const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  // Support token dari Authorization header ATAU query param (untuk SSE EventSource)
  const token = req.headers.authorization?.split(' ')[1] || req.query.token
  if (!token) return res.status(401).json({ message: 'No token provided' })

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid token' })
  }
}