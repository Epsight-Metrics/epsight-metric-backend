const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const referenceService = require('../services/referenceService')
const multer = require('multer')

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
router.get('/', auth, role(...ALLOWED), async (req, res, next) => {
  try {
    const result = await referenceService.getReferences()
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

// GET /api/reference/public - Public endpoint untuk CV program (KEEP RAW)
router.get('/public', async (req, res, next) => {
  try {
    const formatted = await referenceService.getPublicReferences()
    res.json(formatted)
  } catch (err) {
    next(err)
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
  async (req, res, next) => {
    try {
      res.json({ success: true, data: { valid: true, warnings: [], suggestion: null } })
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/reference - Save new reference
router.post('/',
  auth,
  role(...ALLOWED),
  [
    body('name').trim().notEmpty().withMessage('Reference name is required'),
    body('shape').isIn(['circle', 'rectangle', 'triangle', 'pentagon', 'hexagon', 'octagon', 'polygon']).withMessage('Invalid shape'),
    body('vertices').isInt({ min: 0 }).withMessage('Vertices must be a positive integer'),
    body('diameterMm').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Diameter must be a positive number'),
    body('widthMm').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Width must be a positive number'),
    body('heightMm').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Height must be a positive number'),
    body('toleranceMm').isFloat({ min: 0 }).withMessage('Tolerance must be a positive number'),
    body('forceOverride').optional().isBoolean(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { reference, action } = await referenceService.saveReference(req.body, req.user.id)
      res.status(action === 'created' ? 201 : 200).json({ 
        success: true, 
        data: {
          reference,
          message: action === 'created' ? 'Reference created successfully' : 'Reference updated successfully'
        }
      })
    } catch (err) {
      next(err)
    }
  }
)

// POST /api/reference/from-image — Proxy Add Reference melalui backend
router.post('/from-image',
  auth,
  role(...ALLOWED),
  upload.single('image'),
  async (req, res, next) => {
    try {
      const { name } = req.body

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Reference name is required' })
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Image file is required' })
      }

      const result = await referenceService.saveReferenceFromImage({
        name,
        file: req.file
      })

      res.json({ success: true, data: result })
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

// POST /api/reference/from-stream — Proxy save-reference-from-stream melalui backend
router.post('/from-stream',
  auth,
  role(...ALLOWED),
  [
    body('name').trim().notEmpty().withMessage('Reference name is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name } = req.body
      const result = await referenceService.saveReferenceFromStream({ name })
      res.json({ success: true, data: result })
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

// DELETE /api/reference/:name - Delete reference
router.delete('/:name',
  auth,
  role(...ALLOWED),
  async (req, res, next) => {
    try {
      const { name } = req.params
      await referenceService.deleteReference(name)
      res.json({ success: true, data: { message: 'Reference deleted successfully' } })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /api/reference - Clear all references
router.delete('/',
  auth,
  role('QUALITY_MANAGER', 'ADMIN'),
  async (req, res, next) => {
    try {
      await referenceService.clearAllReferences()
      res.json({ success: true, data: { message: 'All references cleared successfully' } })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
