const prisma = require('../db')
const { validateInspectionIntegrity } = require('../utils/hashGenerator')

async function getKPI({ dateFrom, dateTo }) {
  if (dateFrom && dateTo) {
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      const err = new Error('Invalid date format. Use YYYY-MM-DD')
      err.status = 400
      throw err
    }
    
    if (from > to) {
      const err = new Error('dateFrom cannot be greater than dateTo')
      err.status = 400
      throw err
    }
  }
  
  let startDate, endDate
  if (dateFrom && dateTo) {
    startDate = new Date(dateFrom)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(dateTo)
    endDate.setHours(23, 59, 59, 999)
  } else {
    startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date()
    endDate.setHours(23, 59, 59, 999)
  }

  const [total, ngCount, hourlyRaw] = await Promise.all([
    prisma.inspection.count({ where: { timestamp: { gte: startDate, lte: endDate } } }),
    prisma.inspection.count({ where: { timestamp: { gte: startDate, lte: endDate }, status: { in: ['NG', 'NO GOOD'] } } }),
    prisma.$queryRaw`
      SELECT DATE_TRUNC('hour', timestamp) AS hour, COUNT(*) AS count
      FROM inspeksi_log WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
      GROUP BY hour ORDER BY hour
    `,
  ])

  const okCount    = total - ngCount
  const ngRate     = total ? ((ngCount / total) * 100).toFixed(2) : 0
  const okRate     = total ? ((okCount / total) * 100).toFixed(2) : 0
  
  const hoursDiff = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60)))
  const throughput = Math.floor(total / hoursDiff)

  return { total, ngCount, okCount, ngRate, okRate, throughputPerHour: throughput }
}

async function getTrends({ period = 'day', dateFrom, dateTo }) {
  if (dateFrom && dateTo) {
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      const err = new Error('Invalid date format. Use YYYY-MM-DD')
      err.status = 400
      throw err
    }
    
    if (from > to) {
      const err = new Error('dateFrom cannot be greater than dateTo')
      err.status = 400
      throw err
    }
    
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    
    return prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', timestamp) AS period,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status IN ('NG', 'NO GOOD') THEN 1 ELSE 0 END)::int AS ng_count
      FROM inspeksi_log 
      WHERE timestamp >= ${from} AND timestamp <= ${to}
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY period ASC
    `
  }
  
  const truncMap = { day: 'hour', week: 'day', month: 'week' }
  const daysMap = { day: 1, week: 7, month: 30 }
  const trunc = truncMap[period] || 'hour'
  const days = daysMap[period] || 1
  const since = new Date(Date.now() - days * 86400000)

  return prisma.$queryRaw`
    SELECT 
      DATE_TRUNC(${trunc}::text, timestamp) AS period,
      COUNT(*)::int AS total,
      SUM(CASE WHEN status IN ('NG', 'NO GOOD') THEN 1 ELSE 0 END)::int AS ng_count
    FROM inspeksi_log 
    WHERE timestamp >= ${since}
    GROUP BY period 
    ORDER BY period
  `
}

async function getInspections({ partName, partCode, status, dateFrom, dateTo, page = 1, limit = 50 }) {
  const where = {
    ...(status && { status }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    ...(partName || partCode ? {
      part: {
        ...(partName && { partName: { contains: partName, mode: 'insensitive' } }),
        ...(partCode && { partCode: { contains: partCode, mode: 'insensitive' } }),
      }
    } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
      orderBy: { timestamp: 'desc' },
      skip:  (parseInt(page) - 1) * parseInt(limit),
      take:  parseInt(limit),
    }),
    prisma.inspection.count({ where }),
  ])

  return { data, total, page: parseInt(page), limit: parseInt(limit) }
}

async function getInspectionDetail(id) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
  })
  if (!inspection) {
    const err = new Error('Not found')
    err.status = 404
    throw err
  }
  return inspection
}

async function getExportData({ partName, partCode, status, dateFrom, dateTo }) {
  const where = {
    ...(status && { status }),
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
    ...(partName || partCode ? {
      part: {
        ...(partName && { partName: { contains: partName, mode: 'insensitive' } }),
        ...(partCode && { partCode: { contains: partCode, mode: 'insensitive' } }),
      }
    } : {}),
  }

  return prisma.inspection.findMany({
    where,
    include: { part: true, operator: { select: { name: true, username: true } }, session: true, batch: true },
    orderBy: { timestamp: 'asc' },
  })
}

async function getAlertSummary({ dateFrom, dateTo }) {
  const where = {
    status: { in: ['NG', 'NO GOOD'] },
    ...(dateFrom || dateTo ? { timestamp: {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo   && { lte: new Date(dateTo) }),
    }} : {}),
  }
  const total = await prisma.inspection.count({ where })
  return { totalNG: total }
}

async function createPart({ partCode, partName, vendorName }) {
  if (!partName || !vendorName) {
    const err = new Error('partName and vendorName are required')
    err.status = 400
    throw err
  }

  let partCodeVal = partCode
  if (!partCodeVal || partCodeVal.trim() === '') {
    let nextNumber = 1
    const maxPart = await prisma.part.findFirst({
      orderBy: { id: 'desc' }
    })
    if (maxPart) {
      nextNumber = maxPart.id + 1
    }
    
    let uniqueFound = false
    while (!uniqueFound) {
      partCodeVal = `PT-${String(nextNumber).padStart(3, '0')}`
      const duplicate = await prisma.part.findUnique({ where: { partCode: partCodeVal } })
      if (!duplicate) {
        uniqueFound = true
      } else {
        nextNumber++
      }
    }
  } else {
    const existing = await prisma.part.findUnique({ where: { partCode: partCodeVal } })
    if (existing) {
      const err = new Error(`Part with code ${partCodeVal} already exists`)
      err.status = 400
      throw err
    }
  }

  return prisma.part.create({
    data: {
      partCode: partCodeVal,
      partName,
      vendorName
    }
  })
}

async function updatePart(id, { partCode, partName, vendorName }) {
  const partId = parseInt(id)
  if (isNaN(partId)) {
    const err = new Error('Invalid part ID')
    err.status = 400
    throw err
  }

  if (!partName || !vendorName) {
    const err = new Error('partName and vendorName are required')
    err.status = 400
    throw err
  }

  const existingPart = await prisma.part.findUnique({ where: { id: partId } })
  if (!existingPart) {
    const err = new Error('Part not found')
    err.status = 404
    throw err
  }

  let partCodeVal = partCode
  if (!partCodeVal || partCodeVal.trim() === '') {
    partCodeVal = existingPart.partCode || ''
    if (partCodeVal === '') {
      let nextNumber = 1
      const maxPart = await prisma.part.findFirst({
        orderBy: { id: 'desc' }
      })
      if (maxPart) {
        nextNumber = maxPart.id + 1
      }
      let uniqueFound = false
      while (!uniqueFound) {
        partCodeVal = `PT-${String(nextNumber).padStart(3, '0')}`
        const duplicate = await prisma.part.findUnique({ where: { partCode: partCodeVal } })
        if (!duplicate) {
          uniqueFound = true
        } else {
          nextNumber++
        }
      }
    }
  } else if (partCodeVal !== existingPart.partCode) {
    const duplicate = await prisma.part.findFirst({
      where: {
        partCode: partCodeVal,
        id: { not: partId }
      }
    })
    if (duplicate) {
      const err = new Error(`Part with code ${partCodeVal} already exists`)
      err.status = 400
      throw err
    }
  }

  return prisma.part.update({
    where: { id: partId },
    data: {
      partCode: partCodeVal,
      partName,
      vendorName
    }
  })
}

async function deletePart(id) {
  const partId = parseInt(id)
  if (isNaN(partId)) {
    const err = new Error('Invalid part ID')
    err.status = 400
    throw err
  }

  const existing = await prisma.part.findUnique({ where: { id: partId } })
  if (!existing) {
    const err = new Error('Part not found')
    err.status = 404
    throw err
  }

  const count = await prisma.inspection.count({ where: { partId } })
  if (count > 0) {
    const err = new Error('Cannot delete part because it already has associated inspections')
    err.status = 400
    throw err
  }

  await prisma.part.delete({ where: { id: partId } })
  return { message: 'Part deleted successfully' }
}

async function verifyInspectionIntegrity(inspectionId) {
  if (!inspectionId) {
    const err = new Error('inspectionId is required')
    err.status = 400
    throw err
  }
  
  const inspection = await prisma.inspection.findUnique({
    where: { id: parseInt(inspectionId) }
  })
  
  if (!inspection) {
    const err = new Error('Not found')
    err.status = 404
    throw err
  }
  
  return validateInspectionIntegrity(inspection)
}

module.exports = {
  getKPI,
  getTrends,
  getInspections,
  getInspectionDetail,
  getExportData,
  getAlertSummary,
  createPart,
  updatePart,
  deletePart,
  verifyInspectionIntegrity
}
