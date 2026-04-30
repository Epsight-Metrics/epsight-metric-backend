const { Parser } = require('json2csv')
const PDFDocument = require('pdfkit')

const FIELDS = [
  { label: 'Timestamp',              value: 'timestamp' },
  { label: 'Part Name',              value: 'part.partName' },
  { label: 'Part Code',              value: 'part.partCode' },
  { label: 'Vendor',                 value: 'part.vendorName' },
  { label: 'Quantity',               value: 'quantity' },
  { label: 'Length',                 value: 'length' },
  { label: 'Width',                  value: 'width' },
  { label: 'Diameter',               value: 'diameter' },
  { label: 'Status',                 value: 'status' },
  { label: 'Operator',               value: 'operator.name' },
  { label: 'Engineer Config Version',value: 'engineerConfigVersion' },
  { label: 'Data Hash',              value: 'dataHash' },
]

const exportCSV = (res, data, filename = 'export.csv') => {
  const parser = new Parser({ fields: FIELDS })
  const csv    = parser.parse(data)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

const exportPDF = (res, data, title = 'Inspection Report', filename = 'export.pdf') => {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)

  doc.fontSize(14).text(title, { align: 'center' })
  doc.fontSize(9).text(`Generated: ${new Date().toISOString()}`, { align: 'center' })
  doc.moveDown()

  // Header
  const headers = ['Timestamp', 'Part', 'Code', 'Vendor', 'Qty', 'L', 'W', 'D', 'Status', 'Operator']
  const colW    = [130, 80, 60, 80, 25, 30, 30, 30, 35, 80]
  let x = 30, y = doc.y

  headers.forEach((h, i) => {
    doc.rect(x, y, colW[i], 16).stroke()
    doc.text(h, x + 2, y + 3, { width: colW[i] - 4 })
    x += colW[i]
  })

  // Rows
  data.forEach(row => {
    y += 16
    if (y > 540) { doc.addPage(); y = 30 }
    x = 30
    const cols = [
      new Date(row.timestamp).toLocaleString('id-ID'),
      row.part?.partName   || '',
      row.part?.partCode   || '',
      row.part?.vendorName || '',
      row.quantity,
      row.length,
      row.width,
      row.diameter,
      row.status,
      row.operator?.name   || '',
    ]
    cols.forEach((val, i) => {
      doc.rect(x, y, colW[i], 16).stroke()
      doc.text(String(val ?? ''), x + 2, y + 3, { width: colW[i] - 4 })
      x += colW[i]
    })
  })

  doc.end()
}

module.exports = { exportCSV, exportPDF }
