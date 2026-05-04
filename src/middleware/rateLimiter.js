const rateLimit = require('express-rate-limit')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { message: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
})

const cvLimiter = rateLimit({
  windowMs: 1 * 1000, // 1 second
  max: 10, // 10 requests per second
  message: { message: 'Too many inspection requests' },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = { loginLimiter, apiLimiter, cvLimiter }
