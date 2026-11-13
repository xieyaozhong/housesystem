(function(root){
"use strict";
// Read-only searchable index built from the decrypted property master plus
// operations/history. Nothing is uploaded while the user is typing.
const norm=v=>String(v??"").trim().replace(/[\s_－-]/g,"").replace(/[陜陕]/g,"陝").replace(/臺/g,"台").toUpperCase();
const text=v=>String(v??"").trim();
function records(session){
 const found=new Map();
 const push=(row,source)=>{
  const code=text(row.code||row.room),address=text(row.address||"");
  if(!code)return;
  const key=norm(code)+"|"+norm(address);
  if(!key||key==="|")return;
  const existing=found.get(key);
  const more={
   id:source==="master"?String(row.id??""):"",
   code,address,source,
   deposit:row.deposit??(Number(row.rent)>0?Number(row.rent)*2:null),
   power_rate:row.power_rate??null,
   power_billing:row.power_billing||null
  };
  if(existing){
   if(!existing.id&&more.id)existing.id=more.id;
   if(existing.deposit==null&&more.deposit!=null)existing.deposit=more.deposit;
   if(existing.power_rate==null&&more.power_rate!=null)existing.power_rate=more.power_rate;
   if(!existing.power_billing&&more.power_billing)existing.power_billing=more.power_billing;
   if(source==="master")existing.source="master";
  }else found.set(key,more);
 };
 for(const row of session?.vault?.properties||[])push(row,"master");
 for(const row of session?.ops?.rented||[])push(row,"rented");
 for(const row of session?.ops?.vacancies||[])push(row,"vacant");
 for(const row of session?.ops?.checkouts||[])push(row,"history");
 return [...found.values()];
}
function search(session,query,limit=10){
 const q=norm(query);if(!q)return[];
 const terms=text(query).split(/\s+/).map(norm).filter(Boolean);
 return records(session).map((item,index)=>{
  const a=norm(item.code),b=norm(item.address),full=a+" "+b;
  if(!terms.every(t=>full.includes(t)))return null;
  let rank=a===q?0:b===q?1:a.startsWith(q)?2:b.startsWith(q)?3:
   a.includes(q)?4:b.includes(q)?5:6;
  if(item.source!=="master")rank+=0.3;
  return {...item,rank,index};
 }).filter(Boolean)
 .sort((a,b)=>a.rank-b.rank||a.index-b.index)
 .slice(0,Math.min(Math.max(Number(limit)||10,1),30))
 .map(({rank,index,...record})=>record);
}
function byRoom(session,room){
 const code=norm(room);
 return records(session).filter(item=>norm(item.code)===code)
  .sort((a,b)=>(a.id?0:1)-(b.id?0:1));
}
root.HousePropertyLookup={norm,records,search,byRoom};
})(window);
