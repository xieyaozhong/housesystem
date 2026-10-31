(function(){
"use strict";
const app=window.HouseSecureApp;
if(!app)throw Error("HouseSecureApp is required");
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const {ops,finance,vault}=s;
 ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
 const room="明德3D",date="2026-10-30",id="refund-mingde-3d-20261030",cid="checkout-mingde-3d-20261030";
 const match=x=>x?.room===room||x?.code===room;
 const old=ops.checkouts.find(x=>x.id===cid||(match(x)&&x.checkout_date===date));
 const oldWeekly=ops.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=old?.refund_status==="paid"||oldWeekly?.status==="paid";
 const paidDate=old?.refund_paid_date||oldWeekly?.paid_date;
 const existingVacancy=ops.vacancies.find(match);
 const existingRental=ops.rented.find(match);
 const address=old?.address||existingVacancy?.address||existingRental?.address||(vault.properties||[]).find(match)?.address||"";
 const checkout={id:cid,room,address,checkout_date:date,refund_due_date:"2026-11-03",
  refund_amount:16130,calculated_refund_amount:16130,reconciliation_difference:0,reconciliation_status:"matched",
  deposit:11000,termination_compensation:5500,
  meter_previous:6753,meter_current:6827,electricity_usage:74,
  power_rate:5,electricity_fee:370,utilities_status:"settled",refund_status:paid?"paid":"pending",
  note:"電表6827－6753＝74度；74×5元＝370元（已結清）；押金11000＋違約金5500－電費370＝應退16130元；預計11/3退款"};
 if(paid&&paidDate)checkout.refund_paid_date=paidDate;
 if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
 const weekly={id,kind:"refund",party:"明德3D房客",property_label:room,
  description:"退租退款｜押金11000＋違約補償5500－已結清電費（74度×5）370＝16130元",
  amount:16130,due_date:"2026-11-03",settlement_date:date,status:paid?"paid":"pending"};
 if(paid&&paidDate)weekly.paid_date=paidDate;
 if(oldWeekly)Object.assign(oldWeekly,weekly);else ops.weekly_accounts.push(weekly);
 let bank=finance.accounts.find(x=>x.id===id||x.id===oldWeekly?.id);
 if(!bank){bank={id};finance.accounts.push(bank)}
 Object.assign(bank,{id,bank_code:"700",bank_name:"中華郵政",
  bank_account_last4:"1667",secure_local:!paid,bank_account:paid?"":bank.bank_account||""});
 const later=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const vacancy={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant",power_rate:5};
  // Preserve a known monthly rent, but do not infer it from the deposit.
  if(existingVacancy)Object.assign(existingVacancy,vacancy);
  else{
   if(existingRental?.rent!=null)vacancy.rent=existingRental.rent;
   ops.vacancies.push(vacancy);
  }
  ops.rented=ops.rented.filter(x=>!match(x));
 }
 ops.updated_at="2026-10-31T13:42:00+08:00";
 return s;
}
for(const name of ["unlock","auto","loadWithKey"]){
 const original=app[name];
 app[name]=async function(...args){return apply(await original.apply(this,args))};
}
})();