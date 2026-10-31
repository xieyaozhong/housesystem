(function(){
 const app=window.HouseSecureApp;
 async function apply(s){
  if(!s?.ops||!s?.finance||!s?.vault)return s;
  const o=s.ops; o.checkouts||=[];o.weekly_accounts||=[];
  const id="refund-mingde-4b-20261030",cid="checkout-mingde-4b-20261030";
  const old=o.checkouts.find(x=>x.id===cid),w=o.weekly_accounts.find(x=>x.id===id);
  const paid=old?.refund_status==="paid"||w?.status==="paid";
  const row={id:cid,room:"明德4B",checkout_date:"2026-10-30",refund_due_date:"2026-11-03",deposit:11000,termination_compensation:5500,internet_subsidy:500,meter_previous:8727,meter_current:8775,electricity_usage:48,power_rate:5,electricity_fee:240,refund_amount:16760,refund_status:paid?"paid":"pending"};
  if(old)Object.assign(old,row);else o.checkouts.push(row);
  const weekly={id,kind:"refund",party:"明德4B房客",property_label:"明德4B",amount:16760,due_date:"2026-11-03",settlement_date:"2026-10-30",status:paid?"paid":"pending"};
  if(w)Object.assign(w,weekly);else o.weekly_accounts.push(weekly);
  const accounts=s.finance.accounts||=[];
  let bank=accounts.find(x=>x.id===id);
  if(!bank){bank={id};accounts.push(bank)}
  Object.assign(bank,{bank_code:"808",bank_name:"玉山銀行",bank_account_last4:"9661",secure_local:false,bank_account:""});
  return s;
 }
 for(const name of ["unlock","auto","loadWithKey"]){
  const old=app[name];app[name]=async function(...args){return apply(await old.apply(this,args))};
 }
})();