(function (root) {
  'use strict';
  const CONFIG_KEY = 'house_firebase_config_v1', LOCAL_KEY = 'house_ops_checkout_v1';
  const PROJECT_KEY = 'house_data_project_v1', LOCK_KEY = 'house_manual_lock_v1';
  const fields = ['apiKey', 'authDomain', 'projectId', 'appId'];
  function config(value) {
    if (!value || typeof value !== 'object') throw new Error('請填入 Firebase Web App 設定');
    const c = Object.fromEntries(fields.map(k => [k, typeof value[k] === 'string' ? value[k].trim() : '']));
    if (fields.some(k => !c[k])) throw new Error('Firebase 四個欄位都必須填寫');
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(c.apiKey)) throw new Error('apiKey 格式不正確，請從 Firebase 複製');
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(c.authDomain)) throw new Error('authDomain 請填網域，不含 https:// 或路徑');
    if (!/^[a-z0-9][a-z0-9-]{3,62}$/.test(c.projectId)) throw new Error('projectId 格式不正確');
    if (!/^\d+:\d+:web:[a-z0-9]+$/i.test(c.appId)) throw new Error('請使用 Firebase「網頁應用程式」的 appId');
    return c;
  }
  function parseConfig(text) {
    try { return config(JSON.parse(text)); } catch (_) { /* Parse the Firebase snippet without evaluating JavaScript. */ }
    const c = {};
    for (const k of fields) {
      const m = text.match(new RegExp('(?:["\'`]?' + k + '["\'`]?)\\s*:\\s*["\'`]([^"\'`\\r\\n]+)["\'`]'));
      if (m) c[k] = m[1];
    }
    return config(c);
  }
  function readConfig() {
    const raw = localStorage.getItem(CONFIG_KEY);
    if(!raw)return null;
    let parsed;
    try { parsed=JSON.parse(raw); } catch (_) { throw new Error('已儲存的 Firebase 設定損壞，請重新貼上設定並儲存'); }
    return config(parsed);
  }
  function assertProject(projectId) {
    const bound = localStorage.getItem(PROJECT_KEY);
    let previous=null; try { previous=readConfig(); } catch (_) { /* A valid replacement may repair malformed settings; the project binding still applies. */ }
    if ((bound && bound !== projectId) || (previous && previous.projectId !== projectId)) throw new Error('此瀏覽器已連結另一個 Firebase 專案。請使用獨立瀏覽器設定新專案，避免混用房務資料。');
  }
  function saveConfig(value) {
    const c = config(value); assertProject(c.projectId);
    localStorage.setItem(PROJECT_KEY, c.projectId); localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); return c;
  }
  const encode = obj => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function decodePair(value) {
    if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('配對連結格式錯誤，請重新產生');
    let p;
    try { p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), c => c.charCodeAt(0)))); }
    catch (_) { throw new Error('配對連結已損壞，請重新產生'); }
    if (!p || typeof p !== 'object' || Array.isArray(p) || p.v !== 1) throw new Error('不支援此配對版本，請重新產生連結');
    if (p.email !== undefined && typeof p.email !== 'string') throw new Error('配對帳號格式錯誤');
    const email = typeof p.email === 'string' ? p.email.trim() : '';
    if (email.length > 254 || (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new Error('配對帳號格式錯誤');
    return { v: 1, c: config(p.c), email };
  }
  function record(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r) || !/^[A-Za-z0-9_.-]{1,150}$/.test(String(r.id || ''))) throw new Error('資料編號格式錯誤，已停止同步');
    if (!Number.isFinite(Date.parse(r.updated_at))) throw new Error('資料缺少有效更新時間，已停止同步');
    if (r.__deleted !== true && (r.property_id == null || String(r.property_id).trim() === '' || !Number.isFinite(Number(r.property_id)) || Number(r.property_id) <= 0 || !['draft', 'completed'].includes(r.status))) throw new Error('退租資料格式錯誤，已停止同步');
    if (JSON.stringify(r).length > 300000) throw new Error('單筆資料過大，請縮短備註');
    return { ...r, id: String(r.id) };
  }
  function clean(r) { const { _pending, ...value } = r; return value; }
  function stable(x) {
    if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
    return JSON.stringify(x);
  }
  const version = r => stable(clean(r));
  function compare(a, b) {
    if (!a) return -1; if (!b) return 1;
    const delta = Date.parse(a.updated_at) - Date.parse(b.updated_at);
    if (delta) return delta;
    if (!!a.__deleted !== !!b.__deleted) return a.__deleted ? 1 : -1;
    const av = version(a), bv = version(b); return av === bv ? 0 : av > bv ? 1 : -1;
  }
  function reconcile(local, remote) {
    const map = new Map(local.map(r => [String(r.id), record(r)]));
    const cloud = new Map(remote.map(r => [String(r.id), record(r)]));
    for (const [id, r] of cloud) if (!map.has(id) || compare(r, map.get(id)) >= 0) map.set(id, { ...clean(r), _pending: false });
    const uploads = [...map.values()].filter(r => !cloud.has(r.id) || compare(r, cloud.get(r.id)) > 0);
    for (const r of uploads) map.set(r.id, { ...r, _pending: true });
    return { records: [...map.values()].sort((a, b) => -compare(a, b)), uploads };
  }
  function readRecords() {
    let a;
    try { a = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (_) { throw new Error('本機資料無法讀取。請先匯出備份，勿清除瀏覽器資料。'); }
    if (!Array.isArray(a)) throw new Error('本機資料格式錯誤，已停止寫入');
    return a.map(record);
  }
  async function mutate(fn) {
    const apply = () => {
      const next = fn(readRecords()).map(record), raw = JSON.stringify(next);
      if (raw !== localStorage.getItem(LOCAL_KEY)) {
        localStorage.setItem(LOCAL_KEY, raw); root.dispatchEvent(new CustomEvent('house-checkouts-changed'));
      }
      return next;
    };
    if (navigator.locks) return navigator.locks.request(LOCAL_KEY, apply);
    throw new Error('此瀏覽器不支援安全的多頁資料寫入，請更新瀏覽器');
  }
  function nextTime(previous) { return new Date(Math.max(Date.now(), (Date.parse(previous?.updated_at) || 0) + 1)).toISOString(); }
  function lock() { localStorage.setItem(LOCK_KEY, crypto.randomUUID()); root.dispatchEvent(new CustomEvent('house-lock')); }
  function errorMessage(e) {
    if (/dynamically imported module|Failed to fetch|Importing a module script failed|error loading dynamically/i.test(e?.message || '')) return '同步服務載入失敗，請檢查網路後重新整理。本機資料會保留。';
    return ({
      'auth/invalid-credential': 'Email 或 Firebase 密碼不正確', 'auth/wrong-password': 'Email 或 Firebase 密碼不正確',
      'auth/user-not-found': 'Email 或 Firebase 密碼不正確', 'auth/invalid-email': '請輸入有效的 Email',
      'auth/too-many-requests': '登入嘗試過多，請稍後重試', 'auth/network-request-failed': '網路連線失敗，請檢查連線後重試',
      'auth/operation-not-allowed': '請在 Firebase 開啟 Email/Password 登入', 'auth/invalid-api-key': 'Firebase apiKey 不正確，請重新複製設定',
      'permission-denied': '權限不足：請部署 Firestore 規則，並將此帳號 UID 加入會員白名單',
      'unavailable': '雲端暫時無法連線，本機資料會保留，連線恢復後重試'
    })[String(e?.code || '')] || e?.message || '操作未完成，請重試';
  }
  root.HouseCore = { CONFIG_KEY, LOCAL_KEY, LOCK_KEY, fields, config, parseConfig, readConfig, saveConfig, assertProject, encode, decodePair, record, clean, version, compare, reconcile, readRecords, mutate, nextTime, lock, errorMessage };
  if (root.addEventListener) root.addEventListener('storage', e => { if (e.key === LOCK_KEY && e.newValue) root.dispatchEvent(new CustomEvent('house-lock')); });
})(globalThis);
