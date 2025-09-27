import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface InvoicePDFInput {
  invoiceNumber: string
  issuedAt: Date
  billTo: { name: string; email: string }
  lineItems: { description: string; amountPaise: number }[]
  subtotalPaise: number
  taxPaise: number
  totalPaise: number
}

export async function generateInvoicePDF(data: InvoicePDFInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const { height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  let y = height - 50
  const fontSize = 14

  const draw = (text: string, options: { size?: number; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(text, { x: 50, y, size: options.size || fontSize, font, color: options.color ?? rgb(0,0,0) })
    y -= (options.size || fontSize) + 8
  }

  draw('Ganges Healers — Invoice', { size: 20 })
  draw(`Invoice Number: ${data.invoiceNumber}`)
  draw(`Issued At: ${data.issuedAt.toISOString()}`)
  draw('')
  draw('Bill To:', { size: 16 })
  draw(data.billTo.name)
  draw(data.billTo.email)
  draw('')
  draw('Line Items:', { size: 16 })
  data.lineItems.forEach(item => {
    draw(`- ${item.description}  INR ${(item.amountPaise/100).toFixed(2)}`)
  })
  draw('')
  draw(`Subtotal: INR ${(data.subtotalPaise/100).toFixed(2)}`)
  draw(`Tax: INR ${(data.taxPaise/100).toFixed(2)}`)
  draw(`Total: INR ${(data.totalPaise/100).toFixed(2)}`, { size: 16 })
  draw('')
  draw('Thank you')

  return await doc.save()
}
