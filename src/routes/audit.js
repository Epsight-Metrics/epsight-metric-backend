const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const qcService = require('../services/qcService')
const { exportCSV, exportPDF } = require('../exportHelper')

const ALLOWED = ['AUDIT', 'ADMIN', 'QUALITY_MANAGER']

// GET /api/audit/inspections
router.get('/inspections', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { partName, partCode, status, dateFrom, dateTo, page = 1, limit = 100 } = req.query
    const result = await qcService.getInspections({ partName, partCode, status, dateFrom, dateTo, page, limit })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/audit/inspections/:id
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const inspectionId = parseInt(req.params.id)
    if (isNaN(inspectionId)) {
      return res.status(400).json({ message: 'Invalid inspection ID' })
    }
    const inspection = await qcService.getInspectionDetail(inspectionId)
    res.json({ success: true, data: inspection })
  } catch (err) {
    next(err)
  }
})

// GET /api/audit/export?format=csv|pdf&...filters
router.get('/export', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { format = 'csv', partName, partCode, status, dateFrom, dateTo } = req.query
    const data = await qcService.getExportData({ partName, partCode, status, dateFrom, dateTo })

    if (format === 'pdf') return exportPDF(res, data, 'Audit Inspection Evidence', 'audit-evidence.pdf')
    exportCSV(res, data, 'audit-evidence.csv')
  } catch (err) {
    next(err)
  }
})

// POST /api/audit/validate-integrity
router.post('/validate-integrity', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { inspectionId } = req.body
    const result = await qcService.verifyInspectionIntegrity(inspectionId)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

module.exports = router
