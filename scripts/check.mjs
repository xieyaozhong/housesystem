import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
let checked = 0;
for (const name of fs.readdirSync(root)) {
  if (name.endsWith('.js')) {
    const source = fs.readFileSync(name, 'utf8');
    if (/^\s*(?:import|export)\s/m.test(source)) {
      const temp = path.join(os.tmpdir(), 'housesystem-check-' + process.pid + '-' + name.replace(/[^a-z0-9_.-]/gi, '_') + '.mjs');
      fs.writeFileSync(temp, source);
      try { execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' }); }
      finally { fs.rmSync(temp, { force: true }); }
    } else new vm.Script(source, { filename: name });
    checked++;
  }
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
