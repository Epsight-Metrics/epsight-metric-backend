require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const app = express()
const { addClient, removeClient } = require('./sse')
const auth = require('./middleware/auth')
const logger = require('./middleware/logger')
const { apiLimiter } = require('./middleware/rateLimiter')
const prisma = require('./db')

// Trust Railway/proxy reverse proxy
app.set('trust proxy', 1)

// Security & Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(logger)
app.use('/api/', apiLimiter)

// SSE endpoint - frontend subscribe ke sini untuk terima notifikasi NG
app.get('/api/notifications/stream', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write('event: connected\ndata: {"message":"Listening for NG alerts"}\n\n')
  addClient(res)

  req.on('close', () => removeClient(res))
})

app.use('/api/auth',      require('./routes/auth'))
app.use('/api/operator',  require('./routes/operator'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/qcmanager', require('./routes/qcmanager'))
app.use('/api/audit',     require('./routes/audit'))

app.get('/health', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: err.message })
  }
})

app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err.stack)
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Invalid token' })
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: 'Validation error', errors: err.errors })
  }
  
  if (err.code === 'P2002') {
    return res.status(409).json({ message: 'Duplicate entry', field: err.meta?.target })
  }
  
  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'Record not found' })
  }
  
  res.status(err.status || 500).json({ 
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  })
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`)
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`✓ Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[1] || 'connected'}`)
})

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`)
  
  server.close(async () => {
    console.log('✓ HTTP server closed')
    
    try {
      await prisma.$disconnect()
      console.log('✓ Database disconnected')
      process.exit(0)
    } catch (err) {
      console.error('✗ Error during shutdown:', err)
      process.exit(1)
    }
  })
  
  setTimeout(() => {
    console.error('✗ Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
