import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/mse_dev',
  },
  verbose: true,
  strict: true,
})