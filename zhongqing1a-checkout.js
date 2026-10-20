(function(){
  "use strict";
  const app=window.HouseSecureApp;
  async function apply(s){
    if(!s?.ops||!s?.finance||!s?.vault)return s;
    const {ops,finance,vault}=s;
    ops.checkouts ||= [];ops.weekly_accounts ||= [];finance.accounts ||= [];ops.vacancies ||= [];ops.rented ||= [];
    const room="中清1A",date="2026-10-20",id="refund-zhongqing1a-20261020",checkoutId="checkout-zhongqing1a-20261020";
    const legacyId="refund-zhongqing9-1a-20261020",legacyCheckoutId="checkout-zhongqing9-1a-20261020";
    const isRoom=x=>x?.room===room||x?.code===room;
    const address=ops.vacancies.find(isRoom)?.address||ops.rented.find(isRoom)?.address||vault.properties?.find(isRoom)?.address||"";
    const checkoutMatches=ops.checkouts.filter(x=>x.id===checkoutId||x.id===legacyCheckoutId||
      ([room,"中清9-1A"].includes(x.room)&&x.checkout_date===date));
    const weeklyMatches=ops.weekly_accounts.filter(x=>x.id===id||x.id===legacyId);
    const old=checkoutMatches.find(x=>x.id===checkoutId)||checkoutMatches[0];
    const previous=weeklyMatches.find(x=>x.id===id)||weeklyMatches[0];
    const paid=checkoutMatches.some(x=>x.refund_status==="paid")||weeklyMatches.some(x=>x.status==="paid");
    const paidAt=checkoutMatches.find(x=>x.refund_paid_date)?.refund_paid_date||
      weeklyMatches.find(x=>x.paid_date)?.paid_date;
    ops.checkouts=ops.checkouts.filter(x=>!checkoutMatches.includes(x)||x===old);
    ops.weekly_accounts=ops.weekly_accounts.filter(x=>!weeklyMatches.includes(x)||x===previous);
    const checkout={id:checkoutId,room,address,checkout_date:date,refund_due_date:"2026-10-27",refund_amount:11782,calculated_refund_amount:11782,
      reconciliation_difference:0,reconciliation_status:"matched",
      deposit:28000,overpaid_rent:9334,short_term_penalty:11200,penalty_fee:14000,
      meter_previous:3339,meter_current:3403,
      electricity_usage:64,power_rate:5.5,electricity_fee:352,utilities_status:"settled",refund_status:paid?"paid":"pending",
      note:"本期電3403－上期電3339＝64度；64×5.5元＝352元（已結清）；押金28000＋十月超付9334－短租違約11200－違約金14000－電費352＝應退11782元；預計10/27退款"};
    if(paid&&paidAt)checkout.refund_paid_date=paidAt;
    if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
    const weekly={id,kind:"refund",party:"中清1A房客",property_label:room,
      description:"退租退款｜押金28000＋10月超付9334－短租違約11200－違約金14000－電費352（已結清）",
      amount:11782,due_date:"2026-10-27",settlement_date:date,status:paid?"paid":"pending"};
    if(paid&&paidAt)weekly.paid_date=paidAt;
    if(previous)Object.assign(previous,weekly);else ops.weekly_accounts.push(weekly);
    let bank=finance.accounts.find(x=>x.id===id)||finance.accounts.find(x=>x.id===legacyId);
    if(!bank){bank={id};finance.accounts.push(bank)}
    Object.assign(bank,{id,bank_code:"812",bank_name:"台新銀行",bank_account_last4:"5883",secure_local:false,bank_account:""});
    finance.accounts=finance.accounts.filter((x,i,a)=>x.id!==legacyId&&a.findIndex(y=>y.id===x.id)===i);
    ops.vacancies=ops.vacancies.filter(x=>!(x.room==="中清9-1A"&&x.since===date&&x.source==="退租轉空房"));
    const later=ops.rented.some(x=>isRoom(x)&&String(x.updated_at||x.since||"")>date);
    if(!later){const vacant={room,address,status:"vacant",source:"退租轉空房",since:date,updated_at:date,rent:14000,power_rate:5.5,rent_pending:false};
      const prior=ops.vacancies.find(isRoom);if(prior)Object.assign(prior,vacant);else ops.vacancies.push(vacant);
      ops.rented=ops.rented.filter(x=>!isRoom(x));
    }
    ops.updated_at="2026-10-20T15:12:00+08:00";
    return s;
  }
  for(const method of ["unlock","auto","loadWithKey"]){
    const original=app[method];app[method]=async function(...args){return apply(await original.apply(this,args))};
  }
})();
