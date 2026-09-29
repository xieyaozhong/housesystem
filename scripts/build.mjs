import fs from 'node:fs';
const files = ['index.html','vacancy.html','checkout.html','sync-setup.html','mobile-login.html','weekly-accounting.html','upload-local.html','house-core.js','cloud-sync.js','trusted-device.js','secure-data.js','app-session.js','sync-setup.js','mobile-login.js','weekly-accounting.js','public-data.js','public-style.css','setup.css'];
fs.mkdirSync('_site', { recursive: true });
for (const file of files) fs.copyFileSync(file, '_site/' + file);
fs.writeFileSync('_site/.nojekyll', '');
fs.writeFileSync('_site/release.json', JSON.stringify({ version: '2.0.0', commit: process.env.GITHUB_SHA || 'local-preview' }));
console.log('Built ' + files.length + ' runtime files for GitHub Pages.');
