/**
 * Turns stored history records (current and legacy shapes) into one display model.
 *
 * Current:  { type, bet, payout, netWin, result, endedAt, timestamp, id }
 * Legacy:   { game, outcome | result, roll, outcomes[], bet?, payout?, timestamp }
 */

export const STATUS_LABEL = {
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
  bust: 'Bust',
  blackjack: 'Blackjack',
  surrender: 'Surrender',
  even: 'Even',
  none: '',
};

const RESULT_MAP = {
  win: 'win', won: 'win',
  lose: 'loss', loss: 'loss', lost: 'loss',
  push: 'push', tie: 'push',
  bust: 'bust',
  surrender: 'surrender',
  blackjack: 'blackjack', natural: 'blackjack',
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Net result of a craps roll record from its resolved bets. */
const crapsFromOutcomes = (outcomes) => {
  let net = 0;
  let bet = 0;
  let resolved = 0;
  let pushes = 0;
  for (const o of Array.isArray(outcomes) ? outcomes : []) {
    if (!o || !o.bet || (o.result !== 'win' && o.result !== 'lose' && o.result !== 'push')) continue;
    const amount = num(o.amount) ?? 0;
    const payout = num(o.payout) ?? 0;
    resolved += 1;
    bet += amount;
    if (o.result === 'win') {
      // Place bets pay winnings only (the stake stays up); everything else returns the stake in the payout.
      net += String(o.bet).startsWith('place') ? payout : payout - amount;
    } else if (o.result === 'lose') {
      net -= amount;
    } else {
      pushes += 1;
    }
  }
  return { net, bet, resolved, allPush: resolved > 0 && pushes === resolved };
};

export const normalizeRecord = (r, index = 0) => {
  if (!r || typeof r !== 'object') return null;
  const game = (r.type || r.game || 'blackjack') === 'craps' ? 'craps' : 'blackjack';
  const ts = new Date(r.endedAt || r.timestamp || r.startedAt || 0);
  const time = Number.isNaN(ts.getTime()) ? null : ts;

  let bet = num(r.bet) ?? 0;
  let net = num(r.netWin);
  let status = RESULT_MAP[String(r.result ?? r.outcome ?? '').toLowerCase()] || null;

  if (game === 'craps' && net === null && Array.isArray(r.outcomes)) {
    const c = crapsFromOutcomes(r.outcomes);
    net = c.net;
    if (!bet) bet = c.bet;
    if (c.resolved === 0) status = status || 'none';
    else if (!status) status = c.allPush ? 'push' : null;
  }
  if (net === null) {
    const payout = num(r.payout);
    net = payout !== null ? payout - bet : 0;
  }
  if (!status) {
    if (status !== 'none') status = net > 0 ? 'win' : net < 0 ? 'loss' : bet > 0 ? 'push' : 'even';
  }
  // A craps record without bets or results is a plain roll, not a game outcome.
  if (game === 'craps' && status === 'none') net = 0;

  const roll = r.roll && num(r.roll.die1) !== null && num(r.roll.die2) !== null
    ? { die1: r.roll.die1, die2: r.roll.die2, total: num(r.roll.total) ?? r.roll.die1 + r.roll.die2 }
    : null;

  return {
    id: r.id || `legacy-${index}`,
    game,
    time,
    bet,
    net,
    status,
    roll,
  };
};

export const normalizeHistory = (records) =>
  (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .filter((r) => r && r.status !== 'none')
    .sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));

export const summarize = (rows) => {
  let net = 0;
  let wins = 0;
  let losses = 0;
  for (const r of rows) {
    net += r.net;
    if (r.status === 'win' || r.status === 'blackjack') wins += 1;
    else if (r.status === 'loss' || r.status === 'bust' || r.status === 'surrender') losses += 1;
  }
  const decided = wins + losses;
  return { net, played: rows.length, wins, losses, winRate: decided ? wins / decided : null };
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const dayLabel = (date, now = new Date()) => {
  if (!date) return 'Earlier';
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    weekday: diff < 7 ? 'long' : undefined,
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
};

/** Groups newest-first rows by calendar day. */
export const groupByDay = (rows, now = new Date()) => {
  const groups = [];
  for (const row of rows) {
    const key = row.time ? String(startOfDay(row.time)) : 'unknown';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, label: dayLabel(row.time, now), rows: [row] });
  }
  return groups;
};

export const formatTime = (date) =>
  date ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
