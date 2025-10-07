import { NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/db/connection'
import { ScrapingLogService } from '@/lib/db/services'
import { ApiResponse } from '@/lib/types'

export async function GET(): Promise<NextResponse<ApiResponse<{
  database: any
  scrapingStats?: any
}>>> {
  try {
    // Get database health status
    const databaseStatus = await DatabaseService.getHealthStatus()
    
    let scrapingStats = null
    
    // If database is healthy, get scraping statistics
    if (databaseStatus.status === 'healthy') {
      try {
        scrapingStats = await ScrapingLogService.getScrapingStats()
      } catch (error) {
        console.warn('Could not fetch scraping stats:', error)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        database: databaseStatus,
        ...(scrapingStats && { scrapingStats })
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Health check error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      data: {
        database: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }, { status: 500 })
  }
}