const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const config = { apiKey: 'AIzaSySyntheticTestOnly0000000000000000', authDomain: 'demo-house.firebaseapp.com', projectId: 'demo-house', appId: '1:123456789:web:abcdef123456' };
const password = 'Synthetic-test-only-password';
let docs = {}, revision = 0, writes = 0;
const errors = [];
const authSDK = `
let callbacks=[];
const auth={currentUser:JSON.parse(localStorage.getItem('__auth')||'null'),authStateReady:async()=>{}};
export const browserLocalPersistence={};
export const getAuth=()=>auth;
export const setPersistence=async()=>{};
export function onAuthStateChanged(a,cb){callbacks.push(cb);queueMicrotask(()=>cb(a.currentUser));return()=>{callbacks=callbacks.filter(x=>x!==cb)}}
export async function signInWithEmailAndPassword(a,email,password){if(password!=='firebase-test')throw Object.assign(new Error('invalid'),{code:'auth/invalid-credential'});a.currentUser={uid:'test-uid',email};localStorage.setItem('__auth',JSON.stringify(a.currentUser));callbacks.forEach(cb=>cb(a.currentUser));return {user:a.currentUser}}
export async function signOut(a){a.currentUser=null;localStorage.removeItem('__auth');callbacks.forEach(cb=>cb(null))}
`;
const firestoreSDK = `
export const getFirestore=()=>({});
export const doc=(db,col,id)=>({col,id});
export const collection=(db,col)=>({col});
export const query=(...args)=>args;
export const limit=n=>n;
export const serverTimestamp=()=>({seconds:Date.now()/1000});
const err=code=>Object.assign(new Error(code),{code});
function access(write=false){if(window.__test.offline)throw err('unavailable');if(window.__test.denyRead||(write&&window.__test.denyWrite))throw err('permission-denied')}
export async function getDocFromServer(){access();return {exists:()=>true}}
export async function getDocsFromServer(){access();return {docs:[]}}
export function onSnapshot(ref,options,next,error){
 let last='',closed=false,running=false;
 async function tick(){if(closed||running)return;running=true;try{
  if(window.__test.offline||window.__test.fromCache){const token='cache';if(token!==last){last=token;next({docs:[],metadata:{fromCache:true,hasPendingWrites:false}})}return}
  access();const data=await fetch('/__mock').then(r=>r.json());if(closed)return;
  const token=String(data.revision);if(token===last)return;last=token;
  next({docs:Object.entries(data.docs).map(([id,value])=>({id,data:()=>value})),metadata:{fromCache:false,hasPendingWrites:false}});
 }catch(e){if(!closed)error(e)}finally{running=false}}
 const timer=setInterval(tick,60);queueMicrotask(tick);return()=>{closed=true;clearInterval(timer)};
}
export async function runTransaction(db,fn){
 for(let attempt=0;attempt<8;attempt++){
  access(true);const initial=await fetch('/__mock').then(r=>r.json());let outgoing=null;
  const result=await fn({get:async ref=>({exists:()=>!!initial.docs[ref.id],data:()=>initial.docs[ref.id]}),set:(ref,value)=>{outgoing={id:ref.id,value}}});
  if(!outgoing)return result;access(true);
  const response=await fetch('/__mock/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected:initial.revision,...outgoing})});
  if(response.ok)return result;
 }
 throw err('aborted');
}
`;
async function vault() {
  const salt = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12));
  const base = await webcrypto.subtle.importKey('raw', Buffer.from(password), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const data = { properties: [{ id: 1, address: '合成測試地址', code: 'TEST', district: '測試區', access: '合成資訊' }], vacancies: [] };
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(JSON.stringify(data)));
  return { v: 1, salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64'), iter: 250000 };
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/__mock') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ docs, revision })); return; }
  if (req.url === '/__mock/commit') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.expected !== revision) { res.statusCode = 409; res.end(); return; }
    docs[body.id] = body.value; revision++; writes++; res.end('{}'); return;
  }
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });
  const fixture = await vault();
  const contexts = [];
  async function page(name, options = {}) {
    const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } }); contexts.push(context);
    await context.addInitScript(({ config, configured, signedIn }) => {
      if (!localStorage.getItem('__initialized')) {
        localStorage.setItem('__initialized', 'true');
        if (configured) localStorage.setItem('house_firebase_config_v1', JSON.stringify(config));
        if (signedIn) { localStorage.setItem('__auth', JSON.stringify({ uid: 'test-uid', email: 'test@example.com' })); localStorage.setItem('house_admin_email_v1', 'test@example.com'); }
      }
      window.__test = { offline: false, fromCache: false, denyRead: false, denyWrite: false };
      Object.defineProperty(navigator, 'onLine', { get: () => !window.__test.offline });
    }, { config, configured: options.configured !== false, signedIn: options.signedIn !== false });
    await context.route('**/secure-data.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.HOUSE_VAULT=' + JSON.stringify(fixture) }));
    await context.route('https://www.gstatic.com/firebasejs/**', r => {
      const name = new URL(r.request().url()).pathname.split('/').pop();
      r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: name === 'firebase-app.js' ? 'export const initializeApp=(c,name)=>({c,name});' : name === 'firebase-auth.js' ? authSDK : firestoreSDK });
    });
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    p.on('dialog', d => d.accept());
    await p.goto(origin + '/' + name);
    if (name !== 'index.html') await p.waitForFunction(() => !!window.HouseCloud);
    return p;
  }
  const online = p => p.waitForFunction(() => HouseCloud.getStatus().mode === 'online' && !HouseCloud.getStatus().pending, null, { timeout: 15000 });
  async function unlock(p) { await p.locator('#pw').fill(password); await p.locator('#unlock').click(); await p.locator('#lock').waitFor({ state: 'hidden' }); }
  async function check(name, fn) { await fn(); console.log('PASS ' + name); }
  try {
    await check('setup safely parses configuration, validates input and fits mobile', async () => {
      const p = await page('sync-setup.html', { configured: false, signedIn: false, mobile: true });
      assert.equal(await p.locator('#login').isDisabled(), true);
      await p.locator('#saveCfg').click(); await p.waitForFunction(() => document.querySelector('#notice').textContent.includes('四個欄位'));
      await p.locator('#configPaste').fill('const firebaseConfig = ' + JSON.stringify(config) + ';'); await p.locator('#parseCfg').click();
      assert.equal(await p.locator('#projectId').inputValue(), config.projectId);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await p.context().close();
    });
    await check('wrong master password does not write; permission errors stay visible', async () => {
      const p = await page('sync-setup.html'); await p.locator('#checkAccess').click(); await p.locator('#syncNow').waitFor({ state: 'visible' });
      await p.waitForFunction(() => !document.querySelector('#syncNow').disabled);
      await p.locator('#master').fill('wrong'); await p.locator('#syncNow').click();
      await p.waitForFunction(() => document.querySelector('#syncResult').textContent.includes('管理密碼不正確'));
      assert.equal(writes, 0);
      await p.evaluate(() => window.__test.denyRead = true); await p.locator('#checkAccess').click();
      await p.waitForFunction(() => document.querySelector('#status').textContent.includes('權限不足'));
      assert.equal(await p.locator('#syncNow').isDisabled(), true);
      await p.context().close();
    });
    const a = await page('checkout.html'), b = await page('vacancy.html');
    await check('two devices exchange encrypted checkout and populate vacancies', async () => {
      await unlock(a); await unlock(b); await online(a); await online(b);
      await a.locator('#property').selectOption('1'); await a.locator('#room').fill('703'); await a.locator('#checkoutDate').fill('2026-09-14');
      await a.locator('#complete').click(); await online(a);
      await b.waitForFunction(() => document.querySelector('#cards').textContent.includes('703'));
      assert.equal(Object.keys(docs).length, 1); assert.equal(JSON.stringify(docs).includes('703'), false);
      assert.equal(await a.locator('#sDone').textContent(), '1');
    });
    const recordId = Object.keys(docs)[0];
    await check('offline deletion is retained and cannot resurrect on reconnect', async () => {
      await a.evaluate(() => { __test.offline = true; dispatchEvent(new Event('offline')); });
      await a.locator('.del').click();
      await a.waitForFunction(() => HouseCore.readRecords().some(r => r.__deleted && r._pending));
      assert.equal(await a.locator('#sAll').textContent(), '0');
      await a.evaluate(() => { __test.offline = false; dispatchEvent(new Event('online')); });
      await online(a); await b.waitForFunction(() => !document.querySelector('#cards').textContent.includes('703'));
      await a.reload(); await unlock(a); await online(a);
      assert.equal(await a.locator('#sAll').textContent(), '0');
      assert.equal(await a.evaluate(() => HouseCore.readRecords()[0].__deleted), true);
    });
    await check('failed cloud writes retain pending and retry successfully', async () => {
      await a.evaluate(() => __test.denyWrite = true);
      await a.locator('#property').selectOption('1'); await a.locator('#room').fill('704'); await a.locator('#saveDraft').click();
      await a.waitForFunction(() => HouseCloud.getStatus().mode === 'error');
      assert.equal(await a.evaluate(() => HouseCore.readRecords().some(r => r._pending && r.room_label === '704')), true);
      await a.evaluate(() => { __test.denyWrite = false; dispatchEvent(new Event('online')); }); await online(a);
    });
    await check('corrupt ciphertext stops all snapshot merging and uploading', async () => {
      const saved = docs[recordId]; docs[recordId] = { ...saved, ct: 'corrupt' }; revision++;
      await a.waitForFunction(() => HouseCloud.getStatus().mode === 'error');
      const before = writes;
      await a.locator('#property').selectOption('1'); await a.locator('#room').fill('705'); await a.locator('#saveDraft').click();
      await a.waitForFunction(() => HouseCloud.getStatus().mode === 'error');
      assert.equal(writes, before);
      docs[recordId] = saved; revision++; await online(a);
    });
    await check('locking clears rendered data and stops synchronization', async () => {
      const backup=await a.evaluate(()=>HouseCloud.encryptBackup());
      assert.equal(JSON.stringify(backup).includes('704'),false);
      await a.evaluate(async backup=>{
        await HouseCore.mutate(rows=>rows.map(r=>r.room_label==='704'?{...r,note:'newer local note',updated_at:HouseCore.nextTime(r),_pending:true}:r));
        await HouseCloud.restoreBackup(backup);
      },backup);
      assert.equal(await a.evaluate(()=>HouseCore.readRecords().find(r=>r.room_label==='704').note),'newer local note');
      assert.equal(await a.evaluate(()=>HouseCore.readRecords().some(r=>r.__deleted)),true);
      assert.equal(await a.evaluate(async backup=>{try{await HouseCloud.restoreBackup({...backup,ct:'bad'});return false}catch(_){return true}},backup),true);
      await a.locator('#relock').click(); await a.locator('#lock').waitFor({ state: 'visible' });
      assert.equal(await a.locator('#tb').textContent(), '');
      assert.equal(await a.evaluate(() => HouseCloud.getStatus().mode), 'locked');
      await a.reload(); assert.equal(await a.locator('#lock').isVisible(), true);
    });
    await a.context().close(); await b.context().close();
    await check('cached snapshots never upload assumed-missing records',async()=>{
      const p=await page('checkout.html');
      const before=writes;
      await p.evaluate(async()=>{
        __test.fromCache=true;
        await HouseCore.mutate(rows=>[...rows,{id:'cache-only',property_id:1,room_label:'CACHE',status:'draft',updated_at:new Date().toISOString(),_pending:true}]);
      });
      await unlock(p);
      await p.waitForFunction(()=>HouseCloud.getStatus().message.includes('等待雲端確認'));
      assert.equal(writes,before);
      await p.evaluate(()=>{__test.fromCache=false;dispatchEvent(new Event('online'))});await online(p);
      assert.ok(docs['cache-only']);await p.context().close();
    });
    await check('a lock issued during password derivation prevents stale unlock',async()=>{
      const p=await page('checkout.html');
      await p.evaluate(()=>{const original=HouseTrusted.prepare;HouseTrusted.prepare=async(...args)=>{await new Promise(resolve=>window.__resumePrepare=resolve);return original(...args)}});
      await p.locator('#pw').fill(password);await p.locator('#unlock').click();
      await p.waitForFunction(()=>!!window.__resumePrepare);
      await p.evaluate(()=>{HouseCore.lock();__resumePrepare()});
      await p.waitForFunction(()=>!document.querySelector('#unlock').disabled);
      assert.equal(await p.locator('#lock').isVisible(),true);
      assert.ok(await p.evaluate(()=>localStorage.getItem(HouseCore.LOCK_KEY)));
      await p.context().close();
    });
    await check('trusted mobile unlock passes keys, locks across reload and unlocks offline', async () => {
      const p = await page('mobile-login.html', { mobile: true });
      await p.locator('#masterPw').fill(password); await p.locator('#trust').check(); await p.locator('#go').click();
      await p.locator('#app').waitFor({ state: 'visible' });
      await p.frameLocator('#frame').locator('#lock').waitFor({ state: 'hidden' });
      assert.equal(await p.evaluate(() => HouseTrusted.has()), true);
      await p.locator('[data-src="sync-setup.html"]').click();
      await p.frameLocator('#frame').locator('#syncResult').waitFor({state:'visible'});
      await p.waitForFunction(()=>document.querySelector('#frame').contentWindow.HouseCloud?.getStatus().mode==='online');
      assert.equal(await p.frameLocator('#frame').locator('#backup').isDisabled(),false);
      await p.locator('#exit').click(); await p.locator('#login').waitFor({ state: 'visible' });
      await p.reload(); await p.waitForFunction(() => !document.querySelector('#go').disabled);
      assert.equal(await p.locator('#app').isHidden(), true);
      await p.evaluate(() => { __test.offline = true; dispatchEvent(new Event('offline')); });
      await p.locator('#masterPw').fill(password); await p.locator('#go').click(); await p.locator('#app').waitFor({ state: 'visible' });
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await p.context().close();
    });
    assert.deepEqual(errors, [], 'Unexpected browser exceptions');
  } finally { for (const c of contexts) await c.close().catch(() => {}); await browser.close(); server.close(); }
}
main().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
