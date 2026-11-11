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
 const saved=new Map(),listeners=new Set(),events=[],preferences=new Map(),persistence=[];
 let boundProject=options.newDevice?null:"house-52015",storedConfig=null;
 const localStorage={getItem:k=>preferences.get(k)||null,setItem:(k,v)=>preferences.set(k,String(v))};
 const user={uid:"test-"+role,email:role==="editor"?"admin@example.com":"viewer@example.com",
  getIdTokenResult:async()=>({claims:{email:role==="editor"?"admin@example.com":"viewer@example.com",email_verified:true}})};
 const identity={currentUser:user,authStateReady:async()=>{}};
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
    readConfig:()=>storedConfig||(boundProject?{projectId:boundProject}:null),
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
   vault:{properties:[{code:"平德501",address:"舊址"}]}});
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
 await assert.rejects(()=>x.live.saveRoom({room:"平德501",status:"vacant",deposit:26000}),/唯讀帳號/);
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
