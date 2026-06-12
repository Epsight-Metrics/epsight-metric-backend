// Utility script untuk analyze semua referensi dan detect scale mismatch
// Usage: node check-reference-scale.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function analyzeReferences() {
  console.log('\n🔍 Analyzing Reference Scale Consistency...\n')

  try {
    const references = await prisma.reference.findMany({
      orderBy: { createdAt: 'asc' }
    })

    if (references.length === 0) {
      console.log('⚠️  No references found in database')
      return
    }

    console.log(`Found ${references.length} reference(s):\n`)

    // Display all references
    references.forEach((ref, idx) => {
      console.log(`${idx + 1}. ${ref.name}`)
      console.log(`   Shape: ${ref.shape}`)
      console.log(`   Width: ${ref.widthMm.toFixed(2)} mm`)
      console.log(`   Height: ${ref.heightMm.toFixed(2)} mm`)
      console.log(`   Diameter: ${ref.diameterMm.toFixed(2)} mm`)
      console.log(`   Tolerance: ±${ref.toleranceMm.toFixed(2)} mm`)
      console.log(`   Created: ${ref.createdAt.toISOString()}`)
      console.log('')
    })

    // Analyze scale consistency
    console.log('─────────────────────────────────────────')
    console.log('📊 Scale Consistency Analysis:\n')

    let hasIssues = false

    for (let i = 0; i < references.length; i++) {
      for (let j = i + 1; j < references.length; j++) {
        const ref1 = references[i]
        const ref2 = references[j]

        const widthRatio = ref2.widthMm / ref1.widthMm
        const heightRatio = ref2.heightMm / ref1.heightMm

        // Check if ratios are close to 2.0 or 0.5 (scale mismatch indicators)
        const isWidthSuspect = (widthRatio > 1.8 && widthRatio < 2.2) || (widthRatio > 0.45 && widthRatio < 0.55)
        const isHeightSuspect = (heightRatio > 1.8 && heightRatio < 2.2) || (heightRatio > 0.45 && heightRatio < 0.55)

        if (isWidthSuspect || isHeightSuspect) {
          hasIssues = true
          console.log(`⚠️  POTENTIAL SCALE MISMATCH DETECTED!`)
          console.log(`   Between: "${ref1.name}" vs "${ref2.name}"`)
          
          if (isWidthSuspect) {
            console.log(`   Width Ratio: ${widthRatio.toFixed(2)}x`)
            console.log(`   ${ref1.name}: ${ref1.widthMm.toFixed(2)} mm`)
            console.log(`   ${ref2.name}: ${ref2.widthMm.toFixed(2)} mm`)
          }
          
          if (isHeightSuspect) {
            console.log(`   Height Ratio: ${heightRatio.toFixed(2)}x`)
            console.log(`   ${ref1.name}: ${ref1.heightMm.toFixed(2)} mm`)
            console.log(`   ${ref2.name}: ${ref2.heightMm.toFixed(2)} mm`)
          }

          if (widthRatio < 0.6 || heightRatio < 0.6) {
            console.log(`   🔧 Likely Issue: Camera was TOO FAR when capturing "${ref2.name}"`)
          } else if (widthRatio > 1.8 || heightRatio > 1.8) {
            console.log(`   🔧 Likely Issue: Camera was TOO CLOSE when capturing "${ref2.name}"`)
          }

          console.log(`   💡 Recommendation: Re-capture "${ref2.name}" with same camera distance as "${ref1.name}"`)
          console.log('')
        }
      }
    }

    if (!hasIssues) {
      console.log('✅ All references appear to have consistent scaling')
      console.log('   No suspicious ratio detected between references')
    }

    console.log('\n─────────────────────────────────────────')
    console.log('📋 Summary:\n')

    // Calculate statistics
    const widths = references.map(r => r.widthMm)
    const heights = references.map(r => r.heightMm)
    
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length
    const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length
    
    console.log(`Average Width: ${avgWidth.toFixed(2)} mm`)
    console.log(`Average Height: ${avgHeight.toFixed(2)} mm`)
    console.log(`Width Range: ${Math.min(...widths).toFixed(2)} - ${Math.max(...widths).toFixed(2)} mm`)
    console.log(`Height Range: ${Math.min(...heights).toFixed(2)} - ${Math.max(...heights).toFixed(2)} mm`)

    if (hasIssues) {
      console.log('\n⚠️  Action Required:')
      console.log('   1. Review flagged references above')
      console.log('   2. Re-capture problematic references with consistent camera setup')
      console.log('   3. Use POST /api/reference/validate before saving new references')
      console.log('   4. Read CV_CALIBRATION_GUIDE.md for detailed instructions')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
    console.log('\n')
  }
}

// Run analysis
analyzeReferences()
