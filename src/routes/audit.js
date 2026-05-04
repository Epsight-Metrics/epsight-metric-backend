const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const prisma = require('../db')
const { exportCSV, exportPDF } = require('../exportHelper')

const ALLOWED = ['AUDIT', 'ADMIN', 'QUALITY_MANAGER']

// GET /api/audit/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { partName, partCode, status, dateFrom, dateTo, page = 1, limit = 100 } = req.query

    const where = {
      ...(status && { status }),
      ...(dateFrom || dateTo ? { timestamp: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo) }),
      }} : {}),
      ...(partName || partCode ? {
        part: {
          ...(partName && { partName: { contains: partName, mode: 'insensitive' } }),
          ...(partCode && { partCode: { contains: partCode, mode: 'insensitive' } }),
        }
      } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.inspection.findMany({
        where,
        include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
        orderBy: { timestamp: 'desc' },
        skip:  (parseInt(page) - 1) * parseInt(limit),
        take:  parseInt(limit),
      }),
      prisma.inspection.count({ where }),
    ])

    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// GET /api/audit/inspections/:id
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res) => {
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
    })
    if (!inspection) return res.status(404).json({ message: 'Not found' })

    res.json(inspection)
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// GET /api/audit/export?format=csv|pdf&...filters
router.get('/export', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { format = 'csv', partName, partCode, status, dateFrom, dateTo } = req.query

    const where = {
      ...(status && { status }),
      ...(dateFrom || dateTo ? { timestamp: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo) }),
      }} : {}),
      ...(partName || partCode ? {
        part: {
          ...(partName && { partName: { contains: partName, mode: 'insensitive' } }),
          ...(partCode && { partCode: { contains: partCode, mode: 'insensitive' } }),
        }
      } : {}),
    }

    const data = await prisma.inspection.findMany({
      where,
      include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
      orderBy: { timestamp: 'asc' },
    })

    if (format === 'pdf') return exportPDF(res, data, 'Audit Inspection Evidence', 'audit-evidence.pdf')
    exportCSV(res, data, 'audit-evidence.csv')
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
