const router  = require('express').Router()
const crypto  = require('crypto')
const auth    = require('../middleware/auth')
const role    = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const { broadcast } = require('../sse')
const prisma  = new PrismaClient()

const ALLOWED = ['OPERATOR_QC', 'ENGINEER', 'QUALITY_MANAGER', 'ADMIN']

// POST /api/operator/session/start
router.post('/session/start', auth, role(...ALLOWED), async (req, res) => {
  const sessionId = `SES-${Date.now()}`
  const session = await prisma.session.create({
    data: { sessionId, operatorId: req.user.id },
  })
  res.status(201).json(session)
})

// POST /api/operator/session/stop
router.post('/session/stop', auth, role(...ALLOWED), async (req, res) => {
  const { sessionId } = req.body
  const session = await prisma.session.update({
    where:  { sessionId },
    data:   { endedAt: new Date() },
  })

  const inspections = await prisma.inspection.count({ where: { sessionId } })
  const duration    = Math.round((session.endedAt - session.startedAt) / 1000)

  res.json({ session, totalInspections: inspections, durationSeconds: duration })
})

// GET /api/operator/session - session info + recent history hari ini
router.get('/session', auth, role(...ALLOWED), async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [recent, activeSession] = await Promise.all([
    prisma.inspection.findMany({
      where:   { operatorId: req.user.id, timestamp: { gte: today } },
      include: { part: true },
      orderBy: { timestamp: 'desc' },
      take:    20,
    }),
    prisma.session.findFirst({
      where:   { operatorId: req.user.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
  ])

  res.json({ operatorId: req.user.id, date: new Date(), activeSession, recent })
})

// POST /api/operator/inspect
router.post('/inspect', auth, role(...ALLOWED), async (req, res) => {
  const { partId, sessionId, length, width, diameter, status, engineerConfigVersion, quantity } = req.body

  const hashInput = `${partId}-${sessionId}-${length}-${width}-${diameter}-${status}-${Date.now()}`
  const dataHash  = crypto.createHash('sha256').update(hashInput).digest('hex')

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
      dataHash,
    },
    include: { part: true },
  })

  await prisma.activityLog.create({
    data: { userId: req.user.id, action: 'INSPECTION', detail: `Part ${partId} - ${status}` },
  })

  const payload = {
    inspectionId: inspection.id,
    partName:     inspection.part.partName,
    partCode:     inspection.part.partCode,
    length:       inspection.length,
    width:        inspection.width,
    diameter:     inspection.diameter,
    status:       inspection.status,
    operator:     req.user.username,
    timestamp:    inspection.timestamp,
  }

  // broadcast ke semua subscriber (QC Manager, Audit, Operator)
  broadcast('inspection-update', payload)
  if (status === 'NG') broadcast('ng-alert', payload)

  res.status(201).json(inspection)
})

// GET /api/operator/parts
router.get('/parts', auth, role(...ALLOWED), async (req, res) => {
  const parts = await prisma.part.findMany({ orderBy: { partName: 'asc' } })
  res.json(parts)
})

module.exports = router
