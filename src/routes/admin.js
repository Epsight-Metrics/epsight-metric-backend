const router  = require('express').Router()
const auth    = require('../middleware/auth')
const role    = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()

// GET /api/admin/users?name=&username=&role=&page=&limit=
router.get('/users', auth, role('ADMIN'), async (req, res) => {
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
})

// POST /api/admin/users
const bcrypt = require('bcryptjs')
router.post('/users', auth, role('ADMIN'), async (req, res) => {
  const { username, password, name, role: userRole } = req.body
  const user = await prisma.user.create({
    data: { username, password: await bcrypt.hash(password, 10), name, role: userRole },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  })
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: 'CREATE_USER', detail: `Created user ${username}` },
  })
  res.status(201).json(user)
})

// PUT /api/admin/users/:id
router.put('/users/:id', auth, role('ADMIN'), async (req, res) => {
  const { name, role: userRole, password } = req.body
  const data = { name, role: userRole }
  if (password) data.password = await bcrypt.hash(password, 10)

  const user = await prisma.user.update({
    where: { id: parseInt(req.params.id) },
    data,
    select: { id: true, username: true, name: true, role: true, isActive: true },
  })
  await prisma.activityLog.create({
    data: { userId: req.user.id, action: 'UPDATE_USER', detail: `Updated user ${user.username}` },
  })
  res.json(user)
})

// DELETE /api/admin/users/:id?action=delete|deactivate
router.delete('/users/:id', auth, role('ADMIN'), async (req, res) => {
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
})

// GET /api/admin/logs?userId=&page=&limit=
router.get('/logs', auth, role('ADMIN'), async (req, res) => {
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
})

module.exports = router
