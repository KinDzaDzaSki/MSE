'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

// Dynamically import Recharts to avoid SSR issues
const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((mod) => mod.ResponsiveContainer), { ssr: false })

const testData = [
  { name: 'Jan', value: 100 },
  { name: 'Feb', value: 120 },
  { name: 'Mar', value: 110 },
  { name: 'Apr', value: 140 },
  { name: 'May', value: 130 }
]

export function TestChart() {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <div className="w-full h-64 border border-gray-200 rounded flex items-center justify-center">
        <span className="text-gray-500">Loading chart...</span>
      </div>
    )
  }

  return (
    <div className="w-full h-64 border border-gray-200 rounded">
      <h3 className="text-lg font-semibold mb-2">Test Chart</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={testData}>
          <XAxis dataKey="name" />
          <YAxis />
          <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}