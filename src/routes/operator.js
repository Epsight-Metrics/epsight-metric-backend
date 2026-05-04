const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const { cvLimiter } = require('../middleware/rateLimiter')
const prisma = require('../db')
const { broadcast } = require('../sse')

const ALLOWED = ['OPERATOR_QC', 'ENGINEER', 'QUALITY_MANAGER', 'ADMIN']

// POST /api/operator/session/start
router.post('/session/start', 
  auth, 
  role(...ALLOWED), 
  async (req, res) => {
    try {
      const sessionId = `SES-${Date.now()}-${req.user.id}`
      const session = await prisma.session.create({
        data: { sessionId, operatorId: req.user.id },
      })
      res.status(201).json(session)
    } catch (err) {
      console.error('Session start error:', err)
      res.status(500).json({ message: 'Failed to start session' })
    }
  }
)

// POST /api/operator/session/stop
router.post('/session/stop', 
  auth, 
  role(...ALLOWED),
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { sessionId } = req.body
      
      const existing = await prisma.session.findUnique({ where: { sessionId } })
      if (!existing) {
        return res.status(404).json({ message: 'Session not found' })
      }
      
      if (existing.operatorId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Not authorized to stop this session' })
      }
      
      const session = await prisma.session.update({
        where: { sessionId },
        data: { endedAt: new Date() },
      })
      
      res.json({ session })
    } catch (err) {
      console.error('Session stop error:', err)
      res.status(500).json({ message: 'Failed to stop session' })
    }
  }
)

// GET /api/operator/session
router.get('/session', auth, role(...ALLOWED), async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const [recent, activeSession] = await Promise.all([
      prisma.inspection.findMany({
        where:   { operatorId: req.user.id, timestamp: { gte: today } },
        include: { part: true, session: true, batch: true },
        orderBy: { timestamp: 'desc' },
        take:    20,
      }),
      prisma.session.findFirst({
        where:   { operatorId: req.user.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
    ])

    res.json({ operatorId: req.user.id, date: new Date(), activeSession, recent })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// POST /api/operator/inspect/cv - dari computer vision (tanpa auth)
router.post('/inspect/cv',
  cvLimiter,
  [
    body('partId').isInt({ min: 1 }).withMessage('Valid part ID is required'),
    body('status').isIn(['OK', 'NG', 'NO GOOD', 'GOOD']).withMessage('Invalid status'),
    body('operatorId').optional().isInt(),
    body('batchId').optional().isInt(),
  ],
  validate,
  async (req, res) => {
    try {
      const { partId, operatorId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath } = req.body

      const inspection = await prisma.inspection.create({
        data: {
          partId: parseInt(partId),
          operatorId: operatorId ? parseInt(operatorId) : null,
          sessionId: sessionId || null,
          batchId: batchId ? parseInt(batchId) : null,
          idPart: idPart || null,
          shape: shape || null,
          nilaiDimensi: nilaiDimensi || null,
          status: String(status),
          matchedRef: matchedRef || null,
          imagePath: imagePath || null,
        },
        include: { 
          part: true, 
          operator: { select: { username: true, name: true } }, 
          session: true, 
          batch: true 
        },
      })

      const payload = {
        inspectionId: inspection.id,
        partId: inspection.partId,
        partName: inspection.part.partName,
        partCode: inspection.part.partCode,
        operatorName: inspection.operator?.name,
        sessionId: inspection.sessionId,
        batchId: inspection.batchId,
        idPart: inspection.idPart,
        shape: inspection.shape,
        status: inspection.status,
        matchedRef: inspection.matchedRef,
        imagePath: inspection.imagePath,
        timestamp: inspection.timestamp,
      }

      broadcast('inspection-update', payload)
      if (status === 'NG' || status === 'NO GOOD') {
        broadcast('ng-alert', payload)
      }

      res.status(201).json({ success: true, inspection })
    } catch (err) {
      console.error('CV Inspection error:', err)
      res.status(500).json({ message: 'Failed to create inspection' })
    }
  }
)

// POST /api/operator/inspect - manual input
router.post('/inspect', 
  auth, 
  role(...ALLOWED),
  [
    body('partId').isInt({ min: 1 }).withMessage('Valid part ID is required'),
    body('status').isIn(['OK', 'NG', 'NO GOOD', 'GOOD']).withMessage('Invalid status'),
    body('batchId').optional().isInt(),
  ],
  validate,
  async (req, res) => {
    try {
      const { partId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath } = req.body

      const inspection = await prisma.inspection.create({
        data: {
          partId: parseInt(partId),
          operatorId: req.user.id,
          sessionId: sessionId || null,
          batchId: batchId ? parseInt(batchId) : null,
          idPart,
          shape,
          nilaiDimensi,
          status,
          matchedRef,
          imagePath,
        },
        include: { part: true, session: true, batch: true },
      })

      const payload = {
        inspectionId: inspection.id,
        partId: inspection.partId,
        partName: inspection.part.partName,
        partCode: inspection.part.partCode,
        sessionId: inspection.sessionId,
        batchId: inspection.batchId,
        idPart: inspection.idPart,
        shape: inspection.shape,
        status: inspection.status,
        matchedRef: inspection.matchedRef,
        imagePath: inspection.imagePath,
        operator: req.user.username,
        timestamp: inspection.timestamp,
      }

      broadcast('inspection-update', payload)
      if (status === 'NG' || status === 'NO GOOD') {
        broadcast('ng-alert', payload)
      }

      res.status(201).json(inspection)
    } catch (err) {
      console.error('Manual inspection error:', err)
      res.status(500).json({ message: 'Failed to create inspection' })
    }
  }
)

// GET /api/operator/parts
router.get('/parts', auth, role(...ALLOWED), async (req, res) => {
  try {
    const parts = await prisma.part.findMany({ 
      orderBy: { partName: 'asc' },
      select: { id: true, partCode: true, partName: true, vendorName: true }
    })
    res.json(parts)
  } catch (err) {
    console.error('Get parts error:', err)
    res.status(500).json({ message: 'Failed to fetch parts' })
  }
})

module.exports = router
