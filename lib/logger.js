/**
 * Simple file + stdout logger for MSE Clone.
 * Writes to logs/app.log in the project root.
 * Also preserves console output for platform log streams.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', process.env.LOG_DIR || 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LINES = process.env.LOG_MAX_LINES ? parseInt(process.env.LOG_MAX_LINES, 10) : 2000;

// Ensure log directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

// Keep a ring buffer of recent lines for the /api/logs endpoint
const ring = [];
let ringIndex = 0;
let ringSize = 0;

function write(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  // stdout
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
  // file append
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {}
  // ring buffer
  ring[ringIndex] = line;
  ringIndex = (ringIndex + 1) % MAX_LINES;
  if (ringSize < MAX_LINES) ringSize++;
}

const logger = {
  info(msg) { write('INFO', msg); },
  warn(msg) { write('WARN', msg); },
  error(msg) { write('ERROR', msg); },

  /** Return recent log lines (newest last) */
  getRecent(n = 50) {
    const count = Math.min(n, ringSize);
    const result = [];
    if (ringSize < MAX_LINES) {
      // never wrapped — just slice
      for (let i = 0; i < ringSize; i++) result.push(ring[i]);
    } else {
      // wrapped around
      for (let i = 0; i < MAX_LINES; i++) {
        result.push(ring[(ringIndex + i) % MAX_LINES]);
      }
    }
    return result.slice(-count);
  },
};

module.exports = logger;
