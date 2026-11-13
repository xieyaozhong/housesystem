const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

const code=fs.readFileSync(path.join(__dirname,"../accounting-periods.js"),"utf8");
const context={window:{},Date,Intl};
vm.runInNewContext(code,context,{filename:"accounting-periods.js"});
const H=context.window.HouseAccounting;

test("Unpaid records continue to appear after their settlement week closes",()=>{
 const rows=[
  {id:"old",kind:"vendor",status:"pending",amount:500,settlement_date:"2026-09-15"},
  {id:"current",kind:"refund",status:"pending",amount:1600,settlement_date:"2026-11-10"},
  {id:"paid",kind:"vendor",status:"paid",amount:1000,settlement_date:"2026-08-18"},
  {id:"undated",kind:"refund",amount:700},
  {id:"void",kind:"vendor",status:"pending",amount:50,__deleted:true}
 ];
 assert.deepEqual(Array.from(H.pendingPayables(rows),x=>x.id),["old","current","undated"]);
 assert.deepEqual(Array.from(H.completedPayables(rows),x=>x.id),["paid"]);
 assert.equal(H.period(rows[0]),"2026-09-15");
 assert.equal(rows.length,5,"the status views must never delete underlying history");
});
test("Updating payment state moves an item between current pending and history, not vice versa",()=>{
 const row={id:"repair",kind:"vendor",status:"pending",settlement_date:"2026-08-18"};
 assert.equal(H.pendingPayables([row]).length,1);
 assert.equal(H.completedPayables([row]).length,0);
 row.status="paid";row.paid_date="2026-11-13";
 assert.equal(H.pendingPayables([row]).length,0);
 assert.equal(H.completedPayables([row]).length,1);
 row.status="pending";delete row.paid_date;
 assert.equal(H.pendingPayables([row]).length,1);
 assert.equal(H.completedPayables([row]).length,0);
});
