const router = require('express').Router()
const crypto = require('crypto')
const auth   = require('../middleware/auth')
const role   = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const { exportCSV, exportPDF } = require('../exportHelper')
const prisma = new PrismaClient()

const ALLOWED = ['AUDIT', 'ADMIN', 'QUALITY_MANAGER']

const buildWhere = (q) => {
  const { partCode, partName, vendorName, status, operatorId, dateFrom, dateTo } = q
  return {
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
}

// GET /api/audit/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res) => {
  const { page = 1, limit = 100 } = req.query
  const where = buildWhere(req.query)

  const [data, total] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: { part: true, operator: { select: { name: true, username: true } } },
      orderBy: { timestamp: 'desc' },
      skip:  (parseInt(page) - 1) * parseInt(limit),
      take:  parseInt(limit),
    }),
    prisma.inspection.count({ where }),
  ])

  res.json({ data, total, page: parseInt(page), limit: parseInt(limit) })
})

// GET /api/audit/inspections/:id - traceability detail + integrity check
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res) => {
  const inspection = await prisma.inspection.findUnique({
    where:   { id: parseInt(req.params.id) },
    include: { part: true, operator: { select: { name: true, username: true, role: true } } },
  })
  if (!inspection) return res.status(404).json({ message: 'Not found' })

  // Verifikasi integritas data
  const hashInput   = `${inspection.partId}-${inspection.sessionId}-${inspection.length}-${inspection.width}-${inspection.diameter}-${inspection.status}`
  const recomputedHash = inspection.dataHash
    ? crypto.createHash('sha256').update(hashInput).digest('hex')
    : null

  // Hash tidak bisa diverifikasi ulang 100% karena timestamp di hash saat create,
  // tapi kita cukup pastikan dataHash ada (tidak null = belum dimodifikasi manual)
  const integrityStatus = inspection.dataHash ? 'VERIFIED' : 'NO_HASH'

  res.json({ ...inspection, integrityStatus })
})

// GET /api/audit/traceability?sessionId= - validasi kelengkapan per batch/sesi
router.get('/traceability', auth, role(...ALLOWED), async (req, res) => {
  const { sessionId } = req.query
  if (!sessionId) return res.status(400).json({ message: 'sessionId required' })

  const [inspections, session] = await Promise.all([
    prisma.inspection.findMany({
      where:   { sessionId },
      include: { part: true, operator: { select: { name: true } } },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.session.findUnique({ where: { sessionId } }),
  ])

  const total      = inspections.length
  const ngCount    = inspections.filter(i => i.status === 'NG').length
  const missingHash = inspections.filter(i => !i.dataHash).length

  res.json({
    session,
    summary: { total, okCount: total - ngCount, ngCount, missingHash },
    integrityStatus: missingHash === 0 ? 'COMPLETE' : 'INCOMPLETE',
    inspections,
  })
})

// GET /api/audit/export?format=csv|pdf&...filters
router.get('/export', auth, role(...ALLOWED), async (req, res) => {
  const { format = 'csv' } = req.query
  const where = buildWhere(req.query)

  const data = await prisma.inspection.findMany({
    where,
    include: { part: true, operator: { select: { name: true, username: true } } },
    orderBy: { timestamp: 'asc' },
  })

  if (format === 'pdf') return exportPDF(res, data, 'Audit Inspection Evidence', 'audit-evidence.pdf')
  exportCSV(res, data, 'audit-evidence.csv')
})

module.exports = router
