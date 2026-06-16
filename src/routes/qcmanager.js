const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const qcService = require('../services/qcService')
const { exportCSV, exportPDF } = require('../exportHelper')

const ALLOWED = ['QUALITY_MANAGER', 'ADMIN']

// GET /api/qcmanager/kpi
router.get('/kpi', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query
    const metrics = await qcService.getKPI({ dateFrom, dateTo })
    res.json({ success: true, data: metrics })
  } catch (err) {
    next(err)
  }
})

// GET /api/qcmanager/trends?period=day|week|month
router.get('/trends', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { period, dateFrom, dateTo } = req.query
    const trends = await qcService.getTrends({ period, dateFrom, dateTo })
    res.json({ success: true, data: trends })
  } catch (err) {
    next(err)
  }
})

// GET /api/qcmanager/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { partName, partCode, status, dateFrom, dateTo, page = 1, limit = 50 } = req.query
    const result = await qcService.getInspections({ partName, partCode, status, dateFrom, dateTo, page, limit })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/qcmanager/alert-summary
router.get('/alert-summary', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query
    const summary = await qcService.getAlertSummary({ dateFrom, dateTo })
    res.json({ success: true, data: summary })
  } catch (err) {
    next(err)
  }
})

// GET /api/qcmanager/export?format=csv|pdf&...filters
router.get('/export', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { format = 'csv', partName, partCode, status, dateFrom, dateTo } = req.query
    const data = await qcService.getExportData({ partName, partCode, status, dateFrom, dateTo })

    if (format === 'pdf') return exportPDF(res, data, 'QC Inspection Report', 'qc-report.pdf')
    exportCSV(res, data, 'qc-report.csv')
  } catch (err) {
    next(err)
  }
})

// POST /api/qcmanager/parts - Create a new part
router.post('/parts', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const part = await qcService.createPart(req.body)
    res.status(201).json({ success: true, data: part })
  } catch (err) {
    next(err)
  }
})

// PUT /api/qcmanager/parts/:id - Update a part
router.put('/parts/:id', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const part = await qcService.updatePart(req.params.id, req.body)
    res.json({ success: true, data: part })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/qcmanager/parts/:id - Delete a part
router.delete('/parts/:id', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const result = await qcService.deletePart(req.params.id)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

module.exports = router
