const router = require('express').Router()
const auth   = require('../middleware/auth')
const role   = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const ALLOWED = ['AUDIT', 'ADMIN', 'QUALITY_MANAGER']

// GET /api/audit/inspections - complete log with advanced filter
router.get('/inspections', auth, role(...ALLOWED), async (req, res) => {
  const { partCode, partName, vendorName, status, operatorId, dateFrom, dateTo, page = 1, limit = 100 } = req.query

  const where = {
    ...(status     && { status }),
    ...(operatorId && { operatorId: parseInt(operatorId) }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    part: {
      ...(partCode   && { partCode:   { contains: partCode,   mode: 'insensitive' } }),
      ...(partName   && { partName:   { contains: partName,   mode: 'insensitive' } }),
      ...(vendorName && { vendorName: { contains: vendorName, mode: 'insensitive' } }),
    },
  }

  const [data, total] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: {
        part:     true,
        operator: { select: { name: true, username: true } },
      },
      orderBy: { timestamp: 'desc' },
      skip:  (parseInt(page) - 1) * parseInt(limit),
      take:  parseInt(limit),
    }),
    prisma.inspection.count({ where }),
  ])

  res.json({ data, total, page: parseInt(page), limit: parseInt(limit) })
})

// GET /api/audit/inspections/:id - single inspection detail (traceability)
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res) => {
  const inspection = await prisma.inspection.findUnique({
    where:   { id: parseInt(req.params.id) },
    include: { part: true, operator: { select: { name: true, username: true, role: true } } },
  })
  if (!inspection) return res.status(404).json({ message: 'Not found' })
  res.json(inspection)
})

// GET /api/audit/export - export as JSON (frontend handles CSV/PDF rendering)
router.get('/export', auth, role(...ALLOWED), async (req, res) => {
  const { partCode, vendorName, status, dateFrom, dateTo } = req.query

  const where = {
    ...(status && { status }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    part: {
      ...(partCode   && { partCode:   { contains: partCode,   mode: 'insensitive' } }),
      ...(vendorName && { vendorName: { contains: vendorName, mode: 'insensitive' } }),
    },
  }

  const data = await prisma.inspection.findMany({
    where,
    include: { part: true, operator: { select: { name: true, username: true } } },
    orderBy: { timestamp: 'asc' },
  })

  res.setHeader('Content-Disposition', 'attachment; filename="audit-export.json"')
  res.json(data)
})

module.exports = router
