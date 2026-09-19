import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage, statFile } from '@electron/asar';

// Forge restores an existing development .vite directory after packaging.
// E2E must exercise the packaged build, not a stale localhost development URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(process.env.BOSS_BUILD_OUT || path.join(root, 'out'),
  `${manifest.productName}-${process.platform}-${process.arch}`, 'resources', 'app.asar');
const compiledRoot = path.join(root, '.vite');
let count = 0;
for (const entry of listPackage(archive)) {
  const archivePath = entry.replace(/^[/\\]/, '');
  const parts = archivePath.split(/[/\\]/);
  if (parts[0] !== '.vite' || !['build', 'renderer'].includes(parts[1])) continue;
  if (statFile(archive, archivePath).files) continue;
  const target = path.resolve(root, ...parts);
  if (!target.startsWith(compiledRoot + path.sep)) throw new Error('Destino fora da compilação de testes.');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, extractFile(archive, archivePath));
  count++;
}
if (!count) throw new Error('O pacote não contém a compilação do Electron. Execute npm run package.');
console.log(`Electron E2E: ${count} arquivos de produção preparados; perfis dos testes continuam isolados.`);
