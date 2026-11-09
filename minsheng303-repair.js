(function(){
  "use strict";
  const app=window.HouseSecureApp;
  if(!app)throw new Error("HouseSecureApp not initialized");
  const id="vendor-hongmao-minsheng303-waterheater-wiring-20261109";
  const receipt="https://drive.google.com/file/d/1F4mzTQJOBMHOsQpqpBvY_EV90zrnFkLz/view?usp=drivesdk";
  async function addMaintenance(session){
    if(!session?.ops||!session?.finance)return session;
    const {ops,finance}=session;
    ops.weekly_accounts||=[];finance.accounts||=[];
    const old=ops.weekly_accounts.find(x=>x.id===id);
    const alreadyPaid=old?.status==="paid";
    const entry={id,kind:"vendor",party:"鴻茂（熱水器原廠）",
      property_label:"民生303",description:"熱水器線路維修（原廠；維修日期待補）",
      amount:3000,record_date:"2026-11-09",settlement_date:"2026-11-09",
      receipt_url:receipt,status:alreadyPaid?"paid":"pending"};
    if(alreadyPaid){
      if(old?.paid_date)entry.paid_date=old.paid_date;
      if(old?.paid_at)entry.paid_at=old.paid_at;
    }
    if(old)Object.assign(old,entry);else ops.weekly_accounts.push(entry);
    let bank=finance.accounts.find(x=>x.id===id);
    if(!bank){bank={id};finance.accounts.push(bank)}
    Object.assign(bank,{id,bank_code:"013",bank_name:"國泰世華銀行",
      bank_account_last4:"6613",secure_local:false,bank_account:""});
    if(String(ops.updated_at||"")<"2026-11-09T15:22:00+08:00")
      ops.updated_at="2026-11-09T15:22:00+08:00";
    return session;
  }
  for(const name of ["unlock","auto","loadWithKey"]){
    const original=app[name];
    app[name]=async function(...args){return addMaintenance(await original.apply(this,args))};
  }
})();