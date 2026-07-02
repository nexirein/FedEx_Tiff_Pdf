import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    const numPages = metadata.pages || 1

    const pdfDoc = await PDFDocument.create()

    for (let i = 0; i < numPages; i++) {
      const jpgBuffer = await sharp(buffer, { page: i })
        .jpeg({ quality: 90 })
        .toBuffer()

      const jpgImage = await pdfDoc.embedJpg(jpgBuffer)
      const { width, height } = jpgImage.scale(1)

      const page = pdfDoc.addPage([width, height])
      page.drawImage(jpgImage, {
        x: 0,
        y: 0,
        width,
        height,
      })
    }

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${file.name.replace(/\.(tiff|tif)$/i, '.pdf')}"`,
      },
    })
  } catch (error) {
    console.error('Conversion error:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to convert file' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
