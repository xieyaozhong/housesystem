(function(){
"use strict";
const app=window.HouseSecureApp;
async function apply(s){
  if(!s?.ops||!s?.finance||!s?.vault)return s;
  const {ops,finance,vault}=s;
  ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
  const room="明德2A",date="2026-10-15",id="refund-mingde-2a-20261015",checkoutId="checkout-mingde-2a-20261015";
  const match=x=>x?.room===room||x?.code===room;
  const old=ops.checkouts.find(x=>x.id===checkoutId||(x.room===room&&x.checkout_date===date));
  const oldWeekly=ops.weekly_accounts.find(x=>x.id===id);
  const paid=old?.refund_status==="paid"||oldWeekly?.status==="paid";
  const paidDate=old?.refund_paid_date||oldWeekly?.paid_date;
  const address=ops.vacancies.find(match)?.address||ops.rented.find(match)?.address||(vault.properties||[]).find(match)?.address||"";
  const checkout={id:checkoutId,room,address,checkout_date:date,refund_due_date:"2026-10-27",
    refund_amount:12755,deposit:12000,termination_compensation:6000,internet_subsidy:250,
    october_rent:3000,other_fee:100,meter_previous:625,meter_current:1104,
    electricity_usage:479,power_rate:5,electricity_fee:2395,utilities_status:"settled",
    refund_status:paid?"paid":"pending",
    note:"電1104－625＝479度；479×5＝2395元（結清）；押金12000＋違約補償6000＋網路補助250－十月租金3000－其他費100－電費2395＝應退12755元"};
  if(paidDate)checkout.refund_paid_date=paidDate;
  if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
  const weekly={id,kind:"refund",party:"明德2A房客",property_label:room,
    description:"退租退款｜押金12000＋違約補償6000＋網路補助250－10月租金3000－其他費100－已結清電費2395",
    amount:12755,due_date:"2026-10-27",settlement_date:date,status:paid?"paid":"pending"};
  if(paidDate)weekly.paid_date=paidDate;
  if(oldWeekly)Object.assign(oldWeekly,weekly);else ops.weekly_accounts.push(weekly);
  let bank=finance.accounts.find(x=>x.id===id);
  if(!bank){bank={id};finance.accounts.push(bank)}
  Object.assign(bank,{bank_code:"812",bank_name:"台新銀行",bank_account_last4:"1568",secure_local:!paid,bank_account:paid?"":bank.bank_account||""});
  const rentedLater=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
  if(!rentedLater){
    const vacant={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant",rent:6000,rent_pending:false,power_rate:5};
    const prior=ops.vacancies.find(match);
    if(prior)Object.assign(prior,vacant);else ops.vacancies.push(vacant);
    ops.rented=ops.rented.filter(x=>!match(x));
  }
  ops.updated_at="2026-10-26T15:48:00+08:00";
  return s;
}
for(const method of ["unlock","auto","loadWithKey"]){
  const original=app[method];
  app[method]=async function(...args){return apply(await original.apply(this,args))};
}
})();