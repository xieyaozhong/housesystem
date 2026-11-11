(function(){
 "use strict";
 // One-time historical settlement instruction as of 2026-11-11:
 // all existing vendor/refund payables dated on/before this date are paid,
 // EXCEPT Zhongmingnan 867-R1 refund and Minsheng 303 water-heater repair.
 // Do not infer an actual payment date. Keep prior paid dates unchanged.
 const api=window.HouseSecureApp;
 if(!api)throw new Error("HouseSecureApp is required");
 const CUTOFF="2026-11-11",CONFIRMED_ON="2026-11-11";
 const norm=value=>String(value||"").trim().replace(/[\s_－-]/g,"").toUpperCase();
 const dateOf=row=>String(row?.record_date||row?.settlement_date||row?.checkout_date||row?.date||row?.due_date||"").slice(0,10);
 const inScope=row=>{
  const date=dateOf(row);
  return (!date||date<=CUTOFF)&&row?.status!=="void"&&!row?.__deleted;
 };
 const isZhongming=row=>{
  const label=norm(row?.room||row?.property_label||row?.code);
  return row?.id==="refund-zhongmingnan867-r1-20261109"||
   row?.id==="checkout-zhongmingnan867-r1-20261109"||
   (label.includes("忠明南")&&label.includes("R1"));
 };
 const isMinshengHeater=row=>{
  const label=norm(row?.property_label||row?.room||row?.code);
  const desc=String(row?.description||row?.note||"");
  return row?.id==="vendor-hongmao-minsheng303-waterheater-wiring-20261109"||
   (label.includes("民生303")&&/熱水器/.test(desc));
 };
 function apply(session){
  if(!session?.ops)return session;
  const ops=session.ops;
  for(const row of ops.weekly_accounts||[]){
   if(!row||!inScope(row)||!["refund","vendor"].includes(row.kind))continue;
   if(isZhongming(row)||isMinshengHeater(row))continue;
   if(row.status!=="paid"){
    row.status="paid";
    row.payment_status_confirmed_on=CONFIRMED_ON;
    // paid_date represents the actual transfer date; do not guess it.
   }
  }
  for(const row of ops.checkouts||[]){
   if(!row||!inScope(row)||isZhongming(row))continue;
   if(row.refund_status==="void"||row.refund_status==="cancelled")continue;
   if(row.refund_status!=="paid"){
    row.refund_status="paid";
    row.payment_status_confirmed_on=CONFIRMED_ON;
    // Keep refund_paid_date unset when the actual payment date is unknown.
   }
  }
  if(String(ops.updated_at||"")<"2026-11-11T11:15:00+08:00")
   ops.updated_at="2026-11-11T11:15:00+08:00";
  return session;
 }
 // Install last so individual checkout/repair data modules cannot overwrite status.
 for(const name of ["unlock","auto","loadWithKey"]){
  const previous=api[name];
  if(typeof previous!=="function")continue;
  api[name]=async function(...args){return apply(await previous.apply(this,args))};
 }
})();
