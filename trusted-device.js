(function () {
  'use strict';
  const DB_NAME = 'house_ops_secure_device_v1', STORE = 'keys';
  const te = new TextEncoder(), td = new TextDecoder();
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('請關閉其他舊版家總管分頁後重試'));
    });
  }
  async function transaction(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('無法儲存裝置信任')); };
    });
  }
  async function read() {
    const result = {};
    await transaction('readonly', store => {
      for (const name of ['vaultKey', 'syncKey', 'meta']) store.get(name).onsuccess = e => { result[name] = e.target.result; };
    });
    return result;
  }
  async function derive(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function decryptVaultWithKey(vault, key) {
    let data = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(vault.iv) }, key, bytes(vault.ct)));
    if (vault.zip === 'gzip') data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return JSON.parse(td.decode(data));
  }
  async function prepare(password, projectId) {
    if (!password) throw new Error('請輸入家總管管理密碼');
    if (!window.HOUSE_VAULT) throw new Error('房屋加密主檔尚未載入，請重新整理');
    let vaultKey, data;
    try {
      vaultKey = await derive(password, bytes(HOUSE_VAULT.salt), HOUSE_VAULT.iter || 250000);
      data = await decryptVaultWithKey(HOUSE_VAULT, vaultKey);
    } catch (_) { throw new Error('家總管管理密碼不正確，無法解鎖資料'); }
    const syncKey = projectId ? await derive(password, te.encode(`housesystem-sync-v1|${projectId}`), 250000) : null;
    return { vaultKey, syncKey, projectId: projectId || null, data };
  }
  async function remember(keys) {
    if (!keys.projectId || !keys.syncKey) throw new Error('請先設定 Firebase');
    await transaction('readwrite', store => {
      store.put(keys.vaultKey, 'vaultKey'); store.put(keys.syncKey, 'syncKey');
      store.put({ projectId: keys.projectId, trustedAt: new Date().toISOString() }, 'meta');
      store.delete('passwordBlob'); store.delete('sealKey');
    });
  }
  async function getKeys(projectId) {
    const value = await read();
    if (!projectId || value.meta?.projectId !== projectId || !value.vaultKey || !value.syncKey) return null;
    // Upgrade older trusted devices without recovering or retaining their password.
    await transaction('readwrite', store => { store.delete('passwordBlob'); store.delete('sealKey'); });
    return { vaultKey: value.vaultKey, syncKey: value.syncKey, projectId };
  }
  async function forget(options = {}) { await transaction('readwrite', store => store.clear()); if (options.lock !== false) window.HouseCore?.lock(); }
  window.HouseTrusted = { prepare, remember, getKeys, decryptVaultWithKey, forget,
    has: async projectId => !!(await getKeys(projectId || window.HouseCore?.readConfig()?.projectId)),
    trust: async (password, projectId) => remember(await prepare(password, projectId)) };
})();
