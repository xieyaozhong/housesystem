(function(){
  'use strict';
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
    ops.updated_at="2026-10-02T11:31:00+08:00";
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
  window.HouseSecureApp={unlock,auto,forget,loadWithKey};
})();
