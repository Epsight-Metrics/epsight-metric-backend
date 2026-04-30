const router = require('express').Router()
const auth   = require('../middleware/auth')
const role   = require('../middleware/role')
const { PrismaClient } = require('@prisma/client')
const { exportCSV, exportPDF } = require('../exportHelper')
const prisma = new PrismaClient()

const ALLOWED = ['QUALITY_MANAGER', 'ADMIN']

// GET /api/qcmanager/kpi
router.get('/kpi', auth, role(...ALLOWED), async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [total, ngCount, hourlyRaw] = await Promise.all([
    prisma.inspection.count({ where: { timestamp: { gte: today } } }),
    prisma.inspection.count({ where: { timestamp: { gte: today }, status: 'NG' } }),
    prisma.$queryRaw`
      SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*) AS count
      FROM "Inspection" WHERE timestamp >= ${today}
      GROUP BY hour ORDER BY hour
    `,
  ])

  const okCount    = total - ngCount
  const ngRate     = total ? ((ngCount / total) * 100).toFixed(2) : 0
  const okRate     = total ? ((okCount / total) * 100).toFixed(2) : 0
  const throughput = hourlyRaw.length ? Math.round(total / hourlyRaw.length) : 0

  res.json({ total, ngCount, okCount, ngRate, okRate, throughputPerHour: throughput })
})

// GET /api/qcmanager/trends?period=day|week|month
router.get('/trends', auth, role(...ALLOWED), async (req, res) => {
  const { period = 'day' } = req.query
  const truncMap = { day: 'hour', week: 'day', month: 'week' }
  const daysMap  = { day: 1, week: 7, month: 30 }
  const trunc    = truncMap[period] || 'hour'
  const since    = new Date(Date.now() - daysMap[period] * 86400000)

  const data = await prisma.$queryRaw`
    SELECT DATE_TRUNC(${trunc}, timestamp) AS period,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'NG' THEN 1 ELSE 0 END) AS ng_count
    FROM "Inspection" WHERE timestamp >= ${since}
    GROUP BY period ORDER BY period
  `
  res.json(data)
})

// GET /api/qcmanager/defect-patterns
router.get('/defect-patterns', auth, role(...ALLOWED), async (req, res) => {
  const [byVendor, byPart] = await Promise.all([
    prisma.$queryRaw`
      SELECT p."vendorName", COUNT(*) AS ng_count
      FROM "Inspection" i JOIN "Part" p ON i."partId" = p.id
      WHERE i.status = 'NG'
      GROUP BY p."vendorName" ORDER BY ng_count DESC
    `,
    prisma.$queryRaw`
      SELECT p."partName", p."partCode", COUNT(*) AS ng_count
      FROM "Inspection" i JOIN "Part" p ON i."partId" = p.id
      WHERE i.status = 'NG'
      GROUP BY p."partName", p."partCode" ORDER BY ng_count DESC LIMIT 10
    `,
  ])
  res.json({ byVendor, byPart })
})

// GET /api/qcmanager/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res) => {
  const { partName, partCode, vendorName, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query

  const where = {
    ...(status && { status }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    part: {
      ...(partName   && { partName:   { contains: partName,   mode: 'insensitive' } }),
      ...(partCode   && { partCode:   { contains: partCode,   mode: 'insensitive' } }),
      ...(vendorName && { vendorName: { contains: vendorName, mode: 'insensitive' } }),
    },
  }

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

// GET /api/qcmanager/alert-summary
router.get('/alert-summary', auth, role(...ALLOWED), async (req, res) => {
  const { dateFrom, dateTo } = req.query
  const where = {
    status: 'NG',
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
  }
  const [total, byPart] = await Promise.all([
    prisma.inspection.count({ where }),
    prisma.inspection.groupBy({
      by: ['partId'], where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ])
  res.json({ totalNG: total, topNGParts: byPart })
})

// GET /api/qcmanager/export?format=csv|pdf&...filters
router.get('/export', auth, role(...ALLOWED), async (req, res) => {
  const { format = 'csv', partName, partCode, vendorName, status, dateFrom, dateTo } = req.query

  const where = {
    ...(status && { status }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    part: {
      ...(partName   && { partName:   { contains: partName,   mode: 'insensitive' } }),
      ...(partCode   && { partCode:   { contains: partCode,   mode: 'insensitive' } }),
      ...(vendorName && { vendorName: { contains: vendorName, mode: 'insensitive' } }),
    },
  }

  const data = await prisma.inspection.findMany({
    where,
    include: { part: true, operator: { select: { name: true, username: true } } },
    orderBy: { timestamp: 'asc' },
  })

  if (format === 'pdf') return exportPDF(res, data, 'QC Inspection Report', 'qc-report.pdf')
  exportCSV(res, data, 'qc-report.csv')
})

module.exports = router
