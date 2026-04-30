const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

  await prisma.activityLog.create({
    data: { userId: user.id, action: 'LOGIN', detail: `${user.username} logged in` },
  })

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } })
})

module.exports = router
