'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { parseMawbCell, generateArrivalNoticePdf } from '../../lib/arrivalNotice'
import NavTabs from '../../components/NavTabs'

const COL = {
  DATE: 0,
  MAWB_NO: 1,
  AWB: 2,
  COMPANY_NAME: 3,
  PCS_CODE: 4,
  PCS: 5,
  WT_KG: 6,
  ORG: 7,
  DEST: 8,
  CHWT_KG: 9,
  VALUE: 10,
  CONTENTS: 11,
}

function sanitizeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed'
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Excel date cells come through as a raw serial day number. Converting that to a JS Date object
// (e.g. via xlsx's cellDates option) and reading it with getDate()/getUTCDate() is unreliable for
// fractional-hour zones like IST (+5:30) — Excel's own date-to-serial rounding leaves the
// resulting Date a few ms before midnight, which can read back as the previous day. Parsing the
// serial directly with SheetJS's own date-code parser sidesteps JS Date entirely and is exact.
function formatExcelDate(v, XLSX) {
  if (typeof v === 'number') {
    const dc = XLSX.SSF.parse_date_code(v)
    if (dc) return `${String(dc.d).padStart(2, '0')}-${MONTH_ABBR[dc.m - 1]}-${String(dc.y).slice(-2)}`
  }
  return String(v ?? '').trim()
}

function cell(cells, idx) {
  const v = cells[idx]
  if (v === undefined || v === null || v === '') return ''
  // Plain Number#toString() never switches to scientific notation below 1e21, unlike
  // Excel's own "General" cell format — this avoids values like AWB numbers rendering as "8.73598E+11".
  if (typeof v === 'number') return v.toString().trim()
  return String(v).trim()
}

function formatValue(raw) {
  const num = Number(raw)
  if (Number.isNaN(num)) return raw
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function validateRow(cells) {
  const date = cell(cells, COL.DATE)
  const mawbRaw = cell(cells, COL.MAWB_NO)
  const awb = cell(cells, COL.AWB)
  const companyName = cell(cells, COL.COMPANY_NAME)
  const pcsCode = cell(cells, COL.PCS_CODE)
  const pcsRaw = cell(cells, COL.PCS)
  const wtRaw = cell(cells, COL.WT_KG)
  const org = cell(cells, COL.ORG)
  const dest = cell(cells, COL.DEST)
  const valueRaw = cell(cells, COL.VALUE)
  const contents = cell(cells, COL.CONTENTS)

  // awb is surfaced alongside the reason (not embedded in it) so the caller can build a single
  // "Row N (AWB: ...)" label without duplicating it inside the error text.
  if (!date) return { error: 'missing Date', awb }

  // "MAWB No." holds a composite cell like "MAWB-023 02961092 IGM- 3088962 Flight- FX5279t Dt - 04-07-2026"
  // — parseMawbCell() extracts the Master AWB number, IGM, Flight and Flight Date from it.
  const parsed = parseMawbCell(mawbRaw)
  if (!parsed) return { error: `could not parse "MAWB No." ("${mawbRaw || 'empty'}")`, awb }

  // The Excel "AWB" column is the shipment's actual AWB — used verbatim on the PDF and as the filename.
  if (!awb) return { error: 'missing AWB', awb }
  if (!companyName) return { error: 'missing Company Name', awb }

  const pcsNum = Number(pcsRaw)
  if (!pcsRaw || Number.isNaN(pcsNum) || pcsNum <= 0) return { error: `invalid Pcs ("${pcsRaw}")`, awb }

  const wtNum = Number(wtRaw)
  if (!wtRaw || Number.isNaN(wtNum) || wtNum <= 0) return { error: `invalid WT(KG) ("${wtRaw}")`, awb }

  if (!org) return { error: 'missing ORG', awb }
  if (!dest) return { error: 'missing DEST', awb }
  if (!valueRaw) return { error: 'missing VALUE', awb }
  if (!contents) return { error: 'missing Contents', awb }

  return {
    row: {
      awbFileName: sanitizeFileName(awb),
      awbNo: awb,
      date,
      mawbNo: parsed.awbMaster,
      igm: parsed.igm,
      flight: parsed.flight,
      flightDate: parsed.flightDate,
      companyName,
      pieces: pcsNum,
      weight: wtNum.toFixed(2),
      pcsCode,
      origin: org,
      destination: dest,
      value: formatValue(valueRaw),
      contents,
    },
  }
}

export default function ArrivalNotice() {
  const [validRows, setValidRows] = useState([])
  const [invalidRows, setInvalidRows] = useState([])
  const [sourceName, setSourceName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedPdfs, setGeneratedPdfs] = useState([])
  const [failedRows, setFailedRows] = useState([])
  const [genResults, setGenResults] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [largeBatchWarning, setLargeBatchWarning] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [showIdentityForm, setShowIdentityForm] = useState(true)
  const [identityEmail, setIdentityEmail] = useState('')
  const [identityName, setIdentityName] = useState('')
  const [registering, setRegistering] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const storedEmail = localStorage.getItem('userEmail')
    const storedName = localStorage.getItem('userName')
    if (storedEmail && storedName) {
      setUserEmail(storedEmail)
      setUserName(storedName)
      setShowIdentityForm(false)
    }
  }, [])

  const registerUser = async (email, name) => {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)

    if (existing && existing.length > 0) {
      await supabase.from('users').update({ full_name: name }).eq('email', email)
    } else {
      await supabase.from('users').insert({ email, full_name: name })
    }
  }

  const handleIdentitySubmit = async (e) => {
    e.preventDefault()
    if (!identityEmail || !identityName) return
    setRegistering(true)
    try {
      await registerUser(identityEmail, identityName)
    } catch (err) {
      console.error('User registration error:', err)
    }
    localStorage.setItem('userEmail', identityEmail)
    localStorage.setItem('userName', identityName)
    setUserEmail(identityEmail)
    setUserName(identityName)
    setShowIdentityForm(false)
  }

  const handleChangeUser = () => {
    localStorage.removeItem('userEmail')
    localStorage.removeItem('userName')
    setUserEmail('')
    setUserName('')
    setIdentityEmail('')
    setIdentityName('')
    setShowIdentityForm(true)
  }

  const trackAnConversion = async (rowsProcessed, rowsFailed) => {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)

    if (!existing || existing.length === 0) return

    const { error: convError } = await supabase
      .from('an_conversions')
      .insert({ user_id: existing[0].id, rows_processed: rowsProcessed, rows_failed: rowsFailed })

    if (convError) console.error('AN conversion insert error:', convError)
  }

  const reset = () => {
    setValidRows([])
    setInvalidRows([])
    setSourceName('')
    setGeneratedPdfs([])
    setFailedRows([])
    setGenResults([])
    setStatus('')
    setProgress(0)
    setErrorMessage('')
    setLargeBatchWarning('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    reset()
    setParsing(true)
    setSourceName(file.name.replace(/\.(xlsx|xls)$/i, ''))

    try {
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      // raw:true reads underlying values instead of Excel's own display text — "General" format
      // renders long numbers like AWB numbers in scientific notation (e.g. "8.73598E+11"), and date
      // cells come through as their raw serial day number, both of which we format ourselves below.
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })

      const dataRows = rows
        .slice(1)
        .filter((r) => r.some((v) => String(v).trim() !== ''))
        .map((cells) => {
          const copy = [...cells]
          copy[COL.DATE] = formatExcelDate(copy[COL.DATE], XLSX)
          return copy
        })

      const valid = []
      const invalid = []

      dataRows.forEach((cells, i) => {
        const rowNumber = i + 2
        const result = validateRow(cells)
        if (result.error) {
          const label = result.awb ? `Row ${rowNumber} (AWB: ${result.awb})` : `Row ${rowNumber}`
          invalid.push({ rowNumber, label, reason: result.error })
        } else {
          valid.push(result.row)
        }
      })

      if (valid.length > 100) {
        setLargeBatchWarning(`Large batch detected: ${valid.length} rows. Processing in batches of 25 to manage memory.`)
      }

      setValidRows(valid)
      setInvalidRows(invalid)

      if (valid.length === 0 && invalid.length === 0) {
        setErrorMessage('No data rows found in the uploaded Excel file')
      }
    } catch (err) {
      console.error(err)
      setErrorMessage(`Could not read Excel file: ${err.message}`)
    }

    setParsing(false)
  }

  const processRows = async (rows, concurrency = 4) => {
    setGenerating(true)
    setStatus('Starting PDF generation...')
    setProgress(0)
    setGeneratedPdfs([])
    setFailedRows(invalidRows.map((r) => ({ name: r.label, error: r.reason })))

    const total = rows.length
    const allGenerated = []
    const allFailed = [...invalidRows.map((r) => ({ name: r.label, error: r.reason }))]
    const allResults = []
    const BATCH_SIZE = 25

    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, total)
      const batchRows = rows.slice(batchStart, batchEnd)
      const batchGenerated = []
      const batchFailed = []
      let completed = 0

      const queue = batchRows.map((row, i) => ({ row, index: batchStart + i }))

      const processOne = async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) return
          const { row, index } = item

          allResults[index] = { name: `${row.awbFileName}.pdf`, status: 'generating' }

          try {
            const pdfBytes = await generateArrivalNoticePdf(row)
            const blob = new Blob([pdfBytes], { type: 'application/pdf' })
            const url = URL.createObjectURL(blob)
            const pdfName = `${row.awbFileName}.pdf`

            batchGenerated.push({ name: pdfName, url, blob })
            allResults[index] = { name: pdfName, status: 'success' }
          } catch (err) {
            batchFailed.push({ name: `${row.awbFileName}.pdf`, error: err.message })
            allResults[index] = { name: `${row.awbFileName}.pdf`, status: 'error', error: err.message }
          }

          completed++
          setStatus(`Generating ${batchStart + completed}/${total}`)
          setProgress(Math.round(((batchStart + completed) / total) * 100))
          setGenResults([...allResults])
          setGeneratedPdfs([...allGenerated, ...batchGenerated])
          setFailedRows([...allFailed, ...batchFailed])
        }
      }

      const workers = Array(Math.min(concurrency, batchRows.length)).fill(null).map(() => processOne())
      await Promise.all(workers)

      allGenerated.push(...batchGenerated)
      allFailed.push(...batchFailed)
    }

    setGenerating(false)

    if (allGenerated.length > 0) {
      setStatus(`${allGenerated.length} of ${total} PDFs generated successfully`)
      setProgress(100)
      try {
        await trackAnConversion(allGenerated.length, allFailed.length)
      } catch (trackErr) {
        console.error('Tracking error (non-fatal):', trackErr)
      }
    }

    if (allFailed.length > 0 && allGenerated.length === 0) {
      setStatus('All rows failed')
      setErrorMessage(`${allFailed.length} row(s) could not be processed. Check the error details below.`)
    } else if (allFailed.length > 0) {
      setStatus(`${allGenerated.length} of ${total} PDFs generated successfully`)
    }

    if (total === 1 && allGenerated.length === 1) {
      downloadIndividual(allGenerated[0])
    }
  }

  const startGeneration = () => {
    if (validRows.length === 0) {
      setErrorMessage('No valid rows to generate. Please fix the Excel file and re-upload.')
      return
    }
    processRows(validRows)
  }

  const downloadAllAsZip = async (files = generatedPdfs) => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (const file of files) {
      zip.file(file.name, file.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sourceName || 'arrival_notices'}.zip`
    a.click()
    URL.revokeObjectURL(url)
    files.forEach((f) => URL.revokeObjectURL(f.url))
  }

  const downloadIndividual = (file) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.name
    a.click()
  }

  if (showIdentityForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-md w-full">
          <div className="mb-8 text-center">
            <img src="/fedex-logo-local.png" alt="FedEx Logo" className="h-14 mx-auto mb-6" />
            <h1 className="text-3xl font-extrabold text-slate-800">Arrival Notice Generator</h1>
            <p className="text-slate-500 mt-3 text-lg">Enter your details to get started</p>
          </div>

          <form onSubmit={handleIdentitySubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Full Name</label>
              <input
                type="text"
                value={identityName}
                onChange={(e) => setIdentityName(e.target.value)}
                required
                className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-lg"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Email Address</label>
              <input
                type="email"
                value={identityEmail}
                onChange={(e) => setIdentityEmail(e.target.value)}
                required
                className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-lg"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={registering}
              className="w-full py-4 px-6 rounded-2xl font-extrabold text-white text-lg shadow-xl transition-all duration-300 bg-gradient-to-r from-orange-500 via-orange-600 to-red-500 hover:from-orange-600 hover:via-orange-700 hover:to-red-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {registering ? 'Setting up...' : 'Start Generating'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="https://www.fedex.com/content/dam/fedex-com/logos/logo.png"
                alt="FedEx Logo"
                className="h-8 object-contain"
              />
              <h1 className="text-lg font-bold tracking-tight hidden sm:block">Arrival Notice Generator</h1>
            </div>
            <NavTabs />
            <div className="flex items-center gap-3">
              {userEmail === 'admin@fedex.com' && (
                <a
                  href="/admin"
                  className="px-3 py-1.5 bg-white/20 border border-white/30 rounded-lg text-sm font-semibold hover:bg-white/30 transition-all"
                >
                  Admin Dashboard
                </a>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-xs">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{userName}</span>
                <button onClick={handleChangeUser} className="text-xs text-purple-200 hover:text-white ml-1" title="Switch user">
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-5 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">Upload Excel Sheet</h2>
            <p className="text-slate-500 mt-1 text-sm">One row per shipment — MAWB No., AWB, Company Name, Pcs, WT(KG), ORG, DEST, VALUE, Contents etc.</p>
          </div>

          <div className="p-8">
            <div className="mb-8">
              <label className="flex flex-col items-center justify-center w-full h-52 border-3 border-dashed border-slate-300 rounded-2xl cursor-pointer bg-slate-50 hover:bg-purple-50 hover:border-purple-400 transition-all duration-300">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="text-center p-8">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-2xl font-semibold text-slate-700 mb-2">Drop your Excel file here or click to upload</p>
                  <p className="text-sm text-slate-500">Supports: .xlsx, .xls</p>
                </div>
              </label>
            </div>

            {parsing && (
              <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-xl text-purple-700 font-medium">
                Reading and validating rows...
              </div>
            )}

            {largeBatchWarning && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-amber-700 font-medium">{largeBatchWarning}</p>
              </div>
            )}

            {errorMessage && (
              <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 font-medium">{errorMessage}</p>
              </div>
            )}

            {invalidRows.length > 0 && generatedPdfs.length === 0 && !generating && (
              <div className="mb-8">
                <div className="mb-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-amber-100 rounded-xl flex-shrink-0">
                    <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-amber-800 text-lg">
                      {invalidRows.length} row{invalidRows.length > 1 ? 's' : ''} skipped due to missing/invalid data
                    </p>
                    <p className="text-amber-700 text-sm mt-1">
                      {validRows.length > 0
                        ? `${validRows.length} valid row(s) remain and can be generated below.`
                        : 'No valid rows found — fix the Excel file and re-upload.'}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">Failed Rows</p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {invalidRows.map((r, idx) => (
                    <div
                      key={`inv-${idx}`}
                      className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-2xl"
                    >
                      <div className="p-3 bg-red-100 rounded-xl flex-shrink-0">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">{r.label}</p>
                        <p className="text-sm text-red-600">{r.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validRows.length > 0 && generatedPdfs.length === 0 && failedRows.length === 0 && !generating && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-800">
                    {validRows.length} valid row{validRows.length > 1 ? 's' : ''} ready{sourceName && ` from "${sourceName}"`}
                  </h3>
                  <button onClick={reset} className="text-sm text-red-600 hover:text-red-700 font-semibold px-4 py-2 rounded-lg hover:bg-red-50 transition-all">
                    Clear all
                  </button>
                </div>
                <button
                  onClick={startGeneration}
                  disabled={generating}
                  className="w-full py-5 px-6 rounded-xl font-bold text-white text-xl shadow-xl transition-all duration-300 bg-gradient-to-r from-orange-500 via-orange-600 to-red-500 hover:from-orange-600 hover:via-orange-700 hover:to-red-600 hover:shadow-3xl transform hover:-translate-y-1"
                >
                  Generate PDFs
                </button>
              </div>
            )}

            {generating && (
              <div className="mt-6 space-y-4">
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-purple-700 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-sm font-semibold text-slate-600">{progress}% complete</p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 divide-y divide-slate-200">
                  {genResults.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {r.status === 'generating' && (
                        <svg className="w-4 h-4 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {r.status === 'success' && (
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {r.status === 'error' && (
                        <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={`truncate flex-1 ${r.status === 'error' ? 'text-red-600' : r.status === 'success' ? 'text-green-700' : 'text-slate-700'}`}>
                        {r.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(generatedPdfs.length > 0 || (failedRows.length > 0 && !generating)) && (
              <div className="mt-8 pt-8 border-t border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-2xl font-bold text-slate-800">
                      {generatedPdfs.length > 0
                        ? `${generatedPdfs.length} PDF${generatedPdfs.length > 1 ? 's' : ''} generated`
                        : 'Generation completed'}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{status}</p>
                  </div>
                  <div className="flex gap-3">
                    {generatedPdfs.length > 0 && (
                      <button
                        onClick={() => downloadAllAsZip()}
                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {failedRows.length > 0 ? `Download ${generatedPdfs.length} Generated` : 'Download ZIP'}
                      </button>
                    )}
                    <button onClick={reset} className="px-5 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all">
                      Start Over
                    </button>
                  </div>
                </div>

                {failedRows.length > 0 && (
                  <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
                    <div className="p-2 bg-amber-100 rounded-xl flex-shrink-0">
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-amber-800 text-lg">
                        {failedRows.length} row{failedRows.length > 1 ? 's' : ''} could not be processed
                      </p>
                      <p className="text-amber-700 text-sm mt-1">
                        {generatedPdfs.length > 0
                          ? 'The remaining rows were generated successfully. You can download them below.'
                          : 'All rows failed. Check the error details below.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {failedRows.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">Failed Rows</p>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {failedRows.map((r, idx) => (
                          <div key={`err-${idx}`} className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-2xl">
                            <div className="p-3 bg-red-100 rounded-xl flex-shrink-0">
                              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-base text-slate-700 truncate font-semibold">{r.name}</p>
                              <p className="text-sm text-red-600 truncate mt-0.5">{r.error}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {generatedPdfs.length > 0 && (
                    <div>
                      <p className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3">Generated PDFs</p>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {generatedPdfs.map((file, idx) => (
                          <div key={`ok-${idx}`} className="flex items-center justify-between gap-4 px-5 py-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl">
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                              <div className="p-3 bg-green-100 rounded-xl flex-shrink-0">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <span className="text-base text-slate-700 truncate font-semibold">{file.name}</span>
                            </div>
                            <button
                              onClick={() => downloadIndividual(file)}
                              className="p-3 text-purple-600 hover:text-purple-700 hover:bg-purple-100 rounded-xl transition-all flex-shrink-0"
                              title="Download"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
