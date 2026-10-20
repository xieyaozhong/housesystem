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
function loadZhongqing9A(s){
  const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
  vm.runInNewContext(newCheckoutScript,{window:{HouseSecureApp:app}});
  return app;
}
test("corrected Zhongqing 9-1A Oct 20 checkout retains requested payout and flags arithmetic mismatch",async()=>{
  const s=session();
  const app=loadZhongqing9A(s);
  await app.loadWithKey();
  const c=s.ops.checkouts.find(x=>x.room==="中清9-1A");
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
  assert.equal(c.deposit+c.overpaid_rent-c.short_term_penalty-c.penalty_fee-c.electricity_fee,11782);
  assert.equal(c.calculated_refund_amount,11782);
  assert.equal(c.refund_amount,11728);
  assert.equal(c.reconciliation_difference,54);
  assert.equal(c.reconciliation_status,"needs_review");
  const w=s.ops.weekly_accounts.find(x=>x.id==="refund-zhongqing9-1a-20261020");
  assert.ok(w);
  assert.equal(w.amount,11728);
  assert.equal(w.status,"pending");
  assert.equal(w.due_date,"2026-10-27");
  assert.match(w.description,/差54元/);
  const b=s.finance.accounts.find(x=>x.id===w.id);
  assert.equal(b.bank_code,"812");
  assert.equal(b.bank_name,"台新銀行");
  assert.equal(b.bank_account_last4,"5883");
  assert.equal(s.ops.vacancies.find(x=>x.room==="中清9-1A")?.rent,14000);
  await app.unlock();
  assert.equal(s.ops.checkouts.filter(x=>x.room==="中清9-1A").length,1);
  assert.equal(s.ops.weekly_accounts.filter(x=>x.id===w.id).length,1);
});
test("old incorrect Zhongqing 1A checkout is migrated, never duplicated, and completion is retained",async()=>{
  const s=session();
  s.ops.checkouts.push({id:"checkout-zhongqing1a-20261020",room:"中清1A",checkout_date:"2026-10-20",
    refund_status:"paid",refund_paid_date:"2026-10-27",refund_amount:25782});
  s.ops.weekly_accounts.push({id:"refund-zhongqing1a-20261020",kind:"refund",property_label:"中清1A",
    status:"paid",paid_date:"2026-10-27",amount:25782});
  s.ops.vacancies.push({room:"中清1A",since:"2026-10-20",source:"退租轉空房",rent:14000});
  const app=loadZhongqing9A(s);
  await app.unlock();
  const checkout=s.ops.checkouts.find(x=>x.room==="中清9-1A");
  assert.equal(checkout.id,"checkout-zhongqing9-1a-20261020");
  assert.equal(checkout.refund_status,"paid");
  assert.equal(checkout.refund_paid_date,"2026-10-27");
  assert.equal(checkout.refund_amount,11728);
  const w=s.ops.weekly_accounts.find(x=>x.id==="refund-zhongqing9-1a-20261020");
  assert.equal(w.status,"paid");
  assert.equal(w.paid_date,"2026-10-27");
  assert.equal(w.amount,11728);
  assert.equal(s.finance.accounts.find(x=>x.id===w.id).bank_account,"");
  assert.equal(s.ops.checkouts.some(x=>x.room==="中清1A"),false);
  assert.equal(s.ops.weekly_accounts.some(x=>x.property_label==="中清1A"),false);
  assert.equal(s.ops.vacancies.some(x=>x.room==="中清1A"),false);
  await app.loadWithKey();
  assert.equal(s.ops.checkouts.filter(x=>x.checkout_date==="2026-10-20").length,1);
});
test("Zhongqing 9-1A transfer pages show correct property and existing account while pending",()=>{
  const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
  const checkout=fs.readFileSync(path.resolve(__dirname,"../checkout.html"),"utf8");
  assert.ok(weekly.includes('r.property_label==="中清9-1A"'));
  assert.ok(weekly.includes('bank_code:"812",bank_name:"台新銀行"'));
  assert.ok(checkout.includes('r.room==="中清9-1A"'));
  assert.ok(weekly.includes('r.status!=="paid"'));
  assert.ok(checkout.includes('r.refund_status!=="paid"'));
  assert.equal(weekly.includes('r.property_label==="中清1A"'),false);
  assert.equal(checkout.includes('r.room==="中清1A"'),false);
});
