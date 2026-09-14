import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const CONFIG_KEY='house_firebase_config_v1';
const COLLECTION='housesystem_checkouts';
const te=new TextEncoder(),td=new TextDecoder();
let config=null,app=null,auth=null,db=null,cryptoKey=null,localKey=null,unsubscribe=null,currentUser=null;
let state={mode:'local',message:'尚未設定雲端同步',user:null,lastSync:null,error:null};

const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
function emitState(p={}){state={...state,...p,user:currentUser?{uid:currentUser.uid,email:currentUser.email}:null};emit('house-cloud-state',state)}
function readConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch(e){return null}}
function valid(c){return !!(c&&c.apiKey&&c.authDomain&&c.projectId&&c.appId)}
function ts(x){let n=Date.parse(x||'');return Number.isFinite(n)?n:0}
function readLocal(){try{let a=JSON.parse(localStorage.getItem(localKey)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
function writeLocal(a){localStorage.setItem(localKey,JSON.stringify(a));emit('house-checkouts-changed',{records:a,source:'cloud'})}

async function derive(password){if(!config)throw new Error('尚未設定 Firebase');let base=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveKey']);cryptoKey=await crypto.subtle.deriveKey({name:'PBKDF2',salt:te.encode(`housesystem-sync-v1|${config.projectId}`),iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);return true}
async function encrypt(obj){if(!cryptoKey)throw new Error('尚未解鎖同步加密金鑰');let iv=crypto.getRandomValues(new Uint8Array(12));let ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,te.encode(JSON.stringify(obj)));return{v:1,iv:b64(iv),ct:b64(ct)}}
async function decrypt(data){if(!cryptoKey)throw new Error('尚未解鎖同步加密金鑰');let out=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(data.iv)},cryptoKey,ub64(data.ct));return JSON.parse(td.decode(out))}

async function put(record){if(!db||!currentUser||!cryptoKey)return false;let enc=await encrypt(record);await setDoc(doc(db,COLLECTION,String(record.id)),{...enc,clientUpdatedAt:record.updated_at||new Date().toISOString(),updatedAt:serverTimestamp(),uid:currentUser.uid,type:'checkout-v1'});return true}
async function tombstone(id){let r={id:String(id),__deleted:true,updated_at:new Date().toISOString()};return put(r)}

async function mergeSnapshot(snap){if(!localKey||!cryptoKey)return;let local=readLocal(),map=new Map(local.map(r=>[String(r.id),r])),cloudIds=new Set(),toUpload=[],changed=false,decryptErrors=0;
  for(const d of snap.docs){cloudIds.add(String(d.id));let remote;try{remote=await decrypt(d.data())}catch(e){decryptErrors++;continue}let id=String(remote.id||d.id),l=map.get(id);
    if(remote.__deleted){if(l&&ts(remote.updated_at)>=ts(l.updated_at)){map.delete(id);changed=true}else if(l&&ts(l.updated_at)>ts(remote.updated_at)){toUpload.push(l)};continue}
    if(!l){map.set(id,remote);changed=true}else if(ts(remote.updated_at)>ts(l.updated_at)){map.set(id,remote);changed=true}else if(ts(l.updated_at)>ts(remote.updated_at)){toUpload.push(l)}
  }
  for(const r of map.values()){if(!cloudIds.has(String(r.id)))toUpload.push(r)}
  if(changed)writeLocal([...map.values()].sort((a,b)=>ts(b.updated_at)-ts(a.updated_at)));
  for(const r of toUpload){try{await put(r)}catch(e){emitState({mode:'error',message:'同步寫入失敗',error:e.message});break}}
  emitState({mode:'online',message:decryptErrors?`已連線，但有 ${decryptErrors} 筆資料無法解密`:'雲端已同步',lastSync:new Date().toISOString(),error:decryptErrors?'decrypt_failed':null});
}
function startListener(){if(unsubscribe){unsubscribe();unsubscribe=null}if(!db||!currentUser||!cryptoKey||!localKey)return;emitState({mode:'syncing',message:'正在同步…',error:null});unsubscribe=onSnapshot(collection(db,COLLECTION),s=>mergeSnapshot(s).catch(e=>emitState({mode:'error',message:'同步資料處理失敗',error:e.message})),e=>emitState({mode:'error',message:'Firestore 權限或連線失敗',error:e.message}))}
async function init(){config=readConfig()||window.HOUSE_FIREBASE_CONFIG||null;if(!valid(config)){emitState({mode:'local',message:'尚未設定雲端同步'});emit('house-cloud-ready',{configured:false});return}
  try{app=initializeApp(config,'housesystem-sync');auth=getAuth(app);db=getFirestore(app);await setPersistence(auth,browserLocalPersistence);onAuthStateChanged(auth,u=>{currentUser=u;emitState(u?{mode:cryptoKey?'syncing':'locked',message:cryptoKey?'準備同步':'已登入，等待管理密碼解鎖'}:{mode:'login',message:'雲端已設定，尚未登入'});if(u&&cryptoKey&&localKey)startListener();else if(unsubscribe){unsubscribe();unsubscribe=null}});emit('house-cloud-ready',{configured:true})}catch(e){emitState({mode:'error',message:'Firebase 初始化失敗',error:e.message});emit('house-cloud-ready',{configured:false,error:e.message})}}

window.HouseCloud={
  configKey:CONFIG_KEY,
  getStatus:()=>({...state}),
  getConfig:()=>readConfig(),
  saveConfig:c=>{localStorage.setItem(CONFIG_KEY,JSON.stringify(c));location.reload()},
  clearConfig:()=>{localStorage.removeItem(CONFIG_KEY);location.reload()},
  login:async(email,password)=>{if(!auth)throw new Error('請先設定 Firebase');let r=await signInWithEmailAndPassword(auth,email,password);return r.user},
  logout:async()=>{if(auth)await signOut(auth)},
  setCryptoPassword:async password=>{await derive(password);if(currentUser&&localKey)startListener();emitState({mode:currentUser?'syncing':'login',message:currentUser?'準備同步':'加密金鑰已就緒，請登入雲端'})},
  startCheckoutSync:key=>{localKey=key;if(currentUser&&cryptoKey)startListener()},
  upsertCheckout:async r=>{try{let ok=await put(r);if(ok)emitState({mode:'online',message:'已寫入雲端',lastSync:new Date().toISOString()});return ok}catch(e){emitState({mode:'error',message:'雲端儲存失敗，已保留本機資料',error:e.message});return false}},
  deleteCheckout:async id=>{try{return await tombstone(id)}catch(e){emitState({mode:'error',message:'雲端刪除同步失敗',error:e.message});return false}},
  forceSync:()=>startListener(),
  currentUser:()=>currentUser,
  configured:()=>valid(readConfig()||window.HOUSE_FIREBASE_CONFIG||null)
};

window.addEventListener('online',()=>{if(currentUser&&cryptoKey&&localKey)startListener()});
window.addEventListener('offline',()=>emitState({mode:'offline',message:'離線中，資料暫存本機'}));
init();
