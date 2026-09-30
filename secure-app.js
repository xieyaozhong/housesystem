(function(){
  'use strict';
  async function loadWithKey(key){
    const [ops,finance,vault]=await Promise.all([
      HouseTrusted.decryptVaultWithKey(HOUSE_OPS_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_FINANCE_SECURE,key),
      HouseTrusted.decryptVaultWithKey(HOUSE_VAULT,key)
    ]);
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
    ops.updated_at="2026-09-30T15:09:00+08:00";
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
