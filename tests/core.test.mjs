import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
await import('../house-core.js');
const core = globalThis.HouseCore;

const firebaseConfig = {
  apiKey: 'AIzaSyHouseCoreRegressionTests123456789',
  authDomain: 'house-test.firebaseapp.com',
  projectId: 'house-test',
  appId: '1:123456789:web:abcdef0123456789'
};
const earlier = '2026-09-13T10:00:00.000Z';
const later = '2026-09-14T10:00:00.000Z';
const checkout = (overrides = {}) => ({
  id: 'checkout-1', property_id: 1, status: 'draft', tenant: '陳先生',
  updated_at: earlier, ...overrides
});
const tombstone = (overrides = {}) => ({
  id: 'checkout-1', __deleted: true, updated_at: later, ...overrides
});
const versions = records => records.map(core.version).sort();

beforeEach(() => { localStorage.clear(); });

test('Firebase settings normalize whitespace and retain only the four public fields', () => {
  const settings = Object.fromEntries(Object.entries(firebaseConfig).map(([key, value]) => [key, `  ${value}  `]));
  settings.password = 'never-store-this';
  assert.deepEqual(core.config(settings), firebaseConfig);
});

test('Firebase settings reject missing fields and malformed API, domain, project and app values', () => {
  for (const settings of [null, [], {},
    { ...firebaseConfig, apiKey: 'short' },
    { ...firebaseConfig, authDomain: 'https://house-test.firebaseapp.com/path' },
    { ...firebaseConfig, projectId: '../another-project' },
    { ...firebaseConfig, appId: '1:123456789:android:abcdef' },
    { ...firebaseConfig, projectId: 42 }
  ]) assert.throws(() => core.config(settings));
});

test('Firebase config accepts JSON and a copied JavaScript snippet without executing code', () => {
  assert.deepEqual(core.parseConfig(JSON.stringify(firebaseConfig)), firebaseConfig);
  globalThis.__houseConfigExecuted = false;
  const snippet = `const firebaseConfig = {
    apiKey: '${firebaseConfig.apiKey}',
    authDomain: '${firebaseConfig.authDomain}',
    projectId: '${firebaseConfig.projectId}',
    appId: '${firebaseConfig.appId}',
    get dangerous() { globalThis.__houseConfigExecuted = true; }
  };
  globalThis.__houseConfigExecuted = true;`;
  assert.deepEqual(core.parseConfig(snippet), firebaseConfig);
  assert.equal(globalThis.__houseConfigExecuted, false);
  delete globalThis.__houseConfigExecuted;
});

test('Firebase config rejects expressions instead of evaluating them', () => {
  globalThis.__houseConfigExecuted = false;
  assert.throws(() => core.parseConfig(`({
    apiKey: (globalThis.__houseConfigExecuted = true, '${firebaseConfig.apiKey}'),
    authDomain: '${firebaseConfig.authDomain}',
    projectId: '${firebaseConfig.projectId}',
    appId: '${firebaseConfig.appId}'
  })`));
  assert.equal(globalThis.__houseConfigExecuted, false);
  delete globalThis.__houseConfigExecuted;
});

test('saving Firebase settings binds the browser and permits the same project', () => {
  assert.equal(core.readConfig(), null);
  assert.deepEqual(core.saveConfig(firebaseConfig), firebaseConfig);
  assert.deepEqual(core.readConfig(), firebaseConfig);
  assert.doesNotThrow(() => core.assertProject(firebaseConfig.projectId));
  assert.doesNotThrow(() => core.saveConfig({ ...firebaseConfig, apiKey: `${firebaseConfig.apiKey}A` }));
});

test('changing Firebase projects is rejected without replacing existing settings', () => {
  core.saveConfig(firebaseConfig);
  const before = localStorage.getItem(core.CONFIG_KEY);
  assert.throws(() => core.saveConfig({ ...firebaseConfig, projectId: 'other-house' }), /另一個/);
  assert.equal(localStorage.getItem(core.CONFIG_KEY), before);
  localStorage.removeItem(core.CONFIG_KEY);
  assert.throws(() => core.assertProject('other-house'), /另一個/);
});

test('existing settings prevent switching projects even before a binding key exists', () => {
  localStorage.setItem(core.CONFIG_KEY, JSON.stringify(firebaseConfig));
  assert.throws(() => core.assertProject('other-house'), /另一個/);
});

test('pairing supports a version 1 URL-safe round trip and trims an optional email', () => {
  const payload = { v: 1, c: firebaseConfig, email: '  owner@example.com  ' };
  const encoded = core.encode(payload);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(core.decodePair(encoded), { ...payload, email: 'owner@example.com' });
  assert.equal(core.decodePair(core.encode({ v: 1, c: firebaseConfig })).email, '');
});

test('pairing rejects every unsupported version', () => {
  for (const v of [undefined, null, 0, 2, '1', true]) {
    assert.throws(() => core.decodePair(core.encode({ v, c: firebaseConfig })), /版本/);
  }
});

test('pairing rejects corrupt, oversized and nonobject payloads', () => {
  for (const value of ['', '!', 'a', 'a'.repeat(4097), core.encode(null), core.encode([]), core.encode('text')]) {
    assert.throws(() => core.decodePair(value));
  }
  assert.throws(() => core.decodePair(core.encode({ v: 1, c: { ...firebaseConfig, appId: 'invalid' } })));
});

test('pairing rejects invalid email values instead of silently discarding them', () => {
  for (const email of ['not-an-email', 'owner@', '<owner@example.com>', 'a b@example.com',
    `${'a'.repeat(250)}@example.com`, 123, {}, [], null]) {
    assert.throws(() => core.decodePair(core.encode({ v: 1, c: firebaseConfig, email })), `email ${JSON.stringify(email)}`);
  }
});

test('offline deletion survives a reconnect to an older cloud record and is uploaded', () => {
  const deleted = tombstone({ _pending: true });
  const result = core.reconcile([deleted], [checkout()]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].__deleted, true);
  assert.equal(result.records[0]._pending, true);
  assert.deepEqual(versions(result.uploads), [core.version(deleted)]);
});

test('a cloud deletion replaces an older local record and does not upload the old record', () => {
  const result = core.reconcile([checkout({ _pending: true })], [tombstone()]);
  assert.equal(result.records[0].__deleted, true);
  assert.equal(result.records[0]._pending, false);
  assert.deepEqual(result.uploads, []);
});

test('reconciliation chooses newer edits and keeps independent records from each device', () => {
  const local = [checkout({ id: 'local-only' }), checkout({ updated_at: later, tenant: '本機新版' })];
  const remote = [checkout({ id: 'remote-only' }), checkout()];
  const result = core.reconcile(local, remote);
  assert.equal(result.records.length, 3);
  assert.equal(result.records.find(record => record.id === 'checkout-1').tenant, '本機新版');
  assert.deepEqual(result.uploads.map(record => record.id).sort(), ['checkout-1', 'local-only']);
  const inverted = core.reconcile(remote, local);
  assert.deepEqual(versions(result.records), versions(inverted.records));
});

test('a tombstone wins a timestamp tie in either reconciliation direction', () => {
  const live = checkout({ updated_at: later, tenant: 'ZZZZ' });
  const deleted = tombstone();
  assert.ok(core.compare(deleted, live) > 0);
  assert.ok(core.compare(live, deleted) < 0);
  for (const [local, remote] of [[[live], [deleted]], [[deleted], [live]]]) {
    assert.equal(core.reconcile(local, remote).records[0].__deleted, true);
  }
});

test('timestamp ties resolve deterministically regardless of device and property order', () => {
  const a = checkout({ tenant: 'Alice', details: { water: 12, power: 34 } });
  const same = { details: { power: 34, water: 12 }, tenant: 'Alice', updated_at: earlier, status: 'draft', property_id: 1, id: 'checkout-1' };
  const b = checkout({ tenant: 'Bob', details: { power: 35, water: 12 } });
  assert.equal(core.compare(a, same), 0);
  assert.equal(core.version(a), core.version(same));
  assert.notEqual(core.compare(a, b), 0);
  assert.equal(Math.sign(core.compare(a, b)), -Math.sign(core.compare(b, a)));
  assert.deepEqual(versions(core.reconcile([a], [b]).records), versions(core.reconcile([b], [a]).records));
});

test('pending flags do not change record versions or create redundant uploads', () => {
  const pending = checkout({ _pending: true });
  const settled = checkout({ _pending: false });
  assert.equal(core.version(pending), core.version(settled));
  assert.equal(core.compare(pending, settled), 0);
  assert.equal(core.compare(pending, checkout()), 0);
  const result = core.reconcile([pending], [settled]);
  assert.deepEqual(result.uploads, []);
  assert.equal(result.records[0]._pending, false);
  assert.equal(Object.hasOwn(core.clean(pending), '_pending'), false);
  assert.equal(pending._pending, true);
});

test('reconciliation converges after uploads are acknowledged and leaves input arrays intact', () => {
  const local = [checkout({ _pending: true }), tombstone({ id: 'deleted' })];
  const remote = [checkout({ id: 'remote', updated_at: later })];
  const before = JSON.stringify({ local, remote });
  const first = core.reconcile(local, remote);
  const nextCloud = [...remote, ...first.uploads.map(core.clean)];
  const second = core.reconcile(first.records, nextCloud);
  assert.deepEqual(second.uploads, []);
  assert.equal(second.records.every(record => record._pending === false), true);
  assert.deepEqual(versions(first.records), versions(second.records));
  assert.equal(JSON.stringify({ local, remote }), before);
});

test('records reject malformed IDs, timestamps, status, missing property IDs and oversized content', () => {
  for (const value of [null, [], {},
    checkout({ id: '../document' }), checkout({ id: 'x'.repeat(151) }),
    checkout({ updated_at: 'invalid' }), checkout({ updated_at: undefined }),
    checkout({ status: 'unknown' }), checkout({ property_id: 'not-a-number' }),
    checkout({ property_id: null }), checkout({ property_id: '' }),
    checkout({ property_id: '   ' }), checkout({ property_id: undefined }),
    checkout({ property_id: Infinity }), checkout({ note: 'x'.repeat(300001) })
  ]) assert.throws(() => core.record(value), `record ${JSON.stringify(value)?.slice(0, 220)}`);
  assert.deepEqual(core.record(tombstone()), tombstone());
});

test('reconciliation fails on corrupt local or remote data instead of replacing valid records', () => {
  const valid = checkout();
  assert.throws(() => core.reconcile([valid], [checkout({ updated_at: 'invalid' })]));
  assert.throws(() => core.reconcile([checkout({ id: '../bad' })], [valid]));
  assert.equal(valid.tenant, '陳先生');
});

test('reading local storage rejects malformed JSON, nonarrays and invalid records', () => {
  assert.deepEqual(core.readRecords(), []);
  for (const raw of ['{broken', '{}', 'null', JSON.stringify([checkout({ updated_at: 'bad' })])]) {
    localStorage.setItem(core.LOCAL_KEY, raw);
    assert.throws(() => core.readRecords());
    assert.equal(localStorage.getItem(core.LOCAL_KEY), raw);
  }
  localStorage.setItem(core.LOCAL_KEY, JSON.stringify([checkout(), tombstone({ id: 'deleted' })]));
  assert.equal(core.readRecords().length, 2);
});

test('record timestamps advance monotonically even when the previous update is in the future', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(Date.parse(core.nextTime({ updated_at: future })), Date.parse(future) + 1);
  assert.ok(Number.isFinite(Date.parse(core.nextTime())));
});
