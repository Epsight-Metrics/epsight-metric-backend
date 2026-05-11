const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { body } = require('express-validator')
const prisma = require('../db')
const validate = require('../middleware/validate')
const { loginLimiter } = require('../middleware/rateLimiter')
const auth = require('../middleware/auth')

const REFRESH_TOKEN_EXPIRY_DAYS = 7
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  path: '/api/auth',
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  )
}

// POST /api/auth/login
router.post('/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { username, password } = req.body

      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, password: true, name: true, role: true, isActive: true }
      })

      if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' })

      const valid = await bcrypt.compare(password, user.password)
      if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

      // Generate tokens
      const accessToken = generateAccessToken(user)
      const refreshToken = crypto.randomBytes(64).toString('hex')
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

      await prisma.$transaction([
        prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } }),
        prisma.activityLog.create({ data: { userId: user.id, action: 'LOGIN', detail: `${user.username} logged in from ${req.ip}` } }),
      ])

      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS)
      res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, username: user.username } })
    } catch (err) {
      console.error('Login error:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ message: 'No refresh token' })

    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, username: true, role: true, isActive: true } } }
    })

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 })
      return res.status(401).json({ message: 'Invalid or expired refresh token' })
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(64).toString('hex')
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token } }),
      prisma.refreshToken.create({ data: { token: newRefreshToken, userId: stored.userId, expiresAt } }),
    ])

    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS)
    res.json({ accessToken: generateAccessToken(stored.user) })
  } catch (err) {
    console.error('Refresh error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', auth, async (req, res) => {
  try {
    const token = req.cookies?.refreshToken
    await prisma.$transaction([
      ...(token ? [prisma.refreshToken.deleteMany({ where: { token } })] : []),
      prisma.activityLog.create({ data: { userId: req.user.id, action: 'LOGOUT', detail: `${req.user.username} logged out` } }),
    ])

    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 })
    res.json({ message: 'Logged out successfully' })
  } catch (err) {
    console.error('Logout error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
