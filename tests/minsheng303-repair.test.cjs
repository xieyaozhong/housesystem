const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const script=fs.readFileSync(path.resolve(__dirname,"../minsheng303-repair.js"),"utf8");
const receipt="https://drive.google.com/file/d/1F4mzTQJOBMHOsQpqpBvY_EV90zrnFkLz/view?usp=drivesdk";
const id="vendor-hongmao-minsheng303-waterheater-wiring-20261109";
const state=()=>({ops:{checkouts:[],weekly_accounts:[]},finance:{accounts:[]},vault:{properties:[]}});
function bind(s){
 const app={unlock:async()=>s,auto:async()=>s,loadWithKey:async()=>s};
 vm.runInNewContext(script,{window:{HouseSecureApp:app}});
 return app;
}
test("Minsheng 303 Hongmao original water heater repair invoice is NT$3,000",async()=>{
 const s=state(),app=bind(s);
 await app.unlock();
 const w=s.ops.weekly_accounts.find(x=>x.id===id);
 const b=s.finance.accounts.find(x=>x.id===id);
 assert.equal(w.kind,"vendor");
 assert.equal(w.party,"鴻茂（熱水器原廠）");
 assert.equal(w.property_label,"民生303");
 assert.match(w.description,/熱水器線路維修/);
 assert.equal(w.amount,3000);
 assert.equal(w.status,"pending");
 assert.equal(w.settlement_date,"2026-11-09");
 assert.equal(w.receipt_url,receipt);
 assert.equal(b.bank_code,"013");
 assert.equal(b.bank_name,"國泰世華銀行");
 assert.equal(b.bank_account_last4,"6613");
 assert.equal(b.secure_local,false);
 assert.equal(b.bank_account,"");
 await app.auto();
 await app.loadWithKey();
 assert.equal(s.ops.weekly_accounts.filter(x=>x.id===id).length,1);
 assert.equal(s.finance.accounts.filter(x=>x.id===id).length,1);
});
test("Minsheng 303 vendor invoice preserves confirmed payout status and date",async()=>{
 const s=state();
 s.ops.weekly_accounts.push({id,status:"paid",paid_date:"2026-11-12",amount:3000});
 s.finance.accounts.push({id,bank_code:"013",bank_account:""});
 const app=bind(s);
 await app.unlock();
 assert.equal(s.ops.weekly_accounts[0].status,"paid");
 assert.equal(s.ops.weekly_accounts[0].paid_date,"2026-11-12");
 assert.equal(s.ops.weekly_accounts[0].amount,3000);
 assert.equal(s.finance.accounts.length,1);
});
test("Minsheng 303 repair is in all management pages, Tuesday ledger, and history",()=>{
 const pages=["index.html","vacancy.html","checkout.html","weekly-accounting.html","accounting-history.html"];
 for(const page of pages){
  const html=fs.readFileSync(path.resolve(__dirname,"../"+page),"utf8");
  assert.ok(html.includes('<script src="minsheng303-repair.js"></script>'),page);
 }
 const weekly=fs.readFileSync(path.resolve(__dirname,"../weekly-accounting.html"),"utf8");
 assert.ok(weekly.includes('vendor.startsWith("鴻茂")'));
 assert.ok(weekly.includes('bank_code:"013",bank_name:"國泰世華銀行",bank_account:"0000699514776613"'));
 assert.ok(weekly.includes("HouseAccounting.pendingPayables(S.ops.weekly_accounts)"));
 assert.ok(weekly.includes("function receiptCell(r)"));
 const history=fs.readFileSync(path.resolve(__dirname,"../accounting-history.js"),"utf8");
 assert.ok(history.includes("s.ops.weekly_accounts"));
 assert.ok(history.includes("receipt_url"));
 const build=fs.readFileSync(path.resolve(__dirname,"../scripts/build.mjs"),"utf8");
 assert.ok(build.includes("'minsheng303-repair.js'"));
 const periods=fs.readFileSync(path.resolve(__dirname,"../accounting-periods.js"),"utf8");
 const context={window:{},Date,Intl};vm.runInNewContext(periods,context);
 assert.equal(context.window.HouseAccounting.period({kind:"vendor",settlement_date:"2026-11-09"}),"2026-11-10");
});
