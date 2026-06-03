require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Checking references in database...\n')
  
  const references = await prisma.reference.findMany({
    orderBy: { createdAt: 'desc' }
  })
  
  console.log(`Found ${references.length} reference(s):\n`)
  
  references.forEach(ref => {
    console.log(`ID: ${ref.id}`)
    console.log(`Name: ${ref.name}`)
    console.log(`Shape: ${ref.shape}`)
    console.log(`Diameter: ${ref.diameterMm} mm`)
    console.log(`Width: ${ref.widthMm} mm`)
    console.log(`Height: ${ref.heightMm} mm`)
    console.log(`Tolerance: ${ref.toleranceMm} mm`)
    console.log(`Created: ${ref.createdAt}`)
    console.log(`Created By: ${ref.createdBy}`)
    console.log('---')
  })
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
