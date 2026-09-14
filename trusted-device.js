(function(){
'use strict';
const DB_NAME='house_ops_secure_device_v1', STORE='keys';
const te=new TextEncoder(),td=new TextDecoder();
const b64u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function get(k){const db=await openDB();return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function set(k,v){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function del(k){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(k);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function derive(password,salt,iterations){const base=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function deriveVaultKey(password,vault){return derive(password,b64u(vault.salt),vault.iter||250000)}
async function deriveSyncKey(password,projectId){return derive(password,te.encode(`housesystem-sync-v1|${projectId}`),250000)}
async function decryptVaultWithKey(vault,key){let bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u(vault.iv)},key,b64u(vault.ct)));if(vault.zip==='gzip'){const ds=new DecompressionStream('gzip');bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer())}return JSON.parse(td.decode(bytes))}
async function trust(password,projectId){
  if(!window.HOUSE_VAULT)throw new Error('找不到房屋加密資料');
  if(!projectId)throw new Error('Firebase projectId 尚未設定');
  const vaultKey=await deriveVaultKey(password,window.HOUSE_VAULT);
  await decryptVaultWithKey(window.HOUSE_VAULT,vaultKey);
  const syncKey=await deriveSyncKey(password,projectId);
  let sealKey=await get('sealKey');
  if(!sealKey){sealKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await set('sealKey',sealKey)}
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},sealKey,te.encode(password));
  await set('vaultKey',vaultKey);await set('syncKey',syncKey);
  await set('passwordBlob',{iv:b64(iv),ct:b64(ct)});
  await set('meta',{projectId,trustedAt:new Date().toISOString()});
  return true
}
async function has(){try{return !!(await get('passwordBlob'))}catch(e){return false}}
async function getRememberedPassword(){
  const sealKey=await get('sealKey'),blob=await get('passwordBlob');
  if(!sealKey||!blob)return null;
  const out=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u(blob.iv)},sealKey,b64u(blob.ct));
  return td.decode(out)
}
async function getVaultKey(){return get('vaultKey')}
async function getSyncKey(projectId){const meta=await get('meta');if(!meta||meta.projectId!==projectId)return null;return get('syncKey')}
async function decryptVault(vault=window.HOUSE_VAULT){const key=await getVaultKey();if(!key)throw new Error('此裝置尚未被信任');return decryptVaultWithKey(vault,key)}
async function forget(){for(const k of ['vaultKey','syncKey','passwordBlob','sealKey','meta'])await del(k);return true}
window.HouseTrusted={trust,has,getRememberedPassword,getVaultKey,getSyncKey,decryptVault,decryptVaultWithKey,forget};
window.dispatchEvent(new CustomEvent('house-trusted-ready'));
})();