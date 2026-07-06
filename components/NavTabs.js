'use client'

import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'TIFF to PDF' },
  { href: '/arrival-notice', label: 'Arrival Notice' },
]

export default function NavTabs() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 bg-purple-950 border border-white/20 rounded-lg p-1">
      {TABS.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${
            pathname === tab.href
              ? 'bg-white text-purple-900'
              : 'text-white hover:bg-white/10'
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  )
}
