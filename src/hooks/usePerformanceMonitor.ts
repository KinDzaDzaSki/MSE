'use client'

import { useEffect, useRef } from 'react'

interface PerformanceMetric {
  name: string
  duration: number
  timestamp: number
}

export function usePerformanceMonitor(componentName: string) {
  const startTime = useRef<number>(Date.now())
  
  useEffect(() => {
    const endTime = Date.now()
    const renderTime = endTime - startTime.current
    
    // Log performance metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${componentName} rendered in ${renderTime}ms`)
    }
    
    // Send to analytics in production
    if (process.env.NODE_ENV === 'production' && renderTime > 100) {
      const metric: PerformanceMetric = {
        name: `component_render_${componentName}`,
        duration: renderTime,
        timestamp: endTime,
      }
      
      // You can send this to your analytics service
      console.warn(`Slow render detected: ${componentName} (${renderTime}ms)`, metric)
    }
  })
  
  return {
    markStart: () => {
      startTime.current = Date.now()
    },
    markEnd: (operationName: string) => {
      const endTime = Date.now()
      const duration = endTime - startTime.current
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${componentName}:${operationName} took ${duration}ms`)
      }
      
      return duration
    }
  }
}