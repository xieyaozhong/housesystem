import fs from 'node:fs';
const files = ['vendor-payables-secure.js','petty-cash-data.js','ops-delta-secure.js','index.html','vacancy.html','checkout.html','sync-setup.html','mobile-login.html','weekly-accounting.html','accounting-history.html','upload-local.html','house-core.js','cloud-sync.js','trusted-device.js','secure-data.js','app-session.js','sync-setup.js','mobile-login.js','weekly-accounting.js','ops-secure.js','finance-secure.js','secure-app.js','mingde-checkouts.js','zhongqing1a-checkout.js','mingde2a-checkout.js','nantun643-301-checkout.js','mingde3e-checkout.js','fengjia701-checkout.js','mingde4d-checkout.js','mingde3d-checkout.js','mingde4b-checkout.js','pingde501-checkout.js','minsheng303-repair.js','zhongmingnan867-r1-checkout.js','mingde-finance-cloud.js','payment-status-20261111.js','house-ops-live.js','house-ops-forms.js','supervisor-view.js','accounting-periods.js','accounting-history.js','vacancy-sort.js','public-style.css','secure-style.css','setup.css'];
fs.mkdirSync('_site', { recursive: true });
for (const file of files) fs.copyFileSync(file, '_site/' + file);
for (const page of files.filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync('_site/' + page, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const asset = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|about:)/.test(asset)) continue;
    if (!fs.existsSync('_site/' + asset)) {
      throw new Error(page + ': build artifact missing ' + asset);
    }
  }
}
fs.writeFileSync('_site/.nojekyll', '');
fs.writeFileSync('_site/release.json', JSON.stringify({ version: '2.0.0', commit: process.env.GITHUB_SHA || 'local-preview' }));
console.log('Built ' + files.length + ' runtime files for GitHub Pages.');
