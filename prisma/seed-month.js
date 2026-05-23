const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding 1 month inspection data for Andi Wijaya...')

  // Get Andi Wijaya (engineer1)
  const andi = await prisma.user.findUnique({ 
    where: { username: 'engineer1' } 
  })
  
  if (!andi) {
    console.error('❌ User engineer1 (Andi Wijaya) not found!')
    console.log('Run: npm run db:seed first')
    return
  }

  console.log(`✓ Found operator: ${andi.name} (ID: ${andi.id})`)

  // Get all parts
  const parts = await prisma.part.findMany()
  console.log(`✓ Found ${parts.length} parts`)

  // Create sessions for last 30 days (1 session per day)
  const sessions = []
  const today = new Date()
  
  for (let day = 0; day < 30; day++) {
    const sessionDate = new Date(today)
    sessionDate.setDate(today.getDate() - day)
    sessionDate.setHours(8, 0, 0, 0) // Start at 8 AM
    
    const sessionId = `SES-${sessionDate.getTime()}-${andi.id}`
    
    const session = await prisma.session.upsert({
      where: { sessionId },
      update: {},
      create: {
        sessionId,
        operatorId: andi.id,
        startedAt: sessionDate,
        endedAt: new Date(sessionDate.getTime() + 8 * 3600000), // 8 hours later (4 PM)
      },
    })
    
    sessions.push(session)
  }
  
  console.log(`✓ Created ${sessions.length} sessions (1 per day for 30 days)`)

  // Create inspections
  // Pattern: 50-80 inspections per day, distributed throughout work hours
  const statuses = ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'NG'] // 87.5% OK rate
  const shapes = ['CIRCLE', 'RECTANGLE', 'SQUARE', 'HEXAGON', 'OVAL']
  
  let totalInspections = 0
  let totalNG = 0

  for (let dayIndex = 0; dayIndex < sessions.length; dayIndex++) {
    const session = sessions[dayIndex]
    const sessionDate = new Date(session.startedAt)
    
    // Random inspections per day (50-80)
    const inspectionsPerDay = Math.floor(Math.random() * 31) + 50
    
    for (let i = 0; i < inspectionsPerDay; i++) {
      // Distribute inspections throughout 8-hour workday
      const minutesOffset = Math.floor((i / inspectionsPerDay) * 480) // 480 minutes = 8 hours
      const inspectionTime = new Date(sessionDate.getTime() + minutesOffset * 60000)
      
      // Random part
      const part = parts[Math.floor(Math.random() * parts.length)]
      
      // Status (87.5% OK, 12.5% NG)
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      if (status === 'NG') totalNG++
      
      // Shape
      const shape = shapes[Math.floor(Math.random() * shapes.length)]
      
      // Dimensions (realistic values with some variation)
      const baseDiameter = 50
      const baseThickness = 10
      const baseLength = 100
      const baseWidth = 50
      
      // Add variation: OK parts have small variation, NG parts have larger variation
      const variation = status === 'OK' ? 0.5 : 2.0
      
      const nilaiDimensi = {
        diameter: parseFloat((baseDiameter + (Math.random() - 0.5) * variation).toFixed(2)),
        thickness: parseFloat((baseThickness + (Math.random() - 0.5) * variation).toFixed(2)),
        length: parseFloat((baseLength + (Math.random() - 0.5) * variation).toFixed(2)),
        width: parseFloat((baseWidth + (Math.random() - 0.5) * variation).toFixed(2)),
      }
      
      await prisma.inspection.create({
        data: {
          partId: part.id,
          operatorId: andi.id,
          sessionId: session.sessionId,
          idPart: `${part.partCode}-${String(totalInspections + 1).padStart(5, '0')}`,
          shape,
          status,
          matchedRef: `REF-${part.partCode}-${Math.floor(Math.random() * 10)}`,
          imagePath: `/images/inspection-${inspectionTime.getTime()}-${totalInspections}.jpg`,
          nilaiDimensi,
          timestamp: inspectionTime,
        },
      })
      
      totalInspections++
    }
    
    console.log(`✓ Day ${dayIndex + 1}/30: ${inspectionsPerDay} inspections created`)
  }

  console.log('\n📊 Summary:')
  console.log(`✓ Total sessions: ${sessions.length}`)
  console.log(`✓ Total inspections: ${totalInspections}`)
  console.log(`✓ Total NG: ${totalNG} (${((totalNG / totalInspections) * 100).toFixed(2)}%)`)
  console.log(`✓ Total OK: ${totalInspections - totalNG} (${(((totalInspections - totalNG) / totalInspections) * 100).toFixed(2)}%)`)
  console.log(`✓ Average per day: ${Math.floor(totalInspections / 30)}`)
  console.log(`✓ Operator: ${andi.name} (${andi.username})`)
  console.log('\n🎉 Seeding completed!')
}

main()
  .catch(e => { 
    console.error('❌ Error:', e)
    process.exit(1) 
  })
  .finally(() => prisma.$disconnect())
