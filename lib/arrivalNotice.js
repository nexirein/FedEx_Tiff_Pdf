import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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

// Each bullet is an array of {text, bold} segments so key phrases can be highlighted bold in the PDF
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
    { text: '03 working days', bold: true },
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
const NOTE_COL_WIDTHS = [175, 65, 75, 75, 65, 60]
const NOTE_ROWS = [
  ['DAY OF ARRIVAL(CAN ISSUED DATE)', 'Rs. 2,600.00', 'Rs. 0.00', 'Rs. 2,600.00', 'Rs. 468.00', 'Rs. 3068.00'],
  ['FROM NEXT DAY OF ARRIVAL', 'Rs. 2,600.00', 'Rs. 1000.00', 'Rs. 3600.00', 'Rs. 648.00', 'Rs. 4248.00'],
]

// Supports formats with or without commas between segments, and flight dates in
// either DD-MM-YYYY or DD MonthName YYYY format.
const MAWB_PATTERN = /MAWB[-\s]*(\d+)\s+(\d+)\s*,?\s*IGM[-\s]*(\d+)\s*,?\s*Flight[-\s]*([^,\s]+)\s*,?\s*Dt\s*-?\s*(.+)/i

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function normalizeFlightDate(raw) {
  const trimmed = raw.trim()
  // Already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return trimmed
  // DD MonthName YYYY (e.g. "07 July 2026" or "07 Jul 2026")
  const m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase().slice(0, 3)]
    if (month) return `${String(m[1]).padStart(2, '0')}-${month}-${m[3]}`
  }
  return trimmed
}

export function parseMawbCell(raw) {
  if (!raw || typeof raw !== 'string') return null
  const normalized = raw.trim().replace(/\s+/g, ' ')
  const m = normalized.match(MAWB_PATTERN)
  if (!m) return null
  const [, prefix, number, igm, flight, rawDate] = m
  return {
    awbMaster: `${prefix} ${number}`,
    igm,
    flight,
    flightDate: normalizeFlightDate(rawDate),
  }
}

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

// Punctuation-only tokens (e.g. the "." after a bold segment like "Warehouse") should glue
// directly to the previous word with no inserted space.
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

export async function generateArrivalNoticePdf(row) {
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

  // The company name is too long to fit one line next to the logo at a readable size, so wrap it —
  // matches how the original FedEx template itself wraps this name across two lines.
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
  page.drawText(`DATE: ${row.date || ''}`, { x: rightX - 130, y, size: 10, font: helv })
  y -= 16
  page.drawText(row.companyName, { x: marginX, y, size: 10, font: helv })

  y -= 22

  const tableX0 = marginX
  const tableX1 = rightX
  const quarterWidth = (tableX1 - tableX0) / 4
  const thirdWidth = (tableX1 - tableX0) / 3
  const rowH = 21
  const labelSize = 9
  const valueSize = 9.5

  // Row 1: MAWB No | AWB NO | IGM NO | Flight NO
  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'MAWB NO', value: row.mawbNo },
      { label: 'AWB NO', value: row.awbNo },
      { label: 'IGM NO', value: row.igm },
      { label: 'FLIGHT NO', value: row.flight },
    ],
    colWidths: [quarterWidth, quarterWidth, quarterWidth, quarterWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  // Row 2: Origin | Destination | Flight Date
  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'ORIGIN', value: row.origin },
      { label: 'DESTINATION', value: row.destination },
      { label: 'FLIGHT DATE', value: row.flightDate },
    ],
    colWidths: [thirdWidth, thirdWidth, thirdWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  // Row 3: Pieces | Weight | Value
  y = drawGridRow(page, {
    x0: tableX0, x1: tableX1, y, rowHeight: rowH,
    cells: [
      { label: 'PIECES', value: row.pieces },
      { label: 'WEIGHT', value: `${row.weight} KGS` },
      { label: 'VALUE', value: row.value },
    ],
    colWidths: [thirdWidth, thirdWidth, thirdWidth],
    labelFont: helvBold, valueFont: helv, labelSize, valueSize,
  })

  // Row 4: Contents (full width, max 2 lines)
  const contentsStr = String(row.contents ?? '')
  const contentsLabelWidth = helvBold.widthOfTextAtSize('Contents', labelSize)
  const contentsValueX = Math.min(tableX0 + contentsLabelWidth + 18, tableX0 + (tableX1 - tableX0) * 0.55)
  const contentsMaxWidth = tableX1 - contentsValueX - 6
  const contentsLines = wrapText(contentsStr, helv, valueSize, contentsMaxWidth).slice(0, 2)
  const contentsRowH = Math.max(contentsLines.length, 1) * rowH

  page.drawRectangle({ x: tableX0, y: y - contentsRowH, width: tableX1 - tableX0, height: contentsRowH, borderWidth: 1, borderColor: rgb(0, 0, 0) })
  const baseline = y - contentsRowH + rowBaseline(contentsRowH)
  page.drawText('Contents', { x: tableX0 + 6, y: baseline, size: labelSize, font: helvBold })
  let cursor = baseline
  for (const line of contentsLines) {
    page.drawText(line, { x: contentsValueX, y: cursor, size: valueSize, font: helv })
    cursor -= 11
  }
  y -= contentsRowH

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
    y = drawBulletSegments(page, { segments, x: marginX, y, maxWidth: tableX1 - marginX, helv, helvBold, size: 8.5, lineHeight: 10.5 })
    y -= 4
  }

  y -= 6

  page.drawText('Note :-', { x: marginX, y, size: 9.5, font: helvBold })
  y -= 12
  y = drawWrappedParagraph(page, { text: NOTE_INTRO, x: marginX, y, maxWidth: tableX1 - marginX, font: helv, size: 8.5, lineHeight: 10.5 })

  y -= 12

  const noteRowH = 18

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

  y -= 18

  page.drawText(COMPANY_NAME, { x: marginX, y, size: 9.5, font: helvBold })
  y -= 12
  page.drawText('Cargo Services', { x: marginX, y, size: 9.5, font: helvBold })

  return await pdfDoc.save()
}
