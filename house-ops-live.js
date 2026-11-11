(function(){
"use strict";
// Encrypted, authenticated, real-time edits layered after the legacy encrypted seed.
// Never store tenant details, room names, addresses or amounts in Firestore plaintext.
const api=window.HouseSecureApp;
if(!api)throw new Error("HouseSecureApp must load before house-ops-live.js");
const COLL="housesystem_ops_edits",SDK="https://www.gstatic.com/firebasejs/12.19.0/";
const te=new TextEncoder(),td=new TextDecoder();
const norm=s=>String(s||"").trim().replace(/[\s_－-]/g,"").replace(/[陜陕]/g,"陝").toUpperCase();
const positive=x=>x!==undefined&&x!==null&&String(x).trim()!==""&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let s=null,app=null,auth=null,db=null,F=null,A=null,unsubscribe=null,authUnsubscribe=null,initPromise=null;
let patches=new Map(),serial=Promise.resolve(),connection=0;
let state={mode:"setup",message:"尚未連結 Firebase。請先設定雲端連線。",user:"",lastSync:"",count:0};
function notify(){
 window.dispatchEvent(new CustomEvent("house-ops-live-state",{detail:{...state}}));
}
function status(mode,message,extra={}){
 state={...state,mode,message,...extra};notify();
}
const error=e=>status("error",e?.message||"同步發生錯誤，請確認網路與 Firebase 權限");
function render(){
 if(!s)return;
 for(const p of [...patches.values()].sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at))))applyPatch(s,p);
 window.dispatchEvent(new CustomEvent("house-ops-live-change",{detail:{session:s}}));
}
function applyPatch(session,p){
 const ops=session.ops;if(!ops||!p)return;
 ops.vacancies||=[];ops.rented||=[];ops.weekly_accounts||=[];ops.checkouts||=[];
 if(p.kind==="room"){
  const data=p.changes||{},key=norm(p.key);
  if(!key||!["vacant","rented"].includes(data.status))return;
  const match=x=>norm(x?.room||x?.code)===key;
  const prior=[...(ops.rented||[]),...(ops.vacancies||[])].find(match)||{};
  const master=(session.vault?.properties||[]).find(match)||{};
  if(master&&data.address)master.address=data.address;
  if(master&&data.note!==undefined)master.note=data.note;
  const item={...prior,room:p.key,address:data.address||prior.address||master.address||"",
   status:data.status,source:"網頁編輯（雲端同步）",updated_at:p.updated_at};
  if(data.deposit!=null)item.deposit=data.deposit;
  if(data.rent!=null)item.rent=data.rent;
  if(data.power_rate!=null)item.power_rate=data.power_rate;
  if(data.note!==undefined)item.note=data.note;
  delete item.rent_pending;delete item.lease_start_pending;
  delete item.rent_unverified;
  if(data.status==="vacant"){
   item.since=prior.since||p.updated_at.slice(0,10);
  }else delete item.since;
  ops.vacancies=ops.vacancies.filter(x=>!match(x));
  ops.rented=ops.rented.filter(x=>!match(x));
  (data.status==="vacant"?ops.vacancies:ops.rented).push(item);
 }else if(p.kind==="payment"){
  const statusValue=p.changes?.status;
  if(!["paid","pending"].includes(statusValue))return;
  const row=ops.weekly_accounts.find(x=>x.id===p.key&&["vendor","refund"].includes(x.kind));
  if(!row)return;
  row.status=statusValue;
  if(statusValue==="paid"){
   if(p.changes.paid_date)row.paid_date=p.changes.paid_date;
   else {delete row.paid_date;delete row.paid_at}
  }else{delete row.paid_date;delete row.paid_at}
  if(row.kind==="refund"){
   const checkoutId=p.key.replace(/^refund-/,"checkout-");
   const corresponding=ops.checkouts.find(x=>x.id===checkoutId)||
    ops.checkouts.find(x=>norm(x.room)===norm(row.property_label)&&String(x.checkout_date||"")===String(row.settlement_date||""));
   if(corresponding){
    corresponding.refund_status=statusValue;
    if(statusValue==="paid"&&p.changes.paid_date)corresponding.refund_paid_date=p.changes.paid_date;
    else delete corresponding.refund_paid_date;
   }
  }
 }
 if(p.updated_at>String(ops.updated_at||""))ops.updated_at=p.updated_at;
}
async function hash(kind,key){
 const h=new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(kind+":"+norm(key))));
 return kind.slice(0,1)+"-"+Array.from(h,x=>x.toString(16).padStart(2,"0")).join("");
}
async function encrypted(p){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const raw=te.encode(JSON.stringify(p));
 const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},s.key,raw);
 return {v:1,iv:b64(iv),ct:b64(ct),type:"ops-edit-v1",clientUpdatedAt:p.updated_at,updatedAt:F.serverTimestamp()};
}
async function decrypt(doc,key){
 const d=doc.data();
 if(d?.v!==1||d.type!=="ops-edit-v1"||typeof d.iv!=="string"||typeof d.ct!=="string")throw Error("雲端修改紀錄格式異常");
 let p;
 try{
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(d.iv)},key,ub64(d.ct));
  p=JSON.parse(td.decode(raw));
 }catch(_){throw Error("雲端資料解密失敗。請確認各裝置使用相同管理密碼")}
 if(!p||!["room","payment"].includes(p.kind)||typeof p.key!=="string"||typeof p.updated_at!=="string"||!p.changes||typeof p.changes!=="object")throw Error("雲端修改紀錄內容無效");
 if(await hash(p.kind,p.key)!==doc.id)throw Error("雲端修改紀錄識別碼異常");
 return p;
}
function stop(){
 connection++;
 if(unsubscribe){unsubscribe();unsubscribe=null}
 patches=new Map();
}
async function init(){
 if(initPromise)return initPromise;
 initPromise=(async()=>{
  const config=window.HouseCore?.readConfig();
  if(!config){status("setup","尚未設定 Firebase。請在下方輸入 Firebase 專案設定。");return false}
  status("connecting","正在連結 Firebase…");
  const [appSDK,authSDK,firestoreSDK]=await Promise.all([
   import(SDK+"firebase-app.js"),import(SDK+"firebase-auth.js"),import(SDK+"firebase-firestore.js")
  ]);
  A=authSDK;F=firestoreSDK;
  app=appSDK.getApps().find(x=>x.name==="housesystem-sync")||appSDK.initializeApp(config,"housesystem-sync");
  auth=A.getAuth(app);db=F.getFirestore(app);
  await auth.authStateReady();
  authUnsubscribe=A.onAuthStateChanged(auth,()=>{
   if(s)subscribe().catch(error);
  });
  return true;
 })().catch(e=>{initPromise=null;error(e);throw e});
 return initPromise;
}
async function subscribe(){
 stop();
 if(!s?.key)return;
 if(!(await init()))return;
 if(!auth.currentUser){status("login","請使用已授權的 Firebase 帳號登入，即可跨裝置同步。",{user:""});return}
 const g=connection, session=s, cryptoKey=session.key;
 status("connecting","正在下載並驗證加密房務修改紀錄…",{user:auth.currentUser.email||""});
 unsubscribe=F.onSnapshot(F.collection(db,COLL),{includeMetadataChanges:true},snapshot=>{
  serial=serial.then(async()=>{
   if(g!==connection||s!==session)return;
   if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites){
    status("connecting","等待 Firebase 伺服器確認同步狀態…");return
   }
   const incoming=new Map();
   for(const doc of snapshot.docs){
    if(doc.data().type!=="ops-edit-v1")continue;
    const p=await decrypt(doc,cryptoKey);
    incoming.set(p.kind+":"+norm(p.key),p);
   }
   if(g!==connection||s!==session)return;
   patches=incoming;
   render();
   status("online","雲端已同步｜可在此頁修改，其他裝置會自動更新。",{lastSync:new Date().toISOString(),count:patches.size});
  }).catch(error);
 },error);
}
async function connect(session){
 if(!session?.key||!session?.ops)return;
 if(s!==session){
  s=session;
  for(const p of patches.values())applyPatch(s,p);
  if(auth&&db){await subscribe();return}
 }
 await init();
 if(auth&&db&&auth.currentUser&&!unsubscribe)await subscribe();
 else if(auth&&!auth.currentUser)status("login","請登入 Firebase 同步帳號才能修改資料");
}
async function login(email,password){
 if(!(await init()))throw Error("請先儲存 Firebase 設定");
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email||"")||!password)throw Error("請輸入正確的帳號及密碼");
 await A.signInWithEmailAndPassword(auth,email.trim(),password);
 await subscribe();
}
async function logout(){
 if(auth)await A.signOut(auth);
 stop();status("login","已登出雲端帳號；本機加密資料仍受管理密碼保護。",{user:""});
}
function configure(cfg){
 if(!window.HouseCore)throw Error("網站尚未載入 Firebase 設定功能");
 window.HouseCore.saveConfig(cfg);
 location.reload();
}
function writable(){
 if(!s?.key)throw Error("請先解鎖家總管管理密碼");
 if(!db||!auth?.currentUser)throw Error("請先連線並登入 Firebase 同步帳號");
 if(state.mode!=="online"||!navigator.onLine)throw Error("尚未取得雲端同步確認，請確認網路與 Firebase 權限");
}
async function save(p){
 writable();
 const id=await hash(p.kind,p.key),doc=F.doc(db,COLL,id),data=await encrypted(p);
 await F.setDoc(doc,data);
 patches.set(p.kind+":"+norm(p.key),p);
 render();
 status("online","資料已儲存至 Firebase，其他已連線裝置將自動更新。",{lastSync:new Date().toISOString(),count:patches.size});
 return p;
}
async function saveRoom(data){
 const room=String(data.room||"").trim(),statusValue=data.status;
 if(!room||room.length>100||/[\/]/.test(room))throw Error("房號必須介於 1 至 100 字，不可含斜線");
 if(!["vacant","rented"].includes(statusValue))throw Error("請選擇空房或已出租");
 let deposit=positive(data.deposit),rent=positive(data.rent),rate=positive(data.power_rate);
 if(deposit!==null)rent=deposit/2;
 else if(rent!==null)deposit=rent*2;
 if(deposit===null||deposit>100000000||!Number.isFinite(deposit))throw Error("請輸入押金或月租金以完成自動計算");
 if(rate!==null&&rate>1000)throw Error("電費每度金額不合理");
 const address=String(data.address||"").trim(),note=String(data.note||"").trim();
 if(address.length>300||note.length>2000)throw Error("地址或備註內容過長");
 return save({v:1,kind:"room",key:room,updated_at:new Date().toISOString(),
  changes:{status:statusValue,deposit,rent,power_rate:rate,address,note}});
}
async function savePayment(data){
 const id=String(data.id||""),statusValue=data.status,paidDate=String(data.paid_date||"").trim();
 if(!/^[A-Za-z0-9_.-]{1,150}$/.test(id))throw Error("帳務編號不正確");
 if(!["paid","pending"].includes(statusValue))throw Error("請選擇已付款或待付款");
 if(paidDate&&!/^\d{4}-\d{2}-\d{2}$/.test(paidDate))throw Error("付款日期格式不正確");
 const row=s?.ops?.weekly_accounts?.find(x=>x.id===id&&["refund","vendor"].includes(x.kind));
 if(!row)throw Error("找不到這筆帳務，無法修改");
 return save({v:1,kind:"payment",key:id,updated_at:new Date().toISOString(),
  changes:{status:statusValue,paid_date:statusValue==="paid"?paidDate:""}});
}
window.HouseOpsLive={connect,getStatus:()=>({...state}),login,logout,configure,saveRoom,savePayment};
for(const name of ["unlock","auto","loadWithKey"]){
 const original=api[name];
 if(typeof original!=="function")continue;
 api[name]=async function(...args){
  const session=await original.apply(this,args);
  if(session?.key&&session?.ops)Promise.resolve().then(()=>connect(session)).catch(error);
  return session;
 };
}
})();