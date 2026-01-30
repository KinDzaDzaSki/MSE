'use client'

import { Stock } from '@/lib/types'
import { memo } from 'react'
import { uiTextMK, formatMacedonian } from '@/lib/localization'
import { generateStockAriaLabel } from '@/lib/accessibility'

interface StockListProps {
  stocks: Stock[]
  onStockClick?: (stock: Stock) => void
  isLoading?: boolean
}

function StockList({ stocks, onStockClick, isLoading }: StockListProps) {
  const handleStockClick = (stock: Stock) => {
    if (onStockClick) {
      onStockClick(stock)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent, stock: Stock) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleStockClick(stock)
    }
  }

  if (isLoading && stocks.length === 0) {
    return (
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        role="status"
        aria-live="polite"
        aria-label="Се вчитуваат податоците за акциите"
      >
        {[...Array(12)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 skeleton border border-slate-200 shadow-sm" role="presentation">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="h-4 bg-slate-200 rounded w-16 mb-2" aria-hidden="true"></div>
                <div className="h-3 bg-slate-100 rounded w-24" aria-hidden="true"></div>
              </div>
              <div className="text-right">
                <div className="h-4 bg-slate-200 rounded w-20 mb-2" aria-hidden="true"></div>
                <div className="h-3 bg-slate-100 rounded w-16" aria-hidden="true"></div>
              </div>
            </div>
            <div className="h-16 bg-slate-100 rounded mb-3" aria-hidden="true"></div>
            <div className="h-6 bg-slate-200 rounded w-24" aria-hidden="true"></div>
          </div>
        ))}
        <span className="sr-only">Се вчитуваат 12 плејсхолдери за акции</span>
      </div>
    )
  }

  if (stocks.length === 0) {
    return (
      <div
        className="bg-white rounded-lg p-8 text-center border border-slate-200 shadow-sm"
        role="status"
        aria-live="polite"
      >
        <p className="text-slate-600">{uiTextMK.noData} за акции.</p>
      </div>
    )
  }

  return (
    <div className="space-y-0 divide-y divide-gray-100">
      {/* Screen reader summary */}
      <div className="sr-only" aria-live="polite">
        Листа со {stocks.length} компании.
      </div>

      {stocks.map((stock, index) => {
        const ariaLabel = generateStockAriaLabel(stock)

        return (
          <div
            key={stock.id}
            onClick={() => handleStockClick(stock)}
            onKeyDown={(e) => handleKeyPress(e, stock)}
            className="px-8 py-6 cursor-pointer hover:bg-gray-50/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group focus:outline-none focus:bg-green-50"
            role="gridcell"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-posinset={index + 1}
            aria-setsize={stocks.length}
          >
            <div className="min-w-0 flex-1 flex items-center gap-4">
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-tight group-hover:text-primary leading-none mb-1">{stock.symbol}</span>
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wide truncate max-w-[250px]">{stock.name}</span>
              </div>

              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border ${stock.instrumentType === 'bond'
                ? 'bg-amber-50 text-amber-700 border-amber-100'
                : 'bg-gray-50 text-gray-500 border-gray-100'
                }`}>
                {stock.instrumentType === 'bond' ? 'Обврзница' : 'Акција'}
              </span>
            </div>

            <div className="flex items-center gap-8 flex-shrink-0">
              <div className="text-right">
                {stock.price > 0 ? (
                  <>
                    <span className="font-black text-xl">{formatMacedonian.currency(stock.price)}</span>
                    <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">
                      {new Date(stock.lastUpdated).toDateString() === new Date().toDateString()
                        ? 'Последна цена'
                        : `Цена од ${new Date(stock.lastUpdated).toLocaleDateString('mk-MK', { day: '2-digit', month: '2-digit' })}`
                      }
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-black text-xl text-gray-300">Нема промет</span>
                    <div className="text-[10px] text-gray-400 font-extrabold uppercase mt-0.5">Денес</div>
                  </>
                )}
              </div>

              <div className="w-24 text-right">
                {stock.price > 0 && new Date(stock.lastUpdated).toDateString() === new Date().toDateString() ? (
                  <span className={`inline-block px-3 py-1 rounded-lg font-black text-sm ${stock.changePercent > 0 ? 'bg-green-100 text-green-700' :
                      stock.changePercent < 0 ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-500'
                    }`}>
                    {stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                  </span>
                ) : (
                  <span className="inline-block px-3 py-1 rounded-lg font-black text-sm bg-gray-50 text-gray-300">
                    0.00%
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const MemoizedStockList = memo(StockList)
export { MemoizedStockList as StockList }
export default MemoizedStockList