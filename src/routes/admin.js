const router = require('express').Router()
const bcrypt = require('bcryptjs')
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body, query } = require('express-validator')
const validate = require('../middleware/validate')
const prisma = require('../db')

router.get('/users', auth, role('ADMIN'), async (req, res) => {
  try {
    const { name, username, role: filterRole, isActive, page = 1, limit = 50 } = req.query

    const where = {
      ...(name       && { name:     { contains: name,     mode: 'insensitive' } }),
      ...(username   && { username: { contains: username, mode: 'insensitive' } }),
      ...(filterRole && { role: filterRole }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ])

    res.json({ data: users, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.post('/users', 
  auth, 
  role('ADMIN'),
  [
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('role').isIn(['OPERATOR_QC', 'QUALITY_MANAGER', 'AUDIT', 'ADMIN']).withMessage('Invalid role'),
  ],
  validate,
  async (req, res) => {
    try {
      const { username, password, name, role: userRole } = req.body
      
      const existing = await prisma.user.findUnique({ where: { username } })
      if (existing) {
        return res.status(409).json({ message: 'Username already exists' })
      }
      
      const user = await prisma.user.create({
        data: { 
          username, 
          password: await bcrypt.hash(password, 12), 
          name, 
          role: userRole 
        },
        select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
      })
      
      await prisma.activityLog.create({
        data: { userId: req.user.id, action: 'CREATE_USER', detail: `Created user ${username}` },
      })
      
      res.status(201).json(user)
    } catch (err) {
      console.error('Create user error:', err)
      res.status(500).json({ message: 'Failed to create user' })
    }
  }
)

router.put('/users/:id', 
  auth, 
  role('ADMIN'),
  [
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['OPERATOR_QC', 'QUALITY_MANAGER', 'AUDIT', 'ADMIN']),
    body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, role: userRole, password } = req.body
      const data = {}
      
      if (name) data.name = name
      if (userRole) data.role = userRole
      if (password) data.password = await bcrypt.hash(password, 12)

      const user = await prisma.user.update({
        where: { id: parseInt(req.params.id) },
        data,
        select: { id: true, username: true, name: true, role: true, isActive: true },
      })
      
      await prisma.activityLog.create({
        data: { userId: req.user.id, action: 'UPDATE_USER', detail: `Updated user ${user.username}` },
      })
      
      res.json(user)
    } catch (err) {
      console.error('Update user error:', err)
      if (err.code === 'P2025') {
        return res.status(404).json({ message: 'User not found' })
      }
      res.status(500).json({ message: 'Failed to update user' })
    }
  }
)

router.delete('/users/:id', auth, role('ADMIN'), async (req, res) => {
  try {
    const { action } = req.query
    if (action === 'delete') {
      await prisma.user.delete({ where: { id: parseInt(req.params.id) } })
    } else {
      await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { isActive: false } })
    }
    await prisma.activityLog.create({
      data: { userId: req.user.id, action: action === 'delete' ? 'DELETE_USER' : 'DEACTIVATE_USER', detail: `User id ${req.params.id}` },
    })
    res.json({ message: 'Done' })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/logs', auth, role('ADMIN'), async (req, res) => {
  try {
    const { userId, page = 1, limit = 50 } = req.query
    const where = userId ? { userId: parseInt(userId) } : {}
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { username: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.activityLog.count({ where }),
    ])
    res.json({ data: logs, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
