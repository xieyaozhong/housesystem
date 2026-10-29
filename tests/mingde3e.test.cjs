const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const patch=fs.readFileSync(path.resolve(__dirname,"../mingde3e-checkout.js"),"utf8");
const state=()=>({ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},finance:{accounts:[]},vault:{properties:[]}});
const load=s=>{const api={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
vm.runInNewContext(patch,{window:{HouseSecureApp:api}});
return api};
test("Mingde 3E reconciles 11840 with 915 discrepancy and Nov 3 due date",async()=>{
 const s=state(),app=load(s);await app.unlock();
 const c=s.ops.checkouts[0],w=s.ops.weekly_accounts[0],b=s.finance.accounts[0];
 assert.equal(c.room,"明德3E");
 assert.equal(c.checkout_date,"2026-10-29");
 assert.equal(c.refund_due_date,"2026-11-03");
 assert.equal(c.meter_current-c.meter_previous,32);
 assert.equal(c.electricity_fee,160);
 assert.equal(c.deposit+c.october_overpaid_rent-c.electricity_fee,11840);
 assert.equal(c.refund_amount,11840);
 assert.equal(c.requested_refund_amount,12755);
 assert.equal(c.reconciliation_difference,915);
 assert.equal(c.reconciliation_status,"needs_review");
 assert.equal(c.refund_status,"pending");
 assert.equal(w.amount,11840);
 assert.equal(w.due_date,"2026-11-03");
 assert.equal(w.status,"pending");
 assert.match(w.description,/待核對差額915元/);
 assert.equal(b.bank_code,"812");
 assert.equal(b.bank_account_last4,"7418");
 await app.loadWithKey();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
});
test("Mingde 3E retains paid status if subsequently settled",async()=>{
 const s=state();
 s.ops.checkouts.push({id:"checkout-mingde-3e-20261029",room:"明德3E",refund_status:"paid",refund_paid_date:"2026-11-03"});
 s.ops.weekly_accounts.push({id:"refund-mingde-3e-20261029",status:"paid",paid_date:"2026-11-03"});
 await load(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].amount,11840);
});
test("Mingde 3E script is deployed to all accounting views",()=>{
 for(const p of ["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"]){
 const html=fs.readFileSync(path.resolve(__dirname,"../"+p),"utf8");
 assert.ok(html.includes('mingde3e-checkout.js'),p);
 }
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'mingde3e-checkout.js'"));
});
