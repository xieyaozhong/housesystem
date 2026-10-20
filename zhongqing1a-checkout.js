(function(){
  "use strict";
  const app=window.HouseSecureApp;
  async function apply(s){
    if(!s?.ops||!s?.finance||!s?.vault)return s;
    const {ops,finance,vault}=s;
    ops.checkouts ||= [];ops.weekly_accounts ||= [];finance.accounts ||= [];ops.vacancies ||= [];ops.rented ||= [];
    const room="中清1A",date="2026-10-20",id="refund-zhongqing1a-20261020",checkoutId="checkout-zhongqing1a-20261020";
    const isRoom=x=>x?.room===room||x?.code===room;
    const address=ops.vacancies.find(isRoom)?.address||ops.rented.find(isRoom)?.address||vault.properties?.find(isRoom)?.address||"";
    const old=ops.checkouts.find(x=>x.id===checkoutId||(x.room===room&&x.checkout_date===date));
    const previous=ops.weekly_accounts.find(x=>x.id===id);
    const paid=old?.refund_status==="paid"||previous?.status==="paid";
    const paidAt=old?.refund_paid_date||previous?.paid_date;
    const checkout={id:checkoutId,room,address,checkout_date:date,refund_due_date:"2026-10-27",refund_amount:25782,
      deposit:28000,overpaid_rent:9334,penalty_fee:11200,meter_previous:3339,meter_current:3403,
      electricity_usage:64,power_rate:5.5,electricity_fee:352,utilities_status:"settled",refund_status:paid?"paid":"pending",
      note:"本期電3403－上期電3339＝64度，64×5.5＝352元（結清）；押金28000＋十月超付9334－違約11200－電費352＝應退25782元"};
    if(paid&&paidAt)checkout.refund_paid_date=paidAt;
    if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
    const weekly={id,kind:"refund",party:"中清1A房客",property_label:room,
      description:"退租退款｜押金28000＋10月超付9334－違約11200－電費352（結清）",
      amount:25782,due_date:"2026-10-27",settlement_date:date,status:paid?"paid":"pending"};
    if(paid&&paidAt)weekly.paid_date=paidAt;
    if(previous)Object.assign(previous,weekly);else ops.weekly_accounts.push(weekly);
    let bank=finance.accounts.find(x=>x.id===id);
    if(!bank){bank={id};finance.accounts.push(bank)}
    Object.assign(bank,{bank_code:"812",bank_name:"台新銀行",bank_account_last4:"5883",secure_local:!paid,bank_account:""});
    const later=ops.rented.some(x=>isRoom(x)&&String(x.updated_at||x.since||"")>date);
    if(!later){const vacant={room,address,status:"vacant",source:"退租轉空房",since:date,updated_at:date,rent:14000,power_rate:5.5,rent_pending:false};
      const prior=ops.vacancies.find(isRoom);if(prior)Object.assign(prior,vacant);else ops.vacancies.push(vacant);
      ops.rented=ops.rented.filter(x=>!isRoom(x));
    }
    ops.updated_at="2026-10-20T13:33:00+08:00";
    return s;
  }
  for(const method of ["unlock","auto","loadWithKey"]){
    const original=app[method];app[method]=async function(...args){return apply(await original.apply(this,args))};
  }
})();
