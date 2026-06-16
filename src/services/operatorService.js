const prisma = require('../db')
const { broadcast } = require('../sse')
const { generateInspectionHash } = require('../utils/hashGenerator')
const axios = require('axios')
const FormData = require('form-data')

async function startSession(operatorId) {
  const sessionId = `SES-${Date.now()}-${operatorId}`
  return prisma.session.create({
    data: { sessionId, operatorId },
  })
}

async function stopSession(sessionId, operatorId) {
  const existing = await prisma.session.findUnique({ where: { sessionId } })
  if (!existing) {
    const err = new Error('Session not found')
    err.status = 404
    throw err
  }
  
  if (existing.operatorId !== operatorId) {
    const err = new Error('Not authorized to stop this session')
    err.status = 403
    throw err
  }
  
  const session = await prisma.session.update({
    where: { sessionId },
    data: { endedAt: new Date() },
  })
  
  return session
}

async function getSessionDashboard(operatorId) {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [recent, activeSession] = await Promise.all([
    prisma.inspection.findMany({
      where:   { operatorId, timestamp: { gte: today } },
      include: { part: true, session: true, batch: true },
      orderBy: { timestamp: 'desc' },
      take:    20,
    }),
    prisma.session.findFirst({
      where:   { operatorId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    }),
  ])

  return { operatorId, date: new Date(), activeSession, recent }
}

async function processOnlineInspection({ partId, sessionId, batchId, referenceName, operatorId, file }) {
  // Verify session exists and is active
  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: { operator: true }
  })

  if (!session) {
    const err = new Error('Session not found')
    err.status = 404
    throw err
  }

  if (session.endedAt) {
    const err = new Error('Session already ended')
    err.status = 400
    throw err
  }

  if (session.operatorId !== operatorId) {
    const err = new Error('Operator mismatch with session')
    err.status = 403
    throw err
  }

  // Get CV config from database
  const config = await prisma.cvConfig.findFirst()
  if (!config) {
    const err = new Error('CV configuration not found')
    err.status = 500
    throw err
  }

  // Prepare FormData for CV API
  const formData = new FormData()
  formData.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype
  })
  formData.append('ppm', config.pixelPerMm.toString())
  formData.append('tolerance_mm', config.toleranceMm.toString())
  formData.append('contour_thresh', config.contourThresh.toString())
  formData.append('min_area', config.contourMinArea?.toString() || '1500')
  formData.append('min_feature_mm', config.minFeatureMm?.toString() || '5.0')
  formData.append('reference_name', referenceName)

  // Call CV API
  const cvApiUrl = process.env.CV_API_URL
  if (!cvApiUrl) {
    const err = new Error('CV API URL not configured')
    err.status = 500
    throw err
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
    const err = new Error('CV processing failed')
    err.status = 400
    err.details = cvResult.error
    throw err
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
      operatorId,
      sessionId,
      batchId: batchId ? parseInt(batchId) : null,
      shape: cvResult.measurements.shape,
      nilaiDimensi: inspectionDetail,
      status: cvResult.status,
      matchedRef: cvResult.reference_matched,
      imagePath: null,
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
    nilaiDimensi: inspectionDetail,
  }

  broadcast('inspection-update', payload)
  if (updated.status === 'NG' || updated.status === 'NO GOOD') {
    broadcast('ng-alert', payload)
  }

  return { 
    success: true, 
    inspection: updated,
    cvResult: cvResult
  }
}

async function processCvInspection({ partId, operatorId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath }) {
  // Verify session exists and is active
  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: { operator: true }
  })

  if (!session) {
    const err = new Error('Session not found')
    err.status = 404
    throw err
  }

  if (session.endedAt) {
    const err = new Error('Session already ended')
    err.status = 400
    throw err
  }

  if (session.operatorId !== parseInt(operatorId)) {
    const err = new Error('Operator mismatch with session')
    err.status = 403
    throw err
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

  return updated
}

async function processManualInspection({ partId, sessionId, batchId, idPart, shape, nilaiDimensi, status, matchedRef, imagePath, username, operatorId }) {
  const inspection = await prisma.inspection.create({
    data: {
      partId: parseInt(partId),
      operatorId,
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
    operator: username,
    timestamp: updated.timestamp,
    hash: updated.hash,
  }

  broadcast('inspection-update', payload)
  if (status === 'NG' || status === 'NO GOOD') {
    broadcast('ng-alert', payload)
  }

  return updated
}

async function getParts() {
  return prisma.part.findMany({ 
    orderBy: { partName: 'asc' },
    select: { id: true, partCode: true, partName: true, vendorName: true }
  })
}

async function getInspectionDetail(id, operatorId, role) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      part: true,
      operator: { select: { username: true, name: true } },
      session: true,
      batch: true
    }
  })
  
  if (!inspection) {
    const err = new Error('Inspection not found')
    err.status = 404
    throw err
  }
  
  if (role === 'OPERATOR_QC' && inspection.operatorId !== operatorId) {
    const err = new Error('Not authorized to view this inspection')
    err.status = 403
    throw err
  }
  
  return inspection
}

async function triggerCv(sessionId, operatorId) {
  broadcast('cv-trigger', {
    sessionId: sessionId || null,
    operatorId,
    timestamp: new Date().toISOString()
  })
  return { success: true, message: 'CV inspection triggered' }
}

async function getActiveSessionPublic() {
  const activeSession = await prisma.session.findFirst({
    where:   { endedAt: null },
    orderBy: { startedAt: 'desc' },
    include: { operator: { select: { id: true, name: true, username: true } } },
  })

  if (!activeSession) {
    return { active: false, sessionId: null, operatorId: null, operatorName: null }
  }

  return {
    active:       true,
    sessionId:    activeSession.sessionId,
    operatorId:   activeSession.operatorId,
    operatorName: activeSession.operator.name,
    startedAt:    activeSession.startedAt,
  }
}

async function getCalibrationConfig(userId) {
  let config = await prisma.cvConfig.findFirst({
    orderBy: { updatedAt: 'desc' },
    include: { updatedByUser: { select: { username: true, name: true } } },
  })
  if (!config) {
    config = await prisma.cvConfig.create({
      data: { updatedBy: userId },
      include: { updatedByUser: { select: { username: true, name: true } } },
    })
  }
  return config
}

async function saveCalibrationConfig(userId, { pixelPerMm, toleranceMm, contourThresh, contourMinArea, minFeatureMm, roiPercent, warningDuration }) {
  const existing = await prisma.cvConfig.findFirst({ orderBy: { id: 'asc' } })
  const data = {
    pixelPerMm: parseFloat(pixelPerMm), toleranceMm: parseFloat(toleranceMm),
    contourThresh: parseInt(contourThresh), contourMinArea: parseInt(contourMinArea),
    minFeatureMm: parseFloat(minFeatureMm), roiPercent,
    warningDuration: parseFloat(warningDuration), updatedBy: userId,
  }
  const include = { updatedByUser: { select: { username: true, name: true } } }
  
  if (existing) {
    return prisma.cvConfig.update({ where: { id: existing.id }, data, include })
  } else {
    return prisma.cvConfig.create({ data, include })
  }
}

async function getCalibrationConfigPublic() {
  const config = await prisma.cvConfig.findFirst({ orderBy: { updatedAt: 'desc' } })
  if (!config) {
    return { pixel_per_mm: 9.28, tolerance_mm: 1.0, contour_thresh: 200, contour_min_area: 1500, min_feature_mm: 5.0, roi_percent: [0.20, 0.10, 0.80, 0.90], warning_duration: 5.0 }
  }
  return { 
    pixel_per_mm: config.pixelPerMm, 
    tolerance_mm: config.toleranceMm, 
    contour_thresh: config.contourThresh, 
    contour_min_area: config.contourMinArea, 
    min_feature_mm: config.minFeatureMm, 
    roi_percent: config.roiPercent, 
    warning_duration: config.warningDuration 
  }
}

module.exports = {
  startSession,
  stopSession,
  getSessionDashboard,
  processOnlineInspection,
  processCvInspection,
  processManualInspection,
  getParts,
  getInspectionDetail,
  triggerCv,
  getActiveSessionPublic,
  getCalibrationConfig,
  saveCalibrationConfig,
  getCalibrationConfigPublic
}
