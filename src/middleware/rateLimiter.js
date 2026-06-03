const rateLimit = require('express-rate-limit')

const loginLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: 'Too many login attempts, please try again after 15 minutes',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
    })
  : (req, res, next) => next() // No limit in development

const apiLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
    })
  : (req, res, next) => next() // No limit in development

module.exports = { loginLimiter, apiLimiter }
