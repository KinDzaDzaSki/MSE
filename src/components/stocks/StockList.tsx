'use client'

import { useState, useMemo } from 'react'
import { Stock } from '@/lib/types'
import { StockCard } from './StockCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, SortAsc, SortDesc } from 'lucide-react'

interface StockListProps {
  stocks: Stock[]
  onStockClick?: (stock: Stock) => void
  isLoading?: boolean
}

type SortField = 'symbol' | 'price' | 'change' | 'volume'
type SortDirection = 'asc' | 'desc'

export function StockList({ stocks, onStockClick, isLoading }: StockListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('symbol')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const filteredAndSortedStocks = useMemo(() => {
    let filtered = stocks.filter(stock =>
      stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    filtered.sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      switch (sortField) {
        case 'symbol':
          aValue = a.symbol
          bValue = b.symbol
          break
        case 'price':
          aValue = a.price
          bValue = b.price
          break
        case 'change':
          aValue = a.changePercent
          bValue = b.changePercent
          break
        case 'volume':
          aValue = a.volume
          bValue = b.volume
          break
        default:
          aValue = a.symbol
          bValue = b.symbol
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      return 0
    })

    return filtered
  }, [stocks, searchTerm, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(field)}
      className="h-8 px-2 flex items-center gap-1"
    >
      {children}
      {sortField === field && (
        sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
      )}
    </Button>
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Пребарај акции..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-1">
          <SortButton field="symbol">Симбол</SortButton>
          <SortButton field="price">Цена</SortButton>
          <SortButton field="change">Промена</SortButton>
          <SortButton field="volume">Волумен</SortButton>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Прикажани {filteredAndSortedStocks.length} од {stocks.length} акции
      </div>

      {/* Stock Grid */}
      {filteredAndSortedStocks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Не се пронајдени акции што се совпаѓаат со вашето пребарување.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAndSortedStocks.map((stock) => (
            <StockCard
              key={stock.id}
              stock={stock}
              onClick={() => onStockClick?.(stock)}
            />
          ))}
        </div>
      )}
    </div>
  )
}