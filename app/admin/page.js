'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [conversions, setConversions] = useState([])
  const [anConversions, setAnConversions] = useState([])
  const [ucConversions, setUcConversions] = useState([])
  const [activeTool, setActiveTool] = useState('tiff')
  const [users, setUsers] = useState([])
  const [timeFrame, setTimeFrame] = useState('7d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')

  const COLORS = ['#4F46E5', '#7C3AED', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#F97316', '#EAB308']

  useEffect(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    setEndDate(now.toISOString().split('T')[0])
    setStartDate(weekAgo.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    const email = localStorage.getItem('userEmail')
    const name = localStorage.getItem('userName')
    if (email === 'admin@fedex.com') {
      setAdminEmail(email)
      setAdminName(name || 'Admin')
      setAuthorized(true)
      fetchData()
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loading && !authorized) {
      window.location.href = '/admin/login'
    }
  }, [loading, authorized])

  const fetchData = async () => {
    try {
      const { data: conversionsData } = await supabase
        .from('conversions')
        .select(`
          id,
          files_converted,
          created_at,
          users (
            id,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })

      setConversions(conversionsData || [])

      const { data: anData } = await supabase
        .from('an_conversions')
        .select(`
          id,
          rows_processed,
          rows_failed,
          created_at,
          users (
            id,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })

      setAnConversions(anData || [])

      const { data: ucData } = await supabase
        .from('uc_conversions')
        .select(`
          id,
          rows_processed,
          rows_failed,
          created_at,
          users (
            id,
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false })

      setUcConversions(ucData || [])

      const { data: usersData } = await supabase
        .from('users')
        .select('*')

      setUsers(usersData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const filterByTimeFrame = (list) => {
    if (timeFrame === 'all') return list

    if (timeFrame === 'custom' && startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      return list.filter((c) => {
        const convDate = new Date(c.created_at)
        return convDate >= start && convDate <= end
      })
    }

    const now = new Date()
    let daysToSubtract = 7
    if (timeFrame === '30d') daysToSubtract = 30
    if (timeFrame === '90d') daysToSubtract = 90
    const cutoffDate = new Date(now.getTime() - daysToSubtract * 24 * 60 * 60 * 1000)
    return list.filter((c) => new Date(c.created_at) >= cutoffDate)
  }

  const handleLogout = () => {
    localStorage.removeItem('userEmail')
    localStorage.removeItem('userName')
    window.location.href = '/'
  }

  const filteredConversions = useMemo(
    () => filterByTimeFrame(conversions),
    [conversions, timeFrame, startDate, endDate]
  )

  const filteredAnConversions = useMemo(
    () => filterByTimeFrame(anConversions),
    [anConversions, timeFrame, startDate, endDate]
  )

  const filteredUcConversions = useMemo(
    () => filterByTimeFrame(ucConversions),
    [ucConversions, timeFrame, startDate, endDate]
  )

  const stats = useMemo(() => {
    const totalFiles = filteredConversions.reduce((sum, c) => sum + c.files_converted, 0)
    const userConversionMap = {}
    
    filteredConversions.forEach(c => {
      if (c.users) {
        const key = c.users.id
        if (!userConversionMap[key]) {
          userConversionMap[key] = {
            ...c.users,
            files: 0,
            conversions: 0
          }
        }
        userConversionMap[key].files += c.files_converted
        userConversionMap[key].conversions += 1
      }
    })

    const userStats = Object.values(userConversionMap)
    return {
      totalFiles,
      totalConversions: filteredConversions.length,
      activeUsers: userStats.length,
      userStats
    }
  }, [filteredConversions])

  const getDailyData = () => {
    const dailyMap = {}
    filteredConversions.forEach(c => {
      const date = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!dailyMap[date]) {
        dailyMap[date] = { date, files: 0, conversions: 0 }
      }
      dailyMap[date].files += c.files_converted
      dailyMap[date].conversions += 1
    })
    return Object.values(dailyMap)
  }

  const getUserChartData = () => {
    return stats.userStats.map(u => ({
      name: u.full_name,
      files: u.files
    })).sort((a, b) => b.files - a.files).slice(0, 8)
  }

  const anStats = useMemo(() => {
    const totalRows = filteredAnConversions.reduce((sum, c) => sum + c.rows_processed, 0)
    const totalFailed = filteredAnConversions.reduce((sum, c) => sum + (c.rows_failed || 0), 0)
    const userConversionMap = {}

    filteredAnConversions.forEach(c => {
      if (c.users) {
        const key = c.users.id
        if (!userConversionMap[key]) {
          userConversionMap[key] = {
            ...c.users,
            rows: 0,
            conversions: 0
          }
        }
        userConversionMap[key].rows += c.rows_processed
        userConversionMap[key].conversions += 1
      }
    })

    const userStats = Object.values(userConversionMap)
    return {
      totalRows,
      totalFailed,
      totalConversions: filteredAnConversions.length,
      activeUsers: userStats.length,
      userStats
    }
  }, [filteredAnConversions])

  const getAnDailyData = () => {
    const dailyMap = {}
    filteredAnConversions.forEach(c => {
      const date = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!dailyMap[date]) {
        dailyMap[date] = { date, rows: 0, conversions: 0 }
      }
      dailyMap[date].rows += c.rows_processed
      dailyMap[date].conversions += 1
    })
    return Object.values(dailyMap)
  }

  const getAnUserChartData = () => {
    return anStats.userStats.map(u => ({
      name: u.full_name,
      rows: u.rows
    })).sort((a, b) => b.rows - a.rows).slice(0, 8)
  }

  const ucStats = useMemo(() => {
    const totalRows = filteredUcConversions.reduce((sum, c) => sum + c.rows_processed, 0)
    const totalFailed = filteredUcConversions.reduce((sum, c) => sum + (c.rows_failed || 0), 0)
    const userConversionMap = {}

    filteredUcConversions.forEach(c => {
      if (c.users) {
        const key = c.users.id
        if (!userConversionMap[key]) {
          userConversionMap[key] = {
            ...c.users,
            rows: 0,
            conversions: 0
          }
        }
        userConversionMap[key].rows += c.rows_processed
        userConversionMap[key].conversions += 1
      }
    })

    const userStats = Object.values(userConversionMap)
    return {
      totalRows,
      totalFailed,
      totalConversions: filteredUcConversions.length,
      activeUsers: userStats.length,
      userStats
    }
  }, [filteredUcConversions])

  const getUcDailyData = () => {
    const dailyMap = {}
    filteredUcConversions.forEach(c => {
      const date = new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!dailyMap[date]) {
        dailyMap[date] = { date, rows: 0, conversions: 0 }
      }
      dailyMap[date].rows += c.rows_processed
      dailyMap[date].conversions += 1
    })
    return Object.values(dailyMap)
  }

  const getUcUserChartData = () => {
    return ucStats.userStats.map(u => ({
      name: u.full_name,
      rows: u.rows
    })).sort((a, b) => b.rows - a.rows).slice(0, 8)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-purple-600 border-t-transparent mx-auto mb-6"></div>
          <p className="text-2xl font-semibold text-slate-700">Loading Dashboard...</p>
        </div>
      </div>
    )
  }

  if (loading || !authorized) return null

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <img 
                src="https://developer.fedex.com/wirc/browser/assets/FedEx_logo.svg" 
                alt="FedEx Logo" 
                className="h-14 object-contain" 
              />
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Admin Dashboard</h1>
                <p className="text-indigo-200 mt-2 text-lg">Analytics & Performance Insights</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="px-6 py-3 bg-white/10 border border-white/20 rounded-2xl font-bold hover:bg-white/20 transition-all duration-300 backdrop-blur"
              >
                Back to Converter
              </a>
              <button
                onClick={handleLogout}
                className="px-6 py-3 bg-red-500/90 rounded-2xl font-bold hover:bg-red-600 transition-all duration-300 shadow-lg shadow-red-500/30"
              >
                Switch User
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Time Frame Filter */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 mb-10">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Analytics Overview</h2>

          {/* Tool Selector */}
          <div className="mb-8">
            <p className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Select Tool</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setActiveTool('tiff')}
                className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
                  activeTool === 'tiff'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/40'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                TIFF to PDF
              </button>
              <button
                onClick={() => setActiveTool('an')}
                className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
                  activeTool === 'an'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/40'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Arrival Notice Generator
              </button>
              <button
                onClick={() => setActiveTool('uc')}
                className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
                  activeTool === 'uc'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/40'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Ubond/Consol Generator
              </button>
            </div>
          </div>

          {/* Preset Time Frames */}
          <div className="mb-8">
            <p className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Select Time Period</p>
            <div className="flex flex-wrap gap-3 mb-8">
              {['7d', '30d', '90d', 'all'].map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeFrame(tf)}
                  className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
                    timeFrame === tf
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/40'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tf === '7d' ? 'Last 7 Days' : 
                   tf === '30d' ? 'Last 30 Days' : 
                   tf === '90d' ? 'Last 90 Days' : 'All Time'}
                </button>
              ))}
              <button
                onClick={() => setTimeFrame('custom')}
                className={`px-6 py-3 rounded-2xl font-bold transition-all duration-300 ${
                  timeFrame === 'custom'
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/40'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Custom Date Range Picker */}
            {timeFrame === 'custom' && (
              <div className="p-6 bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl border-2 border-orange-200">
                <p className="text-sm font-bold text-orange-800 mb-4 uppercase tracking-wider">Custom Date Range</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-col">
                    <label className="text-sm font-bold text-slate-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate}
                      className="px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none font-semibold text-lg"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm font-bold text-slate-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none font-semibold text-lg"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="text-sm text-slate-600 font-semibold">
                      {activeTool === 'tiff' ? filteredConversions.length : activeTool === 'an' ? filteredAnConversions.length : filteredUcConversions.length} conversions found
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeTool === 'tiff' ? (
        <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-white/20 rounded-2xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-extrabold mb-2">{stats.totalFiles.toLocaleString()}</div>
            <div className="text-xl text-white/90 font-semibold">Total Files Converted</div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 via-red-500 to-orange-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-white/20 rounded-2xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-extrabold mb-2">{stats.totalConversions.toLocaleString()}</div>
            <div className="text-xl text-white/90 font-semibold">Total Conversions</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-green-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-white/20 rounded-2xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-extrabold mb-2">{stats.activeUsers.toLocaleString()}</div>
            <div className="text-xl text-white/90 font-semibold">Active Users</div>
          </div>

          <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-white/20 rounded-2xl">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-extrabold mb-2">
              {stats.totalConversions > 0 
                ? Math.round(stats.totalFiles / stats.totalConversions).toLocaleString() 
                : 0}
            </div>
            <div className="text-xl text-white/90 font-semibold">Avg Files/Conversion</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Daily Conversions */}
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">Daily Conversion Volume</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={getDailyData()}>
                  <defs>
                    <linearGradient id="colorFiles" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '16px', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                    }}
                    itemStyle={{ color: '#4F46E5', fontWeight: 'bold' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="files" 
                    stroke="#4F46E5" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorFiles)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* User Breakdown */}
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
            <h3 className="text-2xl font-bold text-slate-800 mb-8">Top Users by Files Converted</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getUserChartData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={140}
                    innerRadius={60}
                    dataKey="files"
                  >
                    {getUserChartData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '16px', 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* User Statistics Table */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-12">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-800">User Activity Breakdown</h3>
            <div className="text-slate-600 text-sm font-semibold">
              {stats.userStats.length} user{stats.userStats.length !== 1 ? 's' : ''} active
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Conversions</th>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Files Converted</th>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Avg Files/Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.userStats
                  .sort((a, b) => b.files - a.files)
                  .map((userStat, idx) => (
                  <tr key={userStat.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold text-xl">
                          {userStat.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-lg">{userStat.full_name}</div>
                          <div className="text-slate-500 text-sm">{userStat.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                        {userStat.conversions}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                        {userStat.files}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-slate-700 font-semibold text-lg">
                      {Math.round(userStat.files / userStat.conversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Conversions */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200">
            <h3 className="text-2xl font-bold text-slate-800">Recent Conversions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Files Converted</th>
                  <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredConversions.slice(0, 30).map((conversion, idx) => (
                  <tr key={conversion.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold">
                          {conversion.users?.full_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{conversion.users?.full_name || 'Unknown'}</div>
                          <div className="text-sm text-slate-500">{conversion.users?.email || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                        {conversion.files_converted} files
                      </span>
                    </td>
                    <td className="px-8 py-5 text-slate-600 font-semibold">
                      {new Date(conversion.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
        ) : activeTool === 'an' ? (
        <AnAnalyticsSection
          anStats={anStats}
          dailyData={getAnDailyData()}
          userChartData={getAnUserChartData()}
          filteredAnConversions={filteredAnConversions}
          colors={COLORS}
        />
        ) : (
        <UcAnalyticsSection
          ucStats={ucStats}
          dailyData={getUcDailyData()}
          userChartData={getUcUserChartData()}
          filteredUcConversions={filteredUcConversions}
          colors={COLORS}
        />
        )}
      </div>
    </main>
  )
}

function AnAnalyticsSection({ anStats, dailyData, userChartData, filteredAnConversions, colors }) {
  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{anStats.totalRows.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Total Rows Processed</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 via-red-500 to-orange-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{anStats.totalConversions.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Total Uploads</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-green-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{anStats.activeUsers.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Active Users</div>
        </div>

        <div className="bg-gradient-to-br from-red-600 via-rose-600 to-red-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{anStats.totalFailed.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Rows Failed</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
          <h3 className="text-2xl font-bold text-slate-800 mb-8">Daily Rows Processed</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorRows" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                  }}
                  itemStyle={{ color: '#4F46E5', fontWeight: 'bold' }}
                />
                <Area
                  type="monotone"
                  dataKey="rows"
                  stroke="#4F46E5"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorRows)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
          <h3 className="text-2xl font-bold text-slate-800 mb-8">Top Users by Rows Processed</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={140}
                  innerRadius={60}
                  dataKey="rows"
                >
                  {userChartData.map((entry, index) => (
                    <Cell key={`an-cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Statistics Table */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-12">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-slate-800">User Activity Breakdown</h3>
          <div className="text-slate-600 text-sm font-semibold">
            {anStats.userStats.length} user{anStats.userStats.length !== 1 ? 's' : ''} active
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Uploads</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Processed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Avg Rows/Upload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {anStats.userStats
                .sort((a, b) => b.rows - a.rows)
                .map((userStat) => (
                <tr key={userStat.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold text-xl">
                        {userStat.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-lg">{userStat.full_name}</div>
                        <div className="text-slate-500 text-sm">{userStat.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                      {userStat.conversions}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                      {userStat.rows}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-slate-700 font-semibold text-lg">
                    {Math.round(userStat.rows / userStat.conversions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Conversions */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200">
          <h3 className="text-2xl font-bold text-slate-800">Recent Uploads</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Processed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Failed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAnConversions.slice(0, 30).map((conversion) => (
                <tr key={conversion.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold">
                        {conversion.users?.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{conversion.users?.full_name || 'Unknown'}</div>
                        <div className="text-sm text-slate-500">{conversion.users?.email || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                      {conversion.rows_processed} rows
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-red-100 text-red-700">
                      {conversion.rows_failed || 0} failed
                    </span>
                  </td>
                  <td className="px-8 py-5 text-slate-600 font-semibold">
                    {new Date(conversion.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function UcAnalyticsSection({ ucStats, dailyData, userChartData, filteredUcConversions, colors }) {
  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{ucStats.totalRows.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Total Rows Processed</div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 via-red-500 to-orange-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{ucStats.totalConversions.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Total Uploads</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-green-600 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{ucStats.activeUsers.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Active Users</div>
        </div>

        <div className="bg-gradient-to-br from-red-600 via-rose-600 to-red-700 rounded-3xl p-8 text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="p-4 bg-white/20 rounded-2xl">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
          </div>
          <div className="text-5xl font-extrabold mb-2">{ucStats.totalFailed.toLocaleString()}</div>
          <div className="text-xl text-white/90 font-semibold">Rows Failed</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
          <h3 className="text-2xl font-bold text-slate-800 mb-8">Daily Rows Processed</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="colorUcRows" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#667eea" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                  }}
                  itemStyle={{ color: '#4F46E5', fontWeight: 'bold' }}
                />
                <Area
                  type="monotone"
                  dataKey="rows"
                  stroke="#4F46E5"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorUcRows)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
          <h3 className="text-2xl font-bold text-slate-800 mb-8">Top Users by Rows Processed</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={140}
                  innerRadius={60}
                  dataKey="rows"
                >
                  {userChartData.map((entry, index) => (
                    <Cell key={`uc-cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Statistics Table */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-12">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-slate-800">User Activity Breakdown</h3>
          <div className="text-slate-600 text-sm font-semibold">
            {ucStats.userStats.length} user{ucStats.userStats.length !== 1 ? 's' : ''} active
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Uploads</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Processed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Avg Rows/Upload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ucStats.userStats
                .sort((a, b) => b.rows - a.rows)
                .map((userStat) => (
                <tr key={userStat.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold text-xl">
                        {userStat.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-lg">{userStat.full_name}</div>
                        <div className="text-slate-500 text-sm">{userStat.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                      {userStat.conversions}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                      {userStat.rows}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-slate-700 font-semibold text-lg">
                    {Math.round(userStat.rows / userStat.conversions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Conversions */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-8 py-6 border-b border-slate-200">
          <h3 className="text-2xl font-bold text-slate-800">Recent Uploads</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">User</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Processed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Rows Failed</th>
                <th className="px-8 py-5 text-left text-sm font-bold text-slate-700 uppercase tracking-wider">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUcConversions.slice(0, 30).map((conversion) => (
                <tr key={conversion.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-purple-700 font-bold">
                        {conversion.users?.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{conversion.users?.full_name || 'Unknown'}</div>
                        <div className="text-sm text-slate-500">{conversion.users?.email || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-purple-100 text-purple-700">
                      {conversion.rows_processed} rows
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-red-100 text-red-700">
                      {conversion.rows_failed || 0} failed
                    </span>
                  </td>
                  <td className="px-8 py-5 text-slate-600 font-semibold">
                    {new Date(conversion.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
