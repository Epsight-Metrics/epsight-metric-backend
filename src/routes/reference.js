const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const prisma = require('../db')
const { broadcast } = require('../sse')

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
  ],
  validate,
  async (req, res) => {
    try {
      const { name, shape, vertices, diameterMm, widthMm, heightMm, toleranceMm } = req.body

      // Check if reference with same name already exists
      const existing = await prisma.reference.findUnique({ where: { name } })
      
      let reference
      if (existing) {
        // Update existing reference
        reference = await prisma.reference.update({
          where: { name },
          data: {
            shape,
            vertices: parseInt(vertices),
            diameterMm: parseFloat(diameterMm),
            widthMm: parseFloat(widthMm),
            heightMm: parseFloat(heightMm),
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
            widthMm: parseFloat(widthMm),
            heightMm: parseFloat(heightMm),
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
