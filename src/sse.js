// Menyimpan semua SSE client yang sedang terhubung
const clients = new Set()

const addClient = (res) => clients.add(res)
const removeClient = (res) => clients.delete(res)

const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.forEach(res => res.write(payload))
}

module.exports = { addClient, removeClient, broadcast }
