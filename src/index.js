require('dotenv').config()
const express = require('express')
const app     = express()
const { addClient, removeClient } = require('./sse')
const auth    = require('./middleware/auth')

app.use(express.json())

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

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
