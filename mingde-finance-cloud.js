(function () {
  "use strict";
  const api=window.HouseSecureApp;
  if(!api)throw new Error("HouseSecureApp is required");
  const IDS=["refund-mingde-2d-20261015","refund-mingde-3b-20261002"];
  const LAST4=["3491","3791"];
  const COLLECTION="housesystem_checkouts";
  const DOC_ID="finance-mingde-refunds-v1";
  const SDK="https://www.gstatic.com/firebasejs/12.19.0/";
  const enc=new TextEncoder(),dec=new TextDecoder();
  const b64=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const unb64=value=>Uint8Array.from(atob(value),x=>x.charCodeAt(0));
  let sdkPromise;
  const accountOK=(id,value)=>typeof value==="string"&&
    /^\d{6,20}$/.test(value)&&IDS.includes(id)&&value.endsWith(LAST4[IDS.indexOf(id)]);
  function locallyAvailable(session){
    const rows=session.finance.accounts||[];
    const accounts={};
    for(const id of IDS){
      const val=rows.find(r=>r.id===id)?.bank_account;
      if(accountOK(id,val))accounts[id]=val;
    }
    return accounts;
  }
  async function backend(){
    const config=window.HouseCore?.readConfig();
    if(!config)return null;
    if(!sdkPromise){
      sdkPromise=(async()=>{
        const [firebase,authMod,dbMod]=await Promise.all([
          import(SDK+"firebase-app.js"),
          import(SDK+"firebase-auth.js"),
          import(SDK+"firebase-firestore.js")
        ]);
        const app=firebase.getApps().find(a=>a.name==="housesystem-sync")||
          firebase.initializeApp(config,"housesystem-sync");
        const auth=authMod.getAuth(app);
        await auth.authStateReady();
        return{auth,db:dbMod.getFirestore(app),F:dbMod};
      })().catch(e=>{sdkPromise=null;throw e});
    }
    const services=await sdkPromise;
    return services.auth.currentUser?services:null;
  }
  async function encryptAccounts(accounts,key){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const data=enc.encode(JSON.stringify({v:1,accounts}));
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data);
    return{v:1,iv:b64(iv),ct:b64(ct),type:"finance-accounts-v1"};
  }
  async function decryptAccounts(doc,key){
    if(doc?.type!=="finance-accounts-v1"||doc?.v!==1||
       typeof doc.iv!=="string"||typeof doc.ct!=="string")
      throw Error("雲端銀行帳號資料格式不正確");
    let json;
    try{
      const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(doc.iv)},key,unb64(doc.ct));
      json=JSON.parse(dec.decode(data));
    }catch(_){throw Error("雲端銀行帳號無法解密，請確認使用同一份管理密碼")}
    if(json?.v!==1||!json.accounts||typeof json.accounts!=="object")
      throw Error("雲端銀行帳號內容格式不正確");
    const accounts={};
    for(const id of IDS){
      const number=json.accounts[id];
      if(number!==undefined){
        if(!accountOK(id,number))throw Error("雲端帳號末四碼不符，已停止匯入");
        accounts[id]=number;
      }
    }
    return accounts;
  }
  function mergeIntoSession(session,accounts){
    for(const row of session.finance.accounts||[]){
      if(IDS.includes(row.id)&&accountOK(row.id,accounts[row.id]))row.bank_account=accounts[row.id];
    }
  }
  async function push(session,sourceAccounts){
    const services=await backend();
    if(!services)return false;
    const {F,db}=services,ref=F.doc(db,COLLECTION,DOC_ID);
    await F.runTransaction(db,async tx=>{
      const current=await tx.get(ref);
      const prior=current.exists()?await decryptAccounts(current.data(),session.key):{};
      const joined={...prior};
      for(const [id,num] of Object.entries(sourceAccounts)){
        if(accountOK(id,num))joined[id]=num;
      }
      if(!Object.keys(joined).length)return;
      const encrypted=await encryptAccounts(joined,session.key);
      tx.set(ref,{...encrypted,updatedAt:F.serverTimestamp()});
    });
    return true;
  }
  async function apply(session){
    if(!session?.key||!session?.finance)return session;
    let service;
    try{service=await backend()}catch(e){
      console.warn("Firebase finance backend unavailable",e);return session;
    }
    if(!service)return session;
    const {F,db}=service,ref=F.doc(db,COLLECTION,DOC_ID);
    const local=locallyAvailable(session);
    try{
      const snapshot=await F.getDocFromServer(ref);
      if(snapshot.exists()){
        const remote=await decryptAccounts(snapshot.data(),session.key);
        mergeIntoSession(session,remote);
        // Existing locally saved accounts are migrated without a separate sync code.
        const missing=Object.fromEntries(Object.entries(local).filter(([id])=>!remote[id]));
        if(Object.keys(missing).length)await push(session,missing);
      }else if(Object.keys(local).length){
        await push(session,local);
      }
    }catch(e){console.warn("Firebase finance account read failed",e)}
    return session;
  }
  for(const method of ["unlock","auto","loadWithKey"]){
    const original=api[method];
    api[method]=async function(...args){return apply(await original.apply(this,args))};
  }
  const originalSave=api.saveFinanceAccount;
  api.saveFinanceAccount=async function(session,id,number){
    const result=await originalSave.call(this,session,id,number);
    if(IDS.includes(id)){
      try{await push(session,{[id]:String(number).replace(/[\s-]/g,"")})}
      catch(e){console.warn("Bank account saved locally but cloud upload failed",e)}
    }
    return result;
  };
})();
