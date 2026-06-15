import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  const source = path.join(root, entry.name);
  const destination = path.join(output, entry.name);
  if (path.extname(entry.name) === '.html') {
    const html = await readFile(source, 'utf8');
    const tracked = html.includes('src="./analytics.js"')
      ? html
      : html.replace('</body>', '    <script src="./analytics.js"></script>\n  </body>');
    await writeFile(destination, tracked);
  } else {
    await cp(source, destination);
  }
}

await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await cp(path.join(root, '_headers'), path.join(output, '_headers'));

console.log('Cloudflare Pages output created in dist/');
