(function(){
  'use strict';
  const REFUND_ID="refund-pingde-401-20261002";
  const REFUND_STORAGE_KEY="house_ops_refund_account_v1:"+REFUND_ID;
  const LOCAL_FINANCE_PREFIX="house_ops_finance_account_v1:";
  async function readFinanceAccount(key,id){
    try{
      const saved=localStorage.getItem(LOCAL_FINANCE_PREFIX+id);
      if(!saved)return "";
      const decoded=await HouseTrusted.decryptVaultWithKey(JSON.parse(saved),key);
      return decoded.id===id&&/^\d{6,20}$/.test(decoded.account)?decoded.account:"";
    }catch(e){console.warn("Local finance account unavailable",e);return ""}
  }
  async function saveFinanceAccount(session,id,account){
    if(!session?.key||!id)throw new Error("帳務或解鎖資訊有誤");
    const cleaned=String(account||"").replace(/[\s-]/g,"");
    if(!/^\d{6,20}$/.test(cleaned))throw new Error("請輸入正確的數字銀行帳號");
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const body=new TextEncoder().encode(JSON.stringify({id,account:cleaned}));
    const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},session.key,body);
    const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
    localStorage.setItem(LOCAL_FINANCE_PREFIX+id,JSON.stringify({v:1,iv:b64(iv),ct:b64(encrypted)}));
    const row=(session.finance.accounts||[]).find(x=>x.id===id);
    if(row)row.bank_account=cleaned;
    return true;
  }
  async function readRefundAccount(key){
    try{
      const saved=localStorage.getItem(REFUND_STORAGE_KEY);
      if(!saved)return "";
      const decoded=await HouseTrusted.decryptVaultWithKey(JSON.parse(saved),key);
      return decoded.id===REFUND_ID&&/^\d{6,20}$/.test(decoded.account)?decoded.account:"";
    }catch(e){console.warn("Local refund bank account unavailable",e);return ""}
  }
  async function saveRefundAccount(session,id,account){
    if(id!==REFUND_ID)throw new Error("退款紀錄有誤");
    return saveFinanceAccount(session,id,account);
  }
  async function loadWithKey(key){
    const [ops,finance,vault]=await Promise.all([
      HouseTrusted.decryptVaultWithKey(HOUSE_OPS_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_FINANCE_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_VAULT,key)
    ]);
    try{
      if(!window.HOUSE_OPS_DELTA_SECURE)await import('./ops-delta-secure.js');
      if(window.HOUSE_OPS_DELTA_SECURE){
        const delta=await HouseTrusted.decryptVaultWithKey(HOUSE_OPS_DELTA_SECURE,key);
        const weeklyMap=new Map((ops.weekly_accounts||[]).map(x=>[x.id,x]));
        for(const row of delta.weekly_accounts||[]){
          const current=weeklyMap.get(row.id);
          if(current)Object.assign(current,row);
          else{ops.weekly_accounts.push(row);weeklyMap.set(row.id,row)}
        }
        const financeMap=new Map((finance.accounts||[]).map(x=>[x.id,x]));
        for(const row of delta.finance_accounts||[]){
          const current=financeMap.get(row.id);
          if(current)Object.assign(current,row);
          else{finance.accounts.push(row);financeMap.set(row.id,row)}
        }
        if(delta.updated_at)ops.updated_at=delta.updated_at;
      }
    }catch(e){console.error('Secure delta load failed',e)}
    try{
      if(!window.HOUSE_VENDOR_PAYABLES_SECURE)await import('./vendor-payables-secure.js');
      if(window.HOUSE_VENDOR_PAYABLES_SECURE){
        const added=await HouseTrusted.decryptVaultWithKey(HOUSE_VENDOR_PAYABLES_SECURE,key);
        ops.weekly_accounts=ops.weekly_accounts||[];
        finance.accounts=finance.accounts||[];
        const weeklyIds=new Set(ops.weekly_accounts.map(x=>x.id));
        for(const row of added.weekly_accounts||[])if(!weeklyIds.has(row.id)){ops.weekly_accounts.push(row);weeklyIds.add(row.id)}
        const financeIds=new Set(finance.accounts.map(x=>x.id));
        for(const row of added.finance_accounts||[])if(!financeIds.has(row.id)){finance.accounts.push(row);financeIds.add(row.id)}
        if(added.updated_at)ops.updated_at=added.updated_at;
      }
    }catch(e){console.error('Encrypted vendor additions unavailable',e)}
    if(ops?.checkouts?.[1]){
      ops.checkouts[1].refund_status="paid";
      ops.checkouts[1].refund_paid_date="2026-09-30";
    }
    if(ops?.weekly_accounts?.[1]){
      ops.weekly_accounts[1].status="paid";
      ops.weekly_accounts[1].paid_date="2026-09-30";
    }
    const vacancyPricing={
      "一中4A":{rent:11000,power_rate:5},
      "北屯8C":{rent:11000,power_rate:5.5},
      "陝西703":{rent:8500,power_rate:5.5},
      "民生303":{rent:13500,power_rate:5.5},
      "寧夏R8":{rent:12000,power_rate:5},
      "復興路五段186號3樓E室":{rent:9000,power_rate:5}
    };
    for(const room of ops?.vacancies||[]){
      const pricing=vacancyPricing[room.room];
      if(pricing)Object.assign(room,pricing);
    }
    const beitun8B=(ops?.vacancies||[]).findIndex(r=>r.room==="北屯8B");
    if(beitun8B>=0){
      const rentedRoom={...ops.vacancies[beitun8B],rent:12500,power_rate:5.5,updated_at:"2026-09-30",status:"rented"};
      ops.vacancies.splice(beitun8B,1);
      ops.rented=[...(ops.rented||[]),rentedRoom];
    }
    const yizhong4A=(ops?.vacancies||[]).findIndex(r=>r.room==="一中4A");
    if(yizhong4A>=0){
      const rentedRoom={...ops.vacancies[yizhong4A],rent:11000,power_rate:5,updated_at:"2026-10-02",status:"rented"};
      ops.vacancies.splice(yizhong4A,1);
      ops.rented=ops.rented||[];
      if(!ops.rented.some(r=>r.room==="一中4A"))ops.rented.push(rentedRoom);
    }
    const pingdeRoom="平德401";
    const checkoutDate="2026-10-02";
    const roomAddress=(ops.vacancies||[]).find(x=>x.room===pingdeRoom)?.address
      ||(ops.rented||[]).find(x=>x.room===pingdeRoom)?.address
      ||(vault.properties||[]).find(x=>String(x.code||"").includes("平德")||String(x.address||"").includes("平德"))?.address
      ||"";
    ops.checkouts=ops.checkouts||[];
    if(!ops.checkouts.some(x=>x.room===pingdeRoom&&x.checkout_date===checkoutDate)){
      ops.checkouts.push({
        id:"checkout-pingde-401-20261002",room:pingdeRoom,address:roomAddress,
        checkout_date:checkoutDate,refund_due_date:"2026-10-06",
        refund_amount:24218,refund_status:"pending",
        deposit:26000,meter_previous:3117,meter_current:3441,
        electricity_usage:324,power_rate:5.5,electricity_fee:1782,
        note:"押金 26,000 元－已結清電費 1,782 元＝應退 24,218 元；本期 3441－上期 3117＝324 度，324×5.5 元＝1,782 元"
      });
    }
    ops.vacancies=ops.vacancies||[];
    if(!ops.vacancies.some(x=>x.room===pingdeRoom)){
      ops.vacancies.push({room:pingdeRoom,address:roomAddress,source:"退租轉空房",since:checkoutDate,updated_at:checkoutDate,status:"vacant"});
    }
    ops.rented=(ops.rented||[]).filter(x=>x.room!==pingdeRoom);
    ops.weekly_accounts=ops.weekly_accounts||[];
    if(!ops.weekly_accounts.some(x=>x.id===REFUND_ID)){
      ops.weekly_accounts.push({
        id:REFUND_ID,kind:"refund",party:"平德401房客",property_label:pingdeRoom,
        description:"退租退款｜押金 26,000 元－結清電費 1,782 元",
        amount:24218,due_date:"2026-10-06",settlement_date:"2026-10-02",status:"pending"
      });
    }
    finance.accounts=finance.accounts||[];
    let refundBank=finance.accounts.find(x=>x.id===REFUND_ID);
    if(!refundBank){
      refundBank={id:REFUND_ID,bank_code:"013",bank_account:""};
      finance.accounts.push(refundBank);
    }
    refundBank.bank_code="013";
    refundBank.bank_account=await readRefundAccount(key);

    const vendorId="vendor-zhengguofeng-zhongqing11-1b-20261009";
    if(!ops.weekly_accounts.some(x=>x.id===vendorId)){
      ops.weekly_accounts.push({
        id:vendorId,kind:"vendor",party:"鄭國峰（水電）",property_label:"中清11-1B",
        description:"馬桶水管破裂",amount:1000,settlement_date:"2026-10-09",
        status:"pending",receipt_url:"https://drive.google.com/file/d/1lGNLCaQnukaifoZ1dG-OUPB7ijU-uwJG/view?usp=drivesdk"
      });
    }
    let vendorBank=finance.accounts.find(x=>x.id===vendorId);
    if(!vendorBank){
      vendorBank={id:vendorId,bank_code:"808",bank_name:"玉山",bank_account:"",secure_local:true};
      finance.accounts.push(vendorBank);
    }
    vendorBank.bank_code="808";
    vendorBank.bank_name="玉山";
    vendorBank.secure_local=true;
    vendorBank.bank_account=await readFinanceAccount(key,vendorId);

    ops.updated_at="2026-10-05T11:34:00+08:00";
    return {key,ops,finance,vault};
  }
  async function unlock(password){
    const keys=await HouseTrusted.prepare(password,null);
    const session=await loadWithKey(keys.vaultKey);
    await HouseTrusted.rememberVaultKey(keys.vaultKey);
    return session;
  }
  async function auto(){
    const key=await HouseTrusted.getVaultKey();
    if(!key)return null;
    try{return await loadWithKey(key)}catch(e){await HouseTrusted.forgetVaultKey();return null}
  }
  async function forget(){await HouseTrusted.forgetVaultKey()}
  window.HouseSecureApp={unlock,auto,forget,loadWithKey,saveRefundAccount,saveFinanceAccount};
})();
