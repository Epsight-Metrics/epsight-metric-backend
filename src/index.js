require('dotenv').config()
const express = require('express')
const app     = express()

app.use(express.json())

app.use('/api/auth',      require('./routes/auth'))
app.use('/api/operator',  require('./routes/operator'))
app.use('/api/admin',     require('./routes/admin'))
app.use('/api/qcmanager', require('./routes/qcmanager'))
app.use('/api/audit',     require('./routes/audit'))

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
