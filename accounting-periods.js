(function(){
  "use strict";
  // A settlement cycle starts on Wednesday and closes on Tuesday (Asia/Taipei).
  const iso=/^\d{4}-\d{2}-\d{2}$/;
  function toUTC(s){
    if(!iso.test(String(s||"")))return null;
    const [y,m,d]=s.split("-").map(Number),v=new Date(Date.UTC(y,m-1,d));
    return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d?v:null;
  }
  const dateString=d=>d.toISOString().slice(0,10);
  function addDays(s,n){const d=toUTC(s);if(!d)return"";d.setUTCDate(d.getUTCDate()+n);return dateString(d)}
  function tuesday(s){const d=toUTC(s);if(!d)return"";d.setUTCDate(d.getUTCDate()+((2-d.getUTCDay()+7)%7));return dateString(d)}
  function todayTaiwan(){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const n=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return n.year+"-"+n.month+"-"+n.day;
  }
  function current(){return tuesday(todayTaiwan())}
  function dated(r){
    // Refund due date is the intended payment cycle; vendor settlement dates may
    // still be Fridays in historical data, and roll forward to the following Tuesday.
    return r.kind==="refund"?(r.due_date||r.settlement_date||r.date||""):
      (r.due_date||r.settlement_date||r.date||"");
  }
  function period(r){return tuesday(dated(r))}
  function pettyPeriod(r){return tuesday(r.date)}
  function start(cycle){return addDays(cycle,-6)}
  function label(cycle){return cycle?(start(cycle)+" ～ "+cycle+"（週二結算）"):"未排定"}
  const inCurrent=(r,cycle=current())=>period(r)===cycle;
  function sortRows(rows){
    return rows.slice().sort((a,b)=>String(period(b)).localeCompare(String(period(a)))||
      String(dated(b)).localeCompare(String(dated(a)))||String(a.party||"").localeCompare(String(b.party||"")));
  }
  window.HouseAccounting={addDays,tuesday,todayTaiwan,current,dated,period,pettyPeriod,start,label,inCurrent,sortRows};
})();