const clients = new Set()

const addClient = (res) => {
  clients.add(res)
  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n')
    } catch (err) {
      clearInterval(heartbeat)
      removeClient(res)
    }
  }, 30000)
  
  res.on('close', () => clearInterval(heartbeat))
}

const removeClient = (res) => clients.delete(res)

const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.forEach(res => {
    try { res.write(payload) } catch { removeClient(res) }
  })
}

module.exports = { addClient, removeClient, broadcast }
