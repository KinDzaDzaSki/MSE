#!/usr/bin/env node
/**
 * cleanup-noprice.js
 *
 * Deletes stock quotes from the database that have no price (lastPrice is null).
 * Also removes those symbols from the active list.
 *
 * Usage:  node scripts/cleanup-noprice.js
 *         DATABASE_URL=postgres://... node scripts/cleanup-noprice.js
 *
 * Designed to run in production (Cloud Run / suga.app) or locally.
 * Safe to run multiple times — idempotent.
 */

const path = require('path');
// Load db relative to the project root
const db = require(path.join(__dirname, '..', 'lib', 'db'));

async function main() {
  console.log('🔍 Scanning for stock quotes without a price...');

  const all = await db.getAllQuotes();
  const entries = Object.entries(all);
  console.log(`   Total quotes in DB: ${entries.length}`);

  const toRemove = entries.filter(([sym, q]) => {
    return q.lastPrice == null;
  });

  if (toRemove.length === 0) {
    console.log('✅ No stock quotes without a price found. Nothing to do.');
    return;
  }

  console.log(`   Found ${toRemove.length} stocks with no price:\n`);
  for (const [sym, q] of toRemove) {
    console.log(`   - ${sym}  (${q.name || 'unnamed'})`);
  }

  // Remove from quotes table
  console.log('\n🗑️  Removing...');
  for (const [sym] of toRemove) {
    await db.deleteQuote(sym);
  }

  // Also remove from the active symbols list
  const active = await db.getMeta('active', []);
  if (Array.isArray(active) && active.length) {
    const removed = new Set(toRemove.map(([s]) => s));
    const filtered = active.filter((s) => !removed.has(s));
    if (filtered.length !== active.length) {
      await db.setMeta('active', filtered);
      console.log(`   Updated active symbols list: ${active.length} → ${filtered.length}`);
    }
  }

  // Same for the full symbols list
  const symbols = await db.getMeta('symbols', []);
  if (Array.isArray(symbols) && symbols.length) {
    const removed = new Set(toRemove.map(([s]) => s));
    const filtered = symbols.filter((s) => !removed.has(s));
    if (filtered.length !== symbols.length) {
      await db.setMeta('symbols', filtered);
      console.log(`   Updated full symbols list: ${symbols.length} → ${filtered.length}`);
    }
  }

  console.log(`\n✅ Done. Removed ${toRemove.length} stocks without a price.`);
}

main().catch((e) => {
  console.error('❌ Cleanup failed:', e.message);
  process.exit(1);
});