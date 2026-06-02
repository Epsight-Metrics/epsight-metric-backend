const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const { cvLimiter } = require('../middleware/rateLimiter')
const prisma = require('../db')
const { broadcast } = require('../sse')
const { generateInspectionHash } = require('../utils/hashGenerator')
const multer = require('multer')
const FormData = require('form-data')
const axios = require('axios')

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
  async (req, res) => {
    try {
      const sessionId = `SES-${Date.now()}-${req.user.id}`
      const session = await prisma.session.create({
        data: { sessionId, operatorId: req.user.id },
      })
      res.status(201).json(session)
    } catch (err) {
      console.error('Session start error:', err)
      res.status(500).json({ message: 'Failed to start session' })
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
  async (req, res) => {
    try {
      const { sessionId } = req.body
      
      const existing = await prisma.session.findUnique({ where: { sessionId } })
      if (!existing) {
        return res.status(404).json({ message: 'Session not found' })
      }
      
      if (existing.operatorId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: 'Not authorized to stop this session' })
      }
      
      const session = await prisma.session.update({
        where: { sessionId },
        data: { endedAt: new Date() },
      })
      
      res.json({ session })
    } catch (err) {
      console.error('Session stop error:', err)
      res.status(500).json({ message: 'Failed to stop session' })
    }
  }
)

// GET /api/operator/session
router.get('/session', auth, role(...ALLOWED), async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)

    const [recent, activeSession] = await Promise.all([
      prisma.inspection.findMany({
        where:   { operatorId: req.user.id, timestamp: { gte: today } },
        include: { part: true, session: true, batch: true },
        orderBy: { timestamp: 'desc' },
        take:    20,
      }),
      prisma.session.findFirst({
        where:   { operatorId: req.user.id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
    ])

    res.json({ operatorId: req.user.id, date: new Date(), activeSession, recent })
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// POST /api/operator/inspect/online - dari browser (mode online) dengan gambar
router.post('/inspect/online',
  auth,
  role(...ALLOWED),
  upload.single('image'),
  async (req, res) => {
    try {
      const { partId, sessionId, batchId, referenceName } = req.body

      if (!req.file) {
        return res.status(400).json({ message: 'Image file is required' })
      }

      // Verify session exists and is active
      const session = await prisma.session.findUnique({
        where: { sessionId },
        include: { operator: true }
      })

      if (!session) {
        return res.status(404).json({ message: 'Session not found' })
      }

      if (session.endedAt) {
        return res.status(400).json({ message: 'Session already ended' })
      }

      if (session.operatorId !== req.user.id) {
        return res.status(403).json({ message: 'Operator mismatch with session' })
      }

      // Get CV config from database
      const config = await prisma.cvConfig.findFirst()
      if (!config) {
        return res.status(500).json({ message: 'CV configuration not found' })
      }

      // Prepare FormData for CV API
      const formData = new FormData()
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      })
      formData.append('ppm', config.pixelPerMm.toString())
      formData.append('tolerance_mm', config.toleranceMm.toString())
      formData.append('contour_thresh', config.contourThresh.toString())
      formData.append('min_area', config.minArea?.toString() || '1500')
      formData.append('min_feature_mm', config.minFeatureMm?.toString() || '5.0')
      formData.append('reference_name', referenceName)

      // Call CV API
      const cvApiUrl = process.env.CV_API_URL
      if (!cvApiUrl) {
        return res.status(500).json({ message: 'CV API URL not configured' })
      }

      const cvResponse = await axios.post(
        `${cvApiUrl}/process`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 25000,
          maxContentLength: 10 * 1024 * 1024
        }
      )

      const cvResult = cvResponse.data

      if (!cvResult.success) {
        return res.status(400).json({ 
          message: 'CV processing failed', 
          error: cvResult.error 
        })
      }

      // Prepare additional detail for NG cases
      const inspectionDetail = {
        deviations: cvResult.deviations || {},
        referenceMatched: cvResult.reference_matched,
        cvDetail: cvResult.detail,
        measurements: cvResult.measurements
      }

      // Save inspection to database
      const inspection = await prisma.inspection.create({
        data: {
          partId: parseInt(partId),
          operatorId: req.user.id,
          sessionId: sessionId,
          batchId: batchId ? parseInt(batchId) : null,
          shape: cvResult.measurements.shape,
          nilaiDimensi: inspectionDetail,
          status: cvResult.status,
          matchedRef: cvResult.reference_matched,
          imagePath: null, // Could save to cloud storage if needed
        },
        include: { 
          part: true, 
          operator: { select: { username: true, name: true } }, 
          session: true, 
          batch: true 
        },
      })

      // Generate hash
      const hash = generateInspectionHash(inspection)
      
      const updated = await prisma.inspection.update({
        where: { id: inspection.id },
        data: { hash },
        include: { 
          part: true, 
          operator: { select: { username: true, name: true } }, 
          session: true, 
          batch: true 
        },
      })

      // Broadcast to SSE
      const payload = {
        inspectionId: updated.id,
        partId: updated.partId,
        partName: updated.part.partName,
        partCode: updated.part.partCode,
        operatorName: updated.operator?.name,
        sessionId: updated.sessionId,
        batchId: updated.batchId,
        idPart: updated.idPart,
        shape: updated.shape,
        status: updated.status,
        matchedRef: updated.matchedRef,
        imagePath: updated.imagePath,
        timestamp: updated.timestamp,
        hash: updated.hash,
      }

      broadcast('inspection-update', payload)
      if (updated.status === 'NG' || updated.status === 'NO GOOD') {
        broadcast('ng-alert', payload)
      }

      res.status(201).json({ 
        success: true, 
        inspection: updated,
        cvResult: cvResult
      })
    } catch (err) {
      console.error('Online inspection error:', err)
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ message: 'CV API timeout' })
      }
      if (err.response) {
        return res.status(err.response.status).json({ 
          message: 'CV API error', 
          error: err.response.data 
        })
      }
      res.status(500).json({ message: 'Failed to process online inspection' })
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
  cvLimiter,
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
  async (req, res) => {
    try {
      const { partId, operatorId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath } = req.body

      // Verify session exists and is active
      const session = await prisma.session.findUnique({
        where: { sessionId },
        include: { operator: true }
      })

      if (!session) {
        return res.status(404).json({ message: 'Session not found' })
      }

      if (session.endedAt) {
        return res.status(400).json({ message: 'Session already ended' })
      }

      if (session.operatorId !== parseInt(operatorId)) {
        return res.status(403).json({ message: 'Operator mismatch with session' })
      }

      const inspection = await prisma.inspection.create({
        data: {
          partId: parseInt(partId),
          operatorId: parseInt(operatorId),
          sessionId: sessionId,
          batchId: batchId ? parseInt(batchId) : null,
          idPart: idPart || null,
          shape: shape || null,
          nilaiDimensi: nilaiDimensi || null,
          status: String(status),
          matchedRef: matchedRef || null,
          imagePath: imagePath || null,
        },
        include: { 
          part: true, 
          operator: { select: { username: true, name: true } }, 
          session: true, 
          batch: true 
        },
      })

      // Generate hash after creation
      const hash = generateInspectionHash(inspection)
      
      const updated = await prisma.inspection.update({
        where: { id: inspection.id },
        data: { hash },
        include: { 
          part: true, 
          operator: { select: { username: true, name: true } }, 
          session: true, 
          batch: true 
        },
      })

      const payload = {
        inspectionId: updated.id,
        partId: updated.partId,
        partName: updated.part.partName,
        partCode: updated.part.partCode,
        operatorName: updated.operator?.name,
        sessionId: updated.sessionId,
        batchId: updated.batchId,
        idPart: updated.idPart,
        shape: updated.shape,
        status: updated.status,
        matchedRef: updated.matchedRef,
        imagePath: updated.imagePath,
        timestamp: updated.timestamp,
        hash: updated.hash,
      }

      broadcast('inspection-update', payload)
      if (status === 'NG' || status === 'NO GOOD') {
        broadcast('ng-alert', payload)
      }

      res.status(201).json({ success: true, inspection: updated })
    } catch (err) {
      console.error('CV Inspection error:', err)
      res.status(500).json({ message: 'Failed to create inspection' })
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
  async (req, res) => {
    try {
      const { partId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath } = req.body

      const inspection = await prisma.inspection.create({
        data: {
          partId: parseInt(partId),
          operatorId: req.user.id,
          sessionId: sessionId || null,
          batchId: batchId ? parseInt(batchId) : null,
          idPart,
          shape,
          nilaiDimensi,
          status,
          matchedRef,
          imagePath,
        },
        include: { part: true, session: true, batch: true },
      })

      // Generate hash after creation
      const hash = generateInspectionHash(inspection)
      
      const updated = await prisma.inspection.update({
        where: { id: inspection.id },
        data: { hash },
        include: { part: true, session: true, batch: true, operator: { select: { name: true, username: true } } },
      })

      const payload = {
        inspectionId: updated.id,
        partId: updated.partId,
        partName: updated.part.partName,
        partCode: updated.part.partCode,
        sessionId: updated.sessionId,
        batchId: updated.batchId,
        idPart: updated.idPart,
        shape: updated.shape,
        status: updated.status,
        matchedRef: updated.matchedRef,
        imagePath: updated.imagePath,
        operator: req.user.username,
        timestamp: updated.timestamp,
        hash: updated.hash,
      }

      broadcast('inspection-update', payload)
      if (status === 'NG' || status === 'NO GOOD') {
        broadcast('ng-alert', payload)
      }

      res.status(201).json(updated)
    } catch (err) {
      console.error('Manual inspection error:', err)
      res.status(500).json({ message: 'Failed to create inspection' })
    }
  }
)

// GET /api/operator/parts
router.get('/parts', auth, role(...ALLOWED), async (req, res) => {
  try {
    const parts = await prisma.part.findMany({ 
      orderBy: { partName: 'asc' },
      select: { id: true, partCode: true, partName: true, vendorName: true }
    })
    res.json(parts)
  } catch (err) {
    console.error('Get parts error:', err)
    res.status(500).json({ message: 'Failed to fetch parts' })
  }
})

// GET /api/operator/inspections/:id - Get single inspection detail
router.get('/inspections/:id', auth, role(...ALLOWED), async (req, res) => {
  try {
    const inspectionId = parseInt(req.params.id)
    
    if (isNaN(inspectionId)) {
      return res.status(400).json({ message: 'Invalid inspection ID' })
    }
    
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        part: true,
        operator: { select: { username: true, name: true } },
        session: true,
        batch: true
      }
    })
    
    if (!inspection) {
      return res.status(404).json({ message: 'Inspection not found' })
    }
    
    // Optional: Check if user has permission to view this inspection
    // For operator, only allow viewing own inspections
    if (req.user.role === 'OPERATOR_QC' && inspection.operatorId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this inspection' })
    }
    
    res.json({ inspection })
  } catch (err) {
    console.error('Get inspection detail error:', err)
    res.status(500).json({ message: 'Failed to fetch inspection detail' })
  }
})


// POST /api/operator/trigger-cv — trigger CV inspection dari dashboard
router.post('/trigger-cv',
  auth,
  role(...ALLOWED),
  async (req, res) => {
    try {
      const { sessionId } = req.body
      
      // Broadcast command ke CV program yang sedang listening
      broadcast('cv-trigger', {
        sessionId: sessionId || null,
        operatorId: req.user.id,
        timestamp: new Date().toISOString()
      })
      
      res.json({ success: true, message: 'CV inspection triggered' })
    } catch (err) {
      console.error('Trigger CV error:', err)
      res.status(500).json({ message: 'Failed to trigger CV inspection' })
    }
  }
)

// GET /api/operator/active-session/public — tanpa auth, untuk CV ambil sesi aktif
// CV query ini setiap X detik untuk sinkronisasi sessionId & operatorId
router.get('/active-session/public', async (req, res) => {
  try {
    const activeSession = await prisma.session.findFirst({
      where:   { endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { operator: { select: { id: true, name: true, username: true } } },
    })

    if (!activeSession) {
      return res.json({ active: false, sessionId: null, operatorId: null, operatorName: null })
    }

    res.json({
      active:       true,
      sessionId:    activeSession.sessionId,
      operatorId:   activeSession.operatorId,
      operatorName: activeSession.operator.name,
      startedAt:    activeSession.startedAt,
    })
  } catch (err) {
    console.error('Active session public error:', err)
    res.status(500).json({ message: 'Failed to fetch active session' })
  }
})
module.exports = router
