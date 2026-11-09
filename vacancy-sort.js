(function(){
 "use strict";
 // Keep the current vacancy list in newest move-out order, not the original data entry order.
 const roomKey=value=>String(value||"").trim().replace(/[\s_－-]/g,"").toUpperCase();
 const validDate=value=>{
  const date=String(value||"").slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:"";
 };
 function recentCheckoutDates(checkouts){
  const latest=new Map();
  for(const c of checkouts||[]){
   const key=roomKey(c?.room||c?.code),date=validDate(c?.checkout_date);
   if(key&&date&&date>(latest.get(key)||""))latest.set(key,date);
  }
  return latest;
 }
 function dateOf(v,latest){
  const since=validDate(v?.since);
  const checkout=latest.get(roomKey(v?.room||v?.code))||"";
  // The vacancy-since date can reflect a later handover; never let an older
  // historical checkout move a newer vacancy backwards.
  return since>checkout?since:checkout||since||validDate(v?.updated_at);
 }
 function sort(vacancies,checkouts,rented){
  const latest=recentCheckoutDates(checkouts);
  const rentedKeys=new Set((rented||[]).filter(r=>r?.status!=="vacant")
   .map(r=>roomKey(r?.room||r?.code)).filter(Boolean));
  return (vacancies||[]).filter(v=>!rentedKeys.has(roomKey(v?.room||v?.code)))
   .slice().sort((a,b)=>{
    const ad=dateOf(a,latest),bd=dateOf(b,latest);
    if(ad!==bd)return bd.localeCompare(ad);
    const ac=Boolean(latest.get(roomKey(a?.room||a?.code))||a?.source==="退租轉空房");
    const bc=Boolean(latest.get(roomKey(b?.room||b?.code))||b?.source==="退租轉空房");
    if(ac!==bc)return ac?-1:1;
    return String(a?.room||"").localeCompare(String(b?.room||""),"zh-Hant",{numeric:true});
   });
 }
 function date(v,checkouts){return dateOf(v,recentCheckoutDates(checkouts))}
 window.HouseVacancySort={sort,date};
})();
