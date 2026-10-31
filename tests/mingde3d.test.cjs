const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const code=fs.readFileSync(path.resolve(__dirname,"../mingde3d-checkout.js"),"utf8");
const empty=()=>({ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},
finance:{accounts:[]},vault:{properties:[]}});
const load=s=>{const a={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
vm.runInNewContext(code,{window:{HouseSecureApp:a}});return a};
test("Mingde 3D 2026-10-30 refund amount and Nov 3 bank details",async()=>{
 const s=empty(),a=load(s);
 s.ops.rented.push({room:"明德3D",address:"現有地址",rent:9500,power_rate:5});
 await a.unlock();
 const c=s.ops.checkouts[0],w=s.ops.weekly_accounts[0],b=s.finance.accounts[0];
 assert.equal(c.room,"明德3D");
 assert.equal(c.checkout_date,"2026-10-30");
 assert.equal(c.refund_due_date,"2026-11-03");
 assert.equal(c.meter_previous,6753);
 assert.equal(c.meter_current,6827);
 assert.equal(c.meter_current-c.meter_previous,74);
 assert.equal(c.electricity_usage,74);
 assert.equal(c.power_rate,5);
 assert.equal(c.electricity_fee,370);
 assert.equal(c.deposit+c.termination_compensation-c.electricity_fee,16130);
 assert.equal(c.refund_amount,16130);
 assert.equal(c.reconciliation_difference,0);
 assert.equal(c.refund_status,"pending");
 assert.equal(w.amount,16130);
 assert.equal(w.due_date,"2026-11-03");
 assert.equal(w.status,"pending");
 assert.equal(b.bank_code,"700");
 assert.equal(b.bank_name,"中華郵政");
 assert.equal(b.bank_account_last4,"1667");
 assert.equal(b.secure_local,true);
 assert.equal(s.ops.vacancies[0].rent,9500);
 assert.equal(s.ops.rented.length,0);
 await a.loadWithKey();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
 assert.equal(s.ops.vacancies.length,1);
});
test("Mingde 3D preserves paid status and later rental",async()=>{
 const s=empty();
 s.ops.checkouts.push({id:"checkout-mingde-3d-20261030",room:"明德3D",
   checkout_date:"2026-10-30",refund_status:"paid",refund_paid_date:"2026-11-03"});
 s.ops.weekly_accounts.push({id:"refund-mingde-3d-20261030",
   status:"paid",paid_date:"2026-11-03"});
 s.ops.rented.push({room:"明德3D",rent:10200,updated_at:"2026-11-09"});
 await load(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-03");
 assert.equal(s.ops.rented[0].rent,10200);
 assert.equal(s.ops.vacancies.length,0);
 assert.equal(s.finance.accounts[0].secure_local,false);
});
test("Mingde 3D checkout is published in management and historic views",()=>{
 for(const p of ["index.html","vacancy.html","checkout.html","accounting-history.html"]){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+p),"utf8");
  assert.ok(html.includes('<script src="mingde3d-checkout.js"></script>'),p);
 }
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'mingde3d-checkout.js'"));
 const src=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const world={window:{},Date,Intl};vm.runInNewContext(src,world);
 assert.equal(world.window.HouseAccounting.period({kind:"refund",
    settlement_date:"2026-10-30",due_date:"2026-11-03"}),"2026-11-03");
});
