'use client'

import { useState, useEffect, useCallback } from 'react'
import { Stock, MarketStatusInfo, ApiResponse } from '@/lib/types'
import { deduplicateStocks } from '@/lib/utils'

interface UseStocksReturn {
  stocks: Stock[]
  marketStatus: MarketStatusInfo
  lastUpdated: string | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useStocks(autoRefresh: boolean = true): UseStocksReturn {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo>({
    isOpen: false,
    status: 'closed',
    nextOpen: '',
    nextClose: '',
    timezone: 'Europe/Skopje'
  })
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStocks = useCallback(async () => {
    try {
      setError(null)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch('/api/stocks', {
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result: ApiResponse<{
        stocks: Stock[]
        marketStatus: MarketStatusInfo
        lastUpdated: string
        databaseStatus?: any
      }> = await response.json()

      if (result.success && result.data) {
        // Apply client-side deduplication as additional safety measure
        const uniqueStocks = deduplicateStocks(result.data.stocks)
        setStocks(uniqueStocks)
        setMarketStatus(result.data.marketStatus)
        setLastUpdated(result.data.lastUpdated)
        
        // Show warning if using cached data
        if ('warning' in result) {
          console.warn('API Warning:', result.warning)
        }
      } else {
        throw new Error(result.error || 'Failed to fetch stocks')
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timed out. Please try again.')
        } else if (err.message.includes('fetch')) {
          setError('Network error. Please check your connection.')
        } else {
          setError(err.message)
        }
      } else {
        setError('Unknown error occurred')
      }
      console.error('Error fetching stocks:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStocks()
  }, [fetchStocks])

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      // Only auto-refresh if not currently loading
      if (!isLoading) {
        fetchStocks()
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [autoRefresh, isLoading, fetchStocks])

  const refetch = useCallback(async () => {
    setIsLoading(true)
    await fetchStocks()
  }, [fetchStocks])

  return {
    stocks,
    marketStatus,
    lastUpdated,
    isLoading,
    error,
    refetch
  }
}