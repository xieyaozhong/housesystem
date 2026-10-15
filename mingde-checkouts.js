(function () {
  "use strict";
  const app=window.HouseSecureApp;
  if(!app)throw new Error("HouseSecureApp is required");
  const updates=[
    {
      room:"明德2D",checkout_date:"2026-10-15",refund_due_date:"2026-10-20",
      refund_amount:14800,deposit:12000,october_checkout_fee:3000,
      meter_previous:23951,meter_current:23991,electricity_usage:40,
      power_rate:5,electricity_fee:200,bank_account_last4:"3491",
      note:"本期電23991－上期電23951＝40度；40×5元＝200元（已結清）；押金12,000＋十月退租費3,000－電費200＝應退14,800元"
    },
    {
      room:"明德3B",checkout_date:"2026-10-02",refund_due_date:"2026-10-20",
      refund_amount:3710,deposit:12000,rent_arrears:6400,
      rent_arrears_month:6000,rent_arrears_extra:400,
      meter_previous:9148,meter_current:9526,electricity_usage:378,
      power_rate:5,electricity_fee:1890,bank_account_last4:"3791",
      note:"本期電9526－上期電9148＝378度；378×5元＝1,890元（已結清）；欠租6,000＋400＝6,400元；押金12,000－電費1,890－欠租6,400＝應退3,710元"
    }
  ];
  async function apply(session){
    if(!session?.ops||!session?.finance||!session?.vault)return session;
    const {ops,finance,vault,key}=session;
    ops.checkouts ||= [];
    ops.weekly_accounts ||= [];
    ops.vacancies ||= [];
    ops.rented ||= [];
    finance.accounts ||= [];
    const storagePrefix="house_ops_finance_account_v1:";
    for(const entry of updates){
      const room=entry.room,date=entry.checkout_date;
      const slug=room==="明德2D"?"mingde-2d":"mingde-3b";
      const id="refund-"+slug+"-"+date.replaceAll("-","");
      const findRoom=x=>x?.room===room||x?.code===room;
      const address=ops.vacancies.find(findRoom)?.address||
        ops.rented.find(findRoom)?.address||
        (vault.properties||[]).find(findRoom)?.address||"";
      const checkout={...entry,id:"checkout-"+slug+"-"+date.replaceAll("-"),address,refund_status:"pending"};
      delete checkout.bank_account_last4;
      const previousCheckout=ops.checkouts.find(x=>x.id===checkout.id||
        (x.room===room&&x.checkout_date===date));
      if(previousCheckout)Object.assign(previousCheckout,checkout);
      else ops.checkouts.push(checkout);
      const weekly={
        id,kind:"refund",party:room+"房客",property_label:room,
        description:"退租退款｜"+entry.note,amount:entry.refund_amount,
        due_date:entry.refund_due_date,settlement_date:date,status:"pending"
      };
      const priorWeekly=ops.weekly_accounts.find(x=>x.id===id);
      if(priorWeekly)Object.assign(priorWeekly,weekly);
      else ops.weekly_accounts.push(weekly);
      let bank=finance.accounts.find(x=>x.id===id);
      if(!bank){bank={id};finance.accounts.push(bank)}
      bank.bank_code="013";
      bank.bank_name="國泰世華";
      bank.bank_account_last4=entry.bank_account_last4;
      bank.secure_local=true;
      bank.bank_account="";
      try{
        const item=localStorage.getItem(storagePrefix+id);
        if(item){
          const decoded=await HouseTrusted.decryptVaultWithKey(JSON.parse(item),key);
          if(decoded.id===id&&/^\d{6,20}$/.test(decoded.account))bank.bank_account=decoded.account;
        }
      }catch(_){ /* Bank account can be saved after unlock. */ }
      const rentedLater=ops.rented.some(x=>x.room===room&&String(x.updated_at||x.since||"")>date);
      if(!rentedLater){
        const vacancy={
          room,address,source:"退租轉空房",since:date,updated_at:date,
          status:"vacant",rent:entry.deposit/2,rent_pending:false,power_rate:entry.power_rate
        };
        const oldVacancy=ops.vacancies.find(findRoom);
        if(oldVacancy)Object.assign(oldVacancy,vacancy);
        else ops.vacancies.push(vacancy);
        ops.rented=ops.rented.filter(x=>x.room!==room);
      }
    }
    ops.updated_at="2026-10-15T19:36:00+08:00";
    return session;
  }
  for(const method of ["unlock","auto","loadWithKey"]){
    const original=app[method];
    app[method]=async function(...args){return apply(await original.apply(this,args))};
  }
})();