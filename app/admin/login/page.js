'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()

  useEffect(() => {
    const email = localStorage.getItem('userEmail')
    if (email === 'admin@fedex.com') {
      router.replace('/admin')
    } else {
      router.replace('/')
    }
  }, [])

  return null
}
