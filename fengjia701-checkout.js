(function(){
"use strict";
const app=window.HouseSecureApp;
if(!app)throw Error("HouseSecureApp is required");
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const {ops,finance,vault}=s;
 ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
 const room="逢甲701",date="2026-10-29",id="refund-fengjia701-20261029",cid="checkout-fengjia701-20261029";
 const match=x=>x?.room===room||x?.code===room;
 const old=ops.checkouts.find(x=>x.id===cid||(match(x)&&x.checkout_date===date));
 const oldWeekly=ops.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=old?.refund_status==="paid"||oldWeekly?.status==="paid";
 const paidDate=old?.refund_paid_date||oldWeekly?.paid_date;
 const existingVacancy=ops.vacancies.find(match);
 const existingRental=ops.rented.find(match);
 const address=old?.address||existingVacancy?.address||existingRental?.address||(vault.properties||[]).find(match)?.address||"";
 const checkout={id:cid,room,address,checkout_date:date,refund_due_date:"2026-11-03",
  refund_amount:22485,calculated_refund_amount:22485,reconciliation_difference:0,reconciliation_status:"matched",
  deposit:24000,meter_previous:18531,meter_current:18834,electricity_usage:303,
  power_rate:5,electricity_fee:1515,utilities_status:"settled",refund_status:paid?"paid":"pending",
  note:"電表18834－18531＝303度；303×5元＝1515元（已結清）；押金24000－電費1515＝應退22485元；預計11/3退款"};
 if(paid&&paidDate)checkout.refund_paid_date=paidDate;
 if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
 const weekly={id,kind:"refund",party:"逢甲701房客",property_label:room,
  description:"退租退款｜押金24000－已結清電費（303度×5）1515＝22485元",
  amount:22485,due_date:"2026-11-03",settlement_date:date,status:paid?"paid":"pending"};
 if(paid&&paidDate)weekly.paid_date=paidDate;
 if(oldWeekly)Object.assign(oldWeekly,weekly);else ops.weekly_accounts.push(weekly);
 let bank=finance.accounts.find(x=>x.id===id||x.id===oldWeekly?.id);
 if(!bank){bank={id};finance.accounts.push(bank)}
 Object.assign(bank,{id,bank_code:"017",bank_name:"兆豐銀行",
  bank_account_last4:"2301",secure_local:false,bank_account:""});
 const later=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const vacancy={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant",power_rate:5};
  // Preserve an existing verified rent; deposit alone does not establish monthly rent.
  if(existingVacancy)Object.assign(existingVacancy,vacancy);
  else {
   if(existingRental?.rent!=null)vacancy.rent=existingRental.rent;
   ops.vacancies.push(vacancy);
  }
  ops.rented=ops.rented.filter(x=>!match(x));
 }
 ops.updated_at="2026-10-30T20:38:00+08:00";
 return s;
}
for(const name of ["unlock","auto","loadWithKey"]){
 const original=app[name];
 app[name]=async function(...args){return apply(await original.apply(this,args))};
}
})();