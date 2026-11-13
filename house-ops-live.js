(function(){
"use strict";
// Encrypted, authenticated, real-time edits layered after the legacy encrypted seed.
// Never store tenant details, room names, addresses or amounts in Firestore plaintext.
const api=window.HouseSecureApp;
if(!api)throw new Error("HouseSecureApp must load before house-ops-live.js");
const COLL="housesystem_ops_edits",SDK="https://www.gstatic.com/firebasejs/12.19.0/";
const REMEMBER_KEY="house_ops_remember_firebase_login_v1";
const DEFAULT_EDITOR="handsomeboy784@gmail.com";
// Firebase Web App identifiers are intentionally public; access is protected
// by Authentication, the published Firestore rules and AES-GCM encryption.
// These values must never include an account password or service account key.
const DEFAULT_FIREBASE_CONFIG=Object.freeze({
 apiKey:"AIzaSyAGWcz8cV3W_mFcE1iz-kZPxhqVQRK7YS8",
 authDomain:"house-52015.firebaseapp.com",
 projectId:"house-52015",
 appId:"1:1033044359440:web:5e76cd43eda6e8bf660d95"
});
const te=new TextEncoder(),td=new TextDecoder();
const norm=s=>String(s||"").trim().replace(/[\s_－-]/g,"").replace(/[陜陕]/g,"陝").toUpperCase();
const positive=x=>x!==undefined&&x!==null&&String(x).trim()!==""&&Number.isFinite(Number(x))&&Number(x)>0?Number(x):null;
const money=x=>{const n=Number(String(x??"0").replace(/,/g,"").trim()||0);if(!Number.isFinite(n)||n<0||n>100000000)throw Error("金額必須為 0 至 100,000,000 元");return n};
const validDate=x=>{const d=String(x||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const t=new Date(d+"T12:00:00Z");return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===d};
const safeText=(x,max=500)=>{const v=String(x??"").trim();if(v.length>max)throw Error("欄位內容過長");return v};
function calculateCheckout(data){
 const deposit=money(data.deposit);
 if(!deposit)throw Error("退租押金必須大於 0");
 const previous=data.meter_previous===""||data.meter_previous==null?null:money(data.meter_previous);
 const current=data.meter_current===""||data.meter_current==null?null:money(data.meter_current);
 if((previous===null)!==(current===null))throw Error("電表前期與本期讀數需同時填寫");
 if(previous!==null&&current<previous)throw Error("本期電表度數不可低於前期");
 const units=previous!==null?current-previous:money(data.electricity_usage);
 const powerBilling=data.power_billing==="taipower"?"taipower":"fixed";
 const rate=powerBilling==="taipower"?null:money(data.power_rate);
 if(rate!==null&&rate>1000)throw Error("每度電費金額不合理");
 const actual=String(data.actual_electricity_fee??"").trim();
 if(powerBilling==="taipower"&&!actual)throw Error("台電計費請輸入台電帳單實際結清電費（金額可填 0）");
 const electricityFee=powerBilling==="taipower"?Math.round(money(actual)):Math.round(units*rate);
 const creditMode=data.electricity_mode==="credit"?"credit":"deduct";
 const penalty=money(data.penalty),cleaning=money(data.cleaning),
  unpaidRent=money(data.unpaid_rent),otherCharge=money(data.other_charge),
  overpaid=money(data.overpaid),otherCredit=money(data.other_credit);
 const signedElectricity=creditMode==="credit"?electricityFee:-electricityFee;
 const balance=Math.round(deposit+signedElectricity+overpaid+otherCredit-penalty-cleaning-unpaidRent-otherCharge);
 return {deposit,previous,current,units,rate,powerBilling,electricityFee,creditMode,
  penalty,cleaning,unpaidRent,otherCharge,overpaid,otherCredit,
  balance,refundAmount:Math.max(0,balance),owedAmount:Math.max(0,-balance)};
}
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u)));
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let s=null,app=null,auth=null,db=null,F=null,A=null,unsubscribe=null,authUnsubscribe=null,initPromise=null;
let patches=new Map(),serial=Promise.resolve(),connection=0,lastClientTimestamp=0;
// Distinct monotonically increasing timestamps prevent two immediate edits
// (for example, marking a refund paid then correcting its amount) from
// applying in the wrong order when the device clock has millisecond ties.
function nextTimestamp(){
 lastClientTimestamp=Math.max(Date.now(),lastClientTimestamp+1);
 return new Date(lastClientTimestamp).toISOString();
}
let state={mode:"setup",role:"viewer",message:"尚未連結 Firebase。請先設定雲端連線。",user:"",lastSync:"",count:0,remembered:false};
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
 if(p.kind==="vacancy_order"){
  // This is encrypted with the same AES-GCM key as the room data. Never let a
  // shared order overwrite room status, rent or historical checkout records.
  const order=p.changes?.order;
  if(Array.isArray(order)&&order.length<=500&&order.every(x=>typeof x==="string"&&x.length<=100)){
   const normalized=order.map(norm);
   if(normalized.every(Boolean)&&new Set(normalized).size===normalized.length){
    ops.vacancy_card_order=normalized;
   }
  }
 }else if(p.kind==="room"){
  const data=p.changes||{},key=norm(p.key);
  if(!key||!["vacant","rented"].includes(data.status))return;
  const match=x=>norm(x?.room||x?.code)===key;
  const prior=[...(ops.rented||[]),...(ops.vacancies||[])].find(match)||{};
  const master=(session.vault?.properties||[]).find(match)||{};
  if(master&&data.address)master.address=data.address;
  if(master&&data.note!==undefined)master.note=data.note;
  if(master&&data.power_billing) {
   master.power_billing=data.power_billing;
   master.power_rate=data.power_billing==="taipower"?null:data.power_rate;
  }
  const item={...prior,room:p.key,address:data.address||prior.address||master.address||"",
   status:data.status,source:"網頁編輯（雲端同步）",updated_at:p.updated_at};
  if(data.deposit!=null)item.deposit=data.deposit;
  if(data.rent!=null)item.rent=data.rent;
  if(data.power_billing){
   item.power_billing=data.power_billing;
   item.power_rate=data.power_billing==="taipower"?null:data.power_rate;
  }else if(data.power_rate!=null)item.power_rate=data.power_rate;
  if(data.note!==undefined)item.note=data.note;
  delete item.rent_pending;delete item.lease_start_pending;
  delete item.rent_unverified;
  if(data.status==="vacant"){
   item.since=prior.since||p.updated_at.slice(0,10);
  }else delete item.since;
  ops.vacancies=ops.vacancies.filter(x=>!match(x));
  ops.rented=ops.rented.filter(x=>!match(x));
  (data.status==="vacant"?ops.vacancies:ops.rented).push(item);
 }else if(p.kind==="petty"){
  const row=p.changes?.row;
  if(!row||row.id!==p.key||!["fund","advance","advance_repaid","petty_expense"].includes(row.kind))return;
  const ledger=window.HOUSE_PETTY_CASH_DATA||{entries:[],updated_at:""};
  ledger.entries||=[];
  const existing=ledger.entries.find(x=>x.id===row.id);
  if(existing)Object.assign(existing,row);else ledger.entries.push({...row});
  if(p.updated_at>String(ledger.updated_at||""))ledger.updated_at=p.updated_at;
  window.HOUSE_PETTY_CASH_DATA=ledger;
 }else if(p.kind==="account"){
  const row=p.changes?.row;
  if(!row||row.id!==p.key||row.kind!=="vendor")return;
  const old=ops.weekly_accounts.find(x=>x.id===row.id);
  if(old){Object.assign(old,row);if(row.status!=="paid"){delete old.paid_date;delete old.paid_at}}
  else ops.weekly_accounts.push({...row});
  const bank=p.changes?.bank;
  if(bank){
   session.finance.accounts||=[];
   const found=session.finance.accounts.find(x=>x.id===row.id);
   if(found)Object.assign(found,bank,{id:row.id,edited_online:true});
   else session.finance.accounts.push({...bank,id:row.id,edited_online:true});
  }
 }else if(p.kind==="checkout"){
  const record=p.changes?.checkout,weekly=p.changes?.weekly;
  if(!record||!weekly||record.id!==p.key||!validDate(record.checkout_date)||weekly.kind!=="refund")return;
  // Master entry and checkout share one encrypted Firestore document. A new
  // unit is created atomically with its refund and vacancy, never by typing.
  const master=p.changes?.master;
  if(master&&master.code&&norm(master.code)===norm(record.room)){
   session.vault||={properties:[]};
   session.vault.properties||=[];
   const properties=session.vault.properties;
   const stored=properties.find(x=>String(x.id)===String(master.id))||
     properties.find(x=>norm(x.code||x.room)===norm(master.code));
   if(!stored&&["create","existing","update_address"].includes(master.action)){
    // A later edit overwrites the original Firestore checkout document.
    // Rebuild new master units from any later version as well, so supervisors
    // who connect after that edit still see the matching property.
    properties.push({id:master.id,code:master.code,address:master.address,
     address_raw:master.address_raw||master.address,access:"",note:"",
     power_billing:record.power_billing||"fixed",
     power_rate:record.power_billing==="taipower"?null:record.power_rate,
     source:"退租主檔（雲端同步）",created_at:p.updated_at});
   }else if(stored){
    if(master.address&&(master.action==="update_address"||!stored.address)){
     stored.address=master.address;
     if(!stored.address_raw)stored.address_raw=master.address;
    }
    if(record.power_billing){
     stored.power_billing=record.power_billing;
     stored.power_rate=record.power_billing==="taipower"?null:record.power_rate;
    }
   }
  }
  const old=ops.checkouts.find(x=>x.id===record.id);
  if(old){Object.assign(old,record);if(record.refund_status!=="paid")delete old.refund_paid_date}
  else ops.checkouts.push({...record});
  const oldPay=ops.weekly_accounts.find(x=>x.id===weekly.id);
  if(oldPay){Object.assign(oldPay,weekly);if(weekly.status!=="paid"){delete oldPay.paid_date;delete oldPay.paid_at}}
  else ops.weekly_accounts.push({...weekly});
  if(p.changes.bank){
   session.finance.accounts||=[];
   const existing=session.finance.accounts.find(x=>x.id===weekly.id);
   if(existing)Object.assign(existing,p.changes.bank,{id:weekly.id,edited_online:true});
   else session.finance.accounts.push({...p.changes.bank,id:weekly.id,edited_online:true});
  }
  const key=norm(record.room),matches=x=>norm(x?.room||x?.code)===key;
  const rented=ops.rented.find(matches);
  // Do not turn a room vacant if its latest rental started after this checkout.
  if(!rented||String(rented.updated_at||rented.since||"").slice(0,10)<=record.checkout_date){
   const prior=ops.vacancies.find(matches)||rented||{};
   const item={...prior,room:record.room,address:record.address||prior.address||"",
    status:"vacant",source:"退租轉空房",since:record.checkout_date,updated_at:p.updated_at,
    rent:record.rent,deposit:record.deposit,power_rate:record.power_rate,
    power_billing:record.power_billing||"fixed"};
   ops.vacancies=ops.vacancies.filter(x=>!matches(x));
   ops.rented=ops.rented.filter(x=>!matches(x));
   ops.vacancies.push(item);
  }
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
 // p is the already-published encrypted-patch document prefix; checkout
 // and vendor account edits share it for compatibility with existing rules.
 const prefix=kind==="room"?"r":"p";
 return prefix+"-"+Array.from(h,x=>x.toString(16).padStart(2,"0")).join("");
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
 if(!p||!["room","payment","account","checkout","petty","vacancy_order"].includes(p.kind)||typeof p.key!=="string"||typeof p.updated_at!=="string"||!p.changes||typeof p.changes!=="object")throw Error("雲端修改紀錄內容無效");
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
  let config=null;
  try{
   config=window.HouseCore?.readConfig();
  }catch(e){
   // An earlier manual entry might have a malformed authDomain. Only repair
   // a saved configuration already identifying the same project. Never wipe
   // room data, trusted keys or a different project's binding.
   const raw=localStorage.getItem(window.HouseCore?.CONFIG_KEY||"house_firebase_config_v1");
   const bound=localStorage.getItem("house_data_project_v1");
   let existing=null;
   try{existing=raw?JSON.parse(raw):null}catch(_){}
   if(existing?.projectId!==DEFAULT_FIREBASE_CONFIG.projectId ||
      (bound&&bound!==DEFAULT_FIREBASE_CONFIG.projectId)){
     status("error","既有 Firebase 設定損壞或屬於其他專案；未覆寫舊資料。請檢查 Firebase 專案設定。");
     throw e;
   }
   config=window.HouseCore?.saveConfig(DEFAULT_FIREBASE_CONFIG);
   status("connecting","已修復 house-52015 舊版 Firebase 網域設定，正在連線…");
  }
  if(!config){
   // First-time setup uses the confirmed Web App config. Project binding in
   // HouseCore still rejects previously bound different Firebase projects.
   try{config=window.HouseCore?.saveConfig(DEFAULT_FIREBASE_CONFIG)}
   catch(e){status("error","此裝置已有不同的 Firebase 專案綁定，未覆寫舊資料。");throw e}
  }
  if(config?.projectId!==DEFAULT_FIREBASE_CONFIG.projectId){
   status("error","此裝置已綁定其他 Firebase 專案；為防止混用房務資料，請勿繼續儲存。");
   return false;
  }
  status("connecting","正在連結 house-52015 Firebase…");
  const [appSDK,authSDK,firestoreSDK]=await Promise.all([
   import(SDK+"firebase-app.js"),import(SDK+"firebase-auth.js"),import(SDK+"firebase-firestore.js")
  ]);
  A=authSDK;F=firestoreSDK;
  app=appSDK.getApps().find(x=>x.name==="housesystem-sync")||appSDK.initializeApp(config,"housesystem-sync");
  auth=A.getAuth(app);db=F.getFirestore(app);
  // Restore a Firebase session only when this browser chose persistent login.
  // Firebase stores the auth session internally; no password or token is written
  // into application-owned localStorage or the public repository.
  const wasRemembered=localStorage.getItem(REMEMBER_KEY)==="yes";
  try{
    await A.setPersistence(auth,wasRemembered?A.browserLocalPersistence:A.browserSessionPersistence);
  }catch(e){
    // Private-browsing restrictions can prevent persistent storage.
    // Fall back to session login; never tell users they were remembered.
    if(!wasRemembered)throw e;
    await A.setPersistence(auth,A.browserSessionPersistence);
    localStorage.setItem(REMEMBER_KEY,"no");
  }
  await auth.authStateReady();
  authUnsubscribe=A.onAuthStateChanged(auth,()=>{
   if(s)subscribe().catch(error);
   else showReadyAuthState().catch(error);
  });
  return true;
 })().catch(e=>{initPromise=null;error(e);throw e});
 return initPromise;
}
async function showReadyAuthState(){
 if(!auth||s?.key)return;
 const current=auth.currentUser,remembered=localStorage.getItem(REMEMBER_KEY)==="yes";
 if(!current){
  status("locked","主管唯讀模式｜輸入家總管管理密碼後，自動讀取最新同步資料。",{user:"",role:"viewer",remembered});
  return;
 }
 const token=await current.getIdTokenResult(),claims=token.claims||{};
 const role=claims.email===window.HouseCore?.ADMIN_EMAIL&&claims.email_verified===true?"editor":"viewer";
 status("locked",role==="editor"?"Firebase 管理員已登入，請解鎖家總管管理密碼以同步。":"Firebase 已登入，請解鎖家總管管理密碼以讀取資料。",{user:current.email||"",role,remembered});
}
async function prepare(){
 if(!(await init()))return false;
 await showReadyAuthState();
 return true;
}
async function subscribe(){
 stop();
 if(!s?.key)return;
 if(!(await init()))return;
 // Encrypted-only Firestore ops can be fetched without a Firebase account.
 // The password-derived AES key was proven by unlocking the local vault.
 // Firebase Security Rules still require verified admin email for writes.
 const current=auth?.currentUser||null;
 const token=current?await current.getIdTokenResult():null;
 const claims=token?.claims||{},ownerEmail=window.HouseCore?.ADMIN_EMAIL;
 const role=claims.email===ownerEmail&&claims.email_verified===true?"editor":"viewer";
 const remembered=localStorage.getItem(REMEMBER_KEY)==="yes";
 const g=connection, session=s, cryptoKey=session.key;
 status("connecting",role==="editor"?"正在同步管理員加密修改紀錄…":"正在取得加密更新並用家總管密碼解鎖…",{user:current?.email||"",role,remembered});
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
   status("online",role==="editor"?"編輯模式｜資料已同步，儲存後主管裝置自動更新。":"主管唯讀模式｜已同步最新房務與付款狀態（不需 Firebase 登入）。",{lastSync:new Date().toISOString(),count:patches.size,role,remembered});
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
 if(auth&&db&&!unsubscribe)await subscribe();
}
async function login(email,password,options={}){
 if(!(await init()))throw Error("請先儲存 Firebase 設定");
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email||"")||!password)throw Error("請輸入正確的帳號及密碼");
 const remember=options?.remember===true;
 let persisted=false;
 // This preference is bound to the current browser/device, never the account.
 if(remember){
  try{await A.setPersistence(auth,A.browserLocalPersistence);persisted=true}
  catch(_){await A.setPersistence(auth,A.browserSessionPersistence)}
 }else await A.setPersistence(auth,A.browserSessionPersistence);
 await A.signInWithEmailAndPassword(auth,email.trim(),password);
 localStorage.setItem(REMEMBER_KEY,persisted?"yes":"no");
 if(s?.key)await subscribe();
 else await showReadyAuthState();
}
async function logout(){
 if(auth)await A.signOut(auth);
 localStorage.setItem(REMEMBER_KEY,"no");
 stop();status("login","已登出雲端帳號；本機加密資料仍受管理密碼保護。",{user:"",role:"viewer",remembered:false});
}
function configure(cfg){
 if(!window.HouseCore)throw Error("網站尚未載入 Firebase 設定功能");
 window.HouseCore.saveConfig(cfg);
 location.reload();
}
function writable(){
 if(!s?.key)throw Error("請先解鎖家總管管理密碼");
 if(state.role!=="editor")throw Error("主管唯讀模式無法編輯資料，請在管理員手機登入 Firebase。");
 if(!db||!auth?.currentUser)throw Error("請先在管理員裝置登入 Firebase。");
 if(state.mode!=="online"||!navigator.onLine)throw Error("尚未取得雲端同步確認，請確認網路與 Firebase 權限");
}
async function save(p){
 writable();
 const id=await hash(p.kind,p.key),doc=F.doc(db,COLL,id),data=await encrypted(p);
 await F.setDoc(doc,data);
 patches.set(p.kind+":"+norm(p.key),p);
 render();
 status("online","編輯模式｜資料已儲存至 Firebase，其他已連線裝置將自動更新。",{lastSync:new Date().toISOString(),count:patches.size,role:"editor"});
 return p;
}
async function saveRoom(data){
 const room=String(data.room||"").trim(),statusValue=data.status;
 if(!room||room.length>100||/[\/]/.test(room))throw Error("房號必須介於 1 至 100 字，不可含斜線");
 if(!["vacant","rented"].includes(statusValue))throw Error("請選擇空房或已出租");
 let deposit=positive(data.deposit),rent=positive(data.rent),rate=positive(data.power_rate);
 const billing=data.power_billing==="taipower"?"taipower":"fixed";
 if(billing==="taipower")rate=null;
 if(deposit!==null)rent=deposit/2;
 else if(rent!==null)deposit=rent*2;
 if(deposit===null||deposit>100000000||!Number.isFinite(deposit))throw Error("請輸入押金或月租金以完成自動計算");
 if(rate!==null&&rate>1000)throw Error("電費每度金額不合理");
 const address=String(data.address||"").trim(),note=String(data.note||"").trim();
 if(address.length>300||note.length>2000)throw Error("地址或備註內容過長");
 return save({v:1,kind:"room",key:room,updated_at:nextTimestamp(),
  changes:{status:statusValue,deposit,rent,power_billing:billing,power_rate:rate,address,note}});
}
async function savePayment(data){
 const id=String(data.id||""),statusValue=data.status,paidDate=String(data.paid_date||"").trim();
 if(!/^[A-Za-z0-9_.-]{1,150}$/.test(id))throw Error("帳務編號不正確");
 if(!["paid","pending"].includes(statusValue))throw Error("請選擇已付款或待付款");
 if(paidDate&&!/^\d{4}-\d{2}-\d{2}$/.test(paidDate))throw Error("付款日期格式不正確");
 const row=s?.ops?.weekly_accounts?.find(x=>x.id===id&&["refund","vendor"].includes(x.kind));
 if(!row)throw Error("找不到這筆帳務，無法修改");
 return save({v:1,kind:"payment",key:id,updated_at:nextTimestamp(),
  changes:{status:statusValue,paid_date:statusValue==="paid"?paidDate:""}});
}
async function saveAccount(data){
 const originalId=String(data.id||"").trim();
 const id=originalId||("vendor-web-"+Date.now()+"-"+Math.random().toString(36).slice(2,8));
 if(!/^[A-Za-z0-9_.-]{1,150}$/.test(id))throw Error("帳務編號格式不正確");
 if(originalId&&s?.ops?.weekly_accounts?.some(x=>x.id===id&&x.kind!=="vendor"))throw Error("退租退款請至退租頁面修改");
 const party=safeText(data.party,150),item=safeText(data.description,1200),property=safeText(data.property_label,200);
 if(!party||!item)throw Error("請輸入收款人與項目說明");
 const amount=money(data.amount);
 const day=safeText(data.settlement_date,10),due=safeText(data.due_date,10),paidDate=safeText(data.paid_date,10);
 if(!validDate(day)||(due&&!validDate(due))||(paidDate&&!validDate(paidDate)))throw Error("帳務日期格式不正確");
 const statusValue=data.status==="paid"?"paid":"pending";
 const receipt=safeText(data.receipt_url,1200);
 if(receipt&&!/^https:\/\//i.test(receipt))throw Error("收據網址必須是 https 連結");
 const previous=s?.ops?.weekly_accounts?.find(x=>x.id===id);
 const row={id,kind:"vendor",party,property_label:property,description:item,amount,
  settlement_date:day,due_date:due,status:statusValue,receipt_url:receipt};
 if(statusValue==="paid"&&(paidDate||previous?.paid_date))row.paid_date=paidDate||previous.paid_date;
 const bankCode=safeText(data.bank_code,12),bankName=safeText(data.bank_name,100),bankAccount=safeText(data.bank_account,35);
 if(bankCode&&!/^\d{3}$/.test(bankCode))throw Error("銀行代號必須是三位數字");
 if(bankAccount&&!/^\d{6,30}$/.test(bankAccount))throw Error("銀行帳號請輸入 6 至 30 位數字");
 const previousBank=s?.finance?.accounts?.find(x=>x.id===id);
 const bank=(bankCode||bankName||bankAccount)?{bank_code:bankCode,bank_name:bankName,bank_account:bankAccount,bank_account_last4:bankAccount.slice(-4),secure_local:false}:
  previousBank?.edited_online?{bank_code:previousBank.bank_code||"",bank_name:previousBank.bank_name||"",
   bank_account:previousBank.bank_account||"",bank_account_last4:previousBank.bank_account_last4||"",secure_local:false}:null;
 return save({v:1,kind:"account",key:id,updated_at:nextTimestamp(),changes:{row,bank}});
}
function checkoutMaster(data,room,address){
 const properties=s?.vault?.properties||[];
 const selected=String(data.master_id??"").trim();
 const matched=properties.find(p=>norm(p.code||p.room)===norm(room));
 const exactId=selected?properties.find(p=>String(p.id)===selected):null;
 if(selected&&(!exactId||norm(exactId.code||exactId.room)!==norm(room))){
  throw Error("選取的主檔物件與套房名稱不一致，請重新選擇建議項目");
 }
 if(matched){
  const existing=exactId||matched;
  const targetAddress=safeText(existing.address,300);
  const isChanged=Boolean(address&&targetAddress&&norm(address)!==norm(targetAddress));
  return {master:{action:isChanged?"update_address":"existing",id:existing.id,
   code:existing.code||room,address:isChanged?address:(targetAddress||address),
   address_raw:existing.address_raw||targetAddress||address},
   room:existing.code||room,address:isChanged?address:(targetAddress||address)};
 }
 if(selected)throw Error("找不到已選取的主檔物件，請重新搜尋");
 if(!address)throw Error("新套房尚未存在主檔，請填寫地址才可新增主檔並辦理退租");
 const id="web-"+Date.now()+"-"+Math.random().toString(36).slice(2,9);
 return {master:{action:"create",id,code:room,address,address_raw:address},
  room,address};
}
async function saveCheckout(data){
 const typedRoom=safeText(data.room,100),typedAddress=safeText(data.address,300),
  date=safeText(data.checkout_date,10),due=safeText(data.refund_due_date,10);
 if(!typedRoom||/[\/]/.test(typedRoom)||!validDate(date)||(due&&!validDate(due)))throw Error("請填正確房號、退租日期及退款日");
 const linked=checkoutMaster(data,typedRoom,typedAddress),room=linked.room,address=linked.address;
 const calc=calculateCheckout(data);
 const old=s?.ops?.checkouts?.find(x=>x.id===data.id)||
  s?.ops?.checkouts?.find(x=>norm(x.room)===norm(room)&&x.checkout_date===date);
 const id=old?.id||("checkout-web-"+Date.now()+"-"+Math.random().toString(36).slice(2,8));
 const originalRefund=s?.ops?.weekly_accounts?.find(x=>x.kind==="refund"&&(
  x.id===id.replace(/^checkout-/,"refund-")||
  (norm(x.property_label)===norm(room)&&String(x.settlement_date)===date)));
 const refundId=originalRefund?.id||id.replace(/^checkout-/,"refund-");
 const unchanged=old&&Number(old.refund_amount)===calc.refundAmount;
 const wasPaid=unchanged&&old.refund_status==="paid";
 const statusValue=calc.refundAmount===0?"no_refund":wasPaid?"paid":"pending";
 const note=safeText(data.note,2000),tenant=safeText(data.party,150);
 const description="退租退款｜押金"+calc.deposit+"－費用與扣款＋加回款項＝"+calc.refundAmount+"元"+
  (calc.owedAmount?"（另需補繳 "+calc.owedAmount+" 元）":"");
 const record={id,room,address,master_id:linked.master.id,checkout_date:date,refund_due_date:due,
  deposit:calc.deposit,rent:calc.deposit/2,meter_previous:calc.previous,meter_current:calc.current,
  electricity_usage:calc.units,power_billing:calc.powerBilling,
  power_rate:calc.rate,electricity_fee:calc.electricityFee,
  actual_electricity_fee:calc.powerBilling==="taipower"?calc.electricityFee:null,
  electricity_credit_direction:calc.creditMode==="credit"?"add_to_deposit":"deduct_from_deposit",
  electricity_credit:calc.creditMode==="credit"?calc.electricityFee:0,
  early_termination_penalty:calc.penalty,cleaning_fee:calc.cleaning,unpaid_rent:calc.unpaidRent,
  other_charge:calc.otherCharge,overpaid:calc.overpaid,other_credit:calc.otherCredit,
  refund_amount:calc.refundAmount,calculated_refund_amount:calc.refundAmount,
  owed_amount:calc.owedAmount,reconciliation_status:"calculated",refund_status:statusValue,note};
 if(wasPaid&&old.refund_paid_date)record.refund_paid_date=old.refund_paid_date;
 const weekly={id:refundId,kind:"refund",party:tenant||room+"房客",property_label:room,
  description,amount:calc.refundAmount,settlement_date:date,due_date:due,
  status:statusValue==="paid"?"paid":"pending",__deleted:calc.refundAmount===0};
 if(wasPaid&&old.refund_paid_date)weekly.paid_date=old.refund_paid_date;
 const bankCode=safeText(data.bank_code,12),bankName=safeText(data.bank_name,100),bankAccount=safeText(data.bank_account,35);
 if(bankCode&&!/^\d{3}$/.test(bankCode))throw Error("銀行代號必須是三位數字");
 if(bankAccount&&!/^\d{6,30}$/.test(bankAccount))throw Error("銀行帳號請輸入 6 至 30 位數字");
 const previousBank=s?.finance?.accounts?.find(x=>x.id===refundId);
 const bank=(bankCode||bankName||bankAccount)?{bank_code:bankCode,bank_name:bankName,bank_account:bankAccount,
  bank_account_last4:bankAccount.slice(-4),secure_local:false}:
  previousBank?.edited_online?{bank_code:previousBank.bank_code||"",bank_name:previousBank.bank_name||"",
   bank_account:previousBank.bank_account||"",bank_account_last4:previousBank.bank_account_last4||"",secure_local:false}:null;
 return save({v:1,kind:"checkout",key:id,updated_at:nextTimestamp(),changes:{checkout:record,weekly,bank,master:linked.master}});
}
async function savePetty(data){
 const existingId=String(data.id||"").trim();
 const id=existingId||("petty-web-"+Date.now()+"-"+Math.random().toString(36).slice(2,8));
 if(!/^[A-Za-z0-9_.-]{1,150}$/.test(id))throw Error("零用金編號不正確");
 const kind=data.kind,available=["fund","advance","advance_repaid","petty_expense"];
 if(!available.includes(kind))throw Error("請選擇代管備用金類型");
 const date=safeText(data.date,10);
 if(!validDate(date))throw Error("請填寫有效帳務日期");
 const manager=safeText(data.manager,150),item=safeText(data.item,400);
 if(!manager||!item)throw Error("請輸入代管人員與項目");
 const amount=money(data.amount);
 const receipt=safeText(data.receipt_url,1200);
 if(receipt&&!/^https:\/\//i.test(receipt))throw Error("收據網址需以 https 開頭");
 const statusValue=data.status==="void"?"void":"active";
 const row={id,kind,date,manager,item,amount,receipt_url:receipt,status:statusValue};
 return save({v:1,kind:"petty",key:id,updated_at:nextTimestamp(),changes:{row}});
}
async function saveVacancyOrder(order){
 writable();
 if(!Array.isArray(order)||order.length>500)throw Error("空房卡片順序筆數不正確");
 const keys=order.map(value=>{
  if(typeof value!=="string"||!value.trim()||value.length>100)throw Error("房號排序資料不正確");
  return norm(value);
 });
 if(new Set(keys).size!==keys.length)throw Error("房號排序資料有重複項目");
 const available=window.HouseVacancySort?.sort(s.ops.vacancies,s.ops.checkouts,s.ops.rented)||s.ops.vacancies||[];
 const current=new Set(available.map(row=>norm(row?.room||row?.code)).filter(Boolean));
 if(keys.length!==current.size||keys.some(key=>!current.has(key))){
  throw Error("空房名單已變更，請重新整理後再排序");
 }
 return save({v:1,kind:"vacancy_order",key:"global",updated_at:nextTimestamp(),
  changes:{order:keys}});
}
window.HouseOpsLive={connect,prepare,getStatus:()=>({...state}),login,logout,configure,saveRoom,savePayment,saveAccount,saveCheckout,savePetty,saveVacancyOrder,calculateCheckout,
 defaultEmail:DEFAULT_EDITOR,defaultFirebaseConfig:()=>({...DEFAULT_FIREBASE_CONFIG}),rememberOnThisDevice:()=>localStorage.getItem(REMEMBER_KEY)!=="no"};
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