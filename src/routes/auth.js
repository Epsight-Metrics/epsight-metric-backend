const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const prisma = require('../db')
const validate = require('../middleware/validate')
const { loginLimiter } = require('../middleware/rateLimiter')

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
      
      if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Invalid credentials' })
      }

      const valid = await bcrypt.compare(password, user.password)
      if (!valid) {
        return res.status(401).json({ message: 'Invalid credentials' })
      }

      await prisma.activityLog.create({
        data: { 
          userId: user.id, 
          action: 'LOGIN', 
          detail: `${user.username} logged in from ${req.ip}` 
        },
      })

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )
      
      res.json({ 
        token, 
        user: { id: user.id, name: user.name, role: user.role, username: user.username } 
      })
    } catch (err) {
      console.error('Login error:', err)
      res.status(500).json({ message: 'Server error' })
    }
  }
)

module.exports = router
