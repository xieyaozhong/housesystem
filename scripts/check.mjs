import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = process.cwd();
let checked = 0;
for (const name of fs.readdirSync(root)) {
  if (name.endsWith('.js')) { new vm.Script(fs.readFileSync(name, 'utf8'), { filename: name }); checked++; }
  if (!name.endsWith('.html')) continue;
  const html = fs.readFileSync(name, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!match[1].includes('src=')) new vm.Script(match[2], { filename: name });
  }
  for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const target = match[1];
    if (/^(https?:|about:|data:)/.test(target)) continue;
    if (!fs.existsSync(path.join(root, target))) throw new Error(name + ': missing local asset ' + target);
  }
  checked++;
}
console.log('Syntax and local links verified for ' + checked + ' application files.');
