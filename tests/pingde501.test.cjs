const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../pingde501-checkout.js"),"utf8");
function initial(){return {ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},
  finance:{accounts:[]},vault:{properties:[]}}}
function loader(s){
 const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
 vm.runInNewContext(source,{window:{HouseSecureApp:app}});
 return app;
}
test("Pingde 501 Oct 30 refund NT$12,120 matches electricity and penalty",async()=>{
 const s=initial();s.ops.rented.push({room:"平德501",rent:13000,address:"原地址",power_rate:5.5});
 const app=loader(s);await app.unlock();
 const c=s.ops.checkouts[0],w=s.ops.weekly_accounts[0],b=s.finance.accounts[0];
 assert.equal(c.room,"平德501");
 assert.equal(c.checkout_date,"2026-10-30");
 assert.equal(c.refund_due_date,"2026-11-03");
 assert.equal(c.deposit,26000);
 assert.equal(c.early_termination_penalty,13000);
 assert.equal(c.meter_previous,2591);
 assert.equal(c.meter_current,2751);
 assert.equal(c.electricity_usage,c.meter_current-c.meter_previous);
 assert.equal(c.electricity_fee,c.electricity_usage*c.power_rate);
 assert.equal(c.electricity_fee,880);
 assert.equal(c.deposit-c.early_termination_penalty-c.electricity_fee,12120);
 assert.equal(c.refund_amount,12120);
 assert.equal(c.reconciliation_difference,0);
 assert.equal(c.refund_status,"pending");
 assert.equal(w.kind,"refund");
 assert.equal(w.property_label,"平德501");
 assert.equal(w.amount,12120);
 assert.equal(w.due_date,"2026-11-03");
 assert.equal(w.status,"pending");
 assert.equal(b.bank_code,"700");
 assert.equal(b.bank_name,"中華郵政");
 assert.equal(b.bank_account_last4,"1019");
 assert.equal(s.ops.vacancies[0].rent,13000);
 assert.equal(s.ops.vacancies[0].address,"原地址");
 assert.equal(s.ops.rented.length,0);
 await app.auto();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
 assert.equal(s.ops.vacancies.length,1);
 assert.equal(s.finance.accounts.length,1);
});
test("Pingde 501 paid refund and new rental survive future unlocks",async()=>{
 const s=initial();
 s.ops.checkouts.push({id:"checkout-pingde501-20261030",room:"平德501",checkout_date:"2026-10-30",
  refund_status:"paid",refund_paid_date:"2026-11-03"});
 s.ops.weekly_accounts.push({id:"refund-pingde501-20261030",status:"paid",paid_date:"2026-11-03"});
 s.ops.rented.push({room:"平德501",updated_at:"2026-11-10",rent:13000});
 await loader(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].amount,12120);
 assert.equal(s.finance.accounts[0].bank_account,"");
 assert.equal(s.ops.vacancies.length,0);
 assert.equal(s.ops.rented.length,1);
});
test("Pingde 501 loads across all five pages, full bank account and next Tuesday",()=>{
 for(const page of ["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"]){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+page),"utf8");
  assert.ok(html.includes('<script src="pingde501-checkout.js"></script>'),page);
 }
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 assert.ok(weekly.includes('r.property_label==="平德501"'));
 assert.ok(weekly.includes('bank_code:"700",bank_name:"中華郵政",bank_account:"00212730881019"'));
 assert.ok(weekly.includes("HouseAccounting.inCurrent(x,cycle)"));
 const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
 assert.ok(checkout.includes('r.room==="平德501"&&r.refund_status!=="paid"?"00212730881019"'));
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'pingde501-checkout.js'"));
 const cycleScript=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const ctx={window:{},Date,Intl};vm.runInNewContext(cycleScript,ctx);
 assert.equal(ctx.window.HouseAccounting.period({kind:"refund",
  settlement_date:"2026-10-30",due_date:"2026-11-03"}),"2026-11-03");
});
