import * as UTIF from 'utif'
import { PDFDocument } from 'pdf-lib'

export async function tiffToPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const ifds = UTIF.decode(arrayBuffer)

  if (!ifds || ifds.length === 0) {
    throw new Error('No image data found in TIFF')
  }

  const pdfDoc = await PDFDocument.create()

  for (const pageData of ifds) {
    UTIF.decodeImage(arrayBuffer, pageData)
    const rgba = UTIF.toRGBA8(pageData)
    const { width, height } = pageData

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    const imageData = ctx.createImageData(width, height)
    imageData.data.set(rgba)
    ctx.putImageData(imageData, 0, 0)

    const jpegBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    const jpegBuffer = await jpegBlob.arrayBuffer()

    const jpgImage = await pdfDoc.embedJpg(jpegBuffer)
    const { width: pgWidth, height: pgHeight } = jpgImage.scale(1)

    const page = pdfDoc.addPage([pgWidth, pgHeight])
    page.drawImage(jpgImage, { x: 0, y: 0, width: pgWidth, height: pgHeight })
  }

  return await pdfDoc.save()
}
