const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.resolve(__dirname,"../zhongmingnan867-r1-checkout.js"),"utf8");
const state=()=>({ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},
 finance:{accounts:[]},vault:{properties:[]}});
const load=s=>{const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
 vm.runInNewContext(src,{window:{HouseSecureApp:app}});return app};
const cid="checkout-zhongmingnan867-r1-20261109";
const wid="refund-zhongmingnan867-r1-20261109";
test("Zhongmingnan 867-R1 Nov 9 checkout records NT$297 discrepancy, not silently reconciled",async()=>{
 const s=state();
 s.ops.rented.push({room:"忠明南867-R1",address:"原有地址",rent:11000});
 const app=load(s);await app.unlock();
 const c=s.ops.checkouts.find(x=>x.id===cid);
 const w=s.ops.weekly_accounts.find(x=>x.id===wid);
 const b=s.finance.accounts.find(x=>x.id===wid);
 assert.equal(c.room,"忠明南867-R1");
 assert.equal(c.checkout_date,"2026-11-09");
 assert.equal(c.refund_due_date,"2026-11-10");
 assert.equal(c.deposit,22000);
 assert.equal(c.remaining_electricity_units,54);
 assert.equal(c.electricity_credit_rate,5.5);
 assert.equal(c.electricity_credit,54*5.5);
 assert.equal(c.calculated_refund_amount,22297);
 assert.equal(c.requested_refund_amount,22000);
 assert.equal(c.refund_amount,22000);
 assert.equal(c.reconciliation_difference,-297);
 assert.equal(c.reconciliation_status,"needs_confirmation");
 assert.match(c.note,/待確認/);
 assert.match(c.note,/22297/);
 assert.equal(c.refund_status,"pending");
 assert.equal(w.kind,"refund");
 assert.equal(w.amount,22000);
 assert.equal(w.due_date,"2026-11-10");
 assert.equal(w.status,"pending");
 assert.match(w.description,/差額297/);
 assert.equal(b.bank_code,"808");
 assert.equal(b.bank_name,"玉山銀行");
 assert.equal(b.bank_account_last4,"3713");
 assert.equal(s.ops.rented.length,0);
 assert.equal(s.ops.vacancies.length,1);
 assert.equal(s.ops.vacancies[0].address,"原有地址");
 assert.equal(s.ops.vacancies[0].rent,11000);
 await app.auto();await app.loadWithKey();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
 assert.equal(s.finance.accounts.length,1);
 assert.equal(s.ops.vacancies.length,1);
});
test("Zhongmingnan 867-R1 previously paid records and newer lease survive reload",async()=>{
 const s=state();
 s.ops.checkouts.push({id:cid,room:"忠明南867-R1",checkout_date:"2026-11-09",
   refund_status:"paid",refund_paid_date:"2026-11-10"});
 s.ops.weekly_accounts.push({id:wid,kind:"refund",property_label:"忠明南867-R1",
   status:"paid",paid_date:"2026-11-10"});
 s.ops.rented.push({room:"忠明南867-R1",status:"rented",updated_at:"2026-11-13",rent:12500});
 await load(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-10");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-10");
 assert.equal(s.ops.rented[0].rent,12500);
 assert.equal(s.ops.vacancies.length,0);
});
test("Zhongmingnan 867-R1 script is on all pages, direct bank account and Nov 10 cycle",()=>{
 for(const page of ["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"]){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+page),"utf8");
  assert.ok(html.includes('<script src="zhongmingnan867-r1-checkout.js"></script>'),page);
 }
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 assert.ok(weekly.includes('r.property_label==="忠明南867-R1"'));
 assert.ok(weekly.includes('bank_code:"808",bank_name:"玉山銀行",bank_account:"1104979303713"'));
 const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
 assert.ok(checkout.includes('r.room==="忠明南867-R1"&&r.refund_status!=="paid"?"1104979303713"'));
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'zhongmingnan867-r1-checkout.js'"));
 const source=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const ctx={window:{},Date,Intl};vm.runInNewContext(source,ctx);
 assert.equal(ctx.window.HouseAccounting.period({kind:"refund",
  settlement_date:"2026-11-09",due_date:"2026-11-10"}),"2026-11-10");
});
