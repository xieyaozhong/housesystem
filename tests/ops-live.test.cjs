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
 return {live:window.HouseOpsLive,store:saved,state,events,preferences,persistence,getSavedConfig:()=>storedConfig};
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
