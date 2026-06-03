module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !req.user.role)
    return res.status(401).json({ message: 'Unauthorized' })
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: 'Access denied' })
  next()
}
