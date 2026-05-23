const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const prisma = require('../db')
const { exportCSV, exportPDF } = require('../exportHelper')

const ALLOWED = ['QUALITY_MANAGER', 'ADMIN']

// GET /api/qcmanager/kpi
router.get('/kpi', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query
    
    // Validate date range if provided
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom)
      const to = new Date(dateTo)
      
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' })
      }
      
      if (from > to) {
        return res.status(400).json({ message: 'dateFrom cannot be greater than dateTo' })
      }
    }
    
    // Set date range
    let startDate, endDate
    if (dateFrom && dateTo) {
      startDate = new Date(dateFrom)
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date(dateTo)
      endDate.setHours(23, 59, 59, 999)
    } else {
      // Default: today
      startDate = new Date()
      startDate.setHours(0, 0, 0, 0)
      endDate = new Date()
      endDate.setHours(23, 59, 59, 999)
    }

    const [total, ngCount, hourlyRaw] = await Promise.all([
      prisma.inspection.count({ where: { timestamp: { gte: startDate, lte: endDate } } }),
      prisma.inspection.count({ where: { timestamp: { gte: startDate, lte: endDate }, status: { in: ['NG', 'NO GOOD'] } } }),
      prisma.$queryRaw`
        SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*) AS count
        FROM inspeksi_log WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
        GROUP BY hour ORDER BY hour
      `,
    ])

    const okCount    = total - ngCount
    const ngRate     = total ? ((ngCount / total) * 100).toFixed(2) : 0
    const okRate     = total ? ((okCount / total) * 100).toFixed(2) : 0
    
    // Calculate throughput per hour based on date range
    const hoursDiff = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60)))
    const throughput = Math.floor(total / hoursDiff)

    res.json({ total, ngCount, okCount, ngRate, okRate, throughputPerHour: throughput })
  } catch (err) {
    console.error('KPI error:', err)
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// GET /api/qcmanager/trends?period=day|week|month
router.get('/trends', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { period = 'day', dateFrom, dateTo } = req.query
    
    // If custom date range provided, use it
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom)
      const to = new Date(dateTo)
      
      // Validate dates
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' })
      }
      
      if (from > to) {
        return res.status(400).json({ message: 'dateFrom cannot be greater than dateTo' })
      }
      
      // Set time boundaries
      from.setHours(0, 0, 0, 0)
      to.setHours(23, 59, 59, 999)
      
      // Custom range: always group by day
      const data = await prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('day', timestamp) AS period,
          COUNT(*)::int AS total,
          SUM(CASE WHEN status IN ('NG', 'NO GOOD') THEN 1 ELSE 0 END)::int AS ng_count
        FROM inspeksi_log 
        WHERE timestamp >= ${from} AND timestamp <= ${to}
        GROUP BY DATE_TRUNC('day', timestamp)
        ORDER BY period ASC
      `
      return res.json(data)
    }
    
    // Default behavior: period-based
    const truncMap = { day: 'hour', week: 'day', month: 'week' }
    const daysMap = { day: 1, week: 7, month: 30 }
    const trunc = truncMap[period] || 'hour'
    const days = daysMap[period] || 1
    const since = new Date(Date.now() - days * 86400000)

    const data = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC(${trunc}::text, timestamp) AS period,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status IN ('NG', 'NO GOOD') THEN 1 ELSE 0 END)::int AS ng_count
      FROM inspeksi_log 
      WHERE timestamp >= ${since}
      GROUP BY period 
      ORDER BY period
    `
    res.json(data)
  } catch (err) {
    console.error('Trends error:', err)
    res.status(500).json({ message: 'Failed to fetch trends' })
  }
})

// GET /api/qcmanager/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { partName, partCode, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query

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

// GET /api/qcmanager/alert-summary
router.get('/alert-summary', auth, role(...ALLOWED), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query
    const where = {
      status: { in: ['NG', 'NO GOOD'] },
      ...(dateFrom || dateTo ? { timestamp: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo   && { lte: new Date(dateTo) }),
      }} : {}),
    }
    const total = await prisma.inspection.count({ where })
    res.json({ totalNG: total })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// GET /api/qcmanager/export?format=csv|pdf&...filters
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

    if (format === 'pdf') return exportPDF(res, data, 'QC Inspection Report', 'qc-report.pdf')
    exportCSV(res, data, 'qc-report.csv')
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

module.exports = router
