import { PDFDocument, StandardFonts, rgb, PDFName, PDFNumber, PDFArray, PDFString } from 'pdf-lib'

export const LOGO_PATH = '/fedex-logo.png'

const COMPANY_NAME = 'Fedex Express Transportation And Supply Chain Services (India) Private Ltd'
const ADDRESS_LINE = '1st Floor, EICI Building, New Courier Terminal, IGI Airport, New Delhi -110037'

const STATIC_CHARGES = [
  ['CHARGES COLLECT ON AWB', 'Rs. 0'],
  ['CARTAGE CHARGES', 'Rs. 0'],
  ['DELIVERY ORDER CHARGES', 'Rs. 2600'],
  ['SERVICE CHARGES', 'Rs. 0'],
  ['GST Charges 18%', 'Rs. 468'],
  ['TOTAL CHARGES PAYABLE', 'Rs. 3068 (Rounded)'],
]

const BODY_PARAGRAPH_SEGMENTS = [
  [
    { text: 'We are pleased to advice you that your consignment, as per details above, has arrived in ' },
    { text: 'Delhi', bold: true },
    { text: ' and has been lodged with the ' },
    { text: 'GMR Import Warehouse', bold: true },
    { text: '.' },
  ],
  [
    { text: 'Please collect the ' },
    { text: 'Delivery Order', bold: true },
    { text: ', against payment of the charges indicated above, by cash /Demand Draft /Pay Order in favour of Fedex Express Transportation And Supply Chain Services (India) Private Ltd.' },
  ],
  [
    { text: 'In case of Charges Collect Shipments kindly note that a separate Demand Draft /Pay Order be is issued for Charges Collect on ' },
    { text: 'AWB+5% Charges Collect Fee', bold: true },
    { text: ' in favour of Fedex Express Transportation And Supply Chain Services (India) Private Ltd.' },
  ],
  [
    { text: 'Delivery Orders will be issued between ' },
    { text: '9.30 AM & 17.30 Hrs', bold: true },
    { text: ' * kindly note that Delivery Orders will not be issued on second Saturday of every month being a ' },
    { text: 'Customs Holiday', bold: true },
    { text: ' and on all other Customs Holidays.' },
  ],
  [
    { text: 'Please also note that if the consignment is not cleared through Customs within ' },
    { text: '48 hours', bold: true },
    { text: ' of its arrival in ' },
    { text: 'Delhi', bold: true },
    { text: ', ' },
    { text: 'Demurrage charges', bold: true },
    { text: ' will be payable at the ' },
    { text: 'GMR Warehouse', bold: true },
    { text: ', at the current rates, Further, if cargo(except baggage, precious consignments and cold storage goods) deposited is not cleared within ' },
    { text: '03 days', bold: true },
    { text: ' of arrival in ' },
    { text: 'Delhi', bold: true },
    { text: " the same will be transferred to the " },
    { text: 'GMR Import Warehouse', bold: true },
    { text: ", at the consignee's cost and Charges for cold storage where applicable will be, collected at the Cargo Comple" },
  ],
  [
    { text: 'Clearance through Customs can be effected by you or your authorized licensed Customs House Clearing Agents.' },
  ],
  [
    { text: 'In all your correspondence with us regarding this consignment please mention the ' },
    { text: 'Airway bill number and Flight particulars', bold: true },
    { text: ' as given in this notice.' },
  ],
  [
    { text: 'Photocopy of photo I.D.', bold: true },
    { text: ' is compulsory for delivery' },
  ],
]

const NOTE_INTRO = 'Effective November 22, 2023, there is change in the Late collection, fees applicable on the Delivery Order (DO) on Inbound shipments. In case the DO is not collected on the day of arrival, an additional fee of INR 1000 + GST will be applicable.'

const NOTE_HEADERS = ['DAYS', 'DO CHARGES', 'ADMIN CHARGES', 'TOTAL CHARGES', 'GST @18%', 'TOTAL']
const NOTE_COL_WIDTHS = [155, 65, 85, 85, 65, 60]
const NOTE_ROWS = [
  ['DAY OF ARRIVAL(CAN ISSUED DATE)', 'Rs. 2,600.00', 'Rs. 0.00', 'Rs. 2,600.00', 'Rs. 468.00', 'Rs. 3068.00'],
  ['FROM NEXT DAY OF ARRIVAL', 'Rs. 2,600.00', 'Rs. 1000.00', 'Rs. 3600.00', 'Rs. 648.00', 'Rs. 4248.00'],
]

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function drawWrappedParagraph(page, { text, x, y, maxWidth, font, size, lineHeight }) {
  const lines = wrapText(text, font, size, maxWidth)
  let cursor = y
  for (const line of lines) {
    page.drawText(line, { x, y: cursor, size, font })
    cursor -= lineHeight
  }
  return cursor
}

const GLUE_TOKEN_PATTERN = /^[.,;:!?)]+$/

function tokenizeSegments(segments) {
  const tokens = []
  for (const seg of segments) {
    const words = seg.text.split(' ').filter((w) => w.length > 0)
    for (const word of words) {
      tokens.push({ text: word, bold: !!seg.bold, glue: GLUE_TOKEN_PATTERN.test(word) })
    }
  }
  return tokens
}

function wrapMixedTokens(tokens, { helv, helvBold, size, maxWidth }) {
  const spaceWidth = helv.widthOfTextAtSize(' ', size)
  const lines = []
  let current = []
  let currentWidth = 0
  for (const token of tokens) {
    const font = token.bold ? helvBold : helv
    const w = font.widthOfTextAtSize(token.text, size)
    const gap = token.glue ? 0 : spaceWidth
    const addWidth = current.length > 0 ? gap + w : w
    if (current.length > 0 && currentWidth + addWidth > maxWidth) {
      lines.push(current)
      current = [token]
      currentWidth = w
    } else {
      current.push(token)
      currentWidth += addWidth
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function drawMixedParagraph(page, { segments, x, y, maxWidth, helv, helvBold, size, lineHeight }) {
  const tokens = tokenizeSegments(segments)
  const lines = wrapMixedTokens(tokens, { helv, helvBold, size, maxWidth })
  const spaceWidth = helv.widthOfTextAtSize(' ', size)
  let cursorY = y
  for (const line of lines) {
    let cursorX = x
    line.forEach((token, i) => {
      const font = token.bold ? helvBold : helv
      if (i > 0 && !token.glue) cursorX += spaceWidth
      page.drawText(token.text, { x: cursorX, y: cursorY, size, font })
      cursorX += font.widthOfTextAtSize(token.text, size)
    })
    cursorY -= lineHeight
  }
  return cursorY
}

function drawBulletSegments(page, { segments, x, y, maxWidth, helv, helvBold, size, lineHeight }) {
  page.drawText('-', { x, y, size, font: helv })
  return drawMixedParagraph(page, { segments, x: x + 10, y, maxWidth: maxWidth - 10, helv, helvBold, size, lineHeight })
}

function rowBaseline(rowHeight) {
  return Math.max(rowHeight / 2 - 3, 4)
}

function drawGridRow(page, { x0, x1, y, rowHeight, cells, colWidths, labelFont, valueFont, labelSize, valueSize }) {
  page.drawRectangle({ x: x0, y: y - rowHeight, width: x1 - x0, height: rowHeight, borderWidth: 1, borderColor: rgb(0, 0, 0) })
  const baseline = y - rowHeight + rowBaseline(rowHeight)
  let colX = x0
  cells.forEach((cell, i) => {
    if (i > 0) {
      page.drawLine({ start: { x: colX, y }, end: { x: colX, y: y - rowHeight }, thickness: 1, color: rgb(0, 0, 0) })
    }
    if (cell.label !== undefined) {
      const labelWidth = labelFont.widthOfTextAtSize(String(cell.label), labelSize)
      page.drawText(String(cell.label), { x: colX + 6, y: baseline, size: labelSize, font: labelFont })
      if (cell.value !== undefined) {
        const valueX = Math.min(colX + labelWidth + 18, colX + colWidths[i] * 0.55)
        page.drawText(String(cell.value ?? ''), { x: valueX, y: baseline, size: valueSize, font: valueFont })
      }
    } else if (cell.value !== undefined) {
      page.drawText(String(cell.value ?? ''), { x: colX + 6, y: baseline, size: valueSize, font: valueFont })
    }
    colX += colWidths[i]
  })
  return y - rowHeight
}

export async function generateUbondConsolPdf(row) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width } = page.getSize()

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const logoResp = await fetch(LOGO_PATH)
  const logoBytes = await logoResp.arrayBuffer()
  const logoImg = await pdfDoc.embedPng(logoBytes)

  const marginX = 40
  const rightX = width - marginX
  let y = 800

  const logoDims = logoImg.scale(85 / logoImg.width)
  page.drawImage(logoImg, { x: marginX, y: y - logoDims.height + 20, width: logoDims.width, height: logoDims.height })

  const headerTextX = marginX + 100
  const headerTextWidth = rightX - headerTextX
  const nameLines = wrapText(COMPANY_NAME, helvBold, 11, headerTextWidth)
  let headerY = y + 12
  for (const line of nameLines) {
    page.drawText(line, { x: headerTextX, y: headerY, size: 11, font: helvBold })
    headerY -= 13
  }
  page.drawText(ADDRESS_LINE, { x: headerTextX, y: headerY - 2, size: 8.5, font: helv })

  y -= 42

  const title = 'CARGO ARRIVAL NOTICE'
  const titleWidth = helvBold.widthOfTextAtSize(title, 13)
  const boxWidth = 250
  const boxX = (width - boxWidth) / 2
  page.drawRectangle({ x: boxX, y: y - 7, width: boxWidth, height: 22, borderWidth: 1, borderColor: rgb(0, 0, 0) })
  page.drawText(title, { x: (width - titleWidth) / 2, y: y, size: 13, font: helvBold })

  y -= 42

  page.drawText('CONSIGNEE NOTIFY', { x: marginX, y, size: 10, font: helvBold })
  const dateStr = `DATE: ${row.date || ''}`
  const dateWidth = helv.widthOfTextAtSize(dateStr, 10)
  page.drawText(dateStr, { x: rightX - dateWidth, y, size: 10, font: helv })
  y -= 16
  page.drawText(row.consigneeName, { x: marginX, y, size: 10, font: helv })

  y -= 16

  const lightRed = rgb(0.85, 0.25, 0.25)
  const noteBefore = "Please note that the shipment's IGM is not manifested yet, kindly monitor "
  const noteLink = "AIR IGM"
  const noteAfter = " for the same."
  const noteSize = 8.5
  const linkUrl = 'https://foservices.icegate.gov.in/#/public-enquiries/document-status/air-igm'

  const beforeWidth = helvBold.widthOfTextAtSize(noteBefore, noteSize)
  const linkWidth = helvBold.widthOfTextAtSize(noteLink, noteSize)

  page.drawText(noteBefore, { x: marginX, y, size: noteSize, font: helvBold, color: lightRed })
  page.drawText(noteLink, { x: marginX + beforeWidth, y, size: noteSize, font: helvBold, color: rgb(0, 0, 0.8) })

  const underlineY = y - 2
  page.drawLine({ start: { x: marginX + beforeWidth, y: underlineY }, end: { x: marginX + beforeWidth + linkWidth, y: underlineY }, thickness: 0.5, color: rgb(0, 0, 0.8) })

  const linkRect = [marginX + beforeWidth, underlineY - 10, marginX + beforeWidth + linkWidth, underlineY + 8]
  const linkAnnotationDict = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: linkRect,
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(linkUrl),
    },
  })
  const linkAnnotation = pdfDoc.context.register(linkAnnotationDict)
  page.node.addAnnot(linkAnnotation)

  page.drawText(noteAfter, { x: marginX + beforeWidth + linkWidth, y, size: noteSize, font: helvBold, color: lightRed })

  y -= 16

  const tableX0 = marginX
  const tableX1 = rightX
  const halfWidth = (tableX1 - tableX0) / 2
  const rowH = 24
  const labelSize = 9
  const valueSize = 9.5

  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'AWB NO', value: row.awbNo },
      { label: 'COMMIT DATE', value: row.commitDate },
    ],
    colWidths: [halfWidth, halfWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'PIECES', value: row.pieces },
      { label: 'WEIGHT', value: `${row.weight} KGS` },
    ],
    colWidths: [halfWidth, halfWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'VALUE', value: `INR ${row.value}` },
      { label: 'FREIGHT', value: `${row.currency} ${row.freight}` },
    ],
    colWidths: [halfWidth, halfWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  for (const [label, value] of STATIC_CHARGES) {
    y = drawGridRow(page, {
      x0: tableX0,
      x1: tableX1,
      y,
      rowHeight: rowH,
      cells: [{ label, value: undefined }],
      colWidths: [tableX1 - tableX0],
      labelFont: helvBold,
      valueFont: helv,
      labelSize,
      valueSize,
    })
    page.drawText(value, { x: tableX1 - 110, y: y + rowBaseline(rowH), size: valueSize, font: helv })
  }

  y -= 18

  page.drawText('Dear Sir / Madam,', { x: marginX, y, size: 9.5, font: helv })
  y -= 18

  for (const segments of BODY_PARAGRAPH_SEGMENTS) {
    y = drawBulletSegments(page, { segments, x: marginX, y, maxWidth: tableX1 - marginX, helv, helvBold, size: 8.5, lineHeight: 11.5 })
    y -= 6
  }

  y -= 12

  page.drawText('Note :-', { x: marginX, y, size: 9.5, font: helvBold })
  y -= 14
  y = drawWrappedParagraph(page, { text: NOTE_INTRO, x: marginX, y, maxWidth: tableX1 - marginX, font: helv, size: 8.5, lineHeight: 11.5 })

  y -= 14

  const noteRowH = 20

  y = drawGridRow(page, {
    x0: tableX0,
    x1: tableX1,
    y,
    rowHeight: noteRowH,
    cells: NOTE_HEADERS.map((h) => ({ label: h, value: undefined })),
    colWidths: NOTE_COL_WIDTHS,
    labelFont: helvBold,
    valueFont: helv,
    labelSize: 8,
    valueSize: 8,
  })

  for (const rowVals of NOTE_ROWS) {
    y = drawGridRow(page, {
      x0: tableX0,
      x1: tableX1,
      y,
      rowHeight: noteRowH,
      cells: rowVals.map((v) => ({ label: v, value: undefined })),
      colWidths: NOTE_COL_WIDTHS,
      labelFont: helv,
      valueFont: helv,
      labelSize: 8,
      valueSize: 8,
    })
  }

  y -= 24

  page.drawText(COMPANY_NAME, { x: marginX, y, size: 9.5, font: helvBold })
  y -= 14
  page.drawText('Cargo Services', { x: marginX, y, size: 9.5, font: helvBold })

  return await pdfDoc.save()
}
