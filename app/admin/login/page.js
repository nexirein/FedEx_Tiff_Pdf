'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const storedEmail = localStorage.getItem('userEmail')
    if (storedEmail === 'admin@fedex.com') {
      router.replace('/admin')
      return
    }
    setChecking(false)
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      localStorage.setItem('userEmail', email)
      localStorage.setItem('userName', 'Admin')
      router.push('/admin')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        <div className="mb-8 text-center">
          <img 
            src="/fedex-logo-local.png" 
            alt="FedEx Logo" 
            className="h-14 mx-auto mb-6" 
          />
          <h1 className="text-3xl font-extrabold text-slate-800">Admin Login</h1>
          <p className="text-slate-500 mt-3">Sign in to access admin dashboard</p>
        </div>

        {error && (
          <div className="mb-8 p-5 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start gap-4">
            <svg className="w-7 h-7 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-lg">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-lg"
              placeholder="admin@fedex.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-lg"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 rounded-2xl font-extrabold text-white text-lg shadow-xl transition-all duration-300 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-purple-600 font-bold hover:text-purple-700 transition-colors"
          >
            Back to Converter
          </a>
        </div>
      </div>
    </div>
  )
}
