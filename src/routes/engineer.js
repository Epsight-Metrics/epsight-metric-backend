const router = require('express').Router()
const auth = require('../middleware/auth')
const role = require('../middleware/role')
const { body } = require('express-validator')
const validate = require('../middleware/validate')
const prisma = require('../db')

const ALLOWED = ['ENGINEER', 'ADMIN']

// GET /api/engineer/calibration
router.get('/calibration', auth, role(...ALLOWED), async (req, res) => {
  try {
    let config = await prisma.cvConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
      include: { updatedByUser: { select: { username: true, name: true } } },
    })
    if (!config) {
      config = await prisma.cvConfig.create({
        data: { updatedBy: req.user.id },
        include: { updatedByUser: { select: { username: true, name: true } } },
      })
    }
    res.json(config)
  } catch (err) {
    console.error('Get calibration error:', err)
    res.status(500).json({ message: 'Failed to fetch calibration config' })
  }
})

// PUT /api/engineer/calibration
router.put('/calibration',
  auth, role(...ALLOWED),
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
  async (req, res) => {
    try {
      const { pixelPerMm, toleranceMm, contourThresh, contourMinArea, minFeatureMm, roiPercent, warningDuration } = req.body
      const existing = await prisma.cvConfig.findFirst({ orderBy: { id: 'asc' } })
      const data = {
        pixelPerMm: parseFloat(pixelPerMm), toleranceMm: parseFloat(toleranceMm),
        contourThresh: parseInt(contourThresh), contourMinArea: parseInt(contourMinArea),
        minFeatureMm: parseFloat(minFeatureMm), roiPercent,
        warningDuration: parseFloat(warningDuration), updatedBy: req.user.id,
      }
      const include = { updatedByUser: { select: { username: true, name: true } } }
      let config
      if (existing) {
        config = await prisma.cvConfig.update({ where: { id: existing.id }, data, include })
      } else {
        config = await prisma.cvConfig.create({ data, include })
      }
      res.json({ success: true, config })
    } catch (err) {
      console.error('Save calibration error:', err)
      res.status(500).json({ message: 'Failed to save calibration config' })
    }
  }
)

// GET /api/engineer/calibration/public — tanpa auth, untuk CV program
router.get('/calibration/public', async (req, res) => {
  try {
    const config = await prisma.cvConfig.findFirst({ orderBy: { updatedAt: 'desc' } })
    if (!config) {
      return res.json({ pixel_per_mm: 9.28, tolerance_mm: 1.0, contour_thresh: 200, contour_min_area: 1500, min_feature_mm: 5.0, roi_percent: [0.20, 0.10, 0.80, 0.90], warning_duration: 5.0 })
    }
    res.json({ pixel_per_mm: config.pixelPerMm, tolerance_mm: config.toleranceMm, contour_thresh: config.contourThresh, contour_min_area: config.contourMinArea, min_feature_mm: config.minFeatureMm, roi_percent: config.roiPercent, warning_duration: config.warningDuration })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch calibration' })
  }
})

module.exports = router