const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const { generateInspectionHash } = require('../src/utils/hashGenerator')
require('dotenv').config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function migrateExistingInspections() {
  console.log('🔄 Starting hash migration for existing inspections...\n')
  
  try {
    // Get all inspections without hash
    const inspections = await prisma.inspection.findMany({
      where: { hash: null }
    })
    
    if (inspections.length === 0) {
      console.log('✓ No inspections need migration. All inspections already have hash.')
      return
    }
    
    console.log(`Found ${inspections.length} inspections without hash\n`)
    
    let processed = 0
    let errors = 0
    
    // Process in batches of 100
    const batchSize = 100
    for (let i = 0; i < inspections.length; i += batchSize) {
      const batch = inspections.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (inspection) => {
          try {
            const hash = generateInspectionHash(inspection)
            
            await prisma.inspection.update({
              where: { id: inspection.id },
              data: { hash }
            })
            
            processed++
          } catch (err) {
            console.error(`✗ Error processing inspection ${inspection.id}:`, err.message)
            errors++
          }
        })
      )
      
      console.log(`Progress: ${Math.min(i + batchSize, inspections.length)}/${inspections.length} (${((Math.min(i + batchSize, inspections.length) / inspections.length) * 100).toFixed(1)}%)`)
    }
    
    console.log('\n📊 Migration Summary:')
    console.log(`✓ Successfully processed: ${processed}`)
    console.log(`✗ Errors: ${errors}`)
    console.log(`✓ Total: ${inspections.length}`)
    
    if (errors === 0) {
      console.log('\n🎉 Migration completed successfully!')
    } else {
      console.log('\n⚠️  Migration completed with some errors. Please check the logs.')
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  }
}

async function verifyIntegrity() {
  console.log('\n🔍 Verifying data integrity...\n')
  
  try {
    const inspections = await prisma.inspection.findMany({
      where: { hash: { not: null } },
      take: 10 // Sample 10 inspections
    })
    
    let valid = 0
    let invalid = 0
    
    for (const inspection of inspections) {
      const calculatedHash = generateInspectionHash(inspection)
      if (inspection.hash === calculatedHash) {
        valid++
      } else {
        invalid++
        console.log(`⚠️  Inspection ${inspection.id}: Hash mismatch!`)
      }
    }
    
    console.log(`✓ Valid: ${valid}/${inspections.length}`)
    console.log(`✗ Invalid: ${invalid}/${inspections.length}`)
    
    if (invalid === 0) {
      console.log('\n✅ All sampled inspections have valid integrity!')
    }
    
  } catch (err) {
    console.error('❌ Verification failed:', err)
  }
}

async function main() {
  await migrateExistingInspections()
  await verifyIntegrity()
}

main()
  .catch(e => { 
    console.error('❌ Fatal error:', e)
    process.exit(1) 
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
