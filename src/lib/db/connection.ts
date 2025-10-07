import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

// Get database URL from environment variables
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  
  if (!url) {
    // Check if local database is specifically configured
    const localUrl = process.env.LOCAL_DATABASE_URL
    if (localUrl) {
      console.log('🔧 Using local database:', localUrl)
      return localUrl
    }
    
    // No database configured - app will run in memory mode
    console.log('📝 No database configured - running in memory mode')
    return null
  }
  
  return url
}

// Create the database connection only if URL is available
const databaseUrl = getDatabaseUrl()
let sql: any = null
let db: any = null

if (databaseUrl) {
  try {
    sql = neon(databaseUrl)
    db = drizzle(sql, { schema })
  } catch (error) {
    console.warn('⚠️ Database initialization failed:', error)
  }
}

export { db, sql }

// Database utility functions
export class DatabaseService {
  
  // Check if database connection is working
  static async testConnection(): Promise<boolean> {
    try {
      if (!sql) {
        console.log('📝 Database not configured - running in memory mode')
        return false
      }
      
      await sql`SELECT 1`
      console.log('✅ Database connection successful')
      return true
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      return false
    }
  }

  // Initialize database tables (for development)
  static async initializeTables(): Promise<void> {
    try {
      // This would typically be handled by migration files
      // For now, we'll log that tables should be created via drizzle-kit
      console.log('📋 Database tables should be created via: npm run db:push')
    } catch (error) {
      console.error('Error initializing tables:', error)
      throw error
    }
  }

  // Get database health status
  static async getHealthStatus() {
    try {
      const start = Date.now()
      await sql`SELECT 1`
      const responseTime = Date.now() - start
      
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }
  }
}

export default db