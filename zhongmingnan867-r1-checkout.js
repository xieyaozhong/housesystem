(function(){
"use strict";
const app=window.HouseSecureApp;
if(!app)throw Error("HouseSecureApp is required");
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const {ops,finance,vault}=s;
 ops.checkouts||=[];ops.weekly_accounts||=[];ops.vacancies||=[];ops.rented||=[];finance.accounts||=[];
 const room="忠明南867-R1",date="2026-11-09",id="refund-zhongmingnan867-r1-20261109",cid="checkout-zhongmingnan867-r1-20261109";
 const match=x=>String(x?.room||x?.code||"").trim().replace(/[\s_－-]/g,"").toUpperCase()===room.replace(/[\s_－-]/g,"").toUpperCase();
 const old=ops.checkouts.find(x=>x.id===cid||(match(x)&&x.checkout_date===date));
 const oldWeekly=ops.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=old?.refund_status==="paid"||oldWeekly?.status==="paid";
 const paidDate=old?.refund_paid_date||oldWeekly?.paid_date;
 const formerVacancy=ops.vacancies.find(match),formerRental=ops.rented.find(match);
 const address=old?.address||formerVacancy?.address||formerRental?.address||(vault.properties||[]).find(match)?.address||"";
 // The confirmed refund is deposit NT$22,000 plus NT$297 electricity credit.
 const checkout={id:cid,room,address,checkout_date:date,refund_due_date:"2026-11-10",
  refund_amount:22297,requested_refund_amount:22297,calculated_refund_amount:22297,
  reconciliation_difference:0,reconciliation_status:"confirmed",
  deposit:22000,remaining_electricity_units:54,electricity_credit_rate:5.5,
  electricity_credit:297,electricity_credit_direction:"add_to_deposit",
  refund_status:paid?"paid":"pending",
  note:"應退22,297元：押金22,000元＋剩餘電費54度×5.5元＝297元（加回）；預計2026/11/10退款，實際匯款完成後再標記已付"};
 if(paid&&paidDate)checkout.refund_paid_date=paidDate;
 if(old)Object.assign(old,checkout);else ops.checkouts.push(checkout);
 const weekly={id,kind:"refund",party:"忠明南867-R1房客",property_label:room,
  description:"退租退款｜押金22,000元＋剩餘電費297元（54度×5.5元）＝22,297元",
  amount:22297,due_date:"2026-11-10",settlement_date:date,status:paid?"paid":"pending"};
 if(paid&&paidDate)weekly.paid_date=paidDate;
 if(oldWeekly)Object.assign(oldWeekly,weekly);else ops.weekly_accounts.push(weekly);
 let bank=finance.accounts.find(x=>x.id===id);
 if(!bank){bank={id};finance.accounts.push(bank)}
 Object.assign(bank,{id,bank_code:"808",bank_name:"玉山銀行",bank_account_last4:"3713",secure_local:false,bank_account:""});
 const later=ops.rented.some(x=>match(x)&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const vacancy={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant"};
  if(formerVacancy)Object.assign(formerVacancy,vacancy);
  else{
   if(formerRental?.rent!=null)vacancy.rent=formerRental.rent;
   if(formerRental?.power_rate!=null)vacancy.power_rate=formerRental.power_rate;
   ops.vacancies.push(vacancy);
  }
  ops.rented=ops.rented.filter(x=>!match(x));
 }
 if(String(ops.updated_at||"")<"2026-11-09T16:36:00+08:00")
   ops.updated_at="2026-11-09T16:36:00+08:00";
 return s;
}
for(const name of ["unlock","auto","loadWithKey"]){
 const original=app[name];
 app[name]=async function(...args){return apply(await original.apply(this,args))};
}
})();