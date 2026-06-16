require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const app = express()
const { addClient, removeClient } = require('./sse')
const auth = require('./middleware/auth')
const logger = require('./middleware/logger')
const prisma = require('./db')

// Trust Railway/proxy reverse proxy
app.set('trust proxy', 1)

// Security & Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}))

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`)
    }
    next()
  })
}
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan request tanpa origin (curl, Postman, CV program)
    if (!origin) return callback(null, true)
    
    // Development mode: izinkan semua origin
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, origin)
    }
    
    // Production mode: cek whitelist
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, origin)
    }
    callback(new Error('CORS: origin tidak diizinkan'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())
app.use(logger)

// SSE endpoint - frontend subscribe ke sini untuk terima notifikasi NG
app.get('/api/notifications/stream', auth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  res.write('event: connected\ndata: {"message":"Listening for NG alerts"}\n\n')
  addClient(res)

  req.on('close', () => removeClient(res))
})

app.use('/api/auth',      require('./routes/auth'))
app.use('/api/operator',  require('./routes/operator'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/qcmanager', require('./routes/qcmanager'))
app.use('/api/audit',    require('./routes/audit'))
app.use('/api/stream',   require('./routes/stream'))
app.use('/api/reference', require('./routes/reference'))

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

