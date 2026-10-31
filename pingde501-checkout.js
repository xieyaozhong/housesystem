(function(){
"use strict";
const app=window.HouseSecureApp;
if(!app)throw Error("HouseSecureApp is required");
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const {ops,finance,vault}=s;
 ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
 const room="平德501",date="2026-10-30",cid="checkout-pingde501-20261030",id="refund-pingde501-20261030";
 const match=x=>x?.room===room||x?.code===room;
 const checkout=ops.checkouts.find(x=>x.id===cid||(match(x)&&x.checkout_date===date));
 const previous=ops.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=checkout?.refund_status==="paid"||previous?.status==="paid";
 const paidDate=checkout?.refund_paid_date||previous?.paid_date;
 const vacancy=ops.vacancies.find(match),rental=ops.rented.find(match);
 const address=checkout?.address||vacancy?.address||rental?.address||(vault.properties||[]).find(match)?.address||"";
 const newCheckout={id:cid,room,address,checkout_date:date,refund_due_date:"2026-11-03",
  deposit:26000,early_termination_penalty:13000,meter_previous:2591,meter_current:2751,
  electricity_usage:160,power_rate:5.5,electricity_fee:880,utilities_status:"settled",
  refund_amount:12120,calculated_refund_amount:12120,reconciliation_difference:0,
  reconciliation_status:"matched",refund_status:paid?"paid":"pending",
  note:"電表2751－2591＝160度，160×5.5＝880元（結清）；押金26000－違約退租13000－電費880＝應退12120元，預計11/3退款"};
 if(paid&&paidDate)newCheckout.refund_paid_date=paidDate;
 if(checkout)Object.assign(checkout,newCheckout);else ops.checkouts.push(newCheckout);
 const newWeekly={id,kind:"refund",party:"平德501房客",property_label:room,
  description:"退租退款｜押金26000－違約退租13000－已結清電費（160度×5.5）880＝12120元",
  amount:12120,settlement_date:date,due_date:"2026-11-03",status:paid?"paid":"pending"};
 if(paid&&paidDate)newWeekly.paid_date=paidDate;
 if(previous)Object.assign(previous,newWeekly);else ops.weekly_accounts.push(newWeekly);
 let bank=finance.accounts.find(x=>x.id===id||x.id===previous?.id);
 if(!bank){bank={id};finance.accounts.push(bank)}
 Object.assign(bank,{id,bank_code:"700",bank_name:"中華郵政",bank_account_last4:"1019",secure_local:false,bank_account:""});
 const later=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const newVacancy={room,address,source:"退租轉空房",since:date,updated_at:date,
   status:"vacant",power_rate:5.5};
  if(vacancy)Object.assign(vacancy,newVacancy);
  else{
   if(rental?.rent!=null)newVacancy.rent=rental.rent;
   ops.vacancies.push(newVacancy);
  }
  ops.rented=ops.rented.filter(x=>!match(x));
 }
 if(String(ops.updated_at||"")<"2026-10-31T15:17:00+08:00")
  ops.updated_at="2026-10-31T15:17:00+08:00";
 return s;
}
for(const name of ["unlock","auto","loadWithKey"]){
 const orig=app[name];
 app[name]=async function(...args){return apply(await orig.apply(this,args))};
}
})();