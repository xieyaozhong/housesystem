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
    const retiredPublic=fs.readFileSync(path.join(root,'public-data.js'),'utf8');
    for(const secret of ['明德5C','明德6D','一中4A','台中市南區明德街66號']){
      assert.equal(opsSource.includes(secret),false,'encrypted operations payload must not contain plaintext operational data');
      assert.equal(retiredPublic.includes(secret),false,'retired public snapshot must not retain operational data');
    }
    for(const secret of ['01016800045858','20301800995588','01910010974190']){
      assert.equal(financeSource.includes(secret),false,'encrypted finance payload must not contain plaintext bank accounts');
    }

    const build=fs.readFileSync(path.join(root,'scripts/build.mjs'),'utf8');
    assert.equal(build.includes("'ops-secure.js'"),true,'Pages build must include encrypted operations payload');
    assert.equal(build.includes("'secure-app.js'"),true,'Pages build must include unified secure loader');
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
