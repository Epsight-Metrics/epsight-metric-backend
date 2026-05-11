const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Seed Users
  const users = [
    { username: 'admin',    password: 'admin123',    name: 'Administrator',    role: 'ADMIN' },
    { username: 'operator1',password: 'operator123', name: 'Budi Santoso',     role: 'OPERATOR_QC' },
    { username: 'operator2',password: 'operator123', name: 'Siti Rahayu',      role: 'OPERATOR_QC' },
    { username: 'engineer1',password: 'engineer123', name: 'Andi Wijaya',      role: 'ENGINEER' },
    { username: 'qcmanager',password: 'manager123',  name: 'Dewi Kusuma',      role: 'QUALITY_MANAGER' },
    { username: 'auditor1', password: 'audit123',    name: 'Rudi Hartono',     role: 'AUDIT' },
  ]

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, password: await bcrypt.hash(u.password, 10) },
    })
  }

  // Seed Parts
  const parts = [
    { partCode: 'PT-001', partName: 'Bracket A',    vendorName: 'PT Maju Jaya' },
    { partCode: 'PT-002', partName: 'Shaft B',      vendorName: 'CV Teknik Mandiri' },
    { partCode: 'PT-003', partName: 'Housing C',    vendorName: 'PT Maju Jaya' },
    { partCode: 'PT-004', partName: 'Gear D',       vendorName: 'PT Presisi Utama' },
    { partCode: 'PT-005', partName: 'Cover Plate E',vendorName: 'CV Teknik Mandiri' },
  ]

  for (const p of parts) {
    await prisma.part.upsert({
      where: { partCode: p.partCode },
      update: {},
      create: p,
    })
  }

  // Seed Inspections (30 records spread over last 7 days) - only if empty
  const existingInspections = await prisma.inspection.count()
  
  if (existingInspections === 0) {
    const operator1 = await prisma.user.findUnique({ where: { username: 'operator1' } })
    const operator2 = await prisma.user.findUnique({ where: { username: 'operator2' } })
    const allParts  = await prisma.part.findMany()

    const statuses = ['OK', 'OK', 'OK', 'NG', 'OK', 'OK', 'NG', 'OK']

    for (let i = 0; i < 30; i++) {
      const daysAgo  = Math.floor(i / 5)
      const ts       = new Date(Date.now() - daysAgo * 86400000 - i * 600000)
      const part     = allParts[i % allParts.length]
      const operator = i % 2 === 0 ? operator1 : operator2
      const status   = statuses[i % statuses.length]

      await prisma.inspection.create({
        data: {
          partId:     part.id,
          operatorId: operator.id,
          status,
          shape:      ['circle', 'rectangle', 'triangle'][i % 3],
          timestamp:  ts,
        },
      })
    }
  }

  // Seed Activity Logs - only if empty
  const existingLogs = await prisma.activityLog.count()
  if (existingLogs === 0) {
    const admin     = await prisma.user.findUnique({ where: { username: 'admin' } })
    const operator1 = await prisma.user.findUnique({ where: { username: 'operator1' } })
    const operator2 = await prisma.user.findUnique({ where: { username: 'operator2' } })
    await prisma.activityLog.createMany({
      data: [
        { userId: admin.id,     action: 'LOGIN',       detail: 'Admin login' },
        { userId: operator1.id, action: 'INSPECTION',  detail: 'Inspected PT-001' },
        { userId: operator2.id, action: 'INSPECTION',  detail: 'Inspected PT-002' },
        { userId: admin.id,     action: 'CREATE_USER', detail: 'Created user operator2' },
      ]
    })
  }

  console.log('Seeding completed.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
