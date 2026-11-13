const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const {TextEncoder,TextDecoder}=require("node:util");
const source=fs.readFileSync(require("node:path").join(__dirname,"../house-ops-live.js"),"utf8")
 .replace('import(SDK+"firebase-app.js")','Promise.resolve(window.__testSDK.app)')
 .replace('import(SDK+"firebase-auth.js")','Promise.resolve(window.__testSDK.auth)')
 .replace('import(SDK+"firebase-firestore.js")','Promise.resolve(window.__testSDK.db)');
function fixture(role="editor",options={}){
 const saved=options.sharedStore||new Map(),listeners=new Set(),events=[],preferences=new Map(),persistence=[];
 let boundProject=options.otherProject?"other-project":options.newDevice?null:"house-52015",storedConfig=null;
 if(options.corruptConfig)preferences.set("house_firebase_config_v1",JSON.stringify({
   projectId:boundProject,authDomain:"https://broken.example/path"
 }));
 const localStorage={getItem:k=>preferences.get(k)||null,setItem:(k,v)=>preferences.set(k,String(v))};
 const user={uid:"test-"+role,email:role==="editor"?"admin@example.com":"viewer@example.com",
  getIdTokenResult:async()=>({claims:{email:role==="editor"?"admin@example.com":"viewer@example.com",email_verified:true}})};
 const identity={currentUser:role==="guest"?null:user,authStateReady:async()=>{}};
 const publish=listener=>listener({metadata:{fromCache:false,hasPendingWrites:false},
  docs:[...saved].map(([id,value])=>({id,data:()=>value}))});
 const appSDK={getApps:()=>[],initializeApp:()=>({name:"housesystem-sync"})};
 const authSDK={getAuth:()=>identity,authStateReady:async()=>{},
  browserLocalPersistence:"LOCAL",browserSessionPersistence:"SESSION",
  setPersistence:async(_auth,mode)=>{persistence.push(mode)},
  onAuthStateChanged:(_auth,cb)=>{queueMicrotask(cb);return ()=>{}},
  signInWithEmailAndPassword:async()=>({user}),signOut:async()=>{identity.currentUser=null}};
 const dbSDK={getFirestore:()=>({}),collection:()=>({}),doc:(_,__,id)=>({id}),
  onSnapshot:(_ref,_opts,callback)=>{
   listeners.add(callback);queueMicrotask(()=>publish(callback));
   return()=>listeners.delete(callback)
  },
  setDoc:async(ref,value)=>{saved.set(ref.id,value);
   for(const callback of listeners)queueMicrotask(()=>publish(callback));
  },serverTimestamp:()=>new Date()};
 const api={unlock:async()=>null,auto:async()=>null,loadWithKey:async()=>null};
 const window={HouseSecureApp:api,HouseCore:{
    readConfig:()=>{
      if(storedConfig)return storedConfig;
      if(options.corruptConfig)throw Error("authDomain 請填網域，不含 https:// 或路徑");
      return boundProject?{projectId:boundProject}:null
    },
    CONFIG_KEY:"house_firebase_config_v1",
    saveConfig:c=>{if(boundProject&&boundProject!==c.projectId)throw Error("不同專案");boundProject=c.projectId;storedConfig=c;return c},
    ADMIN_EMAIL:"admin@example.com"
  },
  __testSDK:{app:appSDK,auth:authSDK,db:dbSDK},
  dispatchEvent:e=>events.push(e)};
 const sandbox={window,localStorage,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,CustomEvent:
  class{constructor(type,options){this.type=type;this.detail=options?.detail}},
  navigator:{onLine:true},location:{reload:()=>{}},queueMicrotask,Promise,Date,Map,Set,Error,Number,String,Array,Object};
 vm.runInNewContext(source,sandbox,{filename:"house-ops-live.js"});
 const state=key=>({key,ops:{updated_at:"2026-11-10T08:00:00Z",
   vacancies:[],rented:[{room:"平德501",rent:13000,status:"rented"}],
   checkouts:[{id:"checkout-fengjia701-20261029",room:"逢甲701",checkout_date:"2026-10-29",refund_status:"pending"}],
   weekly_accounts:[{id:"refund-fengjia701-20261029",kind:"refund",property_label:"逢甲701",
    settlement_date:"2026-10-29",status:"pending"}]},
   vault:{properties:[{code:"平德501",address:"舊址"}]},finance:{accounts:[]}});
 return {live:window.HouseOpsLive,store:saved,state,events,preferences,persistence,getSavedConfig:()=>storedConfig,getPetty:()=>window.HOUSE_PETTY_CASH_DATA?.entries||[]};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function online(live){
 for(let attempt=0;attempt<50;attempt++){
  if(live.getStatus().mode==="online")return;
  await sleep(10);
 }
 throw Error("Firebase mock did not become online: "+live.getStatus().message)
}
test("Encrypted room edits synchronize to a second unlocked device and preserve half-deposit rent",async()=>{
 const x=fixture(),key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const first=x.state(key);await x.live.connect(first);await online(x.live);
 await x.live.saveRoom({room:"平德501",status:"vacant",deposit:26000,rent:1,
   power_rate:5.5,address:"同步新址",note:"已點交"});
 assert.equal(first.ops.vacancies[0].rent,13000);
 assert.equal(first.ops.rented.length,0);
 assert.equal(first.vault.properties[0].address,"同步新址");
 assert.equal(x.store.size,1);
 const cloud=[...x.store.values()][0];
 assert.equal(cloud.type,"ops-edit-v1");
 assert.equal(JSON.stringify(cloud).includes("平德501"),false);
 assert.equal(JSON.stringify(cloud).includes("同步新址"),false);
 const second=x.state(key);await x.live.connect(second);await online(x.live);
 assert.equal(second.ops.vacancies.find(r=>r.room==="平德501")?.rent,13000);
 assert.equal(second.ops.rented.length,0);
});
test("Cloud payment edits synchronize weekly status and matching checkout without inventing paid date",async()=>{
 const x=fixture(),key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const first=x.state(key);await x.live.connect(first);await online(x.live);
 await x.live.savePayment({id:"refund-fengjia701-20261029",status:"paid",paid_date:""});
 assert.equal(first.ops.weekly_accounts[0].status,"paid");
 assert.equal(first.ops.checkouts[0].refund_status,"paid");
 assert.equal(first.ops.weekly_accounts[0].paid_date,undefined);
 const second=x.state(key);await x.live.connect(second);await online(x.live);
 assert.equal(second.ops.weekly_accounts[0].status,"paid");
 assert.equal(second.ops.checkouts[0].refund_status,"paid");
});

test("An authenticated viewer receives cloud updates but cannot save or edit",async()=>{
 const x=fixture("viewer"),key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const session=x.state(key);
 await x.live.connect(session);await online(x.live);
 assert.equal(x.live.getStatus().role,"viewer");
 await assert.rejects(()=>x.live.saveRoom({room:"平德501",status:"vacant",deposit:26000}),/唯讀/);
 assert.equal(x.store.size,0);
 assert.equal(session.ops.rented.some(row=>row.room==="平德501"),true);
});

test("This browser can remember verified Firebase login without storing a password",async()=>{
 const x=fixture(),key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 await x.live.connect(x.state(key));
 await online(x.live);
 await x.live.login("admin@example.com","testing-password",{remember:true});
 await online(x.live);
 assert.equal(x.live.getStatus().remembered,true);
 assert.equal(x.live.rememberOnThisDevice(),true);
 assert.equal(x.preferences.get("house_ops_remember_firebase_login_v1"),"yes");
 assert.equal(x.persistence.at(-1),"LOCAL");
 assert.equal([...x.preferences.values()].some(v=>v.includes("testing-password")),false);
 await x.live.logout();
 assert.equal(x.live.rememberOnThisDevice(),false);
 assert.equal(x.preferences.get("house_ops_remember_firebase_login_v1"),"no");
});

test("A fresh browser auto-configures Firebase before the management password is unlocked",async()=>{
 const x=fixture("editor",{newDevice:true});
 assert.equal(x.getSavedConfig(),null);
 await x.live.prepare();
 assert.equal(x.live.getStatus().mode,"locked");
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 await x.live.connect(x.state(key));await online(x.live);
 assert.equal(x.getSavedConfig().projectId,"house-52015");
 assert.equal(x.getSavedConfig().authDomain,"house-52015.firebaseapp.com");
 assert.equal(x.live.getStatus().role,"editor");
});

test("Existing house-52015 malformed authDomain is repaired without clearing other phone data",async()=>{
 const x=fixture("editor",{corruptConfig:true});
 x.preferences.set("house-unrelated-sensitive-data","KEEP");
 await x.live.prepare();
 assert.equal(x.getSavedConfig().authDomain,"house-52015.firebaseapp.com");
 assert.equal(x.live.getStatus().mode,"locked");
 assert.equal(x.preferences.get("house-unrelated-sensitive-data"),"KEEP");
});
test("A malformed configuration from another Firebase project is never overwritten",async()=>{
 const x=fixture("editor",{corruptConfig:true,otherProject:true});
 const before=x.preferences.get("house_firebase_config_v1");
 await assert.rejects(()=>x.live.prepare(),/authDomain/);
 assert.equal(x.getSavedConfig(),null);
 assert.equal(x.preferences.get("house_firebase_config_v1"),before);
});

test("Supervisor unlocks with house password only and sees encrypted administrator updates",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const admin=fixture("editor"),first=admin.state(key);
 await admin.live.connect(first);await online(admin.live);
 await admin.live.saveRoom({room:"平德501",status:"vacant",deposit:26000,address:"已更新房間"});
 const viewer=fixture("guest",{newDevice:true,sharedStore:admin.store}),second=viewer.state(key);
 assert.equal(viewer.live.getStatus().role,"viewer");
 assert.equal(viewer.getSavedConfig(),null);
 await viewer.live.connect(second);await online(viewer.live);
 assert.equal(viewer.live.getStatus().role,"viewer");
 assert.equal(viewer.live.getStatus().user,"");
 assert.equal(second.ops.vacancies.find(x=>x.room==="平德501")?.rent,13000);
 assert.equal(second.ops.vacancies.find(x=>x.room==="平德501")?.address,"已更新房間");
 await assert.rejects(()=>viewer.live.saveRoom({room:"平德501",status:"rented",deposit:26000}),/唯讀/);
 assert.equal(admin.store.size,1);
});
test("Public supervisor read never changes protected checkout or member rules",()=>{
 const rules=fs.readFileSync(require("node:path").join(__dirname,"../firestore.rules"),"utf8");
 assert.match(rules,/match \/housesystem_ops_edits\/\{recordId\} \{\s*allow read: if true;/);
 assert.match(rules,/allow create, update: if isVerifiedOwner\(\)/);
 assert.match(rules,/match \/housesystem_checkouts\/\{recordId\} \{\s*allow read: if isHouseSystemMember\(\)/);
 assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test("Refund calculator matches historical subtraction and electricity-credit cases",()=>{
 const calc=fixture().live.calculateCheckout;
 const a=calc({deposit:24000,meter_previous:18531,meter_current:18834,power_rate:5});
 assert.equal(a.units,303);assert.equal(a.electricityFee,1515);assert.equal(a.refundAmount,22485);
 const b=calc({deposit:26000,electricity_usage:160,power_rate:5.5,penalty:13000});
 assert.equal(b.refundAmount,12120);
 const c=calc({deposit:22000,electricity_usage:54,power_rate:5.5,electricity_mode:"credit"});
 assert.equal(c.refundAmount,22297);
 assert.throws(()=>calc({deposit:12000,meter_previous:200,meter_current:100,power_rate:5}),/電表/);
});
test("New and edited vendor accounts synchronize ciphertext to a supervisor",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const admin=fixture(),a=admin.state(key);await admin.live.connect(a);await online(admin.live);
 const row=await admin.live.saveAccount({party:"廠商範例",property_label:"測試房間",description:"維修款",
  amount:3000,settlement_date:"2026-11-10",status:"pending",bank_code:"013",bank_account:"123456789012"});
 const id=row.key;
 assert.equal(a.ops.weekly_accounts.find(r=>r.id===id)?.amount,3000);
 assert.equal(JSON.stringify([...admin.store.values()]).includes("廠商範例"),false);
 await admin.live.saveAccount({id,party:"廠商範例",description:"材料調整",amount:3600,
  settlement_date:"2026-11-10",status:"paid",paid_date:"2026-11-12"});
 assert.equal(a.ops.weekly_accounts.filter(r=>r.id===id).length,1);
 assert.equal(a.ops.weekly_accounts.find(r=>r.id===id).amount,3600);
 const supervisor=fixture("guest",{newDevice:true,sharedStore:admin.store}),b=supervisor.state(key);
 await supervisor.live.connect(b);await online(supervisor.live);
 assert.equal(b.ops.weekly_accounts.find(r=>r.id===id).amount,3600);
 assert.equal(b.finance.accounts.find(r=>r.id===id).bank_account,"123456789012");
 await assert.rejects(()=>supervisor.live.saveAccount({id,party:"修改",description:"無權",
  amount:1,settlement_date:"2026-11-10"}),/唯讀/);
});

test("Checkout creates linked refund and vacancy; editing after payment resets stale paid date",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const admin=fixture(),state=admin.state(key);await admin.live.connect(state);await online(admin.live);
 const details={room:"平德501",address:"測試地址",checkout_date:"2026-11-11",
  refund_due_date:"2026-11-17",deposit:26000,meter_previous:2591,meter_current:2751,
  power_rate:5.5,penalty:13000};
 const saved=await admin.live.saveCheckout(details),id=saved.key;
 const checkout=state.ops.checkouts.find(x=>x.id===id);
 const refund=state.ops.weekly_accounts.find(x=>x.id===id.replace(/^checkout-/,"refund-"));
 assert.equal(checkout.refund_amount,12120);
 assert.equal(refund.amount,12120);
 assert.equal(refund.due_date,"2026-11-17");
 assert.equal(state.ops.rented.find(x=>x.room==="平德501"),undefined);
 assert.equal(state.ops.vacancies.find(x=>x.room==="平德501").since,"2026-11-11");
 await admin.live.savePayment({id:refund.id,status:"paid",paid_date:"2026-11-12"});
 assert.equal(checkout.refund_status,"paid");
 await admin.live.saveCheckout({...details,id,penalty:14000});
 assert.equal(state.ops.checkouts.filter(x=>x.id===id).length,1);
 assert.equal(state.ops.checkouts.find(x=>x.id===id).refund_amount,11120);
 assert.equal(state.ops.checkouts.find(x=>x.id===id).refund_paid_date,undefined);
 assert.equal(state.ops.weekly_accounts.find(x=>x.id===refund.id).paid_date,undefined);
 const supervisor=fixture("guest",{newDevice:true,sharedStore:admin.store}),view=supervisor.state(key);
 await supervisor.live.connect(view);await online(supervisor.live);
 assert.equal(view.ops.checkouts.find(x=>x.id===id).refund_amount,11120);
 assert.equal(view.ops.vacancies.find(x=>x.room==="平德501").since,"2026-11-11");
 await assert.rejects(()=>supervisor.live.saveCheckout({...details,id}),/唯讀/);
});
test("Earlier historical checkout cannot erase a later current rental",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const admin=fixture(),state=admin.state(key);await admin.live.connect(state);await online(admin.live);
 await admin.live.saveRoom({room:"平德501",status:"rented",deposit:26000});
 await admin.live.saveCheckout({room:"平德501",checkout_date:"2026-10-30",deposit:26000,
  electricity_usage:160,power_rate:5.5});
 assert.equal(state.ops.rented.some(x=>x.room==="平德501"),true);
});

test("Petty cash addition, edit and void are encrypted and visible without Firebase login",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const admin=fixture(),session=admin.state(key);await admin.live.connect(session);await online(admin.live);
 const result=await admin.live.savePetty({kind:"advance",manager:"測試人員",item:"代墊材料",
  date:"2026-11-11",amount:1474,receipt_url:"https://example.org/receipt"});
 const id=result.key;
 assert.equal(admin.getPetty().find(r=>r.id===id).amount,1474);
 assert.equal(JSON.stringify([...admin.store.values()]).includes("代墊材料"),false);
 await admin.live.savePetty({id,kind:"advance",manager:"測試人員",item:"代墊材料",
  date:"2026-11-11",amount:1400,status:"void"});
 assert.equal(admin.getPetty().find(r=>r.id===id).status,"void");
 assert.equal(admin.getPetty().filter(r=>r.id===id).length,1);
 const viewer=fixture("guest",{newDevice:true,sharedStore:admin.store}),vSession=viewer.state(key);
 await viewer.live.connect(vSession);await online(viewer.live);
 assert.equal(viewer.getPetty().find(r=>r.id===id).amount,1400);
 assert.equal(viewer.getPetty().find(r=>r.id===id).status,"void");
 await assert.rejects(()=>viewer.live.savePetty({id,kind:"fund",manager:"甲",item:"無權",
  date:"2026-11-11",amount:1}),/唯讀/);
});

test("Editor card rearrangement saves encrypted order once and a password-only supervisor sees it",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),a=editor.state(key);
 a.ops.vacancies=[{room:"Alpha",since:"2026-11-08"},{room:"Beta",since:"2026-11-10"},{room:"Gamma",since:"2026-11-11"}];
 await editor.live.connect(a);await online(editor.live);
 await editor.live.saveVacancyOrder(["Gamma","Alpha","Beta"]);
 assert.deepEqual(Array.from(a.ops.vacancy_card_order),["GAMMA","ALPHA","BETA"]);
 assert.equal(editor.store.size,1);
 const ciphertext=JSON.stringify([...editor.store.values()]);
 assert.equal(ciphertext.includes('"Gamma"'),false);
 assert.equal(ciphertext.includes('"ALPHA"'),false);
 const supervisor=fixture("guest",{newDevice:true,sharedStore:editor.store}),b=supervisor.state(key);
 b.ops.vacancies=a.ops.vacancies.map(x=>({...x}));
 await supervisor.live.connect(b);await online(supervisor.live);
 assert.deepEqual(Array.from(b.ops.vacancy_card_order),["GAMMA","ALPHA","BETA"]);
 assert.equal(supervisor.live.getStatus().role,"viewer");
 await assert.rejects(()=>supervisor.live.saveVacancyOrder(["Alpha","Beta","Gamma"]),/唯讀/);
});
test("Card order rejects duplicate and incomplete room lists without modifying cloud data",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const x=fixture(),session=x.state(key);
 session.ops.vacancies=[{room:"Alpha"},{room:"Beta"}];
 await x.live.connect(session);await online(x.live);
 await assert.rejects(()=>x.live.saveVacancyOrder(["Alpha","Alpha"]),/重複/);
 await assert.rejects(()=>x.live.saveVacancyOrder(["Alpha"]),/名單已變更/);
 await assert.rejects(()=>x.live.saveVacancyOrder(["Alpha","Unlisted"]),/名單已變更/);
 assert.equal(x.store.size,0);
});

test("New checkout suite creates master, vacancy and refund atomically, readable by password-only supervisor",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),a=editor.state(key);
 await editor.live.connect(a);await online(editor.live);
 const startCount=a.vault.properties.length;
 const data={room:"新屋B12",address:"台中市測試路12號",checkout_date:"2026-11-12",
  refund_due_date:"2026-11-17",deposit:24000,electricity_usage:100,power_rate:5.5};
 const result=await editor.live.saveCheckout(data);
 const fresh=a.vault.properties.find(x=>x.code==="新屋B12");
 assert.equal(a.vault.properties.length,startCount+1);
 assert.equal(fresh.address,data.address);
 assert.equal(fresh.address_raw,data.address);
 assert.equal(result.changes.master.action,"create");
 assert.equal(a.ops.checkouts.find(x=>x.room===data.room).master_id,fresh.id);
 assert.equal(a.ops.vacancies.find(x=>x.room===data.room).address,data.address);
 assert.equal(a.ops.weekly_accounts.find(x=>x.property_label===data.room&&x.kind==="refund").amount,23450);
 assert.equal(editor.store.size,1,"master and checkout must share one ciphertext");
 const ciphertext=JSON.stringify([...editor.store.values()]);
 assert.equal(ciphertext.includes("新屋B12"),false);
 assert.equal(ciphertext.includes(data.address),false);
 // Re-saving an existing checkout is idempotent and does not add a second master entry.
 await editor.live.saveCheckout({...data,id:result.key,penalty:1000,master_id:fresh.id});
 assert.equal(a.vault.properties.filter(x=>x.code===data.room).length,1);
 assert.equal(a.ops.weekly_accounts.find(x=>x.property_label===data.room&&x.kind==="refund").amount,22450);
 const supervisor=fixture("guest",{newDevice:true,sharedStore:editor.store}),b=supervisor.state(key);
 await supervisor.live.connect(b);await online(supervisor.live);
 assert.equal(b.vault.properties.find(x=>x.code===data.room)?.address,data.address);
 assert.equal(b.ops.vacancies.find(x=>x.room===data.room)?.address,data.address);
 await assert.rejects(()=>supervisor.live.saveCheckout({...data,room:"新屋B13"}),/唯讀/);
});
test("Master lookup reuses exact room and fills missing address without duplicates",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),a=editor.state(key);
 await editor.live.connect(a);await online(editor.live);
 const startCount=a.vault.properties.length;
 const existing=a.vault.properties.find(x=>x.code==="平德501");
 const saved=await editor.live.saveCheckout({room:"平德-501",checkout_date:"2026-11-13",
  deposit:26000,electricity_usage:0,power_rate:5.5,master_id:existing.id});
 assert.equal(saved.changes.master.action,"existing");
 assert.equal(saved.changes.checkout.address,existing.address);
 assert.equal(a.vault.properties.length,startCount);
 assert.equal(a.ops.vacancies.find(x=>x.room==="平德501")?.address,existing.address);
});
test("Updating a known room's address updates its master without duplicating the room",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),a=editor.state(key);
 await editor.live.connect(a);await online(editor.live);
 const initialCount=a.vault.properties.length;
 const input={room:"平德501",address:"另一個新地址",checkout_date:"2026-11-13",
  deposit:26000,electricity_usage:0,power_rate:5.5};
 const saved=await editor.live.saveCheckout(input);
 assert.equal(saved.changes.master.action,"update_address");
 assert.equal(a.vault.properties.length,initialCount);
 assert.equal(a.vault.properties.find(x=>x.code==="平德501").address,input.address);
 assert.equal(a.ops.vacancies.find(x=>x.room==="平德501").address,input.address);
 await assert.rejects(()=>editor.live.saveCheckout({...input,room:"全新D6",address:""}),/填寫地址/);
 assert.equal(editor.store.size,1);
});

test("Taipower checkout deducts actual invoice amount, never multiplies a fixed room rate",()=>{
 const calc=fixture().live.calculateCheckout;
 const result=calc({deposit:24000,meter_previous:100,meter_current:350,
  power_billing:"taipower",power_rate:5.5,actual_electricity_fee:1287,penalty:3000});
 assert.equal(result.powerBilling,"taipower");
 assert.equal(result.rate,null);
 assert.equal(result.units,250);
 assert.equal(result.electricityFee,1287);
 assert.equal(result.refundAmount,19713);
 const reverse=calc({deposit:22000,power_billing:"taipower",
  actual_electricity_fee:297,electricity_mode:"credit"});
 assert.equal(reverse.refundAmount,22297);
 assert.throws(()=>calc({deposit:22000,power_billing:"taipower",power_rate:5.5,
  electricity_usage:300}),/台電帳單實際結清電費/);
 assert.equal(calc({deposit:22000,power_billing:"taipower",
  actual_electricity_fee:"0"}).refundAmount,22000);
 const legacy=calc({deposit:24000,power_rate:5.5,electricity_usage:100});
 assert.equal(legacy.refundAmount,23450);
});
test("Taipower room setting, master and checkout synchronize to supervisor without an exposed tariff",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),session=editor.state(key);
 await editor.live.connect(session);await online(editor.live);
 await editor.live.saveRoom({room:"平德501",status:"rented",deposit:26000,
  power_billing:"taipower",power_rate:5.5,address:"舊址"});
 assert.equal(session.ops.rented.find(x=>x.room==="平德501").power_billing,"taipower");
 assert.equal(session.ops.rented.find(x=>x.room==="平德501").power_rate,null);
 assert.equal(session.vault.properties.find(x=>x.code==="平德501").power_billing,"taipower");
 await editor.live.saveCheckout({room:"平德501",checkout_date:"2026-11-13",deposit:26000,
  power_billing:"taipower",actual_electricity_fee:1298,electricity_usage:200});
 const checked=session.ops.checkouts.find(x=>x.room==="平德501"&&x.checkout_date==="2026-11-13");
 assert.equal(checked.electricity_fee,1298);
 assert.equal(checked.power_rate,null);
 assert.equal(checked.refund_amount,24702);
 assert.equal(session.ops.vacancies.find(x=>x.room==="平德501").power_billing,"taipower");
 const supervisor=fixture("guest",{newDevice:true,sharedStore:editor.store});
 const viewer=supervisor.state(key);
 await supervisor.live.connect(viewer);await online(supervisor.live);
 assert.equal(viewer.vault.properties.find(x=>x.code==="平德501").power_billing,"taipower");
 assert.equal(viewer.ops.vacancies.find(x=>x.room==="平德501").power_billing,"taipower");
 assert.equal(viewer.ops.checkouts.find(x=>x.room==="平德501"&&x.checkout_date==="2026-11-13").electricity_fee,1298);
 await assert.rejects(()=>supervisor.live.saveRoom({room:"平德501",status:"vacant",deposit:26000,power_billing:"fixed"}),/唯讀/);
});

test("Custom water/gas charges produce an exact auditable refund formula and total",()=>{
 const ops=fixture().live;
 const c=ops.calculateCheckout({deposit:56000,power_billing:"taipower",actual_electricity_fee:3910,
  deduction_items:[{label:"水費",amount:368},{label:"瓦斯費",amount:673}]});
 assert.equal(c.refundAmount,51049);
 assert.equal(c.itemTotal,1041);
 assert.deepEqual(Array.from(c.deductionItems,x=>x.label),["水費","瓦斯費"]);
 assert.equal(ops.refundFormula(c),"退租退款｜押金56000－電費3910－水費368－瓦斯費673＝51049元");
 const legacy=ops.calculateCheckout({deposit:12000,electricity_usage:10,power_rate:5.5,
  cleaning:3000,other_charge:500,deduction_items:[{label:"水費",amount:250}]});
 assert.equal(legacy.refundAmount,8195);
 assert.equal(ops.refundFormula(legacy),"退租退款｜押金12000－電費55－清潔費3000－其他扣款500－水費250＝8195元");
 assert.throws(()=>ops.calculateCheckout({deposit:10000,
  deduction_items:[{label:"瓦斯費",amount:""}]}),/名目與金額/);
 assert.throws(()=>ops.calculateCheckout({deposit:10000,
  deduction_items:[{label:"",amount:30}]}),/名目與金額/);
 assert.throws(()=>ops.calculateCheckout({deposit:10000,
  deduction_items:[{label:"水費",amount:-1}]}),/金額/);
});
test("New itemized checkout syncs calculation and bank to weekly ledger and supervisor",async()=>{
 const key=await webcrypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const editor=fixture(),session=editor.state(key);
 await editor.live.connect(session);await online(editor.live);
 const data={room:"測試社區-D15-5",address:"台中市範例路88號",
  checkout_date:"2026-11-11",refund_due_date:"2026-11-17",
  party:"租屋房客",deposit:56000,power_billing:"taipower",actual_electricity_fee:3910,
  deduction_items:[{label:"水費",amount:368},{label:"瓦斯費",amount:673}],
  bank_code:"006",bank_name:"合作金庫",bank_account:"0000000000000"};
 const saved=await editor.live.saveCheckout(data);
 const record=session.ops.checkouts.find(x=>x.id===saved.key);
 const row=session.ops.weekly_accounts.find(x=>x.id===saved.key.replace(/^checkout-/,"refund-"));
 assert.equal(record.refund_amount,51049);
 assert.equal(record.deduction_items.length,2);
 assert.equal(row.party,"租屋房客");
 assert.equal(row.property_label,data.room);
 assert.equal(row.amount,51049);
 assert.equal(row.due_date,"2026-11-17");
 assert.equal(row.settlement_date,"2026-11-11");
 assert.equal(row.description,"退租退款｜押金56000－電費3910－水費368－瓦斯費673＝51049元");
 assert.equal(editor.live.refundFormulaFromRecord(record),row.description);
 assert.equal(session.finance.accounts.find(x=>x.id===row.id).bank_account,"0000000000000");
 assert.equal(JSON.stringify([...editor.store.values()]).includes("0000000000000"),false);
 const supervisor=fixture("guest",{newDevice:true,sharedStore:editor.store});
 const viewer=supervisor.state(key);await supervisor.live.connect(viewer);await online(supervisor.live);
 assert.equal(viewer.ops.weekly_accounts.find(x=>x.id===row.id)?.description,row.description);
 assert.equal(viewer.ops.checkouts.find(x=>x.id===saved.key)?.deduction_items[1].label,"瓦斯費");
 await assert.rejects(()=>supervisor.live.saveCheckout(data),/唯讀/);
 const edited=await editor.live.saveCheckout({...data,id:saved.key,
  deduction_items:[{label:"水費",amount:468},{label:"瓦斯費",amount:673}]});
 assert.equal(edited.changes.weekly.amount,50949);
 assert.equal(session.ops.checkouts.filter(x=>x.id===saved.key).length,1);
 assert.equal(session.ops.weekly_accounts.find(x=>x.id===row.id).amount,50949);
});
