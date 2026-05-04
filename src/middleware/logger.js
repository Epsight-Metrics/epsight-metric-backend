const logger = (req, res, next) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      user: req.user?.username || 'anonymous',
    }
    
    if (res.statusCode >= 400) {
      console.error('[ERROR]', JSON.stringify(log))
    } else if (process.env.NODE_ENV === 'development') {
      console.log('[INFO]', JSON.stringify(log))
    }
  })
  
  next()
}

module.exports = logger
