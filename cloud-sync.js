/* One Firebase identity and one reconciliation path for every page. */
const C = window.HouseCore;
const COLLECTION = 'housesystem_checkouts';
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const te = new TextEncoder(), td = new TextDecoder();
let config = null, auth = null, db = null, F = null, A = null, user = null, key = null;
let unsubscribe = null, generation = 0, lockEpoch = 0, enabled = false, chain = Promise.resolve(), retryTimer = null;
let state = { mode: 'loading', message: '正在準備同步服務…', user: null, lastSync: null, error: null, pending: 0, access: false };
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
function pending() { try { return C.readRecords().filter(r => r._pending).length; } catch (_) { return 0; } }
function paint(patch) {
  state = { ...state, ...patch, pending: pending(), user: user ? { uid: user.uid, email: user.email } : null };
  emit('house-cloud-state', { ...state });
}
function failure(e) { paint({ mode: navigator.onLine ? 'error' : 'offline', message: C.errorMessage(e), error: e.code || e.message }); }
function stop() { generation++; if (unsubscribe) unsubscribe(); unsubscribe = null; clearTimeout(retryTimer); }
function lock() { lockEpoch++; stop(); key = null; enabled = false; paint({ mode: user ? 'locked' : 'login', message: user ? '已鎖定，請重新解鎖資料' : '請登入同步帳號' }); }
function active(g) { return g === generation && user && key && enabled && config?.projectId === C.readConfig()?.projectId && !localStorage.getItem(C.LOCK_KEY); }
function assertActive(g) { if (!active(g)) throw new Error('同步已停止，請重新解鎖'); }
function b64(value) {
  let s = ''; for (const byte of new Uint8Array(value)) s += String.fromCharCode(byte);
  return btoa(s);
}
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function encrypt(record, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, te.encode(JSON.stringify(C.clean(record))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
async function decrypt(data, id, cryptoKey) {
  try {
    if (data.v !== 1 || typeof data.ct !== 'string' || typeof data.iv !== 'string') throw new Error('format');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(data.iv) }, cryptoKey, unb64(data.ct));
    const record = C.record(JSON.parse(td.decode(plain)));
    if (record.id !== id) throw new Error('id');
    return C.clean(record);
  } catch (_) { throw new Error('雲端資料無法解密或格式不符，已停止寫入。請確認所有裝置使用相同管理密碼。'); }
}
async function acknowledge(winner, g) {
  await C.mutate(rows => {
    assertActive(g);
    const local = rows.find(r => r.id === winner.id);
    if (local && C.compare(local, winner) > 0) return rows;
    return [...rows.filter(r => r.id !== winner.id), { ...winner, _pending: false }];
  });
}
async function put(record, g) {
  assertActive(g);
  const cryptoKey = key, uid = user.uid, ref = F.doc(db, COLLECTION, record.id);
  const encrypted = await encrypt(record, cryptoKey);
  const winner = await F.runTransaction(db, async tx => {
    assertActive(g);
    const snap = await tx.get(ref);
    let remote = snap.exists() ? await decrypt(snap.data(), record.id, cryptoKey) : null;
    assertActive(g);
    if (remote && C.compare(remote, record) >= 0) return remote;
    tx.set(ref, { ...encrypted, clientUpdatedAt: record.updated_at, updatedAt: F.serverTimestamp(), uid, type: 'checkout-v1' });
    return C.clean(record);
  });
  assertActive(g);
  await acknowledge(winner, g);
}
async function mergeSnapshot(snap, g) {
  if (!active(g)) return;
  // Cache events cannot establish that a record is missing on the server.
  if (snap.metadata?.fromCache || snap.metadata?.hasPendingWrites) {
    if (state.mode !== 'error') paint({ mode: navigator.onLine ? 'syncing' : 'offline', message: navigator.onLine ? '等待雲端確認，本機資料已保留' : '離線中，變更保留在本機' });
    return;
  }
  const cryptoKey = key, remote = [];
  for (const d of snap.docs) remote.push(await decrypt(d.data(), d.id, cryptoKey));
  if (!active(g)) return;
  let uploads;
  await C.mutate(rows => {
    assertActive(g);
    const result = C.reconcile(rows, remote); uploads = result.uploads;
    return result.records;
  });
  for (const r of uploads) { assertActive(g); await put(r, g); }
  if (!active(g)) return;
  const count = pending();
  paint({ mode: count ? 'syncing' : 'online', message: count ? `尚有 ${count} 筆變更等待同步` : '雲端已同步', lastSync: new Date().toISOString(), error: null, access: true });
}
function startListener() {
  if (!db || !user || !key || !enabled || localStorage.getItem(C.LOCK_KEY)) return;
  stop();
  const g = generation;
  paint({ mode: navigator.onLine ? 'syncing' : 'offline', message: navigator.onLine ? '正在比對本機與雲端資料…' : '離線中，變更保留在本機', error: null });
  unsubscribe = F.onSnapshot(F.collection(db, COLLECTION), { includeMetadataChanges: true }, snap => {
    chain = chain.then(() => mergeSnapshot(snap, g)).catch(e => { if (active(g)) failure(e); });
  }, e => { if (active(g)) failure(e); });
}
function schedule() {
  if (!enabled || !key || !user) return;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(startListener, 250);
}
async function init() {
  try {
    config = C.readConfig();
    if (!config) { paint({ mode: 'local', message: '尚未設定雲端同步，可先在本機使用' }); return; }
    C.saveConfig(config);
    const [appSDK, authSDK, firestoreSDK] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
    ]);
    A = authSDK; F = firestoreSDK;
    const app = appSDK.initializeApp(config, 'housesystem-sync');
    auth = A.getAuth(app); db = F.getFirestore(app);
    await A.setPersistence(auth, A.browserLocalPersistence);
    await auth.authStateReady();
    A.onAuthStateChanged(auth, value => {
      stop(); user = value;
      if (!user) { key = null; enabled = false; }
      paint({ access: false, error: null, mode: user ? 'locked' : 'login', message: user ? '已登入，請解鎖資料以開始同步' : '設定已儲存，請登入同步帳號' });
      if (user && key && enabled) startListener();
    });
    user = auth.currentUser;
  } catch (e) { failure(e); }
  finally { emit('house-cloud-ready', { configured: !!config }); }
}
async function requireAuth() {
  await ready;
  if (!auth) throw new Error(config ? '同步服務未載入，請確認網路後重新整理' : '請先完成 Firebase 設定');
}
async function checkAccess() {
  await requireAuth();
  if (!user) throw new Error('請先登入同步帳號');
  try {
    const member = await F.getDocFromServer(F.doc(db, 'housesystem_members', user.uid));
    if (!member.exists()) throw new Error('尚未加入會員白名單。請建立 housesystem_members/' + user.uid + ' 文件（可加 enabled: true）。');
    await F.getDocsFromServer(F.query(F.collection(db, COLLECTION), F.limit(1)));
    paint({ access: true, error: null, message: key ? state.message : '帳號與讀取權限正常，請解鎖並同步' });
    return true;
  } catch (e) { paint({ access: false }); failure(e); throw e; }
}
async function setCryptoKeys(keys) {
  const epoch = lockEpoch;
  const lockVersion = localStorage.getItem(C.LOCK_KEY);
  await ready;
  if (!config) return;
  if (keys.projectId !== config.projectId || !keys.syncKey) throw new Error('加密金鑰與目前 Firebase 專案不符');
  await HouseTrusted.decryptVaultWithKey(HOUSE_VAULT, keys.vaultKey);
  if (lockEpoch !== epoch || localStorage.getItem(C.LOCK_KEY) !== lockVersion) throw new Error('解鎖期間裝置已被鎖定，請重新輸入管理密碼');
  key = keys.syncKey;
  localStorage.removeItem(C.LOCK_KEY);
  if (enabled) startListener();
}
async function forceSync() {
  await requireAuth();
  if (!user) throw new Error('請先登入同步帳號');
  if (!key) throw new Error('請先使用家總管管理密碼解鎖資料');
  if (!navigator.onLine) throw new Error('目前離線，變更會保留，連線恢復後自動重試');
  enabled = true; startListener();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('同步仍在等待雲端回應，請稍後重試；本機資料已保留')), 25000);
    const onState = e => {
      if (e.detail.mode === 'online' && !e.detail.pending) finish();
      else if (['error', 'offline', 'locked', 'login'].includes(e.detail.mode)) finish(new Error(e.detail.message));
    };
    function finish(error) { clearTimeout(timer); window.removeEventListener('house-cloud-state', onState); error ? reject(error) : resolve({ ...state }); }
    window.addEventListener('house-cloud-state', onState);
  });
}
window.HouseCloud = {
  getStatus: () => ({ ...state }), getConfig: () => C.readConfig(), configured: () => { try { return !!C.readConfig(); } catch (_) { return false; } },
  currentUser: () => user, checkAccess, setCryptoKeys, forceSync, lock,
  login: async (email, password) => { await requireAuth(); const result = await A.signInWithEmailAndPassword(auth, email, password); user = result.user; return user; },
  logout: async () => { C.lock(); await ready; if (auth) await A.signOut(auth); },
  setCryptoPassword: async password => {
    const token = localStorage.getItem(C.LOCK_KEY);
    const keys = await HouseTrusted.prepare(password, C.readConfig()?.projectId);
    if(token !== localStorage.getItem(C.LOCK_KEY)) throw new Error('裝置已被鎖定，請重新解鎖');
    return setCryptoKeys(keys);
  },
  startCheckoutSync: () => { enabled = true; if (!unsubscribe) startListener(); },
  upsertCheckout: async record => {
    const r = { ...C.record(record), _pending: true };
    await C.mutate(rows => {
      const previous = rows.find(x => x.id === r.id);
      if (previous && C.compare(previous, r) > 0) throw new Error('此紀錄已更新，請重新開啟再編輯');
      return [...rows.filter(x => x.id !== r.id), r];
    });
    paint({ mode: navigator.onLine && user && key ? 'syncing' : state.mode, message: '已儲存本機，等待同步' }); schedule(); return true;
  },
  deleteCheckout: async id => {
    await C.mutate(rows => {
      const old = rows.find(r => r.id === id);
      return [...rows.filter(r => r.id !== id), { id, __deleted: true, updated_at: C.nextTime(old), _pending: true }];
    });
    paint({ message: '刪除已保留在本機，等待同步' }); schedule(); return true;
  },
  encryptBackup: async () => { if (!key) throw new Error('請先解鎖資料'); return { format: 'housesystem-backup-v1', projectId: config.projectId, createdAt: new Date().toISOString(), ...(await encrypt({ records: C.readRecords().map(C.clean) }, key)) }; },
  restoreBackup: async backup => {
    const epoch=lockEpoch,cryptoKey=key;
    if(!cryptoKey)throw new Error('請先解鎖資料');
    if(backup?.format!=='housesystem-backup-v1'||backup.projectId!==config.projectId||backup.v!==1)throw new Error('備份格式或 Firebase 專案不符');
    let rows;
    try{
      const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(backup.iv)},cryptoKey,unb64(backup.ct));
      rows=JSON.parse(td.decode(out)).records;
      if(!Array.isArray(rows)||rows.length>10000)throw new Error('format');
      rows=rows.map(r=>C.record(C.clean(r)));
    }catch(_){throw new Error('備份無法解密或資料格式不符，未變更本機資料')}
    await C.mutate(local=>{
      if(epoch!==lockEpoch||key!==cryptoKey)throw new Error('裝置已鎖定，未匯入備份');
      const map=new Map(local.map(r=>[r.id,r]));
      for(const r of rows)if(!map.has(r.id)||C.compare(r,map.get(r.id))>0)map.set(r.id,{...r,_pending:true});
      return [...map.values()];
    });
    schedule();return rows.length;
  }
};
window.addEventListener('house-lock', lock);
window.addEventListener('online', startListener);
window.addEventListener('offline', () => paint({ mode: 'offline', message: '離線中，變更保留在本機，連線恢復後自動重試' }));
window.addEventListener('storage', e => {
  if (e.key === C.LOCAL_KEY) schedule();
  if (e.key === C.CONFIG_KEY) { lock(); paint({ mode: 'error', message: '同步設定已在其他頁面變更，請重新整理', error: 'config_changed' }); }
});
const ready = init();
window.HouseCloud.ready = ready;
