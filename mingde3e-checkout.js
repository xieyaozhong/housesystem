(function(){
"use strict";
const app=window.HouseSecureApp;
if(!app)throw Error("HouseSecureApp is required");
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const {ops,finance,vault}=s;
 ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
 const room="明德3E",date="2026-10-29",id="refund-mingde-3e-20261029",cid="checkout-mingde-3e-20261029";
 const match=x=>x?.room===room||x?.code===room;
 const old=ops.checkouts.find(x=>x.id===cid||(match(x)&&x.checkout_date===date));
 const oldWeekly=ops.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=old?.refund_status==="paid"||oldWeekly?.status==="paid";
 const paidDate=old?.refund_paid_date||oldWeekly?.paid_date;
 const address=old?.address||ops.vacancies.find(match)?.address||ops.rented.find(match)?.address||(vault.properties||[]).find(match)?.address||"";
 const checkout={id:cid,room,address,checkout_date:date,refund_due_date:"2026-11-03",
  refund_amount:11840,requested_refund_amount:11840,calculated_refund_amount:11840,
  reconciliation_difference:0,reconciliation_status:"matched",
  deposit:10000,october_overpaid_rent:2000,meter_previous:3359,meter_current:3391,
  electricity_usage:32,power_rate:5,electricity_fee:160,utilities_status:"settled",
  refund_status:paid?"paid":"pending",
  note:"本期電3391－上期電3359＝32度；32×5元＝160元（結清）；押金10000＋10月租金溢繳2000－電費160＝確認應退11840元；預計11/3退款"};
 if(paidDate)checkout.refund_paid_date=paidDate;
 if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
 const weekly={id,kind:"refund",party:"明德3E房客",property_label:room,
  description:"退租退款｜已確認押金10000＋10月租金溢繳2000－已結清電費160＝11840元",
  amount:11840,due_date:"2026-11-03",settlement_date:date,status:paid?"paid":"pending"};
 if(paidDate)weekly.paid_date=paidDate;
 if(oldWeekly)Object.assign(oldWeekly,weekly);else ops.weekly_accounts.push(weekly);
 let bank=finance.accounts.find(x=>x.id===id);
 if(!bank){bank={id};finance.accounts.push(bank)}
 Object.assign(bank,{bank_code:"812",bank_name:"台新銀行",bank_account_last4:"7418",secure_local:false,bank_account:""});
 const later=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const prior=ops.vacancies.find(match);
  const vacancy={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant",power_rate:5};
  // A deposit is not reliable evidence of the monthly rent; preserve existing verified rent only.
  if(prior)Object.assign(prior,vacancy);else ops.vacancies.push(vacancy);
  ops.rented=ops.rented.filter(x=>!match(x));
 }
 ops.updated_at="2026-10-29T14:23:00+08:00";
 return s;
}
for(const name of ["unlock","auto","loadWithKey"]){
 const original=app[name];
 app[name]=async function(...args){return apply(await original.apply(this,args))};
}
})();