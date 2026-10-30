const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.resolve(__dirname,"../fengjia701-checkout.js"),"utf8");
const state=()=>({ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},
finance:{accounts:[]},vault:{properties:[]}});
const load=s=>{
 const api={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
 vm.runInNewContext(src,{window:{HouseSecureApp:api}});
 return api;
};
test("Fengjia 701 Oct 29 checkout and Nov 3 refund totals are exact and nonduplicating",async()=>{
 const s=state(),app=load(s);
 s.ops.rented.push({room:"逢甲701",address:"既有地址",rent:12000,power_rate:5});
 await app.loadWithKey();
 const c=s.ops.checkouts[0],w=s.ops.weekly_accounts[0],b=s.finance.accounts[0];
 assert.equal(c.room,"逢甲701");
 assert.equal(c.checkout_date,"2026-10-29");
 assert.equal(c.refund_due_date,"2026-11-03");
 assert.equal(c.meter_current-c.meter_previous,303);
 assert.equal(c.electricity_usage,303);
 assert.equal(c.electricity_fee,c.electricity_usage*c.power_rate);
 assert.equal(c.deposit-c.electricity_fee,22485);
 assert.equal(c.refund_amount,22485);
 assert.equal(c.reconciliation_difference,0);
 assert.equal(c.reconciliation_status,"matched");
 assert.equal(c.utilities_status,"settled");
 assert.equal(c.refund_status,"pending");
 assert.equal(w.kind,"refund");
 assert.equal(w.property_label,"逢甲701");
 assert.equal(w.due_date,"2026-11-03");
 assert.equal(w.status,"pending");
 assert.equal(w.amount,22485);
 assert.equal(b.bank_code,"017");
 assert.equal(b.bank_name,"兆豐銀行");
 assert.equal(b.bank_account_last4,"2301");
 assert.equal(s.ops.rented.length,0);
 assert.equal(s.ops.vacancies[0].rent,12000);
 assert.equal(s.ops.vacancies[0].address,"既有地址");
 await app.unlock();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
 assert.equal(s.finance.accounts.length,1);
 assert.equal(s.ops.vacancies.length,1);
});
test("Fengjia 701 prior settlement remains paid and a newer lease is retained",async()=>{
 const s=state();
 s.ops.checkouts.push({id:"checkout-fengjia701-20261029",room:"逢甲701",
  checkout_date:"2026-10-29",refund_status:"paid",refund_paid_date:"2026-11-03"});
 s.ops.weekly_accounts.push({id:"refund-fengjia701-20261029",
  kind:"refund",property_label:"逢甲701",status:"paid",paid_date:"2026-11-03"});
 s.ops.rented.push({room:"逢甲701",address:"續租地址",rent:13500,
  updated_at:"2026-11-08",status:"rented"});
 await load(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].amount,22485);
 assert.equal(s.ops.rented.length,1);
 assert.equal(s.ops.rented[0].rent,13500);
 assert.equal(s.ops.vacancies.length,0);
 assert.equal(s.finance.accounts[0].bank_account,"");
});
test("Fengjia 701 is loaded on all pages with current Tuesday payout, account and history",()=>{
 for(const page of ["index.html","vacancy.html","checkout.html",
  "weekly-accounting.html","accounting-history.html"]){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+page),"utf8");
  assert.ok(html.includes('<script src="fengjia701-checkout.js"></script>'),page);
 }
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
 assert.ok(weekly.includes('r.property_label==="逢甲701"'));
 assert.ok(weekly.includes('bank_code:"017",bank_name:"兆豐銀行"'));
 assert.ok(weekly.includes('bank_account:"03210522301"'));
 assert.ok(checkout.includes('r.room==="逢甲701"&&r.refund_status!=="paid"?"03210522301"'));
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'fengjia701-checkout.js'"));
 const periodSrc=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const world={window:{},Date,Intl};
 vm.runInNewContext(periodSrc,world);
 assert.equal(world.window.HouseAccounting.period({kind:"refund",
   settlement_date:"2026-10-29",due_date:"2026-11-03"}),"2026-11-03");
});
