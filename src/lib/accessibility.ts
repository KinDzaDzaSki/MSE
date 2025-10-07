// WCAG 2.1 AA Accessibility utilities and helpers

export interface AccessibilityProps {
  ariaLabel?: string
  ariaDescribedBy?: string
  ariaExpanded?: boolean
  ariaHidden?: boolean
  role?: string
  tabIndex?: number
}

// Screen reader announcements
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.setAttribute('class', 'sr-only')
  announcement.textContent = message
  
  document.body.appendChild(announcement)
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

// Focus management utilities
export const focusElement = (selector: string) => {
  const element = document.querySelector(selector) as HTMLElement
  if (element) {
    element.focus()
  }
}

export const trapFocus = (container: HTMLElement) => {
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  const firstElement = focusableElements[0] as HTMLElement
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus()
          e.preventDefault()
        }
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown)
  return () => container.removeEventListener('keydown', handleKeyDown)
}

// Color contrast utilities
export const getContrastRatio = (foreground: string, background: string): number => {
  // Simplified contrast ratio calculation
  // In a real implementation, you'd want a more robust color parsing library
  const getLuminance = (color: string): number => {
    const rgb = parseInt(color.slice(1), 16)
    const r = (rgb >> 16) & 0xff
    const g = (rgb >> 8) & 0xff
    const b = (rgb >> 0) & 0xff
    
    const sRGB = [r, g, b].map((c) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    
    return 0.2126 * (sRGB[0] || 0) + 0.7152 * (sRGB[1] || 0) + 0.0722 * (sRGB[2] || 0)
  }

  const l1 = getLuminance(foreground)
  const l2 = getLuminance(background)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

// Stock price change accessibility helpers
export const getStockChangeAnnouncement = (
  symbol: string,
  price: number,
  change: number,
  changePercent: number
): string => {
  const direction = change >= 0 ? 'горе' : 'долу'
  const changeType = change >= 0 ? 'добивка' : 'загуба'
  
  return `${symbol}: тековна цена ${price.toLocaleString('mk-MK')} денари, ${direction} за ${Math.abs(changePercent).toFixed(2)} проценти, ${changeType} од ${Math.abs(change).toLocaleString('mk-MK')} денари`
}

// ARIA live region helpers
export const createLiveRegion = (id: string, level: 'polite' | 'assertive' = 'polite'): HTMLElement => {
  let liveRegion = document.getElementById(id)
  
  if (!liveRegion) {
    liveRegion = document.createElement('div')
    liveRegion.id = id
    liveRegion.setAttribute('aria-live', level)
    liveRegion.setAttribute('aria-atomic', 'true')
    liveRegion.setAttribute('class', 'sr-only')
    document.body.appendChild(liveRegion)
  }
  
  return liveRegion
}

export const updateLiveRegion = (id: string, message: string) => {
  const liveRegion = document.getElementById(id)
  if (liveRegion) {
    liveRegion.textContent = message
  }
}

// Keyboard navigation helpers
export const KEYBOARD_KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  TAB: 'Tab'
} as const

export const handleKeyboardInteraction = (
  e: KeyboardEvent,
  handlers: Partial<Record<keyof typeof KEYBOARD_KEYS, () => void>>
) => {
  const key = e.key
  Object.entries(KEYBOARD_KEYS).forEach(([keyName, keyValue]) => {
    if (key === keyValue && handlers[keyName as keyof typeof KEYBOARD_KEYS]) {
      e.preventDefault()
      handlers[keyName as keyof typeof KEYBOARD_KEYS]!()
    }
  })
}

// Touch target size validation
export const validateTouchTarget = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect()
  const minSize = 44 // WCAG minimum touch target size
  return rect.width >= minSize && rect.height >= minSize
}

// Reduced motion detection
export const prefersReducedMotion = (): boolean => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// High contrast detection
export const prefersHighContrast = (): boolean => {
  return window.matchMedia('(prefers-contrast: high)').matches
}

// ARIA description generators for financial data
export const generateStockAriaLabel = (stock: {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
}): string => {
  const direction = stock.change >= 0 ? 'зголемена' : 'намалена'
  return `${stock.symbol}, ${stock.name}, цена ${stock.price.toLocaleString('mk-MK')} денари, ${direction} за ${Math.abs(stock.changePercent).toFixed(2)} проценти, волумен ${stock.volume.toLocaleString('mk-MK')}`
}

export const generateChartAriaLabel = (data: Array<{value: number, timestamp: string}>): string => {
  if (data.length === 0) return 'Графиконот нема податоци'
  
  const firstPoint = data[0]
  const lastPoint = data[data.length - 1]
  if (!firstPoint || !lastPoint) return 'Графиконот нема валидни податоци'
  
  const firstValue = firstPoint.value
  const lastValue = lastPoint.value
  const change = lastValue - firstValue
  const changePercent = (change / firstValue) * 100
  const trend = change >= 0 ? 'растечки' : 'опаѓачки'
  
  return `Графикон со ${data.length} точки, ${trend} тренд, промена од ${changePercent.toFixed(2)} проценти`
}

// Error message helpers
export const getAccessibleErrorMessage = (field: string, error: string): string => {
  return `Грешка во полето ${field}: ${error}. Ве молиме поправете ја грешката и обидете се повторно.`
}

// Loading state helpers
export const getLoadingAnnouncement = (content: string): string => {
  return `Се вчитува ${content}. Ве молиме почекајте.`
}

export const getLoadingCompleteAnnouncement = (content: string): string => {
  return `${content} е успешно вчитан.`
}