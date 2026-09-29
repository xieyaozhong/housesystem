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
    for(const name of ['index.html','vacancy.html','checkout.html']){
      await p.goto(origin+'/'+name);
      await p.waitForLoadState('networkidle');
      assert.equal(await p.locator('input[type="password"]').count(),0,name+' must stay public');
      assert.equal((await p.textContent('body')).includes('01910010974190'),false,name+' must not expose full bank account');
      assert.equal((await p.textContent('body')).includes('20301800995588'),false,name+' must not expose Mingde full bank account');
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,name+' must fit mobile width');
    }
    await p.goto(origin+'/vacancy.html');
    assert.equal(await p.locator('#cards').textContent().then(x=>x.includes('精誠301')),false,'rented Jingcheng 301 must not be listed as vacant');
    assert.equal(await p.locator('#rented').textContent().then(x=>x.includes('精誠301')),true,'rented Jingcheng 301 should appear in rented list');

    await p.goto(origin+'/checkout.html');
    assert.equal(await p.locator('#tb').textContent().then(x=>x.includes('一中4A')),true,'public checkout should show Yizhong 4A');
    assert.equal(await p.locator('#tb').textContent().then(x=>x.includes('22,079')),true,'public checkout should show refund amount');

    await p.goto(origin+'/weekly-accounting.html');
    await p.waitForLoadState('networkidle');
    assert.equal(await p.locator('input[type="password"]').count(),1,'finance accounting must require the management password');
    assert.equal(await p.locator('#lock').isVisible(),true,'finance accounting must start locked on a new device');
    assert.equal((await p.textContent('body')).includes('01910010974190'),false,'locked finance page must not render Yizhong full account');
    assert.equal((await p.textContent('body')).includes('20301800995588'),false,'locked finance page must not render Mingde full account');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'finance page must fit mobile width');
    const financeSource=fs.readFileSync(path.join(root,'finance-secure.js'),'utf8');
    assert.equal(financeSource.includes('01910010974190'),false,'encrypted finance file must not contain Yizhong plaintext account');
    assert.equal(financeSource.includes('20301800995588'),false,'encrypted finance file must not contain Mingde plaintext account');

    await p.goto(origin+'/mobile-login.html');
    await p.waitForURL(origin+'/index.html');
    console.log('PASS public house pages stay open while finance details require one-time device unlock');
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(e=>{console.error(e);server.close();process.exit(1)});
