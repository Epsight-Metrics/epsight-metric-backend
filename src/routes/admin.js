const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const userService = require('../services/userService')

// GET /api/admin/users
router.get('/users', auth, role('ADMIN'), async (req, res, next) => {
  try {
    const { name, username, role: filterRole, isActive, page = 1, limit = 50 } = req.query
    const result = await userService.getUsers({ name, username, role: filterRole, isActive, page, limit })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/users
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
  async (req, res, next) => {
    try {
      const user = await userService.createUser(req.body, req.user.id)
      res.status(201).json({ success: true, data: user })
    } catch (err) {
      next(err)
    }
  }
)

// PUT /api/admin/users/:id
router.put('/users/:id', 
  auth, 
  role('ADMIN'),
  [
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['OPERATOR_QC', 'QUALITY_MANAGER', 'AUDIT', 'ADMIN']),
    body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await userService.updateUser(req.params.id, req.body, req.user.id)
      res.json({ success: true, data: user })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/admin/users/:id
router.delete('/users/:id', auth, role('ADMIN'), async (req, res, next) => {
  try {
    const { action } = req.query
    const result = await userService.deleteOrDeactivateUser(req.params.id, action, req.user.id)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/logs
router.get('/logs', auth, role('ADMIN'), async (req, res, next) => {
  try {
    const { userId, page = 1, limit = 50 } = req.query
    const result = await userService.getActivityLogs({ userId, page, limit })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

module.exports = router
