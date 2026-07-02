'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [sourceName, setSourceName] = useState('')
  const [converting, setConverting] = useState(false)
  const [convertedFiles, setConvertedFiles] = useState([])
  const [failedFiles, setFailedFiles] = useState([])
  const [conversionResults, setConversionResults] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [showIdentityForm, setShowIdentityForm] = useState(true)
  const [identityEmail, setIdentityEmail] = useState('')
  const [identityName, setIdentityName] = useState('')
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

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
      await supabase
        .from('users')
        .update({ full_name: name })
        .eq('email', email)
    } else {
      await supabase
        .from('users')
        .insert({ email, full_name: name })
    }
  }

  const [registering, setRegistering] = useState(false)

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

  const trackConversion = async (count) => {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)

    if (!existing || existing.length === 0) return

    const { error: convError } = await supabase
      .from('conversions')
      .insert({ user_id: existing[0].id, files_converted: count })

    if (convError) console.error('Conversion insert error:', convError)
  }

  const processFiles = async (files) => {
    setConverting(true)
    setStatus('Starting conversion...')
    setProgress(0)
    setErrorMessage('')
    setConvertedFiles([])
    setFailedFiles([])
    const converted = []
    const failed = []
    const results = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setStatus(`Converting ${i + 1}/${files.length}: ${file.name}`)
      setProgress(Math.round(((i + 1) / files.length) * 100))

      results[i] = { name: file.name, status: 'converting' }
      setConversionResults([...results])

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/convert', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error(res.statusText || 'Conversion failed')

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const pdfName = file.name.replace(/\.(tiff|tif)$/i, '.pdf')

        converted.push({ name: pdfName, url, blob })
        results[i] = { name: file.name, status: 'success', pdfName }
      } catch (err) {
        failed.push({ name: file.name, error: err.message })
        results[i] = { name: file.name, status: 'error', error: err.message }
      }

      setConversionResults([...results])
      setConvertedFiles([...converted])
      setFailedFiles([...failed])
    }

    setConverting(false)

    if (converted.length > 0) {
      setStatus(`${converted.length} of ${files.length} converted successfully`)
      setProgress(100)
      try {
        await trackConversion(converted.length)
      } catch (trackErr) {
        console.error('Tracking error (non-fatal):', trackErr)
      }
    }

    if (failed.length > 0 && converted.length === 0) {
      setStatus('All conversions failed')
      setErrorMessage(`${failed.length} file(s) could not be converted. Check the error details below.`)
    } else if (failed.length > 0) {
      setStatus(`${converted.length} of ${files.length} converted successfully`)
    }

    if (files.length === 1 && converted.length === 1) {
      downloadIndividual(converted[0])
    }
  }

  const handleUnifiedSelect = async (e) => {
    const files = Array.from(e.target.files)
    setSelectedFiles([])
    setConvertedFiles([])
    setStatus('')
    setErrorMessage('')
    setSourceName('')

    const tiffFiles = []
    const zipFiles = []
    let detectedSourceName = ''

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        zipFiles.push(file)
        if (!detectedSourceName) {
          detectedSourceName = file.name.replace(/\.zip$/i, '')
        }
      } else if (file.name.toLowerCase().endsWith('.tiff') || file.name.toLowerCase().endsWith('.tif')) {
        tiffFiles.push(file)
        if (!detectedSourceName && file.webkitRelativePath) {
          const pathParts = file.webkitRelativePath.split('/')
          if (pathParts.length > 1) {
            detectedSourceName = pathParts[0]
          }
        }
      }
    }

    if (zipFiles.length > 0) {
      for (const zipFile of zipFiles) {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(zipFile)
          let foundInZip = false

          for (const [path, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && (path.toLowerCase().endsWith('.tiff') || path.toLowerCase().endsWith('.tif'))) {
              const blob = await zipEntry.async('blob')
              const fileName = path.split('/').pop()
              const tiffFile = new File([blob], fileName, { type: 'image/tiff' })
              tiffFiles.push(tiffFile)
              foundInZip = true
            }
          }

          if (!foundInZip) {
            setErrorMessage(`No TIFF files found in ${zipFile.name}`)
          }
        } catch (error) {
          console.error(error)
          setErrorMessage(`Error reading ${zipFile.name}: ${error.message}`)
        }
      }
    }

    if (tiffFiles.length === 0 && zipFiles.length === 0) {
      setErrorMessage('No TIFF or ZIP files found in selection')
      setSelectedFiles([])
    } else if (tiffFiles.length === 0) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(tiffFiles)
      setSourceName(detectedSourceName || 'converted')
      setErrorMessage('')
    }
  }

  const downloadAllAsZip = async (files = convertedFiles) => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (const file of files) {
      zip.file(file.name, file.blob)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sourceName}_PDFs.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadIndividual = (file) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.name
    a.click()
  }

  const startConversion = () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Please select some TIFF files first!')
      return
    }
    processFiles(selectedFiles)
  }

  const reset = () => {
    setSelectedFiles([])
    setSourceName('')
    setConvertedFiles([])
    setFailedFiles([])
    setConversionResults([])
    setStatus('')
    setProgress(0)
    setErrorMessage('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  if (showIdentityForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-md w-full">
          <div className="mb-8 text-center">
            <img 
              src="/fedex-logo-local.png" 
              alt="FedEx Logo" 
              className="h-14 mx-auto mb-6" 
            />
            <h1 className="text-3xl font-extrabold text-slate-800">TIFF to PDF Converter</h1>
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
              {registering ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Setting up...
                </div>
              ) : (
                'Start Converting'
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="https://www.fedex.com/content/dam/fedex-com/logos/logo.png" 
                alt="FedEx Logo" 
                className="h-10 md:h-12 object-contain" 
              />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">TIFF to PDF Converter</h1>
                <p className="text-purple-200 mt-1 text-sm">Fast, reliable conversion</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {userEmail === 'admin@fedex.com' && (
                <a
                  href="/admin"
                  className="px-4 py-2 bg-white/20 border border-white/30 rounded-xl font-semibold hover:bg-white/30 transition-all"
                >
                  Admin Dashboard
                </a>
              )}
              <div className="flex items-center gap-3 px-4 py-2 bg-white/10 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium">{userName}</span>
                <button
                  onClick={handleChangeUser}
                  className="text-xs text-purple-200 hover:text-white ml-2"
                  title="Switch user"
                >
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
            <h2 className="text-xl font-bold text-slate-800">Upload Files</h2>
            <p className="text-slate-500 mt-1 text-sm">Select TIFF files, folders, or ZIP files with TIFFs</p>
          </div>
          
          <div className="p-8">
            <div className="mb-8">
              <label className="flex flex-col items-center justify-center w-full h-52 border-3 border-dashed border-slate-300 rounded-2xl cursor-pointer bg-slate-50 hover:bg-purple-50 hover:border-purple-400 transition-all duration-300">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tiff,.tif,.zip"
                  multiple
                  className="hidden"
                  onChange={handleUnifiedSelect}
                />
                <div className="text-center p-8">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-2xl font-semibold text-slate-700 mb-2">Drop your files here or click to upload</p>
                  <p className="text-sm text-slate-500">Supports: TIFF files, entire folders, or ZIP files</p>
                </div>
              </label>
            </div>

            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-semibold text-slate-700">Or select an entire folder:</span>
                <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span>Select Folder</span>
                  <input
                    ref={folderInputRef}
                    type="file"
                    directory=""
                    webkitdirectory=""
                    className="hidden"
                    onChange={handleUnifiedSelect}
                  />
                </label>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 font-medium">{errorMessage}</p>
              </div>
            )}

            {selectedFiles.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-800">
                    Selected {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}{sourceName && ` from "${sourceName}"`}
                  </h3>
                  <button
                    onClick={reset}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold px-4 py-2 rounded-lg hover:bg-red-50 transition-all"
                  >
                    Clear all
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-2xl bg-slate-50">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 px-5 py-4 border-b border-slate-200 last:border-b-0 hover:bg-white transition-colors"
                    >
                      <div className="p-3 bg-purple-100 rounded-xl">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <span className="text-base text-slate-700 truncate flex-1 font-medium">{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedFiles.length > 0 && !convertedFiles.length && !failedFiles.length && (
              <button
                onClick={startConversion}
                disabled={converting}
                className={`w-full py-5 px-6 rounded-xl font-bold text-white text-xl shadow-xl transition-all duration-300 ${converting ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 via-orange-600 to-red-500 hover:from-orange-600 hover:via-orange-700 hover:to-red-600 hover:shadow-3xl transform hover:-translate-y-1'}`}
              >
                {converting ? (
                  <div className="flex items-center justify-center gap-4">
                    <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {status}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Convert Files
                  </div>
                )}
              </button>
            )}

            {converting && (
              <div className="mt-6 space-y-4">
                <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-purple-700 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-sm font-semibold text-slate-600">{progress}% complete</p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 divide-y divide-slate-200">
                  {conversionResults.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {r.status === 'converting' && (
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
                      {r.status === 'error' && (
                        <span className="text-xs text-red-500 flex-shrink-0 truncate max-w-[200px]" title={r.error}>
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(convertedFiles.length > 0 || failedFiles.length > 0) && (
              <div className="mt-8 pt-8 border-t border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-2xl font-bold text-slate-800">
                      {convertedFiles.length > 0
                        ? `${convertedFiles.length} file${convertedFiles.length > 1 ? 's' : ''} converted`
                        : 'Conversion completed'}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{status}</p>
                  </div>
                  <div className="flex gap-3">
                    {convertedFiles.length > 0 && (
                      <button
                        onClick={() => downloadAllAsZip()}
                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {failedFiles.length > 0
                          ? `Download ${convertedFiles.length} Converted`
                          : 'Download ZIP'}
                      </button>
                    )}
                    <button
                      onClick={reset}
                      className="px-5 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                    >
                      Convert More
                    </button>
                  </div>
                </div>

                {failedFiles.length > 0 && (
                  <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4">
                    <div className="p-2 bg-amber-100 rounded-xl flex-shrink-0">
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-amber-800 text-lg">
                        {failedFiles.length} file{failedFiles.length > 1 ? 's' : ''} could not be converted
                      </p>
                      <p className="text-amber-700 text-sm mt-1">
                        {convertedFiles.length > 0
                          ? 'The remaining files were converted successfully. You can download them below.'
                          : 'All files failed. Check the error details below.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="max-h-96 overflow-y-auto space-y-3">
                  {convertedFiles.map((file, idx) => (
                    <div
                      key={`ok-${idx}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl"
                    >
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
                  {failedFiles.map((file, idx) => (
                    <div
                      key={`err-${idx}`}
                      className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-2xl"
                    >
                      <div className="p-3 bg-red-100 rounded-xl flex-shrink-0">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base text-slate-700 truncate font-semibold">{file.name}</p>
                        <p className="text-sm text-red-600 truncate mt-0.5">{file.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
