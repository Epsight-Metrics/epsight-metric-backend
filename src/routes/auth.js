const router = require('express').Router()
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const { loginLimiter } = require('../middleware/rateLimiter')
const auth = require('../middleware/auth')
const authService = require('../services/authService')

const REFRESH_TOKEN_EXPIRY_DAYS = 7
const isProduction = process.env.NODE_ENV === 'production'
const useSecureCookie = isProduction || process.env.COOKIE_SECURE === 'true'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: useSecureCookie,
  sameSite: useSecureCookie ? 'none' : 'lax',
  maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  path: '/'
}

// POST /api/auth/login
router.post('/login',
  loginLimiter,
  [
    body('username').trim().escape().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { username, password } = req.body
      const { accessToken, refreshToken, user } = await authService.loginUser(
        username,
        password,
        req.ip,
        req.get('user-agent')
      )

      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
      res.cookie('accessToken', accessToken, {
        httpOnly: false,
        secure: useSecureCookie,
        sameSite: useSecureCookie ? 'none' : 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/'
      })
      res.json({ success: true, data: { accessToken, user } })
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken
    const { accessToken, refreshToken, user } = await authService.refreshSession(token)

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
    res.cookie('accessToken', accessToken, {
      httpOnly: false,
      secure: useSecureCookie,
      sameSite: useSecureCookie ? 'none' : 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/'
    })
    res.json({ success: true, data: { accessToken } })
  } catch (err) {
    if (err.status === 401) {
      res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 })
    }
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', auth, async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken
    await authService.logoutUser(token, req.user.id, req.user.username)

    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 })
    res.clearCookie('accessToken', { path: '/', maxAge: 0 })
    res.json({ success: true, data: { message: 'Logged out successfully' } })
  } catch (err) {
    next(err)
  }
})

module.exports = router
