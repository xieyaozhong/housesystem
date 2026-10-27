const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const {TextEncoder,TextDecoder}=require("node:util");
const fs=require("node:fs");
const path=require("node:path");
const patch=fs.readFileSync(path.resolve(__dirname,"../mingde-checkouts.js"),"utf8");
const expect={
  "明德2D":{date:"2026-10-15",amount:14800,due:"2026-10-20",meter:40,fee:200,last4:"3491"},
  "明德3B":{date:"2026-10-02",amount:3710,due:"2026-10-20",meter:378,fee:1890,last4:"3791"}
};
function session(rented=[]){return{key:{},ops:{checkouts:[],weekly_accounts:[],vacancies:[],rented},finance:{accounts:[]},vault:{properties:[]}}}
function load(s, saved){
  const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
  const context={TextEncoder,TextDecoder,window:{HouseSecureApp:app,HouseCore:{readConfig:()=>null}},
    localStorage:{getItem:key=>saved?.[key]||null},
    HouseTrusted:{decryptVaultWithKey:async blob=>blob},
    console:{warn:()=>{}}};
  vm.runInNewContext(patch,context,{filename:"mingde-checkouts.js"});
  const cloud=fs.readFileSync(path.resolve(__dirname,"../mingde-finance-cloud.js"),"utf8");
  vm.runInNewContext(cloud,context,{filename:"mingde-finance-cloud.js"});
  return app;
}
test("two paid Mingde refunds retain their checkout history without bank accounts",async()=>{
  const s=session();
  const api=load(s);
  await api.loadWithKey({});
  for(const [room,values] of Object.entries(expect)){
    const c=s.ops.checkouts.find(x=>x.room===room);
    assert.ok(c,room);
    assert.equal(c.checkout_date,values.date);
    assert.equal(c.refund_due_date,values.due);
    assert.equal(c.refund_amount,values.amount);
    assert.equal(c.electricity_usage,values.meter);
    assert.equal(c.electricity_fee,values.fee);
    assert.equal(c.refund_status,"paid");
    assert.equal(c.refund_paid_date,"2026-10-20");
    const w=s.ops.weekly_accounts.find(x=>x.property_label===room&&x.kind==="refund");
    assert.ok(w,room);
    assert.equal(w.amount,values.amount);
    assert.equal(w.status,"paid");
    assert.equal(w.paid_date,"2026-10-20");
    assert.equal(w.due_date,values.due);
    const v=s.ops.vacancies.find(x=>x.room===room);
    assert.ok(v,room);
    assert.equal(v.rent,6000);
    assert.equal(v.power_rate,5);
    const b=s.finance.accounts.find(x=>x.id===w.id);
    assert.equal(b.bank_code,"013");
    assert.equal(b.bank_account_last4,values.last4);
    assert.equal(b.bank_account,"");
    assert.equal(b.secure_local,false);
  }
  assert.equal(s.ops.checkouts.find(x=>x.room==="明德2D").october_checkout_fee,3000);
  assert.equal(s.ops.checkouts.find(x=>x.room==="明德3B").rent_arrears,6400);
  assert.equal(s.ops.weekly_accounts.reduce((sum,x)=>sum+x.amount,0),18510);
  await api.loadWithKey({});
  assert.equal(s.ops.checkouts.length,2);
  assert.equal(s.ops.weekly_accounts.length,2);
  assert.equal(s.ops.vacancies.length,2);
});
test("a later rental does not get cleared by historical Mingde 3B checkout",async()=>{
  const s=session([{room:"明德3B",updated_at:"2026-10-10",status:"rented"}]);
  await load(s).loadWithKey({});
  assert.equal(s.ops.rented.some(x=>x.room==="明德3B"),true);
  assert.equal(s.ops.vacancies.some(x=>x.room==="明德3B"),false);
  assert.equal(s.ops.checkouts.some(x=>x.room==="明德3B"),true);
});
test("paid refunds do not retain previously saved bank account numbers",async()=>{
  const s=session();
  const saved={
    "house_ops_finance_account_v1:refund-mingde-2d-20261015":JSON.stringify({id:"refund-mingde-2d-20261015",account:"999999993491"}),
    "house_ops_finance_account_v1:refund-mingde-3b-20261002":JSON.stringify({id:"refund-mingde-3b-20261002",account:"888888883791"})
  };
  await load(s,saved).unlock();
  const banks=s.finance.accounts;
  assert.equal(banks.find(x=>x.id==="refund-mingde-2d-20261015")?.bank_account,"");
  assert.equal(banks.find(x=>x.id==="refund-mingde-3b-20261002")?.bank_account,"");
});
test("sync-code interface removed while authenticated Firestore sync remains",()=>{
  const html=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
  const accounts=fs.readFileSync(path.resolve(__dirname,"../mingde-finance-cloud.js"),"utf8");
  assert.equal(html.includes("mingdeBankPanel"),false);
  assert.equal(html.includes("加密同步碼"),false);
  assert.equal(html.includes("mingde-bank-vault.js"),false);
  assert.equal(html.includes("mingde-finance-cloud.js"),true);
  assert.equal(accounts.includes("getDocFromServer"),true);
  assert.equal(accounts.includes("runTransaction"),true);
  assert.equal(accounts.includes("AES-GCM"),true);
  assert.equal(accounts.includes("HouseCore?.readConfig()"),true);
});

test("paid refund accounts are omitted from current public weekly payment page",()=>{
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 for(const room of ["明德2D","明德3B","中清11-3A"]){
   assert.equal(weekly.includes('if(r.property_label==="'+room+'")return{bank_code:'),false);
 }
 assert.equal(weekly.includes('S.ops.weekly_accounts.filter(x=>x.status!=="paid")'),true);
});

const newCheckoutScript=fs.readFileSync(path.resolve(__dirname,"../zhongqing1a-checkout.js"),"utf8");
function loadZhongqing1A(s){
  const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
  vm.runInNewContext(newCheckoutScript,{window:{HouseSecureApp:app}});
  return app;
}
test("Zhongqing 1A Oct 20 pending refund has consistent amount, complete breakdown and Oct 27 due date",async()=>{
  const s=session();
  const app=loadZhongqing1A(s);
  await app.loadWithKey();
  const c=s.ops.checkouts.find(x=>x.room==="中清1A");
  assert.ok(c);
  assert.equal(c.checkout_date,"2026-10-20");
  assert.equal(c.refund_due_date,"2026-10-27");
  assert.equal(c.refund_status,"pending");
  assert.equal(c.deposit,28000);
  assert.equal(c.overpaid_rent,9334);
  assert.equal(c.short_term_penalty,11200);
  assert.equal(c.penalty_fee,14000);
  assert.equal(c.meter_current-c.meter_previous,64);
  assert.equal(c.electricity_fee,352);
  const calculated=c.deposit+c.overpaid_rent-c.short_term_penalty-c.penalty_fee-c.electricity_fee;
  assert.equal(calculated,11782);
  assert.equal(c.calculated_refund_amount,11782);
  assert.equal(c.refund_amount,11782);
  assert.equal(c.reconciliation_difference,0);
  assert.equal(c.reconciliation_status,"matched");
  const w=s.ops.weekly_accounts.find(x=>x.id==="refund-zhongqing1a-20261020");
  assert.ok(w);
  assert.equal(w.party,"中清1A房客");
  assert.equal(w.amount,11782);
  assert.equal(w.status,"pending");
  assert.equal(w.due_date,"2026-10-27");
  assert.equal(w.description.includes("待核對"),false);
  const b=s.finance.accounts.find(x=>x.id===w.id);
  assert.equal(b.bank_code,"812");
  assert.equal(b.bank_name,"台新銀行");
  assert.equal(b.bank_account_last4,"5883");
  assert.equal(s.ops.vacancies.find(x=>x.room==="中清1A")?.rent,14000);
  await app.unlock();
  assert.equal(s.ops.checkouts.filter(x=>x.room==="中清1A").length,1);
  assert.equal(s.ops.weekly_accounts.filter(x=>x.id===w.id).length,1);
});
test("incorrect Zhongqing 9-1A record migrates into 1A without duplicate history or ghost vacancy",async()=>{
  const s=session();
  s.ops.checkouts.push({id:"checkout-zhongqing9-1a-20261020",room:"中清9-1A",
    checkout_date:"2026-10-20",refund_status:"pending",refund_amount:11728});
  s.ops.weekly_accounts.push({id:"refund-zhongqing9-1a-20261020",
    kind:"refund",property_label:"中清9-1A",status:"pending",amount:11728});
  s.finance.accounts.push({id:"refund-zhongqing9-1a-20261020",bank_code:"812",bank_account:""});
  s.ops.vacancies.push({room:"中清9-1A",since:"2026-10-20",source:"退租轉空房",rent:14000});
  const app=loadZhongqing1A(s);
  await app.unlock();
  assert.equal(s.ops.checkouts.length,1);
  assert.equal(s.ops.checkouts[0].id,"checkout-zhongqing1a-20261020");
  assert.equal(s.ops.checkouts[0].room,"中清1A");
  assert.equal(s.ops.checkouts[0].refund_status,"pending");
  assert.equal(s.ops.checkouts[0].refund_amount,11782);
  assert.equal(s.ops.weekly_accounts.length,1);
  assert.equal(s.ops.weekly_accounts[0].id,"refund-zhongqing1a-20261020");
  assert.equal(s.ops.weekly_accounts[0].status,"pending");
  assert.equal(s.ops.weekly_accounts[0].amount,11782);
  assert.equal(s.finance.accounts.length,1);
  assert.equal(s.finance.accounts[0].id,"refund-zhongqing1a-20261020");
  assert.equal(s.ops.vacancies.some(x=>x.room==="中清9-1A"),false);
  assert.equal(s.ops.vacancies.some(x=>x.room==="中清1A"),true);
  await app.loadWithKey();
  assert.equal(s.ops.weekly_accounts.length,1);
  assert.equal(s.ops.checkouts.length,1);
});
test("refund marked paid after Oct 27 stays paid and account is withheld",async()=>{
  const s=session();
  s.ops.checkouts.push({id:"checkout-zhongqing1a-20261020",room:"中清1A",
    checkout_date:"2026-10-20",refund_status:"paid",refund_paid_date:"2026-10-27"});
  s.ops.weekly_accounts.push({id:"refund-zhongqing1a-20261020",
    kind:"refund",status:"paid",paid_date:"2026-10-27"});
  await loadZhongqing1A(s).unlock();
  assert.equal(s.ops.checkouts[0].refund_status,"paid");
  assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-10-27");
  assert.equal(s.ops.weekly_accounts[0].status,"paid");
  assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-10-27");
  assert.equal(s.finance.accounts[0].bank_account,"");
});
test("Zhongqing 1A refund pages display corrected identity and bank while pending",()=>{
  const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
  const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
  assert.ok(weekly.includes('r.property_label==="中清1A"'));
  assert.ok(weekly.includes('bank_code:"812",bank_name:"台新銀行"'));
  assert.ok(checkout.includes('r.room==="中清1A"'));
  assert.ok(weekly.includes('r.status!=="paid"'));
  assert.ok(checkout.includes('r.refund_status!=="paid"'));
  assert.equal(weekly.includes('r.property_label==="中清9-1A"'),false);
  assert.equal(checkout.includes('r.room==="中清9-1A"'),false);
});

const mingde2AScript=fs.readFileSync(path.resolve(__dirname,"../mingde2a-checkout.js"),"utf8");
function loadMingde2A(s){
 const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
 vm.runInNewContext(mingde2AScript,{window:{HouseSecureApp:app}});
 return app;
}
test("Mingde 2A Oct 27 refund uses verified arithmetic and does not duplicate",async()=>{
 const s=session();
 const app=loadMingde2A(s);
 await app.loadWithKey();
 const c=s.ops.checkouts.find(x=>x.room==="明德2A");
 assert.ok(c);
 assert.equal(c.checkout_date,"2026-10-15");
 assert.equal(c.refund_due_date,"2026-10-27");
 assert.equal(c.refund_status,"pending");
 assert.equal(c.meter_current-c.meter_previous,479);
 assert.equal(c.power_rate,5);
 assert.equal(c.electricity_fee,2395);
 assert.equal(c.deposit+c.termination_compensation+c.internet_subsidy-c.october_rent-c.other_fee-c.electricity_fee,12755);
 assert.equal(c.refund_amount,12755);
 const w=s.ops.weekly_accounts.find(x=>x.id==="refund-mingde-2a-20261015");
 assert.ok(w);
 assert.equal(w.amount,12755);
 assert.equal(w.status,"pending");
 assert.equal(w.due_date,"2026-10-27");
 const bank=s.finance.accounts.find(x=>x.id===w.id);
 assert.equal(bank.bank_code,"812");
 assert.equal(bank.bank_name,"台新銀行");
 assert.equal(bank.bank_account_last4,"1568");
 assert.equal(s.ops.vacancies.find(x=>x.room==="明德2A")?.rent,6000);
 await app.unlock();
 assert.equal(s.ops.checkouts.filter(x=>x.room==="明德2A").length,1);
 assert.equal(s.ops.weekly_accounts.filter(x=>x.id===w.id).length,1);
});
test("Mingde 2A paid state is not reverted on future logins",async()=>{
 const s=session();
 s.ops.checkouts.push({id:"checkout-mingde-2a-20261015",room:"明德2A",checkout_date:"2026-10-15",refund_status:"paid",refund_paid_date:"2026-10-27"});
 s.ops.weekly_accounts.push({id:"refund-mingde-2a-20261015",status:"paid",paid_date:"2026-10-27"});
 await loadMingde2A(s).unlock();
 assert.equal(s.ops.checkouts[0].refund_status,"paid");
 assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-10-27");
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-10-27");
 assert.equal(s.finance.accounts[0].bank_account,"");
});
test("Mingde 2A account is shown only for pending refunds",()=>{
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(weekly.includes('r.property_label==="明德2A"'));
 assert.ok(weekly.includes('r.status!=="paid"'));
 assert.ok(checkout.includes('r.room==="明德2A"&&r.refund_status!=="paid"'));
 assert.ok(weekly.includes('bank_name:"台新銀行"'));
 assert.ok(build.includes("'mingde2a-checkout.js'"));
});

test("Tuesday cycles group Wednesday through Tuesday and preserve Friday vendor settlement dates",()=>{
  const src=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
  const world={window:{},Date,Intl};
  vm.runInNewContext(src,world,{filename:"accounting-periods.js"});
  const H=world.window.HouseAccounting;
  assert.equal(H.tuesday("2026-10-20"),"2026-10-20");
  assert.equal(H.tuesday("2026-10-21"),"2026-10-27");
  assert.equal(H.tuesday("2026-10-27"),"2026-10-27");
  assert.equal(H.tuesday("2026-10-28"),"2026-11-03");
  assert.equal(H.start("2026-10-27"),"2026-10-21");
  assert.equal(H.period({kind:"vendor",settlement_date:"2026-10-16"}),"2026-10-20");
  assert.equal(H.period({kind:"refund",settlement_date:"2026-10-15",due_date:"2026-10-27"}),"2026-10-27");
  assert.equal(H.period({kind:"refund",due_date:"2026-10-20"}),"2026-10-20");
  assert.equal(H.pettyPeriod({date:"2026-10-20"}),"2026-10-20");
  assert.equal(H.pettyPeriod({date:"2026-10-26"}),"2026-10-27");
  assert.equal(H.tuesday("2026-02-30"),"");
});
test("history archive page is included in all management navigation and published build",()=>{
  for(const filename of ["index.html","vacancy.html","checkout.html","weekly-accounting.html"]){
    const html=fs.readFileSync(path.resolve(__dirname,"../"+filename),"utf8");
    assert.ok(html.includes('accounting-history.html'),filename+" history link");
  }
  const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
  assert.ok(weekly.includes('HouseAccounting.inCurrent(x,cycle)'));
  assert.ok(weekly.includes('HouseAccounting.pettyPeriod(x)===HouseAccounting.current()'));
  const history=fs.readFileSync(path.resolve(__dirname,"../accounting-history.html"),"utf8");
  assert.ok(history.includes('id="cycle"'));
  assert.ok(history.includes('id="keyword"'));
  assert.ok(history.includes('id="includeCurrent"'));
  const source=fs.readFileSync(path.resolve(__dirname,"../accounting-history.js"),"utf8");
  assert.ok(source.includes('s.ops.weekly_accounts'));
  assert.ok(source.includes('HOUSE_PETTY_CASH_DATA'));
  const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
  for(const file of ["accounting-history.html","accounting-history.js","accounting-periods.js"])
    assert.ok(build.includes("'"+file+"'"),file+" in build");
});

const nantunScript=fs.readFileSync(path.resolve(__dirname,"../nantun643-301-checkout.js"),"utf8");
function loadNantun(s){
  const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
  vm.runInNewContext(nantunScript,{window:{HouseSecureApp:app}});
  return app;
}
test("Nantun 643-301 refund is 28,588 due Tuesday Oct 27, with 758-unit electricity and unique records",async()=>{
  const s=session([{room:"南屯643-301",status:"rented"}]);
  const app=loadNantun(s);
  await app.loadWithKey();
  const c=s.ops.checkouts.find(x=>x.room==="南屯643-301");
  assert.ok(c);
  assert.equal(c.checkout_date,"2026-10-14");
  assert.equal(c.refund_due_date,"2026-10-27");
  assert.equal(c.refund_status,"pending");
  assert.equal(c.deposit,38000);
  assert.equal(c.previous_overpayment,289);
  assert.equal(c.meter_current-c.meter_previous,758);
  assert.equal(c.electricity_fee,c.electricity_usage*c.power_rate);
  assert.equal(c.overstay_rent,c.overstay_days*c.overstay_daily_rate);
  assert.equal(c.cleaning_fee,3000);
  assert.equal(c.deposit+c.previous_overpayment-c.electricity_fee-c.overstay_rent-c.cleaning_fee,28588);
  assert.equal(c.refund_amount,28588);
  const w=s.ops.weekly_accounts.find(x=>x.id==="refund-nantun643-301-20261014");
  assert.ok(w);
  assert.equal(w.amount,28588);
  assert.equal(w.due_date,"2026-10-27");
  assert.equal(w.status,"pending");
  assert.equal(w.property_label,"南屯643-301");
  const b=s.finance.accounts.find(x=>x.id===w.id);
  assert.equal(b.bank_code,"700");
  assert.equal(b.bank_name,"中華郵政");
  assert.equal(b.bank_account_last4,"8183");
  assert.equal(s.ops.vacancies.find(x=>x.room==="南屯643-301")?.rent,19000);
  assert.equal(s.ops.rented.some(x=>x.room==="南屯643-301"),false);
  await app.unlock();
  assert.equal(s.ops.checkouts.filter(x=>x.room==="南屯643-301").length,1);
  assert.equal(s.ops.weekly_accounts.filter(x=>x.property_label==="南屯643-301").length,1);
  assert.equal(s.finance.accounts.filter(x=>x.id===w.id).length,1);
});
test("Nantun 643-301 refund once confirmed paid stays in archive and is removed from pending",async()=>{
  const s=session();
  s.ops.checkouts.push({id:"checkout-nantun643-301-20261014",room:"南屯643-301",checkout_date:"2026-10-14",
    refund_status:"paid",refund_paid_date:"2026-10-27"});
  s.ops.weekly_accounts.push({id:"refund-nantun643-301-20261014",kind:"refund",property_label:"南屯643-301",
    status:"paid",paid_date:"2026-10-27"});
  await loadNantun(s).unlock();
  assert.equal(s.ops.checkouts[0].refund_status,"paid");
  assert.equal(s.ops.checkouts[0].refund_paid_date,"2026-10-27");
  assert.equal(s.ops.weekly_accounts[0].status,"paid");
  assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-10-27");
  assert.equal(s.ops.weekly_accounts[0].amount,28588);
  assert.equal(s.finance.accounts[0].bank_account,"");
});
test("Nantun 643-301 is loaded in all pages, shows postal payout account while pending and follows Tuesday period",()=>{
  const pages=["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"];
  for(const file of pages){
    const html=fs.readFileSync(path.resolve(__dirname,"../"+file),"utf8");
    assert.ok(html.includes('<script src="nantun643-301-checkout.js"></script>'),file);
  }
  const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
  assert.ok(weekly.includes('r.property_label==="南屯643-301"'));
  assert.ok(weekly.includes('bank_code:"700",bank_name:"中華郵政"'));
  assert.ok(weekly.includes('r.status!=="paid"'));
  const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
  assert.ok(checkout.includes('r.room==="南屯643-301"&&r.refund_status!=="paid"'));
  const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
  assert.ok(build.includes("'nantun643-301-checkout.js'"));
  const periods=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
  const ctx={window:{},Date,Intl};
  vm.runInNewContext(periods,ctx);
  assert.equal(ctx.window.HouseAccounting.period({kind:"refund",settlement_date:"2026-10-14",due_date:"2026-10-27"}),"2026-10-27");
});
