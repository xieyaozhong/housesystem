const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../mingde4d-checkout.js"),"utf8");
const make=()=>({ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented:[]},finance:{accounts:[]},vault:{properties:[]}});
function load(s){const api={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};vm.runInNewContext(source,{window:{HouseSecureApp:api}});return api}
test("Mingde 4D October 20 checkout and November 3 refund amounts are consistent",async()=>{
 const s=make();s.ops.rented.push({room:"明德4D",address:"原有地址",rent:8800,power_rate:5});
 const app=load(s);await app.unlock();
 const c=s.ops.checkouts.find(x=>x.room==="明德4D");
 const w=s.ops.weekly_accounts.find(x=>x.id==="refund-mingde-4d-20261020");
 const b=s.finance.accounts.find(x=>x.id===w.id);
 assert.equal(c.checkout_date,"2026-10-20");
 assert.equal(c.refund_due_date,"2026-11-03");
 assert.equal(c.meter_current-c.meter_previous,92);
 assert.equal(c.electricity_usage,92);
 assert.equal(c.electricity_fee,460);
 assert.equal(c.electricity_fee,c.electricity_usage*c.power_rate);
 assert.equal(c.deposit,11000);
 assert.equal(c.october_overpaid_rent,1833);
 assert.equal(c.termination_compensation,5500);
 assert.equal(c.deposit+c.october_overpaid_rent+c.termination_compensation-c.electricity_fee,17873);
 assert.equal(c.refund_amount,17873);
 assert.equal(c.reconciliation_difference,0);
 assert.equal(c.reconciliation_status,"matched");
 assert.equal(c.utilities_status,"settled");
 assert.equal(c.refund_status,"pending");
 assert.equal(w.amount,17873);
 assert.equal(w.status,"pending");
 assert.equal(w.due_date,"2026-11-03");
 assert.equal(b.bank_code,"822");
 assert.equal(b.bank_name,"中國信託");
 assert.equal(b.bank_account_last4,"0976");
 assert.equal(b.secure_local,true);
 assert.equal(s.ops.rented.length,0);
 assert.equal(s.ops.vacancies[0].address,"原有地址");
 assert.equal(s.ops.vacancies[0].rent,8800);
 await app.loadWithKey();
 assert.equal(s.ops.checkouts.length,1);
 assert.equal(s.ops.weekly_accounts.length,1);
 assert.equal(s.finance.accounts.length,1);
 assert.equal(s.ops.vacancies.length,1);
});
test("Mingde 4D paid refund and newer rental survive repeated unlocks",async()=>{
 const s=make();
 s.ops.checkouts.push({id:"checkout-mingde-4d-20261020",room:"明德4D",checkout_date:"2026-10-20",
   refund_status:"paid",refund_paid_date:"2026-11-03"});
 s.ops.weekly_accounts.push({id:"refund-mingde-4d-20261020",kind:"refund",
   property_label:"明德4D",settlement_date:"2026-10-20",status:"paid",paid_date:"2026-11-03"});
 s.ops.rented.push({room:"明德4D",address:"新房客",rent:9300,updated_at:"2026-11-08",status:"rented"});
 const app=load(s);await app.unlock();await app.loadWithKey();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-03");
 assert.equal(s.ops.weekly_accounts[0].amount,17873);
 assert.equal(s.ops.rented[0].rent,9300);
 assert.equal(s.ops.vacancies.length,0);
 assert.equal(s.finance.accounts[0].bank_account,"");
 assert.equal(s.finance.accounts[0].secure_local,false);
});
test("Mingde 4D refund appears in weekly, checkout and searchable history",()=>{
 for(const page of ["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"]){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+page),"utf8");
  assert.ok(html.includes('<script src="mingde4d-checkout.js"></script>'),page);
 }
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 assert.ok(weekly.includes("HouseAccounting.inCurrent(x,cycle)"));
 assert.ok(weekly.includes('function secureFinanceId(r)'));
 const history=fs.readFileSync(path.resolve(__dirname,"../accounting-history.js"),"utf8");
 assert.ok(history.includes('s.ops.weekly_accounts'));
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'mingde4d-checkout.js'"));
 const src=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const ctx={window:{},Date,Intl};vm.runInNewContext(src,ctx);
 assert.equal(ctx.window.HouseAccounting.period({kind:"refund",settlement_date:"2026-10-20",due_date:"2026-11-03"}),"2026-11-03");
});
