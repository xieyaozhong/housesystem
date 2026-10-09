const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

const server = http.createServer((req,res)=>{
  const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1) || 'index.html';
  const file = path.resolve(root,name);
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.statusCode=404;res.end();return}
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    const p=await browser.newPage({viewport:{width:390,height:844}});
    for(const name of ['index.html','vacancy.html','checkout.html','weekly-accounting.html']){
      await p.goto(origin+'/'+name);
      await p.waitForLoadState('networkidle');
      assert.equal(await p.locator('input[type="password"]').count(),1,name+' must require the unified management password');
      assert.equal(await p.locator('#lock').isVisible(),true,name+' must start locked on a new device');
      const body=await p.textContent('body');
      for(const secret of ['明德5C','明德6D','一中4A','01016800045858','20301800995588','01910010974190']){
        assert.equal(body.includes(secret),false,name+' must not render operational or banking data before unlock');
      }
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' must fit mobile width');
    }

    const opsSource=fs.readFileSync(path.join(root,'ops-secure.js'),'utf8');
    const financeSource=fs.readFileSync(path.join(root,'finance-secure.js'),'utf8');
    const pettySource=fs.readFileSync(path.join(root,'petty-cash-data.js'),'utf8');
    const retiredPublic=fs.readFileSync(path.join(root,'public-data.js'),'utf8');
    for(const secret of ['明德5C','明德6D','一中4A','台中市南區明德街66號']){
      assert.equal(opsSource.includes(secret),false,'encrypted operations payload must not contain plaintext operational data');
      assert.equal(retiredPublic.includes(secret),false,'retired public snapshot must not retain operational data');
    }
    for(const secret of ['01016800045858','20301800995588','01910010974190']){
      assert.equal(financeSource.includes(secret),false,'encrypted finance payload must not contain plaintext bank accounts');
    }
    assert.equal(pettySource.includes('馬卡'),true,'management reserve data must include the default manager');
    assert.equal(pettySource.includes('梅亭503'),true,'management reserve data must include the latest advance property');
    assert.equal(pettySource.includes('amount:2000'),true,'management reserve data must include the latest advance amount');
    assert.equal(pettySource.includes('台電代繳'),true,'management reserve data must include the Taipower advance');
    assert.equal(pettySource.includes('amount:439'),true,'Taipower advance amount must be 439');
    assert.equal(pettySource.includes('1rcdEEcDjtF7ftsHzebozE3DABtO6QIuE'),true,'Taipower advance must retain its receipt link');

    const build=fs.readFileSync(path.join(root,'scripts/build.mjs'),'utf8');
    assert.equal(build.includes("'ops-secure.js'"),true,'Pages build must include encrypted operations payload');
    assert.equal(build.includes("'secure-app.js'"),true,'Pages build must include unified secure loader');
    assert.equal(build.includes("'petty-cash-data.js'"),true,'Pages build must include management reserve data');
    assert.equal(build.includes("'public-data.js'"),false,'Pages build must not ship retired public snapshot');

    const vacancy=fs.readFileSync(path.join(root,'vacancy.html'),'utf8');
    const checkout=fs.readFileSync(path.join(root,'checkout.html'),'utf8');
    const weekly=fs.readFileSync(path.join(root,'weekly-accounting.html'),'utf8');
    assert.equal(vacancy.includes('HOUSE_PUBLIC_DATA'),false,'vacancy must only use encrypted data');
    assert.equal(vacancy.includes('月租 '),true,'vacancy cards must render monthly rent when present');
    assert.equal(vacancy.includes('元／度'),true,'vacancy cards must render electricity rate when present');
    assert.equal(vacancy.includes('<th>月租</th><th>電費</th>'),true,'rented list must show rent and electricity columns');
    const secureApp=fs.readFileSync(path.join(root,'secure-app.js'),'utf8');
    assert.equal(secureApp.includes('rent:12500'),true,'latest rented room must retain monthly rent');
    assert.equal(secureApp.includes('power_rate:5.5'),true,'latest rented room must retain electricity rate');
    assert.equal(secureApp.includes('findIndex(r=>r.room==="北屯8B")'),true,'rented room removal must target the room by name');
    assert.equal(secureApp.includes('findIndex(r=>r.room==="一中4A")'),true,'Yizhong 4A must be located by room name when rented');
    assert.equal(secureApp.includes('ops.vacancies.splice(yizhong4A,1)'),true,'Yizhong 4A must be removed from vacancy list');
    assert.equal(secureApp.includes('some(r=>r.room==="一中4A")'),true,'Yizhong 4A must not be duplicated in recently rented');
    assert.equal(secureApp.includes('rent:11000,power_rate:5,updated_at:"2026-10-02",status:"rented"'),true,'Yizhong 4A retains original pricing after rental');
    for(const expected of [
      '"北屯8C":{rent:11000,power_rate:5.5}',
      '"陝西703":{rent:8500,power_rate:5.5}',
      '"民生303":{rent:13500,power_rate:5.5}',
      '"寧夏R8":{rent:12000,power_rate:5}',
      '"復興路五段186號3樓E室":{rent:9000,power_rate:5}'
    ]) assert.equal(secureApp.includes(expected),true,'vacancy pricing must include '+expected);
    assert.equal(checkout.includes('HOUSE_PUBLIC_DATA'),false,'checkout must only use encrypted data');
    assert.equal(checkout.includes('b.bank_name'),true,'checkout must render refund bank name when present');
    assert.equal(weekly.includes('HOUSE_PUBLIC_DATA'),false,'finance must only use encrypted data');
    assert.equal(weekly.includes('function groupedPending()'),true,'finance must preserve same-vendor weekly aggregation');
    assert.equal(weekly.includes('x.status!=="paid"'),true,'finance must continue hiding completed transfers from the pending list');
    assert.equal(weekly.includes('複製帳號'),true,'finance must provide one-tap account copy');
    assert.equal(weekly.includes('複製完整資訊'),true,'finance must provide one-tap full-info copy');
    assert.equal(weekly.includes('navigator.clipboard'),true,'finance copy must use Clipboard API when available');
    assert.equal(weekly.includes('document.execCommand("copy")'),true,'finance copy must include Safari-compatible fallback');
    assert.equal(weekly.includes('canCopy=b.bank_account'),true,'account copy must be disabled when bank data is unavailable or conflicting');
    assert.equal(weekly.includes('b.bank_name'),true,'finance must display bank name when encrypted data provides it');
    assert.equal(weekly.includes('<th>收據</th>'),true,'finance must show a receipt column');
    assert.equal(weekly.includes('function receiptCell(r)'),true,'finance must render receipt links after unlock');
    assert.equal(weekly.includes('id="pettySection"'),true,'finance must include the management reserve section');
    assert.equal(weekly.includes('function renderPetty()'),true,'finance must calculate management reserve balances after unlock');
    assert.equal(weekly.includes('剩餘零用金'),true,'finance must display remaining petty cash');
    assert.equal(weekly.includes('balance=fund-spent-advance'),true,'management advances must reduce remaining petty cash');
    assert.equal(weekly.includes('$("#pettyTb").addEventListener'),true,'management reserve receipt buttons must open Drive receipts');
    const vendorSecure=fs.readFileSync(path.join(root,'vendor-payables-secure.js'),'utf8');
    assert.equal(vendorSecure.includes('025200180300'),false,'vendor bank account must remain encrypted');
    assert.equal(vendorSecure.includes('徐志騰'),false,'vendor payment details must not be plaintext');
    assert.equal(vendorSecure.includes('1D3zMsH-uo9-qu4pNMvkoc36TFgREXtEt'),false,'vendor receipt ID must remain encrypted');
    assert.equal(build.includes("'vendor-payables-secure.js'"),true,'Pages build must include encrypted vendor payment data');
    assert.equal(secureApp.includes('HOUSE_VENDOR_PAYABLES_SECURE'),true,'unlock must load encrypted vendor additions');
        const deltaSource=fs.readFileSync(path.join(root,'ops-delta-secure.js'),'utf8');
    assert.equal(deltaSource.includes('drive.google.com/file/d/'),false,'encrypted delta must not expose receipt URLs in plaintext');
    assert.equal(deltaSource.includes('1T8a8FProZHdMJKkLnqid4jw3IppJ7SW4'),false,'encrypted delta must not expose receipt file IDs in plaintext');
    assert.equal(deltaSource.includes('119sTb-9jLMksVtHHAEQEA4K05jomlHl4'),false,'encrypted delta must not expose the prior receipt file ID in plaintext');
    assert.equal(secureApp.includes('Object.assign(current,row)'),true,'secure delta must be able to update an existing accounting record');
    assert.equal(build.includes("'ops-delta-secure.js'"),true,'Pages build must include encrypted operations delta');
    assert.equal(secureApp.includes('vendor-zhengguofeng-zhongqing11-1b-20261009'),true,'latest plumbing vendor payable must be registered');
    assert.equal(secureApp.includes('鄭國峰（水電）'),true,'latest vendor name must be present after unlock');
    assert.equal(secureApp.includes('property_label:"中清11-1B"'),true,'latest vendor payable must target Zhongqing 11-1B');
    assert.equal(secureApp.includes('description:"馬桶水管破裂"'),true,'latest vendor payable must include repair item');
    assert.equal(secureApp.includes('amount:1000,settlement_date:"2026-10-09"'),true,'latest vendor payable must retain amount and Friday settlement date');
    assert.equal(secureApp.includes('1lGNLCaQnukaifoZ1dG-OUPB7ijU-uwJG'),true,'latest vendor payable must retain its receipt link');
    assert.equal(secureApp.includes('1159968132133'),true,'latest vendor bank account should display directly after unlock');
    assert.equal(secureApp.includes('vendorBank.secure_local=false'),true,'latest vendor account must not require local secure entry');
    assert.equal(secureApp.includes('vendorBank.bank_account="1159968132133"'),true,'latest vendor account must be populated directly');
    assert.equal(secureApp.includes('vendor-zhengguofeng-yizhong7b-lamp-20261009'),true,'Yizhong 7B lighting repair must have a unique record ID');
    assert.equal(secureApp.includes('property_label:"一中7B"'),true,'lighting repair must target Yizhong 7B');
    assert.equal(secureApp.includes('description:"電燈更換",amount:500,settlement_date:"2026-10-09"'),true,'lighting repair must be 500 due on October 9');
    assert.equal(secureApp.includes('13Mbk5PnOG_Rmj78Cw-b_r05E6711d-lQ'),true,'Yizhong 7B receipt must be attached');
    assert.equal(secureApp.includes('lampBank.bank_account=vendorBank.bank_account'),true,'lighting repair must reuse the matching vendor bank account');

    assert.equal(secureApp.includes('Number(x.amount)===3000&&x.settlement_date==="2026-10-02"'),true,'paid plumbing invoice must be identified without exposing vendor plaintext');
    assert.equal(secureApp.includes('settledPlumbing.status="paid"'),true,'paid plumbing invoice must be removed from pending payments');
    assert.equal(secureApp.includes('settledPlumbing.paid_date="2026-10-06"'),true,'paid plumbing invoice must retain settlement date');
    assert.equal(secureApp.includes('x=>x.room==="明德5C"'),true,'Mingde 5C checkout must be targeted by room name');
    assert.equal(secureApp.includes('mingde5CCheckout.refund_status="paid"'),true,'Mingde 5C checkout must be marked refunded');
    assert.equal(secureApp.includes('mingde5CCheckout.refund_paid_date="2026-10-06"'),true,'Mingde 5C checkout must retain refund completion date');
    assert.equal(secureApp.includes('x.kind==="refund"&&x.property_label==="明德5C"'),true,'Mingde 5C weekly refund must be targeted');
    assert.equal(secureApp.includes('mingde5CRefund.status="paid"'),true,'Mingde 5C weekly refund must be removed from pending list');
        const trustedDevice=fs.readFileSync(path.join(root,'trusted-device.js'),'utf8');
    assert.equal(trustedDevice.includes("Array.isArray(s)?s.join(''):s"),true,'decryptor must support chunked encrypted payloads');

    await p.goto(origin+'/checkout.html');
    await p.waitForLoadState('networkidle');
    const refundCheck=await p.evaluate(async()=>{
      const oldDecrypt=HouseTrusted.decryptVaultWithKey;
      HouseTrusted.decryptVaultWithKey=async(blob,key)=>{
        if(blob===HOUSE_OPS_SECURE)return {
          vacancies:[],rented:[{room:"平德401",address:"測試地址"}],
          checkouts:[],weekly_accounts:[]
        };
        if(blob===HOUSE_FINANCE_SECURE)return {accounts:[]};
        if(blob===HOUSE_VAULT)return {properties:[]};
        if(blob===window.HOUSE_OPS_DELTA_SECURE||blob===window.HOUSE_VENDOR_PAYABLES_SECURE)return {};
        return oldDecrypt(blob,key);
      };
      const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
      const s=await HouseSecureApp.loadWithKey(key);
      render(s);
      const checkout=s.ops.checkouts.find(x=>x.room==="平德401");
      const weekly=s.ops.weekly_accounts.find(x=>x.id==="refund-pingde-401-20261002");
      const before={
        checkout:checkout&&{
          date:checkout.checkout_date,due:checkout.refund_due_date,
          amount:checkout.refund_amount,usage:checkout.electricity_usage,
          electricity_fee:checkout.electricity_fee,status:checkout.refund_status
        },
        pending:weekly&&{amount:weekly.amount,due:weekly.due_date,status:weekly.status},
        vacancy:s.ops.vacancies.some(x=>x.room==="平德401"),
        noLongerRented:s.ops.rented.every(x=>x.room!=="平德401"),
        saveButton:document.querySelectorAll('[data-save-account]').length===1,
        bank:s.finance.accounts.find(x=>x.id==="refund-pingde-401-20261002"),
        pingshun:s.ops.checkouts.find(x=>x.room==="平順403"),
        pingshunWeekly:s.ops.weekly_accounts.find(x=>x.id==="refund-pingshun403-20261009"),
        pingshunBank:s.finance.accounts.find(x=>x.id==="refund-pingshun403-20261009"),
        pingshunVacancy:s.ops.vacancies.filter(x=>x.room==="平順403").length,
        pingshunRemovedFromRented:s.ops.rented.every(x=>x.room!=="平順403")
      };
      const id="refund-pingshun403-20261009";
      const testBank="123456789012";
      await HouseSecureApp.saveFinanceAccount(s,id,testBank);
      const stored=localStorage.getItem("house_ops_finance_account_v1:"+id);
      const reloaded=await HouseSecureApp.loadWithKey(key);
      before.secureBankRoundtrip=reloaded.finance.accounts.find(x=>x.id===id)?.bank_account===testBank;
      before.storedEncrypted=!!stored&&!stored.includes(testBank);
      localStorage.removeItem("house_ops_finance_account_v1:"+id);
      return before;
    });
    assert.deepEqual(refundCheck.checkout,{date:"2026-10-02",due:"2026-10-06",amount:24218,usage:324,electricity_fee:1782,status:"paid"},'Pingde 401 checkout must retain amounts and show completed refund');
    assert.deepEqual(refundCheck.pending,{amount:24218,due:"2026-10-06",status:"paid"},'weekly accounting must retain Pingde 401 refund history as paid');
    assert.equal(refundCheck.vacancy,true,'Pingde 401 must return to vacancies');
    assert.equal(refundCheck.noLongerRented,true,'Pingde 401 must not remain in rented list');
    assert.equal(refundCheck.saveButton,true,'checkout should display the saved refund account directly');
    assert.equal(refundCheck.bank?.bank_code,"013",'refund must retain user-provided bank code');
    assert.equal(refundCheck.bank?.bank_name,"國泰世華",'refund must display Cathay United Bank name');
    assert.equal(refundCheck.bank?.bank_account,"699512385196",'refund must display the updated bank account directly');
    assert.equal(refundCheck.pingshun?.checkout_date,"2026-10-09","Pingshun checkout date must be October 9");
    assert.equal(refundCheck.pingshun?.refund_due_date,"2026-10-13","Pingshun refund is due October 13");
    assert.equal(refundCheck.pingshun?.refund_amount,23709,"Pingshun refund is 23,709");
    assert.equal(refundCheck.pingshun?.refund_status,"pending","Pingshun must remain pending until confirmation");
    assert.equal(refundCheck.pingshun?.deposit,24000,"Pingshun deposit is 24,000");
    assert.equal(refundCheck.pingshun?.electricity_usage,53,"Pingshun electricity usage is 53 units");
    assert.equal(refundCheck.pingshun?.electricity_fee,291,"user-stated electricity deduction is 291");
    assert.equal(refundCheck.pingshun?.electricity_exact,291.5,"exact electricity amount must be recorded");
    assert.equal(refundCheck.pingshunWeekly?.status,"pending","Pingshun pending transfer must appear in weekly accounting");
    assert.equal(refundCheck.pingshunWeekly?.amount,23709,"Pingshun weekly transfer is 23,709");
    assert.equal(refundCheck.pingshunWeekly?.due_date,"2026-10-13","Pingshun weekly transfer due date is October 13");
    assert.equal(refundCheck.pingshunWeekly?.settlement_date,"2026-10-09","Pingshun refund is listed in October 9 Friday batch");
    assert.equal(refundCheck.pingshunVacancy,1,"Pingshun must return to the vacancy list once");
    assert.equal(refundCheck.pingshunRemovedFromRented,true,"Pingshun must not remain recently rented");
    assert.equal(refundCheck.pingshunBank?.bank_code,"013","Pingshun bank code must be 013");
    assert.equal(refundCheck.pingshunBank?.bank_name,"國泰世華","Pingshun bank name must be displayed");
    assert.equal(refundCheck.pingshunBank?.secure_local,true,"Pingshun bank must not be written as plaintext");
    assert.equal(refundCheck.secureBankRoundtrip,true,"Pingshun account must AES-GCM encrypt and decrypt");
    assert.equal(refundCheck.storedEncrypted,true,"Pingshun local account storage must not include the plaintext");
    assert.equal(secureApp.includes("063506286192"),false,"Pingshun account must not appear in public source");
    assert.equal(checkout.includes("063506286192"),false,"Pingshun account must not appear in public HTML");
    assert.equal(weekly.includes("063506286192"),false,"Pingshun account must not appear in public accounting HTML");

    assert.equal(secureApp.includes('pingde401Checkout.refund_status="paid"'),true,'Pingde 401 checkout must be marked refunded');
    assert.equal(secureApp.includes('pingde401Checkout.refund_paid_date="2026-10-06"'),true,'Pingde 401 checkout must retain completion date');
    assert.equal(secureApp.includes('pingde401Refund.status="paid"'),true,'Pingde 401 weekly refund must be removed from pending list');
    assert.equal(secureApp.includes('pingde401Refund.paid_date="2026-10-06"'),true,'Pingde 401 weekly refund must retain paid date');

    await p.goto(origin+'/weekly-accounting.html');
    await p.waitForLoadState('networkidle');
    const lightingCheck=await p.evaluate(async()=>{
      HouseTrusted.decryptVaultWithKey=async(blob)=>{
        if(blob===HOUSE_OPS_SECURE)return {weekly_accounts:[],checkouts:[],vacancies:[],rented:[]};
        if(blob===HOUSE_FINANCE_SECURE)return {accounts:[]};
        if(blob===HOUSE_VAULT)return {properties:[]};
        return {};
      };
      const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
      const session=await HouseSecureApp.loadWithKey(key);
      await render(session);
      const pair=session.ops.weekly_accounts.filter(x=>x.party==="鄭國峰（水電）");
      const visible=DISPLAY.filter(x=>x.party==="鄭國峰（水電）");
      const payees=visible.length?visible[0]._items:[];
      const bankRows=session.finance.accounts.filter(x=>payees.some(p=>p.id===x.id));
      return {
        items:pair.length,grouped:visible.length,
        total:visible[0]?.amount,
        rooms:visible[0]?.property_label,
        receipts:document.querySelectorAll('#tb button[data-receipt-url]').length,
        matchingBank:bankRows.length===2&&bankRows[0].bank_account===bankRows[1].bank_account,
        allPending:pair.every(x=>x.status==="pending")
      };
    });
    assert.deepEqual(lightingCheck,{
      items:2,grouped:1,total:1500,rooms:"中清11-1B、一中7B",
      receipts:2,matchingBank:true,allPending:true
    },'same-week same-vendor repairs must aggregate to 1,500 while preserving both receipts and bank accounts');

    await p.goto(origin+'/mobile-login.html');
    await p.waitForURL(origin+'/index.html');
    assert.equal(await p.locator('input[type="password"]').count(),1,'legacy mobile entry must land on locked dashboard');

    console.log('PASS all primary pages require one password and ship only encrypted operational data');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
