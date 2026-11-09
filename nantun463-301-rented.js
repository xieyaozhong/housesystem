(function(){
 "use strict";
 const app=window.HouseSecureApp;
 if(!app)throw Error("HouseSecureApp is required");
 const room="南屯463-301",updated="2026-11-09";
 const variants=new Set(["南屯463-301","南屯463－301","南屯463301"]);
 const roomKey=v=>String(v||"").trim().replace(/[\s_－-]/g,"");
 const keys=new Set([...variants].map(roomKey));
 const same=x=>keys.has(roomKey(x?.room||x?.code));
 async function apply(s){
  if(!s?.ops||!s?.vault)return s;
  const o=s.ops;
  o.vacancies||=[];o.rented||=[];
  const vacancies=o.vacancies.filter(same),rentals=o.rented.filter(same);
  const prevVacancy=vacancies[0],prevRental=rentals[0];
  const property=(s.vault.properties||[]).find(same);
  const existingLease=prevRental||prevVacancy||{};
  const address=prevRental?.address||prevVacancy?.address||property?.address||"";
  const confirmed={...existingLease,room,address,status:"rented",
   updated_at:updated,source:"已出租（2026/11/9 確認狀態；實際起租日與新租金待補）",
   rent_unverified:true,lease_start_pending:true};
  delete confirmed.since;
  delete confirmed.rent_pending;
  o.vacancies=o.vacancies.filter(x=>!same(x));
  o.rented=o.rented.filter(x=>!same(x));
  o.rented.push(confirmed);
  if(String(o.updated_at||"")<"2026-11-09T16:36:00+08:00")
   o.updated_at="2026-11-09T16:36:00+08:00";
  return s;
 }
 for(const name of ["unlock","auto","loadWithKey"]){
  const original=app[name];
  app[name]=async function(...args){return apply(await original.apply(this,args))};
 }
})();