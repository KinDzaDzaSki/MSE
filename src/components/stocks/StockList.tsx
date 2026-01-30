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

  // Generate realistic chart path based on stock data
  const generateChartPath = (stock: Stock) => {
    const points = 15 // Number of data points
    const width = 100
    const baseY = 25 // Middle baseline

    // Generate realistic price movement based on stock data
    const priceChange = stock.changePercent / 100
    const volatility = Math.max(2, Math.abs(priceChange) * 8 + Math.random() * 3) // Realistic volatility

    // Create a more realistic trading pattern
    const pricePoints: number[] = []
    let currentPrice = baseY

    // Generate realistic intraday price movements
    for (let i = 0; i <= points; i++) {
      if (i === 0) {
        pricePoints.push(baseY)
      } else {
        // Add realistic market noise
        const marketNoise = (Math.random() - 0.5) * volatility * 0.8

        // Add trend influence that grows stronger towards the end
        const trendStrength = (i / points) * 0.7
        const trendInfluence = priceChange * trendStrength * 12

        // Add some momentum and mean reversion
        const momentum = i > 1 && pricePoints[i - 1] !== undefined && pricePoints[i - 2] !== undefined
          ? (pricePoints[i - 1]! - pricePoints[i - 2]!) * 0.3
          : 0
        const meanReversion = (baseY - currentPrice) * 0.1

        currentPrice = baseY - trendInfluence + marketNoise + momentum + meanReversion

        // Keep within bounds but allow some variation
        currentPrice = Math.max(8, Math.min(32, currentPrice))
        pricePoints.push(currentPrice)
      }
    }

    // Create smooth SVG path
    let path = `M0,${pricePoints[0] || baseY}`

    for (let i = 1; i < pricePoints.length; i++) {
      const x = (i / points) * width
      const y = pricePoints[i]
      const prevY = pricePoints[i - 1]

      if (y === undefined) continue

      if (i === 1) {
        path += ` L${x},${y}`
      } else {
        // Use quadratic curves for smoother transitions
        const prevX = ((i - 1) / points) * width
        const controlX = prevX + (x - prevX) * 0.5
        const controlY = prevY !== undefined ? (prevY + y) * 0.5 : y
        path += ` Q${controlX},${controlY} ${x},${y}`
      }
    }

    return path
  }

  // Generate fill path for gradient area
  const generateFillPath = (stock: Stock) => {
    const mainPath = generateChartPath(stock)
    return `${mainPath} L100,40 L0,40 Z`
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
    <div className="space-y-4">
      {/* Screen reader summary */}
      <div className="sr-only" aria-live="polite">
        Листа со {stocks.length} акции. Користете Tab за навигација и Enter или Space за селекција.
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        role="grid"
        aria-label="Листа на акции"
      >
        {stocks.map((stock, index) => {
          const changeDirection = stock.changePercent >= 0 ? 'позитивна' : 'негативна'
          const ariaLabel = generateStockAriaLabel(stock)

          return (
            <div
              key={stock.id}
              onClick={() => handleStockClick(stock)}
              onKeyDown={(e) => handleKeyPress(e, stock)}
              className="bg-white rounded-lg p-4 cursor-pointer hover:bg-slate-50 transition-colors border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              role="gridcell"
              tabIndex={0}
              aria-label={ariaLabel}
              aria-describedby={`stock-${stock.id}-details`}
              aria-posinset={index + 1}
              aria-setsize={stocks.length}
            >
              {/* Header with symbol and price */}
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-lg" id={`stock-${stock.id}-symbol`}>
                      {stock.symbol}
                    </h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${stock.instrumentType === 'bond'
                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                      {stock.instrumentType === 'bond' ? 'Обврзница' : 'Акција'}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm truncate" id={`stock-${stock.id}-name`}>
                    {stock.name}
                  </p>
                </div>
                <div className="text-right ml-2">
                  <div
                    className={`text-sm font-medium ${stock.changePercent >= 0 ? 'text-stock-gain' : 'text-stock-loss'
                      }`}
                    aria-label={`Промена: ${changeDirection} ${Math.abs(stock.changePercent).toFixed(2)} проценти`}
                  >
                    <span aria-hidden="true">
                      {stock.changePercent >= 0 ? '↑' : '↓'}
                    </span>
                    <span className="sr-only">
                      {stock.changePercent >= 0 ? 'зголемување' : 'намалување'}
                    </span>
                    {Math.abs(stock.changePercent).toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Mini chart placeholder with accessibility */}
              <div className="h-16 mb-3 flex items-center" role="img" aria-label={`Графикон за ${stock.symbol}, ${changeDirection} тренд`}>
                <svg
                  className="w-full h-full"
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d={generateChartPath(stock)}
                    stroke={stock.changePercent >= 0 ? 'var(--stock-gain)' : 'var(--stock-loss)'}
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d={generateFillPath(stock)}
                    fill={`url(#gradient-${stock.id})`}
                    fillOpacity="0.2"
                  />
                  <defs>
                    <linearGradient id={`gradient-${stock.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={stock.changePercent >= 0 ? 'var(--stock-gain)' : 'var(--stock-loss)'} />
                      <stop offset="100%" stopColor={stock.changePercent >= 0 ? 'var(--stock-gain)' : 'var(--stock-loss)'} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              {/* Price with accessibility */}
              <div className="text-slate-900 text-2xl font-bold" id={`stock-${stock.id}-price`}>
                <span className="sr-only">Цена: </span>
                {formatMacedonian.currency(stock.price)}
              </div>

              {/* Hidden detailed description for screen readers */}
              <div id={`stock-${stock.id}-details`} className="sr-only">
                Притиснете Enter или Space за да ги видите деталите за {stock.symbol}.
                Тековна цена: {formatMacedonian.currency(stock.price)}.
                Промена: {changeDirection} {Math.abs(stock.changePercent).toFixed(2)} проценти.
                Компанија: {stock.name}.
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const MemoizedStockList = memo(StockList)
export { MemoizedStockList as StockList }
export default MemoizedStockList