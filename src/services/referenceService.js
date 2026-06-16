const prisma = require('../db')
const { broadcast } = require('../sse')
const axios = require('axios')
const FormData = require('form-data')

async function getReferences() {
  const references = await prisma.reference.findMany({
    orderBy: { createdAt: 'desc' }
  })
  return { references, count: references.length }
}

async function getPublicReferences() {
  const references = await prisma.reference.findMany({
    orderBy: { createdAt: 'desc' }
  })
  
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
  
  return formatted
}

async function saveReference({ id, name, shape, vertices, diameterMm, widthMm, heightMm, toleranceMm }, userId) {
  if (shape === 'circle') {
    if (!diameterMm || parseFloat(diameterMm) <= 0) {
      const err = new Error('Validation failed')
      err.status = 400
      err.errors = [{ field: 'diameterMm', message: 'Diameter is required for circle shape' }]
      throw err
    }
  } else {
    if (!widthMm || parseFloat(widthMm) <= 0 || !heightMm || parseFloat(heightMm) <= 0) {
      const err = new Error('Validation failed')
      err.status = 400
      err.errors = [
        { field: 'widthMm', message: 'Width is required for non-circle shapes' },
        { field: 'heightMm', message: 'Height is required for non-circle shapes' }
      ]
      throw err
    }
  }

  const newWidth = parseFloat(widthMm) || 0
  const newHeight = parseFloat(heightMm) || 0
  const diameter = parseFloat(diameterMm) || 0

  let existing = null
  if (id) {
    existing = await prisma.reference.findUnique({ where: { id: parseInt(id) } })
    if (existing && existing.name !== name.trim()) {
      const nameConflict = await prisma.reference.findUnique({ where: { name: name.trim() } })
      if (nameConflict) {
        const err = new Error('Validation failed')
        err.status = 400
        err.errors = [{ field: 'name', message: 'Reference name already exists' }]
        throw err
      }
    }
  } else {
    existing = await prisma.reference.findUnique({ where: { name: name.trim() } })
  }

  let reference
  if (existing) {
    reference = await prisma.reference.update({
      where: { id: existing.id },
      data: {
        name: name.trim(),
        shape,
        vertices: parseInt(vertices),
        diameterMm: diameter,
        widthMm: newWidth,
        heightMm: newHeight,
        toleranceMm: parseFloat(toleranceMm),
      }
    })
  } else {
    reference = await prisma.reference.create({
      data: {
        name: name.trim(),
        shape,
        vertices: parseInt(vertices),
        diameterMm: diameter,
        widthMm: newWidth,
        heightMm: newHeight,
        toleranceMm: parseFloat(toleranceMm),
        createdBy: userId,
      }
    })
  }

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

  return { reference, action: existing ? 'updated' : 'created' }
}

async function saveReferenceFromImage({ name, file }) {
  const config = await prisma.cvConfig.findFirst()
  if (!config) {
    const err = new Error('CV configuration not found. Set calibration first.')
    err.status = 500
    throw err
  }

  const cvApiUrl = process.env.CV_API_URL
  if (!cvApiUrl) {
    const err = new Error('CV API URL not configured')
    err.status = 500
    throw err
  }

  const formData = new FormData()
  formData.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  })
  formData.append('name', name.trim())
  formData.append('ppm', config.pixelPerMm.toString())
  formData.append('tolerance_mm', config.toleranceMm.toString())
  formData.append('contour_thresh', config.contourThresh.toString())
  formData.append('min_area', config.contourMinArea?.toString() || '1500')
  formData.append('min_feature_mm', config.minFeatureMm?.toString() || '5.0')

  const cvResponse = await axios.post(
    `${cvApiUrl}/save-reference`,
    formData,
    {
      headers: formData.getHeaders(),
      timeout: 25000,
      maxContentLength: 10 * 1024 * 1024
    }
  )

  return cvResponse.data
}

async function saveReferenceFromStream({ name }) {
  const config = await prisma.cvConfig.findFirst()
  if (!config) {
    const err = new Error('CV configuration not found. Set calibration first.')
    err.status = 500
    throw err
  }

  const cvApiUrl = process.env.CV_API_URL
  if (!cvApiUrl) {
    const err = new Error('CV API URL not configured')
    err.status = 500
    throw err
  }

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

  return cvResponse.data
}

async function deleteReference(name) {
  try {
    await prisma.reference.delete({
      where: { name }
    })

    broadcast('reference-update', {
      action: 'deleted',
      reference: { name }
    })
  } catch (err) {
    if (err.code === 'P2025') {
      const error = new Error('Reference not found')
      error.status = 404
      throw error
    }
    throw err
  }
}

async function clearAllReferences() {
  await prisma.reference.deleteMany({})

  broadcast('reference-update', {
    action: 'cleared'
  })
}

module.exports = {
  getReferences,
  getPublicReferences,
  saveReference,
  saveReferenceFromImage,
  saveReferenceFromStream,
  deleteReference,
  clearAllReferences
}
