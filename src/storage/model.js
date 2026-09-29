// The journal as the views read it: every row of every store in memory, plus the statistics context.
// Views are small and the journal is a few thousand rows, so one read per screen is enough (no query layer).
import { minorDigits } from '../core/money.js';

export function newId(prefix = '') {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}${c.randomUUID()}`;
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadModel(store) {
  const [accounts, trades, cash, imports, reconciliations, plans] = await Promise.all([
    store.accounts.getAll(), store.trades.getAll(), store.cash.getAll(), store.imports.getAll(), store.reconciliations.getAll(), store.plans.getAll(),
  ]);
  return { accounts, trades, cash, imports, reconciliations, plans };
}

// Statistics context (architecture section 3.1) for what the person is looking at now.
// ctx: the view ctx (S1); model: loadModel().
export function statsCtxFor(ctx, model, overrides = {}) {
  const get = (k, d) => { const v = ctx.settings.get(k); return v === undefined || v === null ? d : v; };
  const accounts = {};
  for (const a of model.accounts) accounts[a.id] = { mode: a.mode, baseCurrency: a.baseCurrency, startBalance: a.startBalance ?? null, toDisplayRate: a.toDisplayRate ?? null };
  return {
    mode: ctx.mode,
    accountIds: ctx.accountFilter === 'all' ? 'all' : [ctx.accountFilter],
    displayCurrency: ctx.displayCurrency(),
    digitsOf: minorDigits,
    tz: ctx.tz,
    dayCutoffHour: Number(get('dayCutoffHour', 0)),
    smallSampleMin: Number(get('smallSampleMin', 30)),
    accounts,
    cash: model.cash,
    ...overrides,
  };
}

export const accountsOfMode = (model, mode) => model.accounts.filter((a) => a.mode === mode);
export const accountById = (model, id) => model.accounts.find((a) => a.id === id) || null;

// Reconciliation record id for an account and period (architecture section 4.1).
export const reconId = (accountId, from, to) => `${accountId}:${from}:${to}`;
export const reconQtyId = (accountId, asset) => `${accountId}:qty:${asset}`;
