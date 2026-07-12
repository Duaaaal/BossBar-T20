import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryOutput = path.join(os.tmpdir(), 'boss-battle-forge-output');
const projectOutput = path.join(projectRoot, 'out');
const forgeCli = path.join(
  projectRoot,
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);

const runForge = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [forgeCli, 'make'], {
      cwd: projectRoot,
      env: { ...process.env, BOSS_BUILD_OUT: temporaryOutput },
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Electron Forge terminou com o código ${code ?? 'desconhecido'}.`));
    });
  });

await rm(temporaryOutput, { recursive: true, force: true });

try {
  await runForge();
  await rm(projectOutput, { recursive: true, force: true });
  await mkdir(path.dirname(projectOutput), { recursive: true });
  await cp(temporaryOutput, projectOutput, { recursive: true });
  console.log(`\nInstalador copiado para: ${path.join(projectOutput, 'make')}`);
} finally {
  await rm(temporaryOutput, { recursive: true, force: true });
}
