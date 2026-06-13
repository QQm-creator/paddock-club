import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist');
const allowedExtensions = new Set(['.html', '.css', '.js']);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name))) continue;
  if (entry.name === 'server.js') continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name));
}

await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await cp(path.join(root, '_headers'), path.join(output, '_headers'));

console.log('Cloudflare Pages output created in dist/');
