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
    const trustedDevice=fs.readFileSync(path.join(root,'trusted-device.js'),'utf8');
    assert.equal(trustedDevice.includes("Array.isArray(s)?s.join(''):s"),true,'decryptor must support chunked encrypted payloads');

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
