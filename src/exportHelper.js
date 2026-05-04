const { Parser } = require('json2csv')
const PDFDocument = require('pdfkit')

const FIELDS = [
  { label: 'Timestamp', value: 'timestamp' },
  { label: 'Part Code', value: 'part.partCode' },
  { label: 'Part Name', value: 'part.partName' },
  { label: 'Operator', value: 'operator.name' },
  { label: 'ID Part', value: 'idPart' },
  { label: 'Shape', value: 'shape' },
  { label: 'Status', value: 'status' },
  { label: 'Matched Ref', value: 'matchedRef' },
  { label: 'Image Path', value: 'imagePath' },
]

const exportCSV = (res, data, filename = 'export.csv') => {
  try {
    const parser = new Parser({ fields: FIELDS })
    const csv    = parser.parse(data)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    res.status(500).json({ message: 'Export failed', error: err.message })
  }
}

const exportPDF = (res, data, title = 'Inspection Report', filename = 'export.pdf') => {
  try {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    doc.pipe(res)

    doc.fontSize(14).text(title, { align: 'center' })
    doc.fontSize(9).text(`Generated: ${new Date().toISOString()}`, { align: 'center' })
    doc.moveDown()

    const headers = ['Timestamp', 'Part Code', 'Part Name', 'Operator', 'ID Part', 'Shape', 'Status', 'Matched Ref']
    const colW    = [120, 80, 100, 80, 80, 60, 50, 100]
    let x = 30, y = doc.y

    headers.forEach((h, i) => {
      doc.rect(x, y, colW[i], 16).stroke()
      doc.text(h, x + 2, y + 3, { width: colW[i] - 4 })
      x += colW[i]
    })

    data.forEach(row => {
      y += 16
      if (y > 540) { doc.addPage(); y = 30 }
      x = 30
      const cols = [
        new Date(row.timestamp).toLocaleString('id-ID'),
        row.part?.partCode || '',
        row.part?.partName || '',
        row.operator?.name || '',
        row.idPart || '',
        row.shape || '',
        row.status,
        row.matchedRef || '',
      ]
      cols.forEach((val, i) => {
        doc.rect(x, y, colW[i], 16).stroke()
        doc.text(String(val ?? ''), x + 2, y + 3, { width: colW[i] - 4 })
        x += colW[i]
      })
    })

    doc.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Export failed', error: err.message })
    }
  }
}

module.exports = { exportCSV, exportPDF }
