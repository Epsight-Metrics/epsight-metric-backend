const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const operatorService = require('../services/operatorService')
const multer = require('multer')

// Multer config for image upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'))
    }
    cb(null, true)
  }
})

const ALLOWED = ['OPERATOR_QC', 'QUALITY_MANAGER', 'ADMIN']

// POST /api/operator/session/start
router.post('/session/start', 
  auth, 
  role(...ALLOWED), 
  async (req, res, next) => {
    try {
      const session = await operatorService.startSession(req.user.id)
      res.status(201).json({ success: true, data: session })
    } catch (err) {
      next(err)
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
  async (req, res, next) => {
    try {
      const { sessionId } = req.body
      const session = await operatorService.stopSession(sessionId, req.user.id)
      res.json({ success: true, data: { session } })
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/operator/session
router.get('/session', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const dashboard = await operatorService.getSessionDashboard(req.user.id)
    res.json({ success: true, data: dashboard })
  } catch (err) {
    next(err)
  }
})

// POST /api/operator/inspect/online - dari browser (mode online) dengan gambar
router.post('/inspect/online',
  auth,
  role(...ALLOWED),
  upload.single('image'),
  async (req, res, next) => {
    try {
      const { partId, sessionId, batchId, referenceName } = req.body

      if (!req.file) {
        return res.status(400).json({ message: 'Image file is required' })
      }

      const result = await operatorService.processOnlineInspection({
        partId,
        sessionId,
        batchId,
        referenceName,
        operatorId: req.user.id,
        file: req.file
      })

      res.status(201).json({ 
        success: true, 
        data: { 
          inspection: result.inspection, 
          cvResult: result.cvResult 
        } 
      })
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ message: 'CV API timeout' })
      }
      if (err.response) {
        return res.status(err.response.status).json({ 
          message: 'CV API error', 
          error: err.response.data 
        })
      }
      next(err)
    }
  }
)

// POST /api/operator/inspect/cv - dari computer vision dengan API key auth
router.post('/inspect/cv',
  // API Key authentication for CV program
  (req, res, next) => {
    const apiKey = req.headers['x-api-key']
    if (!apiKey || apiKey !== process.env.CV_API_KEY) {
      return res.status(401).json({ message: 'Invalid or missing API key' })
    }
    next()
  },
  [
    body('partId').isInt({ min: 1 }).withMessage('Valid part ID is required'),
    body('status').isIn(['OK', 'NG', 'NO GOOD', 'GOOD']).withMessage('Invalid status'),
    body('operatorId').isInt().withMessage('Operator ID is required'),
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('batchId').optional().isInt(),
    body('idPart').optional().trim().escape(),
    body('shape').optional().trim().escape(),
    body('matchedRef').optional().trim().escape(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const updated = await operatorService.processCvInspection(req.body)
      res.status(201).json({ success: true, data: { inspection: updated } })
    } catch (err) {
      next(err)
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
  async (req, res, next) => {
    try {
      const { partId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath } = req.body
      const updated = await operatorService.processManualInspection({
        partId,
        sessionId,
        batchId,
        idPart,
        shape,
        nilaiDimensi,
        status,
        matchedRef,
        imagePath,
        username: req.user.username,
        operatorId: req.user.id
      })
      res.status(201).json({ success: true, data: updated })
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/operator/parts
router.get('/parts', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const parts = await operatorService.getParts()
    res.json({ success: true, data: parts })
  } catch (err) {
    next(err)
  }
})

// GET /api/operator/inspections/:id - Get single inspection detail
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const inspectionId = parseInt(req.params.id)
    if (isNaN(inspectionId)) {
      return res.status(400).json({ message: 'Invalid inspection ID' })
    }
    
    const inspection = await operatorService.getInspectionDetail(inspectionId, req.user.id, req.user.role)
    res.json({ success: true, data: { inspection } })
  } catch (err) {
    next(err)
  }
})

// POST /api/operator/trigger-cv — trigger CV inspection dari dashboard
router.post('/trigger-cv', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const { sessionId } = req.body
    const result = await operatorService.triggerCv(sessionId, req.user.id)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/operator/active-session/public — tanpa auth, untuk CV ambil sesi aktif (KEEP RAW)
router.get('/active-session/public', async (req, res, next) => {
  try {
    const result = await operatorService.getActiveSessionPublic()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ============================================================
// CALIBRATION ROUTES (dipindah dari engineer.js)
// ============================================================
const CALIBRATION_ALLOWED = ['OPERATOR_QC', 'ADMIN']

// GET /api/operator/calibration
router.get('/calibration', auth, role(...CALIBRATION_ALLOWED), async (req, res, next) => {
  try {
    const config = await operatorService.getCalibrationConfig(req.user.id)
    res.json({ success: true, data: config })
  } catch (err) {
    next(err)
  }
})

// PUT /api/operator/calibration
router.put('/calibration',
  auth, role(...CALIBRATION_ALLOWED),
  [
    body('pixelPerMm').isFloat({ min: 0.1, max: 1000 }),
    body('toleranceMm').isFloat({ min: 0.0, max: 100 }),
    body('contourThresh').isInt({ min: 10, max: 250 }),
    body('contourMinArea').isInt({ min: 100 }),
    body('minFeatureMm').isFloat({ min: 0.1 }),
    body('roiPercent').isArray({ min: 4, max: 4 }),
    body('warningDuration').isFloat({ min: 1, max: 60 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const config = await operatorService.saveCalibrationConfig(req.user.id, req.body)
      res.json({ success: true, data: { config } })
    } catch (err) {
      next(err)
    }
  }
)

// GET /api/operator/calibration/public — tanpa auth, untuk CV program (KEEP RAW)
router.get('/calibration/public', async (req, res, next) => {
  try {
    const result = await operatorService.getCalibrationConfigPublic()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

module.exports = router
