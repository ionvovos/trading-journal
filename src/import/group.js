// Fills to round-trip trades (architecture section 2.3). Pure: no DOM, no clock (now is passed).
//
// groupFills(input, deps) -> { trades, anomalies, matched, funding, accountUpdates }
//
// input: { fills, funding = [], account, mode = 'real', importId, existingKeys = [], existingLegs = [],
//          dustThreshold = '0', declaredZone, fileZone, answers = {}, overrides = {}, now }
//   account: { id, baseCurrency, dustThresholds?, contractValues? }
//   existingLegs: legs already stored for the account, { key, time, instrument, side, size, price } (see legsAsFills)
//   answers / overrides: see anomalies.js answersOf(). Every answer is applied on a fresh build, so
//   the same input always gives the same trades; trade and leg ids come from the first fill key.
// deps: { tradeMoney(trade, ctx) -> { netMinor, recomputedNetMinor } | null }  (src/stats, for broker_mismatch)
//
// Unanswered anomalies that hold trades put their kind into trade.holds; an answer removes it.
import * as D from '../core/decimal.js';
import { minorDigits, roundMinor } from '../core/money.js';
import { localParts, startOfLocalDate, zoneOffsetMs, addDays } from '../core/time.js';
import { KINDS, KIND_ORDER, anomalyId, answerFor } from './anomalies.js';
import { isClosed, closeTimeOf } from '../core/trade.js';

const HOUR = 3600000;
const PENDING_BEFORE_MONEY = ['missing_fee', 'rate_missing', 'contract_size_missing', 'opened_before_file', 'dust', 'flip', 'near_duplicate'];

const sign = (fill) => (fill.side === 'buy' ? 1 : -1);
const isKraken = (f) => /^kraken:/.test(f.key || '');
const isMt4 = (f) => /^mt4:/.test(f.key || '');

// True when the source says the fill closes a position: IBKR code C; a Kraken spot sell (spot cannot be short).
export function isCloseBySource(fill) {
  if (fill.openClose === 'C') return true;
  if (fill.openClose === 'O') return false;
  return isKraken(fill) && fill.side === 'sell' && !/margin/.test(fill.notes || '');
}

// Stored trades as fills for near-duplicate matching: one entry per leg with a source key.
export function legsAsFills(trades) {
  const out = [];
  for (const t of trades) {
    for (const l of t.legs) {
      if (!l.source?.key) continue;
      const buy = (t.side === 'long') === (l.kind === 'entry');
      out.push({ key: l.source.key, time: l.time, instrument: t.instrument, side: buy ? 'buy' : 'sell', size: l.size, price: l.price, tradeId: t.id });
    }
  }
  return out;
}

// Every source key already stored: leg keys, cash keys, attached funding keys.
export function collectExistingKeys(trades, cash = []) {
  const keys = new Set();
  for (const t of trades) {
    for (const l of t.legs) if (l.source?.key) keys.add(l.source.key);
    for (const f of t.fundingEntries || []) if (f.key) keys.add(f.key);
  }
  for (const c of cash) if (c.key) keys.add(c.key);
  return keys;
}

function proRata(fee, part, whole) {
  if (fee === null || fee === undefined) return [null, null];
  const first = D.div(D.mul(fee, part), whole); // multiply first: exact when the split is exact
  return [first, D.sub(fee, first)];
}

function rateFrom(value, currency) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value[currency] !== undefined ? Number(value[currency]) : null;
  return Number(value);
}

function fillValueFor(value, fill) {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.hasOwn(value, fill.key)) return value[fill.key];
  if (value.fill !== undefined && (value.fill === fill.key || fill.key.endsWith(`:${value.fill}`) || String(value.fill) === String(fill.row))) return value.value;
  for (const [k, v] of Object.entries(value)) if (k !== 'fill' && k !== 'value' && fill.key.endsWith(`:${k}`)) return v;
  return undefined;
}

export function groupFills(input, deps = {}) {
  const {
    fills = [], funding = [], account, mode = 'real', importId, existingKeys = [], existingLegs = [],
    dustThreshold = '0', declaredZone = 'UTC', fileZone = null, answers = {}, overrides = {}, now = '1970-01-01T00:00:00.000Z',
  } = input;
  const base = account.baseCurrency;
  const digits = minorDigits(base);
  const accountUpdates = { contractValues: {}, dustThresholds: {} };
  const known = new Set(existingKeys);

  // 1. Keys already stored are counted as matched and dropped (AC-P1.10).
  let matched = 0;
  const fresh = [];
  for (const f of fills) {
    if (known.has(f.key)) matched++; else fresh.push(f);
  }

  // 2. Near duplicates of an earlier import's fills: same instrument, side, size, price within 1 second.
  const dupOf = new Map();
  if (existingLegs.length) {
    const index = new Map();
    for (const e of existingLegs) {
      const k = `${e.instrument}|${e.side}|${D.toString(e.size)}|${D.toString(e.price)}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push({ ms: Date.parse(e.time), key: e.key });
    }
    for (const f of fresh) {
      const list = index.get(`${f.instrument}|${f.side}|${D.toString(f.size)}|${D.toString(f.price)}`);
      const hit = list && list.find((e) => e.key !== f.key && Math.abs(e.ms - Date.parse(f.time)) <= 1000);
      if (hit) dupOf.set(f.key, hit.key);
    }
  }

  const thrFor = (instrument) => {
    const own = account.dustThresholds?.[instrument];
    if (own !== undefined) return own;
    if (dustThreshold && typeof dustThreshold === 'object') return dustThreshold[instrument] ?? dustThreshold.default ?? '0';
    return dustThreshold || '0';
  };

  function build(dropKeys) {
    const built = []; // { trade, meta: Map(kind -> detail), fillKeys: Set }
    const groups = new Map();
    for (const f of fresh) {
      if (dropKeys.has(f.key)) continue;
      const gk = f.positionId ? `p:${f.positionId}` : `i:${f.instrument}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(f);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : (a.row ?? 0) - (b.row ?? 0)));
      walk(list, built);
    }
    return built;
  }

  function walk(list, built) {
    let cur = null; // { trade, meta, fillKeys, dir, pos, entryMissing }
    const open = (f, dir, entryMissing = false, suffix = '') => {
      const trade = {
        id: `${importId}:${f.key}${suffix}`,
        accountId: account.id, mode, market: f.market, instrument: f.instrument, side: dir > 0 ? 'long' : 'short',
        contractSize: f.contractSize || '1', contractValue: null, quoteCurrency: f.quoteCurrency,
        legs: [], initialStop: null, stopSource: null, stopMoves: [], target: null, funding: 0, fundingEntries: [],
        broker: null, setup: null, plan: null, notes: '', moodBefore: null, moodAfter: null, screenshotId: null, leverage: null,
        importId, holds: [], excluded: null, dustRemainder: '0', closeDayOverride: null, closeTime: null,
        createdAt: now, updatedAt: now, entry: 'import', entryUnknown: false,
      };
      cur = { trade, meta: new Map(), fillKeys: new Set(), dir, pos: '0', entryMissing };
      built.push(cur);
    };
    const addLeg = (f, kind, size, fee, brokerOnLeg = true) => {
      const t = cur.trade;
      t.legs.push({
        id: `${t.id}:${t.legs.length + 1}`, kind, time: f.time, zone: declaredZone, price: f.price, size, fee,
        feeCurrency: f.feeCurrency || f.quoteCurrency, feeToAccount: undefined, quoteToAccount: f.quoteToAccount ?? undefined,
        broker: brokerOnLeg && f.broker ? f.broker : null, source: { importId, row: f.row ?? null, key: f.key },
        _fill: f,
      });
      cur.fillKeys.add(f.key);
      if (kind === 'entry') {
        if (!t.setup && f.setup) t.setup = f.setup;
        if (!t.notes && f.notes) t.notes = f.notes;
        if (!t.initialStop && f.stop) { t.initialStop = D.toString(f.stop); t.stopSource = f.stopSource || 'file_initial'; }
        if (!t.target && f.target) t.target = D.toString(f.target);
      }
      if (dupOf.has(f.key)) cur.meta.set('near_duplicate', { ...(cur.meta.get('near_duplicate') || {}), [f.key]: dupOf.get(f.key) });
      // MT4 states commission and taxes on the closing row only: the opening fill has no fee field of its own
      if ((f.fee === null || f.fee === undefined) && !/^mt4:.*:open$/.test(f.key || '')) {
        const m = cur.meta.get('missing_fee') || {};
        m[f.key] = f.row ?? null;
        cur.meta.set('missing_fee', m);
      }
    };
    const closeCur = (dust = '0') => {
      cur.trade.dustRemainder = dust;
      if (!D.isZero(dust)) cur.meta.set('dust', { remainder: dust });
      cur = null;
    };

    for (const f of list) {
      let size = D.toString(f.size);
      let fee = f.fee === undefined ? null : f.fee;
      // continue an exit-only trade (position opened before the file) while the source still says "close"
      if (cur && cur.entryMissing) {
        if (isCloseBySource(f) && sign(f) === -cur.dir) { addLeg(f, 'exit', size, fee); continue; }
        cur = null;
      }
      for (;;) {
        if (!cur) {
          if (isCloseBySource(f)) {
            open(f, -sign(f), true);
            cur.meta.set('opened_before_file', {});
            addLeg(f, 'exit', size, fee);
            break;
          }
          open(f, sign(f));
        }
        const kind = sign(f) === cur.dir ? 'entry' : 'exit';
        if (kind === 'entry') {
          addLeg(f, 'entry', size, fee);
          cur.pos = D.add(cur.pos, size);
          break;
        }
        const thr = thrFor(f.instrument);
        const over = D.sub(size, cur.pos);
        if (D.cmp(over, '0') > 0 && D.cmp(over, thr) >= 0 && !D.isZero(cur.pos)) {
          // crosses zero: split at zero, fee pro rata by size, the rest opens the next trade
          const [feeClose, feeRest] = proRata(fee, cur.pos, size);
          addLeg(f, 'exit', cur.pos, feeClose);
          cur.meta.set('flip', {});
          cur.pos = '0';
          closeCur();
          size = over;
          fee = feeRest;
          open(f, sign(f), false, '~s');
          cur.meta.set('flip', {});
          continue;
        }
        addLeg(f, 'exit', size, fee);
        cur.pos = D.cmp(over, '0') > 0 ? '0' : D.sub(cur.pos, size);
        if (D.isZero(cur.pos)) { closeCur(); break; }
        const keepOpen = answerFor(answers, overrides, 'dust', cur.trade.id)?.optionId === 'keep_open';
        if (!keepOpen && D.cmp(cur.pos, thr) < 0) { const rem = cur.pos; closeCur(rem); }
        break;
      }
    }
    return built;
  }

  // A build without dropped fills first; if the answers merge duplicates, drop those fills and build again.
  let built = build(new Set());
  const dropKeys = new Set();
  for (const b of built) {
    const dups = b.meta.get('near_duplicate');
    if (!dups) continue;
    if (answerFor(answers, overrides, 'near_duplicate', b.trade.id)?.optionId === 'merge') for (const k of Object.keys(dups)) dropKeys.add(k);
  }
  if (dropKeys.size) {
    matched += dropKeys.size;
    built = build(dropKeys);
  }

  // 3. Finish every trade: rates, fees, broker figures, holds.
  const rateAnswers = (tradeId) => answerFor(answers, overrides, 'rate_missing', tradeId);
  const excludeAnomaly = (b, kind) => { b.trade.excluded = { by: 'import', anomalyId: anomalyId(importId, kind) }; };
  const tradeMoneyCtx = { mode, accountIds: 'all', displayCurrency: base, digitsOf: minorDigits, tz: declaredZone, dayCutoffHour: 0, smallSampleMin: 30, accounts: { [account.id]: { baseCurrency: base, startBalance: account.startBalance ?? null, toDisplayRate: 1 } }, cash: [] };

  for (const b of built) {
    const t = b.trade;
    const rateAns = rateAnswers(t.id);
    const rate = (ccy) => (ccy === base ? 1 : rateAns?.optionId === 'rate' ? rateFrom(rateAns.value, ccy) : null);
    const feeAns = answerFor(answers, overrides, 'missing_fee', t.id);

    for (const leg of t.legs) {
      const f = leg._fill;
      delete leg._fill;
      if ((leg.fee === null || leg.fee === undefined) && /^mt4:.*:open$/.test(f.key || '')) leg.fee = '0';
      else if (leg.fee === null || leg.fee === undefined) {
        if (feeAns?.optionId === 'fee_zero') leg.fee = '0';
        else if (feeAns?.optionId === 'enter_fee') {
          const v = fillValueFor(feeAns.value, f);
          if (v !== undefined && v !== null && v !== '') leg.fee = D.toString(v);
        }
        if (leg.fee === undefined) leg.fee = null;
      } else leg.fee = D.toString(leg.fee);
      if (leg.quoteToAccount === undefined || leg.quoteToAccount === null) {
        let q = null;
        if (isMt4(f)) {
          const cv = account.contractValues?.[t.instrument];
          const ans = answerFor(answers, overrides, 'contract_size_missing', t.id);
          const typed = ans?.optionId === 'value' ? (ans.value && typeof ans.value === 'object' ? ans.value[t.instrument] : ans.value) : undefined;
          const value = typed ?? cv;
          if (value !== undefined && value !== null && value !== '') {
            q = Number(value) / Number(t.contractSize);
            if (typed !== undefined) accountUpdates.contractValues[t.instrument] = D.toString(typed);
          } else b.meta.set('contract_size_missing', { symbol: t.instrument });
        } else q = rate(f.quoteCurrency);
        leg.quoteToAccount = q;
      }
      leg.feeToAccount = leg.fee === null || D.isZero(leg.fee) ? 1 : rate(leg.feeCurrency);
    }
    // a missing rate holds the trade; the missing currencies are listed once per import
    const missing = new Set();
    for (const leg of t.legs) {
      if (leg.quoteToAccount === null && !b.meta.has('contract_size_missing')) missing.add(b.trade.quoteCurrency);
      if (leg.feeToAccount === null) missing.add(leg.feeCurrency);
    }
    if (missing.size) b.meta.set('rate_missing', { currencies: [...missing] });

    if (b.meta.has('opened_before_file')) {
      const ans = answerFor(answers, overrides, 'opened_before_file', t.id);
      const v = ans?.optionId === 'enter_open' ? ans.value || {} : null;
      const time = v && v.price && v.date ? startOfLocalDate(v.date, declaredZone) : null;
      if (time) {
        const exitLeg = t.legs.find((l) => l.kind === 'exit');
        const size = D.sum(t.legs.filter((l) => l.kind === 'exit').map((l) => l.size));
        t.legs.unshift({ id: `${t.id}:0`, kind: 'entry', time, zone: declaredZone, price: D.toString(v.price), size, fee: '0', feeCurrency: exitLeg.feeCurrency, feeToAccount: 1, quoteToAccount: exitLeg.quoteToAccount, broker: null, source: { importId, row: null, key: null, entered: true } });
      }
    }

    // broker figures from the file (IBKR realised P/L, MT4 profit + commission + taxes + swap)
    const exits = t.legs.filter((l) => l.kind === 'exit');
    const brokerSrc = exits.length && exits.every((l) => l.broker) ? (isMt4(exits[0].source) ? 'mt4' : /^ibkr:/.test(exits[0].source.key || '') ? 'ibkr' : null) : null;
    if (brokerSrc === 'ibkr' && exits.every((l) => l.broker.realizedPnl !== undefined && l.broker.realizedPnl !== null)) {
      const net = D.sum(exits.map((l) => l.broker.realizedPnl));
      const comm = D.sum(t.legs.map((l) => (l.broker?.commission ?? '0')));
      t.broker = { netMinor: roundMinor(D.toNumber(net), digits), commissionMinor: roundMinor(D.toNumber(comm), digits), swapMinor: 0, source: 'ibkr' };
    } else if (brokerSrc === 'mt4') {
      const parts = (k) => D.sum(exits.map((l) => l.broker[k] ?? '0'));
      const net = D.sum([parts('profit'), parts('commission'), parts('taxes'), parts('swap')]);
      t.broker = { netMinor: roundMinor(D.toNumber(net), digits), commissionMinor: roundMinor(D.toNumber(D.add(parts('commission'), parts('taxes'))), digits), swapMinor: roundMinor(D.toNumber(parts('swap')), digits), source: 'mt4' };
      t.funding = D.toNumber(parts('swap'));
    }
  }

  // 4. Funding entries: attach to the trade open on that instrument at that time (this import's trades).
  const fundingOut = [];
  const unmatchedFunding = [];
  const byId = new Map(built.map((b) => [b.trade.id, b]));
  for (const fe of funding) {
    if (known.has(fe.key)) { matched++; continue; }
    const at = Date.parse(fe.time);
    let target = null;
    let reason = 'no_trade';
    if (fe.currency && fe.currency !== base) reason = 'currency';
    else {
      const att = answerFor(answers, overrides, 'funding_unmatched', fe.key);
      if (att?.optionId === 'ignore') { fundingOut.push({ ...fe, attachedTo: null, ignored: true }); continue; }
      if (att?.optionId === 'attach' && byId.has(att.value)) target = byId.get(att.value);
      else {
        target = built.find((b) => {
          if (b.trade.instrument !== fe.instrument) return false;
          const entries = b.trade.legs.filter((l) => l.kind === 'entry');
          if (!entries.length) return false;
          const start = Math.min(...entries.map((l) => Date.parse(l.time)));
          const closed = closeTimeOf(b.trade);
          return start <= at && (closed === null || at <= Date.parse(closed));
        }) || null;
      }
    }
    if (target) {
      target.trade.funding = D.toNumber(D.add(String(target.trade.funding), fe.amount));
      target.trade.fundingEntries.push({ key: fe.key, amount: fe.amount, time: fe.time, currency: fe.currency || base });
      fundingOut.push({ ...fe, attachedTo: target.trade.id });
    } else unmatchedFunding.push({ key: fe.key, instrument: fe.instrument, time: fe.time, amount: fe.amount, currency: fe.currency, reason });
  }

  // 5. Checks that need the finished trade: tz_edge, broker_mismatch.
  for (const b of built) {
    const t = b.trade;
    t.closeTime = closeTimeOf(t);
    if (fileZone && declaredZone && fileZone !== declaredZone && t.closeTime) {
      const off = Math.abs(zoneOffsetMs(t.closeTime, declaredZone) - zoneOffsetMs(t.closeTime, fileZone));
      const [y, m] = localParts(t.closeTime, declaredZone).date.split('-').map(Number);
      const start = startOfLocalDate(`${y}-${String(m).padStart(2, '0')}-01`, declaredZone);
      const next = startOfLocalDate(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, declaredZone);
      const at = Date.parse(t.closeTime);
      const dStart = Math.abs(at - Date.parse(start));
      const dNext = Math.abs(Date.parse(next) - at);
      if (Math.min(dStart, dNext) <= off + HOUR) {
        const boundary = dNext < dStart ? next : start;
        b.meta.set('tz_edge', { boundaryDate: localParts(boundary, declaredZone).date });
      }
    }
    if (deps.tradeMoney && t.broker && isClosed(t) && !PENDING_BEFORE_MONEY.some((k) => b.meta.has(k) && !trueAnswered(b, k))) {
      const money = deps.tradeMoney(t, tradeMoneyCtx);
      if (money && Math.abs(t.broker.netMinor - money.recomputedNetMinor) > 1) {
        b.meta.set('broker_mismatch', { brokerMinor: t.broker.netMinor, recomputedMinor: money.recomputedNetMinor });
      }
    }
  }

  function trueAnswered(b, kind) {
    return !!answerFor(answers, overrides, kind, b.trade.id);
  }

  // 6. Apply answers, set holds, and derive the anomaly list.
  const anomalyTrades = new Map(); // kind -> { tradeIds, detail }
  const slot = (kind) => {
    if (!anomalyTrades.has(kind)) anomalyTrades.set(kind, { tradeIds: [], detail: {} });
    return anomalyTrades.get(kind);
  };
  // What the question sheet needs to name the affected trades, per kind.
  const noteDetail = (kind, tradeId, det) => {
    const a = slot(kind);
    a.tradeIds.push(tradeId);
    const d = a.detail;
    if (kind === 'missing_fee') (d.fills ||= {})[tradeId] = det;
    else if (kind === 'dust') (d.remainders ||= {})[tradeId] = det.remainder;
    else if (kind === 'near_duplicate') d.pairs = { ...(d.pairs || {}), ...det };
    else if (kind === 'broker_mismatch') (d.figures ||= {})[tradeId] = det;
    else if (kind === 'tz_edge') (d.boundaries ||= {})[tradeId] = det.boundaryDate;
    else if (kind === 'rate_missing') d.currencies = [...new Set([...(d.currencies || []), ...det.currencies])];
    else if (kind === 'contract_size_missing') d.symbols = [...new Set([...(d.symbols || []), det.symbol])];
  };

  for (const b of built) {
    const t = b.trade;
    for (const kind of KIND_ORDER) {
      if (!b.meta.has(kind)) continue;
      const det = b.meta.get(kind);
      noteDetail(kind, t.id, det);
      if (!KINDS[kind].holds) continue;
      if (!resolveAnswer(b, kind, answerFor(answers, overrides, kind, t.id), det)) t.holds.push(kind);
    }
    if (b.meta.has('opened_before_file') && !t.holds.includes('opened_before_file')) {
      if (answerFor(answers, overrides, 'opened_before_file', t.id)?.optionId === 'keep_broker_pnl') t.entryUnknown = true;
    }
  }

  // true when the answer settles the anomaly for this trade (the hold is not set)
  function resolveAnswer(b, kind, ans, det) {
    if (!ans) return false;
    const t = b.trade;
    switch (kind) {
      case 'flip': if (ans.optionId === 'exclude') excludeAnomaly(b, kind); return ans.optionId === 'split' || ans.optionId === 'exclude';
      case 'dust': return ans.optionId === 'close_with_remainder' || ans.optionId === 'keep_open';
      case 'opened_before_file':
        if (ans.optionId === 'exclude') { excludeAnomaly(b, kind); return true; }
        if (ans.optionId === 'keep_broker_pnl') return !!t.broker; // needs the broker's realised figure
        return ans.optionId === 'enter_open' && t.legs.some((l) => l.kind === 'entry');
      case 'tz_edge': {
        if (ans.optionId !== 'month_before' && ans.optionId !== 'month_after') return false;
        t.closeDayOverride = ans.optionId === 'month_before' ? addDays(det.boundaryDate, -1) : det.boundaryDate;
        return true;
      }
      case 'missing_fee':
        if (ans.optionId === 'exclude') { excludeAnomaly(b, kind); return true; }
        return t.legs.every((l) => l.fee !== null);
      case 'rate_missing': return !!t.legs.every((l) => l.quoteToAccount !== null && l.feeToAccount !== null);
      case 'contract_size_missing': return t.legs.every((l) => l.quoteToAccount !== null);
      case 'broker_mismatch': if (ans.optionId === 'exclude') excludeAnomaly(b, kind); return ans.optionId === 'use_broker' || ans.optionId === 'exclude';
      case 'near_duplicate': return ans.optionId === 'keep_both' || ans.optionId === 'merge';
      default: return false;
    }
  }

  if (unmatchedFunding.length) slot('funding_unmatched').detail.entries = unmatchedFunding;

  const anomalies = [];
  for (const kind of KIND_ORDER) {
    const a = anomalyTrades.get(kind);
    if (!a) continue;
    anomalies.push({
      id: anomalyId(importId, kind), kind, importId, accountId: account.id, tradeIds: a.tradeIds, detail: a.detail,
      answer: answers[kind] ? { ...answers[kind] } : null, overrides: overrides[kind] ? { ...overrides[kind] } : {},
    });
  }

  // a merge answer that removed every duplicate leaves its anomaly out of the derived list; the caller keeps the record
  return { trades: built.map((b) => b.trade), anomalies, matched, funding: fundingOut, accountUpdates, dropped: [...dropKeys] };
}
