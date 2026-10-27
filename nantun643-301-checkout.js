(function(){
"use strict";
const app=window.HouseSecureApp;
async function apply(s){
 if(!s?.ops||!s?.finance||!s?.vault)return s;
 const o=s.ops,f=s.finance;
 o.checkouts||=[];o.weekly_accounts||=[];o.vacancies||=[];o.rented||=[];f.accounts||=[];
 const room="南屯643-301",date="2026-10-14",id="refund-nantun643-301-20261014",cid="checkout-nantun643-301-20261014";
 const old=o.checkouts.find(x=>x.id===cid||(x.room===room&&x.checkout_date===date));
 const prior=o.weekly_accounts.find(x=>x.id===id||(x.kind==="refund"&&x.property_label===room&&x.settlement_date===date));
 const paid=true;
 const when="2026-10-27";
 const c={id:cid,room,checkout_date:date,refund_due_date:"2026-10-27",refund_amount:28588,
  deposit:38000,previous_overpayment:289,meter_previous:12842,meter_current:13600,
  electricity_usage:758,power_rate:5.5,electricity_fee:4169,utilities_status:"settled",
  overstay_days:4,overstay_daily_rate:633,overstay_rent:2532,cleaning_fee:3000,
  refund_status:paid?"paid":"pending",
  note:"押金38000＋上期多匯289－電費4169（758度×5.5，已結清）－超租2532（4天×633）－清潔費3000＝應退28588"};
 if(when)c.refund_paid_date=when;
 if(old)Object.assign(old,c);else o.checkouts.push(c);
 const w={id,kind:"refund",party:"南屯643-301房客",property_label:room,
  description:c.note,amount:28588,due_date:"2026-10-27",settlement_date:date,status:paid?"paid":"pending"};
 if(when)w.paid_date=when;
 if(prior)Object.assign(prior,w);else o.weekly_accounts.push(w);
 let b=f.accounts.find(x=>x.id===id);
 if(!b){b={id};f.accounts.push(b)}
 Object.assign(b,{bank_code:"700",bank_name:"中華郵政",bank_account_last4:"8183",secure_local:false,bank_account:""});
 const later=o.rented.some(x=>x.room===room&&String(x.updated_at||x.since||"")>date);
 if(!later){
  const address=o.vacancies.find(x=>x.room===room)?.address||o.rented.find(x=>x.room===room)?.address||"";
  const v={room,address,source:"退租轉空房",since:date,updated_at:date,status:"vacant",rent:19000,power_rate:5.5};
  const previous=o.vacancies.find(x=>x.room===room);
  if(previous)Object.assign(previous,v);else o.vacancies.push(v);
  o.rented=o.rented.filter(x=>x.room!==room);
 }
 o.updated_at="2026-10-27T22:33:00+08:00";
 return s;
}
for(const m of ["unlock","auto","loadWithKey"]){
 const orig=app[m];app[m]=async function(...args){return apply(await orig.apply(this,args))};
}
})();