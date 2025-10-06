// API Configuration
export const API_CONFIG = {
  TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
} as const

// MSE Website Configuration
export const MSE_CONFIG = {
  BASE_URL: 'https://www.mse.mk',
  ENDPOINTS: {
    STOCKS: '/en/stats/symbolhistory',
    MARKET_DATA: '/en/stats/current',
  },
} as const

// Refresh Intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  STOCKS: 30000, // 30 seconds
  MARKET_STATUS: 60000, // 1 minute
} as const

// Market Trading Hours (in 24-hour format)
export const MARKET_HOURS = {
  OPEN: 10, // 10:00 AM
  CLOSE: 16, // 4:00 PM
  TIMEZONE: 'Europe/Skopje',
} as const

// UI Constants
export const UI_CONFIG = {
  ITEMS_PER_PAGE: 20,
  CHART_HEIGHT: 400,
  ANIMATION_DURATION: 300,
} as const

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK: 'Мрежна грешка. Ве молиме проверете ја вашата конекција.',
  TIMEOUT: 'Барањето истече. Ве молиме обидете се повторно.',
  SERVER: 'Серверска грешка. Ве молиме обидете се повторно подоцна.',
  NOT_FOUND: 'Податоците не се пронајдени.',
  RATE_LIMIT: 'Премногу барања. Ве молиме почекајте пред да се обидете повторно.',
} as const

// Success Messages
export const SUCCESS_MESSAGES = {
  DATA_UPDATED: 'Податоците се успешно ажурирани',
  CONNECTION_RESTORED: 'Конекцијата е воспоставена',
} as const