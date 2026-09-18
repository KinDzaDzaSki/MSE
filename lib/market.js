// Market calendar & hours — single source of truth for "is the exchange open".
//
// Trading session: Monday–Friday, 09:00–14:00.
// Polling continues until 14:30 because MSE publishes the end-of-day data with
// a short lag after the close — the last poll of the day is what actually
// captures the final prices.
//
// Non-trading days are taken from the official MSE trading calendar
// (mse.mk → Markets and trading → Calendar). Add the next year's list here
// each January.
const HOURS_LABEL = '09:00 – 14:00';
const DAYS_LABEL = 'Понеделник – Петок';

const OPEN_MIN = 9 * 60;             // 09:00 — session opens
const CLOSE_MIN = 14 * 60;           // 14:00 — session closes (what we display)
const POLL_UNTIL_MIN = 14 * 60 + 30; // 14:30 — internal polling window (publication lag)

// 'MM-DD' entries, per year.
const HOLIDAYS = {
  2025: ['01-01', '01-06', '01-07', '03-31', '04-18', '04-21', '05-01', '06-06', '08-28', '09-08', '10-23', '12-08', '12-31'],
  2026: ['01-01', '01-06', '01-07', '01-19', '03-20', '04-10', '04-13', '05-01', '05-25', '05-29', '08-03', '08-28', '09-08', '10-12', '10-23', '12-08', '12-31'],
};

// Skopje wall-clock encoded as UTC (Date.UTC-built) so every getter below is
// timezone-independent regardless of the container's local timezone.
function skopjeClock(at) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Skopje',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(at || new Date());
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return new Date(Date.UTC(
    +o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second
  ));
}
function nowSkopje() {
  return skopjeClock(new Date());
}

function ymd(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function isHoliday(d) {
  const list = HOLIDAYS[d.getUTCFullYear()];
  return Array.isArray(list) && list.includes(ymd(d).slice(5));
}

// Trading session state — what the UI shows ("Пазарот е отворен/затворен").
function isMarketOpen(at) {
  const d = at || nowSkopje();
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  if (isHoliday(d)) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= OPEN_MIN && mins < CLOSE_MIN; // 14:00 sharp = session over
}

// Polling window — the scheduler keeps refreshing until 14:30 so the final
// end-of-day numbers (published just after the close) get picked up.
function isPollingWindow(at) {
  const d = at || nowSkopje();
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (isHoliday(d)) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= OPEN_MIN && mins <= POLL_UNTIL_MIN;
}

// EOD capture window — with a slow poll interval the last in-window tick can
// land before MSE publishes the final numbers. Between 14:30 and 16:00 the
// scheduler runs exactly one capture poll per trading day, so the published
// close never depends on tick alignment.
const CAPTURE_UNTIL_MIN = 16 * 60; // 16:00 — latest EOD capture attempt

function isFinalCaptureWindow(at) {
  const d = at || nowSkopje();
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (isHoliday(d)) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins > POLL_UNTIL_MIN && mins <= CAPTURE_UNTIL_MIN;
}

// Trading day that isn't a weekend or an official holiday — used by the
// boot-time EOD safety net.
function isTradingDay(at) {
  const d = at || nowSkopje();
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !isHoliday(d);
}

// First upcoming day the exchange is closed (weekend or holiday), from today.
function nextNonTradingDay(at) {
  const d = at || nowSkopje();
  for (let i = 0; i <= 30; i++) {
    const probe = new Date(d.getTime());
    probe.setUTCDate(probe.getUTCDate() + i);
    const day = probe.getUTCDay();
    const holiday = isHoliday(probe);
    if (day === 0 || day === 6 || holiday) {
      return {
        date: ymd(probe),
        type: holiday ? 'holiday' : 'weekend',
        isToday: i === 0,
      };
    }
  }
  return null;
}

function marketInfo() {
  const d = nowSkopje();
  return {
    open: isMarketOpen(),
    hours: HOURS_LABEL,
    days: DAYS_LABEL,
    today: ymd(d),
    nextNonTrading: nextNonTradingDay(),
  };
}

module.exports = {
  nowSkopje,
  skopjeClock,
  isMarketOpen,
  isPollingWindow,
  isFinalCaptureWindow,
  isTradingDay,
  nextNonTradingDay,
  marketInfo,
  HOURS_LABEL,
  HOLIDAYS,
};
