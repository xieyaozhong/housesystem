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
    for(const name of ['index.html','vacancy.html','checkout.html','weekly-accounting.html','accounting-history.html']){
      await p.goto(origin+'/'+name);
      await p.waitForLoadState('networkidle');
      assert.equal(await p.locator('input[type="password"]').count(),1,name+' must require the unified management password');
      assert.equal(await p.locator('#lock').isVisible(),true,name+' must start locked on a new device');
      const body=await p.textContent('body');
      for(const secret of ['明德5C','明德6D','一中4A','01016800045858','20301800995588','01910010974190','288540544712']){
        assert.equal(body.includes(secret),false,name+' must not render operational or banking data before unlock');
      }
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' must fit mobile width');
    }

    // History page: no plaintext before login, retain older paid/unpaid transactions,
    // and exclude current-week records by default while allowing explicit inclusion.
    await p.goto(origin+'/accounting-history.html');
    await p.waitForLoadState('networkidle');
    const historyCheck=await p.evaluate(async()=>{
      const H=HouseAccounting,cycle=H.current(),previous=H.addDays(cycle,-7);
      const oldFriday=H.addDays(previous,-4);
      window.HOUSE_PETTY_CASH_DATA={entries:[
        {id:"old-fund",date:previous,manager:"馬卡",kind:"fund",item:"之前入帳",amount:500,status:"active"},
        {id:"current-fund",date:cycle,manager:"馬卡",kind:"fund",item:"本週入帳",amount:100,status:"active"}
      ]};
      HouseSecureApp.unlock=async()=>({
        ops:{updated_at:"2026-10-20T12:00:00+08:00",weekly_accounts:[
          {id:"vendor-old-paid",kind:"vendor",party:"歷史已付廠商",property_label:"A101",
            description:"舊維修",amount:1000,settlement_date:oldFriday,status:"paid",paid_date:previous},
          {id:"vendor-old-pending",kind:"vendor",party:"歷史未付廠商",property_label:"B102",
            description:"舊欠款",amount:500,settlement_date:oldFriday,status:"pending"},
          {id:"refund-current",kind:"refund",party:"本期退款房客",property_label:"C103",
            description:"押金退還",amount:2222,settlement_date:H.addDays(cycle,-5),
            due_date:cycle,status:"pending"}
        ]},finance:{accounts:[]},vault:{properties:[]}
      });
      document.querySelector('#unlock').click();
      await new Promise(resolve=>setTimeout(resolve,30));
      const archive=HouseHistoryDebug.filtered();
      const archiveAmount=document.querySelector('#nAmount').textContent;
      const archiveUnpaid=document.querySelector('#nUnpaid').textContent;
      document.querySelector('#includeCurrent').click();
      const total=HouseHistoryDebug.filtered();
      document.querySelector('#kind').value='refund';
      document.querySelector('#kind').dispatchEvent(new Event('change'));
      const refunds=HouseHistoryDebug.filtered();
      document.querySelector('#keyword').value='本期退款';
      document.querySelector('#keyword').dispatchEvent(new Event('input'));
      const search=HouseHistoryDebug.filtered();
      return {archiveIds:archive.map(x=>x.id).sort(),
        archiveAmount,archiveUnpaid,totalCount:total.length,
        refundCount:refunds.length,searchIds:search.map(x=>x.id),
        cycle:HouseAccounting.period({kind:"vendor",settlement_date:oldFriday}),expected:previous};
    });
    assert.deepEqual(historyCheck.archiveIds,['old-fund','vendor-old-paid','vendor-old-pending']);
    assert.equal(historyCheck.archiveAmount,"$1,500");
    assert.equal(historyCheck.archiveUnpaid,"$500");
    assert.equal(historyCheck.totalCount,5);
    assert.equal(historyCheck.refundCount,1);
    assert.deepEqual(historyCheck.searchIds,['refund-current']);
    assert.equal(historyCheck.cycle,historyCheck.expected);

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
    assert.equal(weekly.includes('function groupedPending(rows)'),true,'finance must preserve same-vendor weekly aggregation');
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
    assert.equal(secureApp.includes('0222440022171'),false,'complete Yidai bank account must not appear in public source');
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
          vacancies:[{room:"新退租A",address:"示範地址",rent:9000,status:"vacant",source:"原空房"},{room:"民生303",address:"測試民生地址",source:"管理空房",status:"vacant"}],
          rented:[{room:"平德401",address:"測試地址"},{room:"已重新出租B",address:"另一地址",updated_at:"2026-10-11",status:"rented"}],
          checkouts:[
            {room:"新退租A",checkout_date:"2026-09-01",deposit:24000,power_rate:5},
            {room:"新退租A",checkout_date:"2026-10-11",deposit:30000,power_rate:5.5},
            {room:"已重新出租B",checkout_date:"2026-09-09",deposit:26000,power_rate:5}
          ],weekly_accounts:[]
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
        saveButton:document.querySelector('[data-save-account][data-account-id="refund-pingde-401-20261002"]')===null,
        bank:s.finance.accounts.find(x=>x.id==="refund-pingde-401-20261002"),
        pingshun:s.ops.checkouts.find(x=>x.room==="平順403"),
        pingshunWeekly:s.ops.weekly_accounts.find(x=>x.id==="refund-pingshun403-20261009"),
        pingshunBank:s.finance.accounts.find(x=>x.id==="refund-pingshun403-20261009"),
        pingshunVacancy:s.ops.vacancies.filter(x=>x.room==="平順403").length,
        pingshunRemovedFromRented:s.ops.rented.every(x=>x.room!=="平順403"),
        taiyuan:s.ops.checkouts.find(x=>x.room==="太原D"),
        taiyuanWeekly:s.ops.weekly_accounts.find(x=>x.id==="refund-taiyuan-d-20261009"),
        taiyuanBank:{...(s.finance.accounts.find(x=>x.id==="refund-taiyuan-d-20261009")||{})},
        taiyuanVacancy:s.ops.vacancies.filter(x=>x.room==="太原D").length,
        taiyuanNotRented:s.ops.rented.every(x=>x.room!=="太原D"),
        taiyuanAccountEntry:document.querySelector('[data-account-id="refund-taiyuan-d-20261009"]')!==null,
        taiyuanAccountDisplayed:document.querySelector("#tb")?.textContent.includes("0000473541080310")||false,
        pingdeVacancy:s.ops.vacancies.find(v=>v.room==="平德401"),
        pingshunVacancyItem:s.ops.vacancies.find(v=>v.room==="平順403"),
        taiyuanVacancyItem:s.ops.vacancies.find(v=>v.room==="太原D"),
        autoPricedVacancy:s.ops.vacancies.find(v=>v.room==="新退租A"),
        autoPricedVacancyCount:s.ops.vacancies.filter(v=>v.room==="新退租A").length,
        historicalRentalKept:s.ops.rented.some(v=>v.room==="已重新出租B"),
        historicalRentalNotVacant:s.ops.vacancies.every(v=>v.room!=="已重新出租B"),
        minshengRented:s.ops.rented.find(r=>r.room==="民生303"),
        minshengRentedCount:s.ops.rented.filter(r=>r.room==="民生303").length,
        minshengVacant:s.ops.vacancies.some(v=>v.room==="民生303"),
        xuefuCheckout:s.ops.checkouts.find(x=>x.room==="學府702"),
        xuefuWeekly:s.ops.weekly_accounts.find(x=>x.id==="refund-xuefu702-20261008"),
        xuefuBank:s.finance.accounts.find(x=>x.id==="refund-xuefu702-20261008"),
        xuefuVacancy:s.ops.vacancies.find(x=>x.room==="學府702"),
        xuefuVacancyCount:s.ops.vacancies.filter(x=>x.room==="學府702").length,
        xuefuRented:s.ops.rented.some(x=>x.room==="學府702"),
        xuefuRendered:document.querySelector("#tb")?.textContent.includes("288540544712"),
        zhongqingCheckout:s.ops.checkouts.find(x=>x.room==="中清11-3A"),
        zhongqingWeekly:s.ops.weekly_accounts.find(x=>x.id==="refund-zhongqing11-3a-20261013"),
        zhongqingVacancy:s.ops.vacancies.find(x=>x.room==="中清11-3A"),
        zhongqingRented:s.ops.rented.find(x=>x.room==="中清11-3A"),
        zhongqingRentalCount:s.ops.rented.filter(x=>x.room==="中清11-3A").length,
        zhongqingBank:s.finance.accounts.find(x=>x.id==="refund-zhongqing11-3a-20261013"),
        zhongqingEntry:document.querySelector('[data-account-id="refund-zhongqing11-3a-20261013"]')!==null

      };
      return before;
    });
    assert.deepEqual(refundCheck.checkout,{date:"2026-10-02",due:"2026-10-06",amount:24218,usage:324,electricity_fee:1782,status:"paid"},'Pingde 401 checkout must retain amounts and show completed refund');
    assert.deepEqual(refundCheck.pending,{amount:24218,due:"2026-10-06",status:"paid"},'weekly accounting must retain Pingde 401 refund history as paid');
    assert.equal(refundCheck.vacancy,true,'Pingde 401 must return to vacancies');
    assert.equal(refundCheck.noLongerRented,true,'Pingde 401 must not remain in rented list');
    assert.equal(refundCheck.saveButton,true,'checkout should display the saved refund account directly');
    assert.equal(refundCheck.bank?.bank_code,"013",'refund must retain user-provided bank code');
    assert.equal(refundCheck.zhongqingCheckout?.checkout_date,"2026-10-13","Zhongqing 11-3A handover date must be October 13");
    assert.equal(refundCheck.zhongqingCheckout?.refund_due_date,"2026-10-20","Zhongqing refund must be due October 20");
    assert.equal(refundCheck.zhongqingCheckout?.refund_amount,36489,"Zhongqing deposit refund must be 36,489");
    assert.equal(refundCheck.zhongqingCheckout?.electricity_usage,93,"Zhongqing power usage must be 93 units");
    assert.equal(refundCheck.zhongqingCheckout?.electricity_fee,511,"Zhongqing user-confirmed electricity fee must be 511");
    assert.equal(refundCheck.zhongqingCheckout?.electricity_exact,511.5,"Zhongqing calculated power fee must retain 0.5 discrepancy");
    assert.equal(refundCheck.zhongqingCheckout?.refund_status,"paid","Zhongqing refund is paid");
    assert.equal(refundCheck.zhongqingCheckout?.refund_paid_date,"2026-10-20","Zhongqing paid date is recorded");
    assert.equal(refundCheck.zhongqingWeekly?.amount,36489,"Zhongqing weekly accounting must match refund");
    assert.equal(refundCheck.zhongqingWeekly?.status,"paid","Zhongqing weekly refund is paid");
    assert.equal(refundCheck.zhongqingWeekly?.paid_date,"2026-10-20","Zhongqing weekly payment date is recorded");
    assert.equal(refundCheck.zhongqingVacancy,undefined,"Zhongqing 11-3A is no longer vacant");
    assert.equal(refundCheck.zhongqingRented?.status,"rented","Zhongqing 11-3A is rented again");
    assert.equal(refundCheck.zhongqingRentalCount,1,"Zhongqing 11-3A rental must not duplicate");
    assert.ok(refundCheck.zhongqingRented?.updated_at>="2026-10-29","Zhongqing 11-3A status update must be recent");
    assert.equal(refundCheck.zhongqingBank?.bank_code,"812","Zhongqing refund bank code must be 812");
    assert.equal(refundCheck.zhongqingBank?.secure_local,false,"Zhongqing paid refund account does not require entry");
    assert.equal(refundCheck.zhongqingBank?.bank_account,"","Paid Zhongqing account is cleared");
    assert.equal(refundCheck.zhongqingEntry,false,"Zhongqing refund account entry is removed after payment");
    assert.equal(refundCheck.bank?.bank_name,"國泰世華",'refund must display Cathay United Bank name');
    assert.equal(refundCheck.bank?.bank_account,"699512385196",'refund must display the updated bank account directly');
    assert.equal(refundCheck.pingshun?.checkout_date,"2026-10-09","Pingshun checkout date must be October 9");
    assert.equal(refundCheck.pingshun?.refund_due_date,"2026-10-13","Pingshun refund is due October 13");
    assert.equal(refundCheck.pingshun?.refund_amount,23709,"Pingshun refund is 23,709");
    assert.equal(refundCheck.pingshun?.refund_status,"paid","Pingshun refund is confirmed paid");
    assert.equal(refundCheck.pingshun?.refund_paid_date,"2026-10-13","Pingshun refund paid date is October 13");
    assert.equal(refundCheck.pingshun?.deposit,24000,"Pingshun deposit is 24,000");
    assert.equal(refundCheck.pingshun?.electricity_usage,53,"Pingshun electricity usage is 53 units");
    assert.equal(refundCheck.pingshun?.electricity_fee,291,"user-stated electricity deduction is 291");
    assert.equal(refundCheck.pingshun?.electricity_exact,291.5,"exact electricity amount must be recorded");
    assert.equal(refundCheck.pingshunWeekly?.status,"paid","Pingshun completed transfer must be removed from the pending list");
    assert.equal(refundCheck.pingshunWeekly?.paid_date,"2026-10-13","Pingshun accounting must retain paid date");
    assert.equal(refundCheck.pingshunWeekly?.amount,23709,"Pingshun weekly transfer is 23,709");
    assert.equal(refundCheck.pingshunWeekly?.due_date,"2026-10-13","Pingshun weekly transfer due date is October 13");
    assert.equal(refundCheck.pingshunWeekly?.settlement_date,"2026-10-09","Pingshun refund is listed in October 9 Friday batch");
    assert.equal(refundCheck.pingshunVacancy,1,"Pingshun must return to the vacancy list once");
    assert.equal(refundCheck.pingshunRemovedFromRented,true,"Pingshun must not remain recently rented");
    assert.equal(refundCheck.pingshunBank?.bank_code,"013","Pingshun bank code must be 013");
    assert.equal(refundCheck.pingshunBank?.bank_name,"國泰世華","Pingshun bank name must be displayed");
    assert.equal(refundCheck.pingshunBank?.secure_local,false,"Pingshun bank should require no device-local setup");
    assert.equal(refundCheck.pingshunBank?.bank_account,"063506286192","Pingshun bank should be shown directly after unlock, including the leading zero");
    assert.equal(secureApp.includes('pingshunBank.bank_account="063506286192"'),true,"Pingshun account is loaded directly on all devices");
    assert.equal(secureApp.includes('pingshunCheckout.refund_status="paid"'),true,"Pingshun checkout must be marked paid");
    assert.equal(secureApp.includes('pingshunCheckout.refund_paid_date="2026-10-13"'),true,"Pingshun checkout must retain refund completion date");
    assert.equal(secureApp.includes('pingshunRefund.status="paid"'),true,"Pingshun refund must not appear in pending weekly accounting");
    assert.equal(secureApp.includes('pingshunRefund.paid_date="2026-10-13"'),true,"Pingshun weekly refund must retain payment date");
    assert.equal(secureApp.includes('taiyuanCheckout.refund_status="paid"'),true,"Taiyuan D paid status must be set only for its dated checkout");
    assert.equal(secureApp.includes('taiyuanRefund.status="paid"'),true,"Taiyuan D weekly payment must be settled by its specific ID");
    assert.equal(secureApp.includes('taiyuanRefund.paid_date="2026-10-13"'),true,"Taiyuan D weekly settlement date must be October 13");
    assert.equal(secureApp.includes('xuefuPaidCheckout.refund_status="paid"'),true,"Xuefu 702 paid status must be set only for its dated checkout");
    assert.equal(secureApp.includes('xuefuRefund.status="paid"'),true,"Xuefu 702 weekly payment must be settled by its specific ID");
    assert.equal(secureApp.includes('xuefuRefund.paid_date="2026-10-13"'),true,"Xuefu 702 weekly settlement date must be October 13");

    assert.equal(checkout.includes("data-save-account"),true,"existing checkout account entry fallback is retained for other records");
    assert.equal(refundCheck.taiyuan?.room,"太原D","Taiyuan D must be a checkout");
    assert.equal(refundCheck.taiyuan?.checkout_date,"2026-10-09","Taiyuan D checkout was on October 9");
    assert.equal(refundCheck.taiyuan?.refund_due_date,"2026-10-13","Taiyuan D refund is scheduled for October 13");
    assert.equal(refundCheck.taiyuan?.refund_status,"paid","Taiyuan D refund was confirmed paid");
    assert.equal(refundCheck.taiyuan?.refund_paid_date,"2026-10-13","Taiyuan D refund was completed on October 13");
    assert.equal(refundCheck.taiyuan?.refund_amount,23515,"Taiyuan D refund is 23,515");
    assert.equal(refundCheck.taiyuan?.deposit,26000,"Taiyuan D deposit is 26,000");
    assert.equal(refundCheck.taiyuan?.meter_previous,12191,"Taiyuan D previous electricity reading must match handover");
    assert.equal(refundCheck.taiyuan?.meter_current,12688,"Taiyuan D current electricity reading must match handover");
    assert.equal(refundCheck.taiyuan?.electricity_usage,497,"Taiyuan D electricity use is 497");
    assert.equal(refundCheck.taiyuan?.power_rate,5,"Taiyuan D electricity rate is 5");
    assert.equal(refundCheck.taiyuan?.electricity_fee,2485,"Taiyuan D electricity fee is 2,485");
    assert.equal(refundCheck.taiyuanWeekly?.amount,23515,"Taiyuan D weekly pending refund amount must be 23,515");
    assert.equal(refundCheck.taiyuanWeekly?.status,"paid","Taiyuan D weekly refund must no longer be pending");
    assert.equal(refundCheck.taiyuanWeekly?.paid_date,"2026-10-13","Taiyuan D weekly accounts must preserve refund completion date");
    assert.equal(refundCheck.taiyuanWeekly?.due_date,"2026-10-13","Taiyuan D weekly refund deadline must be October 13");
    assert.equal(refundCheck.taiyuanWeekly?.settlement_date,"2026-10-09","Taiyuan D weekly batch date must be October 9");
    assert.equal(refundCheck.taiyuanVacancy,1,"Taiyuan D must appear exactly once in vacancies");
    assert.equal(refundCheck.pingdeVacancy?.rent,13000,"Pingde 401 vacancy monthly rent must be half of the 26,000 deposit");
    assert.equal(refundCheck.pingdeVacancy?.power_rate,5.5,"Pingde 401 vacancy must retain checkout electricity rate");
    assert.equal(refundCheck.pingshunVacancyItem?.rent,12000,"Pingshun 403 vacancy monthly rent must be half of the 24,000 deposit");
    assert.equal(refundCheck.pingshunVacancyItem?.power_rate,5.5,"Pingshun 403 vacancy must retain checkout electricity rate");
    assert.equal(refundCheck.taiyuanVacancyItem?.rent,13000,"Taiyuan D vacancy monthly rent must be half of the 26,000 deposit");
    assert.equal(refundCheck.taiyuanVacancyItem?.power_rate,5,"Taiyuan D vacancy must retain checkout electricity rate");
    assert.equal(refundCheck.taiyuanVacancyItem?.source,"退租轉空房","Taiyuan D must be flagged as a checkout-based vacancy");
    assert.equal(refundCheck.autoPricedVacancy?.rent,15000,"latest checkout deposit must override older rents for future checkouts");
    assert.equal(refundCheck.autoPricedVacancy?.power_rate,5.5,"future checkout must set the vacancy electricity rate");
    assert.equal(refundCheck.autoPricedVacancy?.since,"2026-10-11","new vacancy must use checkout date");
    assert.equal(refundCheck.autoPricedVacancyCount,1,"future checkout must not duplicate existing vacancies");
    assert.equal(refundCheck.historicalRentalKept,true,"a re-rented room newer than its checkout must stay rented");
    assert.equal(refundCheck.historicalRentalNotVacant,true,"historical checkout must not vacate a subsequently re-rented room");
    assert.equal(refundCheck.minshengVacant,false,"Minsheng 303 must not appear as a vacancy after rental");
    assert.equal(refundCheck.minshengRentedCount,1,"Minsheng 303 must appear exactly once in rented rooms");
    assert.equal(refundCheck.minshengRented?.rent,13500,"Minsheng 303 must preserve the monthly rent of 13,500");
    assert.equal(refundCheck.minshengRented?.power_rate,5.5,"Minsheng 303 electricity rate remains 5.5 per unit");
    assert.equal(refundCheck.minshengRented?.updated_at,"2026-10-12","Minsheng 303 rental date must be October 12");
    assert.equal(refundCheck.minshengRented?.status,"rented","Minsheng 303 must be marked rented");
    assert.equal(secureApp.includes('findIndex(r=>r.room==="民生303")'),true,"Minsheng 303 rental must target its own room");
    assert.equal(secureApp.includes('ops.vacancies.splice(minsheng303,1)'),true,"Minsheng 303 must be removed from the vacancy list");
    assert.equal(refundCheck.xuefuCheckout?.checkout_date,"2026-10-08","Xuefu 702 handover occurred October 8");
    assert.equal(refundCheck.xuefuCheckout?.refund_due_date,"2026-10-13","Xuefu 702 planned refund is October 13");
    assert.equal(refundCheck.xuefuCheckout?.refund_amount,19000,"Xuefu 702 refund must be 19,000");
    assert.equal(refundCheck.xuefuCheckout?.refund_status,"paid","Xuefu 702 was confirmed refunded");
    assert.equal(refundCheck.xuefuCheckout?.refund_paid_date,"2026-10-13","Xuefu 702 refund was completed on October 13");
    assert.equal(refundCheck.xuefuCheckout?.utilities_status,"settled_proof_pending","Xuefu 702 utilities settled but evidence pending");
    assert.equal(refundCheck.xuefuCheckout?.receipt_status,"pending","Xuefu 702 utility proof remains outstanding");
    assert.equal(refundCheck.xuefuCheckout?.note.includes("待租客傳送繳費證明"),true,"Xuefu 702 checkout note must request proof");
    assert.equal(refundCheck.xuefuCheckout?.note.includes("台水、台電已結清"),true,"Xuefu 702 must keep settled utility status");
    assert.equal(refundCheck.xuefuCheckout?.note.includes("月租 9,500 元"),true,"Xuefu 702 checkout notes should reflect the confirmed vacancy rent");
    assert.equal(refundCheck.xuefuCheckout?.deposit,19000,"Xuefu 702 original deposit is 19,000");
    assert.equal(refundCheck.xuefuWeekly?.status,"paid","Xuefu 702 must be removed from pending transfers");
    assert.equal(refundCheck.xuefuWeekly?.paid_date,"2026-10-13","Xuefu 702 weekly account must retain completion date");
    assert.equal(refundCheck.xuefuWeekly?.amount,19000,"Xuefu 702 weekly transfer must be 19,000");
    assert.equal(refundCheck.xuefuWeekly?.due_date,"2026-10-13","Xuefu 702 weekly transfer is due October 13");
    assert.equal(refundCheck.xuefuWeekly?.description.includes("待租客提供繳費證明"),true,"pending utility receipt must be visible in weekly accounting");
    assert.equal(refundCheck.xuefuBank?.bank_code,"822","Xuefu 702 bank must be CTBC code 822");
    assert.equal(refundCheck.xuefuBank?.bank_name,"中國信託","Xuefu 702 bank must be named");
    assert.equal(refundCheck.xuefuBank?.bank_account,"288540544712","Xuefu 702 bank account must display directly");
    assert.equal(refundCheck.xuefuBank?.secure_local,false,"Xuefu 702 must not need local entry on each device");
    assert.equal(refundCheck.xuefuRendered,true,"Xuefu 702 bank account must display on checkout page after unlock");
    assert.equal(refundCheck.xuefuVacancyCount,1,"Xuefu 702 must appear exactly once among vacancies");
    assert.equal(refundCheck.xuefuVacancy?.status,"vacant","Xuefu 702 must be marked vacant");
    assert.equal(refundCheck.xuefuVacancy?.source,"退租轉空房","Xuefu 702 vacancy must originate from checkout");
    assert.equal(refundCheck.xuefuVacancy?.rent,9500,"Xuefu vacancy monthly rent must equal half the confirmed 19,000 deposit");
    assert.equal(refundCheck.xuefuVacancy?.rent_pending,false,"Xuefu vacancy rent must no longer be pending deposit information");
    assert.equal(refundCheck.xuefuRented,false,"Xuefu 702 must no longer be rented");
    assert.equal(vacancy.includes("月租待補原押金"),true,"vacancy cards must explain missing deposit");
    assert.equal(secureApp.includes('xuefuBank.bank_account="288540544712"'),true,"Xuefu 702 direct bank account is shared across device loads");
    assert.equal(secureApp.includes('const latestCheckouts=new Map()'),true,"generic checkout to vacancy mapping must be maintained");
    assert.equal(secureApp.includes('deposit/2'),true,"vacancy rent must be half of original deposit, not the refunded amount");
    assert.equal(refundCheck.taiyuanNotRented,true,"Taiyuan D must no longer be rented");
    assert.equal(refundCheck.taiyuanBank?.bank_code,"822","Taiyuan D bank code must be 822");
    assert.equal(refundCheck.taiyuanBank?.bank_name,"中國信託","Taiyuan D bank name must be CTBC");
    assert.equal(refundCheck.taiyuanBank?.bank_account_last4,"0310","Taiyuan D account hint must preserve last four digits");
    assert.equal(refundCheck.taiyuanBank?.secure_local,false,"Taiyuan D should show the account on all devices without local setup");
    assert.equal(refundCheck.taiyuanBank?.bank_account,"0000473541080310","Taiyuan D full bank account must be shown with its leading zeros");
    assert.equal(refundCheck.taiyuanAccountEntry,false,"Taiyuan D must not show a manual account entry form");
    assert.equal(refundCheck.taiyuanAccountDisplayed,true,"Taiyuan D complete bank account must be visible in checkout after unlock");
    assert.equal(secureApp.includes('taiyuanBank.bank_account="0000473541080310"'),true,"Taiyuan D bank account must be populated directly on every device");

    assert.equal(secureApp.includes('pingde401Checkout.refund_status="paid"'),true,'Pingde 401 checkout must be marked refunded');
    assert.equal(secureApp.includes('pingde401Checkout.refund_paid_date="2026-10-06"'),true,'Pingde 401 checkout must retain completion date');
    assert.equal(secureApp.includes('pingde401Refund.status="paid"'),true,'Pingde 401 weekly refund must be removed from pending list');
    assert.equal(secureApp.includes('pingde401Refund.paid_date="2026-10-06"'),true,'Pingde 401 weekly refund must retain paid date');

    await p.goto(origin+'/weekly-accounting.html');
    await p.waitForLoadState('networkidle');
    const lightingCheck=await p.evaluate(async()=>{
      HouseTrusted.decryptVaultWithKey=async(blob)=>{
        if(blob===HOUSE_OPS_SECURE)return {weekly_accounts:[{
          id:"old-xu-bank-source",kind:"vendor",party:"徐志騰（通水管）",
          property_label:"平德201",amount:3000,settlement_date:"2026-10-02",status:"pending"
        }],checkouts:[],vacancies:[],rented:[]};
        if(blob===HOUSE_FINANCE_SECURE)return {accounts:[{
          id:"old-xu-bank-source",bank_code:"TEST",bank_name:"測試銀行",bank_account:"ENCRYPTED_VAULT_ACCOUNT"
        }]};
        if(blob===HOUSE_VAULT)return {properties:[]};
        return {};
      };
      const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
      const session=await HouseSecureApp.loadWithKey(key);
      await render(session);
      const pair=session.ops.weekly_accounts.filter(x=>x.party==="鄭國峰（水電）");
      const visible=groupedPending(session.ops.weekly_accounts.filter(x=>x.status!=="paid")).filter(x=>x.party==="鄭國峰（水電）");
      const payees=pair;
      const bankRows=session.finance.accounts.filter(x=>payees.some(p=>p.id===x.id));
      const repair=session.ops.weekly_accounts.find(x=>x.id==="vendor-xuzhiteng-jingcheng301-drain-20261013");
      const repairAccount=session.finance.accounts.find(x=>x.id===repair?.id);
      const previous=session.ops.weekly_accounts.find(x=>x.id==="old-xu-bank-source");
      const yidaiRows=session.ops.weekly_accounts.filter(x=>x.party==="一代家電");
      const yidaiDisplayed=groupedPending(session.ops.weekly_accounts.filter(x=>x.status!=="paid")).filter(x=>x.party==="一代家電");
      const yidaiBankRows=session.finance.accounts.filter(x=>yidaiRows.some(row=>row.id===x.id));
      const yidaiDirectBank=bankFor(yidaiDisplayed[0]);
      const xuDirectBank=bankFor(session.ops.weekly_accounts.find(x=>x.id==="vendor-xuzhiteng-jingcheng301-drain-20261013"));
      const yidaiDirectCopyReady=[...document.querySelectorAll('#tb button[data-copy="account"]')].some(button=>{
        const row=DISPLAY[Number(button.dataset.i)];
        return row?.party==="一代家電"&&!button.disabled;
      });
      const yidaiSecureEntry=document.querySelector('[data-finance-id="vendor-yidai-wuchang5c-aircon-20261015"]')!==null;
      const yidaiReceiptButtons=[...document.querySelectorAll('#tb button[data-receipt-url]')].filter(b=>yidaiRows.some(x=>x.receipt_url===b.dataset.receiptUrl)).length;
      const yidaiAccountsInitiallyEmpty=yidaiBankRows.every(x=>!x.bank_account);
      const exampleAccount="0123456789012";
      await HouseSecureApp.saveFinanceAccount(session,"vendor-yidai-wuchang5c-aircon-20261015",exampleAccount);
      await render(session);
      const yidaiSharedAfterSave=yidaiBankRows.every(x=>x.bank_account===exampleAccount);
      const yidaiAccountCopyEnabled=[...document.querySelectorAll('#tb button[data-copy="account"]')].some(button=>{
        const row=DISPLAY[Number(button.dataset.i)];
        return row?.party==="一代家電"&&!button.disabled;
      });
      const yidaiEncryptedStored=!String(localStorage.getItem("house_ops_finance_account_v1:vendor-yidai-wuchang5c-aircon-20261015")).includes(exampleAccount);
      return {
        items:pair.length,grouped:visible.length,
        total:pair.reduce((sum,x)=>sum+Number(x.amount||0),0),
        rooms:pair.map(x=>x.property_label).join("、"),
        receipts:document.querySelectorAll('#tb button[data-receipt-url]').length,
        matchingBank:bankRows.length===2&&bankRows[0].bank_account===bankRows[1].bank_account,
        allPaid:pair.every(x=>x.status==="paid"&&x.paid_date==="2026-10-13"),
        zhongqingPending:DISPLAY.some(x=>x.id==="refund-zhongqing11-3a-20261013"),
        xuRepair:repair&&{party:repair.party,room:repair.property_label,item:repair.description,
          amount:repair.amount,date:repair.settlement_date,status:repair.status,receipt:repair.receipt_url},
        priorXuSettled:previous?.status==="paid",
        xuBankCopied:repairAccount?.bank_account==="ENCRYPTED_VAULT_ACCOUNT"&&repairAccount?.bank_code==="TEST",
        xuRowUnique:session.ops.weekly_accounts.filter(x=>x.id===repair?.id).length===1,
        yidaiCount:yidaiRows.length,
        yidaiGrouped:yidaiDisplayed.length,
        yidaiAmount:yidaiRows.reduce((total,x)=>total+Number(x.amount||0),0),
        yidaiRooms:yidaiDisplayed[0]?.property_label,
        yidaiItems:yidaiRows.map(x=>[x.property_label,x.description,x.amount]),
        yidaiPending:yidaiRows.every(x=>x.status==="pending"&&x.settlement_date==="2026-10-16"),
        yidaiReceipts:yidaiReceiptButtons,
        yidaiBankCode:yidaiBankRows.every(x=>x.bank_code==="808"&&x.bank_name==="玉山銀行"),
        yidaiAccountIds:yidaiBankRows.every(x=>x.account_storage_id==="vendor-yidai-wuchang5c-aircon-20261015"),
        yidaiSecureCount:yidaiBankRows.filter(x=>x.secure_local).length,
        yidaiSecureEntry,
        yidaiDirectBank,
        xuDirectBank,
        yidaiDirectCopyReady,
        yidaiAccountsInitiallyEmpty,
        yidaiSharedAfterSave,yidaiAccountCopyEnabled,yidaiEncryptedStored
      };
    });
    assert.deepEqual(lightingCheck,{
      items:2,grouped:0,total:1500,rooms:"中清11-1B、一中7B",
      receipts:0,matchingBank:true,allPaid:true,zhongqingPending:false,
      xuRepair:{party:"徐志騰（包通）",room:"精誠301",item:"通浴室管道",
        amount:1500,date:"2026-10-16",status:"pending",
        receipt:"https://drive.google.com/file/d/1zsb3p98LNFK4nSNrnvCsxp6UE74qQSkT/view?usp=drivesdk"},
      priorXuSettled:true,xuBankCopied:true,xuRowUnique:true,
      yidaiCount:3,yidaiGrouped:1,yidaiAmount:58000,
      yidaiRooms:"五常5C、五權五202、市政愛悅",
      yidaiItems:[["五常5C","冷氣更換",23500],["五權五202","冷氣更換",23500],["市政愛悅","裝電視",11000]],
      yidaiPending:true,yidaiReceipts:0,yidaiBankCode:true,yidaiAccountIds:true,yidaiSecureCount:1,
      yidaiSecureEntry:false,
      yidaiDirectBank:{bank_code:"808",bank_name:"玉山銀行",bank_account:"0222440022171"},
      xuDirectBank:{bank_code:"053",bank_name:"台中銀行（北太平分行）",bank_account:"025200180300"},
      yidaiDirectCopyReady:false,yidaiAccountsInitiallyEmpty:true,
      yidaiSharedAfterSave:true,yidaiAccountCopyEnabled:false,yidaiEncryptedStored:true
    },'completed Zheng Guofeng transfers must no longer appear in pending and bank details remain linked');

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
