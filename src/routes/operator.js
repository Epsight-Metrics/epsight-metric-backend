const router  = require('express').Router()
const auth    = require('../middleware/auth')
const role    = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const prisma  = new PrismaClient()
const { addClient, removeClient, broadcast } = require('../sse')

const ALLOWED = ['OPERATOR_QC', 'ENGINEER', 'QUALITY_MANAGER', 'ADMIN']

// GET /api/operator/session - current session info + recent history
router.get('/session', auth, role(...ALLOWED), async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const recent = await prisma.inspection.findMany({
    where:   { operatorId: req.user.id, timestamp: { gte: today } },
    include: { part: true },
    orderBy: { timestamp: 'desc' },
    take:    20,
  })
  res.json({ operatorId: req.user.id, date: new Date(), recent })
})

// POST /api/operator/inspect - submit inspection result
router.post('/inspect', auth, role(...ALLOWED), async (req, res) => {
  const { partId, sessionId, length, width, diameter, status, engineerConfigVersion, quantity } = req.body

  const inspection = await prisma.inspection.create({
    data: {
      partId:               parseInt(partId),
      operatorId:           req.user.id,
      sessionId,
      length:               parseFloat(length),
      width:                parseFloat(width),
      diameter:             parseFloat(diameter),
      status,
      engineerConfigVersion,
      quantity:             quantity || 1,
    },
    include: { part: true },
  })

  await prisma.activityLog.create({
    data: { userId: req.user.id, action: 'INSPECTION', detail: `Part ${partId} - ${status}` },
  })

  if (status === 'NG') {
    broadcast('ng-alert', {
      inspectionId: inspection.id,
      partName:     inspection.part.partName,
      partCode:     inspection.part.partCode,
      length:       inspection.length,
      width:        inspection.width,
      diameter:     inspection.diameter,
      operator:     req.user.username,
      timestamp:    inspection.timestamp,
    })
  }

  res.status(201).json(inspection)
})

// GET /api/operator/parts - list parts for dropdown
router.get('/parts', auth, role(...ALLOWED), async (req, res) => {
  const parts = await prisma.part.findMany({ orderBy: { partName: 'asc' } })
  res.json(parts)
})

module.exports = router
