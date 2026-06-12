const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const prisma = require('../db')
const { broadcast } = require('../sse')
const multer = require('multer')
const FormData = require('form-data')
const axios = require('axios')

// Multer config — sama dengan operator.js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'))
    }
    cb(null, true)
  }
})

const ALLOWED = ['OPERATOR_QC', 'QUALITY_MANAGER', 'ADMIN']

// GET /api/reference - List all references
router.get('/', auth, role(...ALLOWED), async (req, res) => {
  try {
    const references = await prisma.reference.findMany({
      orderBy: { createdAt: 'desc' }
    })
    res.json({ references, count: references.length })
  } catch (err) {
    console.error('Get references error:', err)
    res.status(500).json({ message: 'Failed to fetch references' })
  }
})

// GET /api/reference/public - Public endpoint untuk CV program
router.get('/public', async (req, res) => {
  try {
    const references = await prisma.reference.findMany({
      orderBy: { createdAt: 'desc' }
    })
    
    // Format ke struktur yang sama dengan referensi.json
    const formatted = {}
    references.forEach(ref => {
      formatted[ref.name] = {
        name: ref.name,
        shape: ref.shape,
        vertices: ref.vertices,
        diameter_mm: ref.diameterMm,
        width_mm: ref.widthMm,
        height_mm: ref.heightMm,
        tolerance_mm: ref.toleranceMm,
        timestamp: ref.createdAt.toISOString()
      }
    })
    
    res.json(formatted)
  } catch (err) {
    console.error('Get public references error:', err)
    res.status(500).json({ message: 'Failed to fetch references' })
  }
})

// POST /api/reference/validate - Validate reference before saving
router.post('/validate',
  auth,
  role(...ALLOWED),
  [
    body('name').trim().notEmpty(),
    body('widthMm').isFloat({ min: 0 }),
    body('heightMm').isFloat({ min: 0 }),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, widthMm, heightMm } = req.body
      const newWidth = parseFloat(widthMm)
      const newHeight = parseFloat(heightMm)

      // Validasi scale consistency dihapus — CV program kini selalu
      // fetch kalibrasi terbaru dari backend sebelum memproses gambar.

      res.json({ valid: true, warnings: [], suggestion: null })

    } catch (err) {
      console.error('Validate reference error:', err)
      res.status(500).json({ message: 'Failed to validate reference' })
    }
  }
)

// POST /api/reference - Save new reference
router.post('/',
  auth,
  role(...ALLOWED),
  [
    body('name').trim().notEmpty().withMessage('Reference name is required'),
    body('shape').isIn(['circle', 'rectangle', 'triangle', 'pentagon', 'hexagon', 'octagon']).withMessage('Invalid shape'),
    body('vertices').isInt({ min: 0 }).withMessage('Vertices must be a positive integer'),
    body('diameterMm').isFloat({ min: 0 }).withMessage('Diameter must be a positive number'),
    body('widthMm').isFloat({ min: 0 }).withMessage('Width must be a positive number'),
    body('heightMm').isFloat({ min: 0 }).withMessage('Height must be a positive number'),
    body('toleranceMm').isFloat({ min: 0 }).withMessage('Tolerance must be a positive number'),
    body('forceOverride').optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, shape, vertices, diameterMm, widthMm, heightMm, toleranceMm, forceOverride } = req.body
      const newWidth = parseFloat(widthMm)
      const newHeight = parseFloat(heightMm)

      // Check if reference with same name already exists
      const existing = await prisma.reference.findUnique({ where: { name } })
      
      // Catatan: validasi scale consistency dihapus.
      // CV program kini selalu fetch kalibrasi terbaru dari backend sebelum
      // memproses gambar referensi, sehingga konsistensi PPM sudah terjamin.

      let reference
      if (existing) {
        // Update existing reference
        reference = await prisma.reference.update({
          where: { name },
          data: {
            shape,
            vertices: parseInt(vertices),
            diameterMm: parseFloat(diameterMm),
            widthMm: newWidth,
            heightMm: newHeight,
            toleranceMm: parseFloat(toleranceMm),
          }
        })
      } else {
        // Create new reference
        reference = await prisma.reference.create({
          data: {
            name,
            shape,
            vertices: parseInt(vertices),
            diameterMm: parseFloat(diameterMm),
            widthMm: newWidth,
            heightMm: newHeight,
            toleranceMm: parseFloat(toleranceMm),
            createdBy: req.user.id,
          }
        })
      }

      // Broadcast reference update via SSE
      broadcast('reference-update', {
        action: existing ? 'updated' : 'created',
        reference: {
          name: reference.name,
          shape: reference.shape,
          vertices: reference.vertices,
          diameter_mm: reference.diameterMm,
          width_mm: reference.widthMm,
          height_mm: reference.heightMm,
          tolerance_mm: reference.toleranceMm,
          timestamp: reference.createdAt.toISOString()
        }
      })

      res.status(existing ? 200 : 201).json({ 
        success: true, 
        reference,
        message: existing ? 'Reference updated successfully' : 'Reference created successfully'
      })
    } catch (err) {
      console.error('Save reference error:', err)
      res.status(500).json({ message: 'Failed to save reference' })
    }
  }
)

// POST /api/reference/from-image — Proxy Add Reference melalui backend (SAMA PIPELINE dengan /inspect/online)
// Sebelumnya frontend panggil CV API langsung → sekarang lewat backend agar config SELALU dari DB
router.post('/from-image',
  auth,
  role(...ALLOWED),
  upload.single('image'),
  async (req, res) => {
    try {
      const { name } = req.body

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Reference name is required' })
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Image file is required' })
      }

      // Ambil config dari DB — SAMA PERSIS dengan /inspect/online
      const config = await prisma.cvConfig.findFirst()
      if (!config) {
        return res.status(500).json({ message: 'CV configuration not found. Set calibration first.' })
      }

      const cvApiUrl = process.env.CV_API_URL
      if (!cvApiUrl) {
        return res.status(500).json({ message: 'CV API URL not configured' })
      }

      // Build FormData ke CV API — parameter identik dengan inspeksi
      const formData = new FormData()
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      })
      formData.append('name', name.trim())
      formData.append('ppm', config.pixelPerMm.toString())
      formData.append('tolerance_mm', config.toleranceMm.toString())
      formData.append('contour_thresh', config.contourThresh.toString())
      formData.append('min_area', config.contourMinArea?.toString() || '1500')
      formData.append('min_feature_mm', config.minFeatureMm?.toString() || '5.0')

      // Panggil CV API /save-reference
      const cvResponse = await axios.post(
        `${cvApiUrl}/save-reference`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 25000,
          maxContentLength: 10 * 1024 * 1024
        }
      )

      res.json(cvResponse.data)
    } catch (err) {
      console.error('Save reference from image error:', err)
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ message: 'CV API timeout' })
      }
      if (err.response) {
        return res.status(err.response.status).json({
          message: 'CV API error',
          error: err.response.data
        })
      }
      res.status(500).json({ message: 'Failed to process reference image' })
    }
  }
)

// POST /api/reference/from-stream — Proxy save-reference-from-stream melalui backend
router.post('/from-stream',
  auth,
  role(...ALLOWED),
  [
    body('name').trim().notEmpty().withMessage('Reference name is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name } = req.body

      // Ambil config dari DB — SAMA PERSIS dengan /inspect/online
      const config = await prisma.cvConfig.findFirst()
      if (!config) {
        return res.status(500).json({ message: 'CV configuration not found. Set calibration first.' })
      }

      const cvApiUrl = process.env.CV_API_URL
      if (!cvApiUrl) {
        return res.status(500).json({ message: 'CV API URL not configured' })
      }

      // Panggil CV API /save-reference-from-stream
      const cvResponse = await axios.post(
        `${cvApiUrl}/save-reference-from-stream`,
        {
          name: name.trim(),
          ppm: config.pixelPerMm,
          tolerance_mm: config.toleranceMm,
          contour_thresh: config.contourThresh,
          min_area: config.contourMinArea || 1500,
          min_feature_mm: config.minFeatureMm || 5.0
        },
        { timeout: 25000 }
      )

      res.json(cvResponse.data)
    } catch (err) {
      console.error('Save reference from stream error:', err)
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ message: 'CV API timeout' })
      }
      if (err.response) {
        return res.status(err.response.status).json({
          message: 'CV API error',
          error: err.response.data
        })
      }
      res.status(500).json({ message: 'Failed to save reference from stream' })
    }
  }
)

// DELETE /api/reference/:name - Delete reference
router.delete('/:name',
  auth,
  role(...ALLOWED),
  async (req, res) => {
    try {
      const { name } = req.params

      const reference = await prisma.reference.delete({
        where: { name }
      })

      // Broadcast reference deletion via SSE
      broadcast('reference-update', {
        action: 'deleted',
        reference: { name }
      })

      res.json({ success: true, message: 'Reference deleted successfully' })
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({ message: 'Reference not found' })
      }
      console.error('Delete reference error:', err)
      res.status(500).json({ message: 'Failed to delete reference' })
    }
  }
)

// DELETE /api/reference - Clear all references
router.delete('/',
  auth,
  role('QUALITY_MANAGER', 'ADMIN'),
  async (req, res) => {
    try {
      await prisma.reference.deleteMany({})

      // Broadcast reference clear via SSE
      broadcast('reference-update', {
        action: 'cleared'
      })

      res.json({ success: true, message: 'All references cleared successfully' })
    } catch (err) {
      console.error('Clear references error:', err)
      res.status(500).json({ message: 'Failed to clear references' })
    }
  }
)

module.exports = router
