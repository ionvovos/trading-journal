// Store contract: runs against createMemoryStore in `npm test` and against createIdbStore in the
// browser (e2e/migration.mjs). `make()` returns a fresh empty store.
import assert from 'node:assert/strict';

const account = (id = 'a1', extra = {}) => ({ id, name: 'IBKR', mode: 'real', baseCurrency: 'USD', startBalance: '1000', ...extra });
const trade = (id, extra = {}) => ({ id, accountId: 'a1', mode: 'real', side: 'long', instrument: 'AAPL', legs: [], closeTime: null, ...extra });

export const contractTests = [
  ['put, get, getAll, delete', async (make) => {
    const s = await make();
    await s.accounts.put(account());
    assert.deepEqual(await s.accounts.get('a1'), account());
    assert.equal(await s.accounts.get('missing'), undefined);
    await s.accounts.put(account('a2', { name: 'Kraken' }));
    assert.equal((await s.accounts.getAll()).length, 2);
    await s.accounts.delete('a1');
    assert.deepEqual((await s.accounts.getAll()).map((a) => a.id), ['a2']);
  }],
  ['put overwrites by id and putMany is atomic on a bad row', async (make) => {
    const s = await make();
    await s.trades.put(trade('t1', { notes: 'x' }));
    await s.trades.put(trade('t1', { notes: 'y' }));
    assert.equal((await s.trades.get('t1')).notes, 'y');
    await assert.rejects(() => s.trades.putMany([trade('t2'), { nope: 1 }]));
    assert.equal(await s.trades.get('t2'), undefined);
  }],
  ['rows are copied in and out', async (make) => {
    const s = await make();
    const row = trade('t1', { legs: [{ id: 'l1' }] });
    await s.trades.put(row);
    row.legs.push({ id: 'l2' });
    const got = await s.trades.get('t1');
    assert.equal(got.legs.length, 1);
    got.legs.push({ id: 'l3' });
    assert.equal((await s.trades.get('t1')).legs.length, 1);
  }],
  ['every store exists', async (make) => {
    const s = await make();
    for (const name of ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs']) {
      assert.equal(typeof s[name].getAll, 'function', name);
      assert.deepEqual(await s[name].getAll(), [], name);
    }
  }],
  ['settings with defaults', async (make) => {
    const s = await make();
    assert.equal(await s.getSetting('smallSampleMin'), 30);
    assert.equal(await s.getSetting('reconcileCap'), '1.00');
    assert.equal(await s.getSetting('nothing.here'), undefined);
    await s.setSetting('smallSampleMin', 50);
    await s.setSetting('thresholds.lossWindowMin', 45);
    assert.equal(await s.getSetting('smallSampleMin'), 50);
    assert.deepEqual(await s.allSettings(), { smallSampleMin: 50, 'thresholds.lossWindowMin': 45 });
  }],
  ['transaction: an import writes trades, cash and the import row together', async (make) => {
    const s = await make();
    await s.transaction((tx) => {
      tx.putMany('trades', [trade('t1'), trade('t2')]);
      tx.put('cash', { id: 'c1', accountId: 'a1', kind: 'deposit', amount: '100', time: '2026-03-02', currency: 'USD' });
      tx.put('imports', { id: 'i1', accountId: 'a1', formatId: 'generic-csv' });
      tx.put('settings', { key: 'firstRunDone', value: true });
    });
    assert.equal((await s.trades.getAll()).length, 2);
    assert.equal((await s.cash.getAll()).length, 1);
    assert.equal((await s.imports.getAll()).length, 1);
    assert.equal(await s.getSetting('firstRunDone'), true);
  }],
  ['transaction: nothing is written when fn throws or a row is bad', async (make) => {
    const s = await make();
    await assert.rejects(() => s.transaction((tx) => { tx.put('trades', trade('t1')); throw new Error('boom'); }), /boom/);
    assert.equal(await s.trades.get('t1'), undefined);
    await assert.rejects(() => s.transaction((tx) => { tx.put('trades', trade('t1')); tx.put('cash', { nope: 1 }); }));
    assert.equal(await s.trades.get('t1'), undefined);
  }],
  ['clearAll empties every store and every setting', async (make) => {
    const s = await make();
    await s.accounts.put(account());
    await s.trades.put(trade('t1'));
    await s.blobs.put({ id: 'b1', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==' });
    await s.setSetting('lang', 'el');
    await s.clearAll();
    for (const name of ['accounts', 'trades', 'cash', 'imports', 'reconciliations', 'plans', 'reviews', 'blobs']) assert.deepEqual(await s[name].getAll(), [], name);
    assert.deepEqual(await s.allSettings(), {});
  }],
  ['a row without a string id is refused', async (make) => {
    const s = await make();
    await assert.rejects(() => s.trades.put({}), TypeError);
    await assert.rejects(() => s.trades.put({ id: 5 }), TypeError);
    await assert.rejects(() => s.setSetting('', 1), TypeError);
  }],
  ['subscribe reports writes', async (make) => {
    const s = await make();
    const seen = [];
    const off = s.subscribe((e) => seen.push(`${e.kind}:${e.store}`));
    await s.trades.put(trade('t1'));
    await s.trades.delete('t1');
    off();
    await s.trades.put(trade('t2'));
    assert.deepEqual(seen, ['put:trades', 'delete:trades']);
  }],
];
