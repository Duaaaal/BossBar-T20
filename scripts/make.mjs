import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
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

const readLastCommitSubject = () =>
  new Promise((resolve) => {
    execFile(
      'git',
      ['log', '-1', '--pretty=%s'],
      { cwd: projectRoot, encoding: 'utf8' },
      (error, stdout) => resolve(error ? null : stdout.trim()),
    );
  });

const assertVersionMatchesGit = async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const commitSubject = await readLastCommitSubject();
  const committedVersion = commitSubject?.match(
    /^Version\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/i,
  )?.[1];

  if (committedVersion && committedVersion !== packageJson.version) {
    throw new Error(
      `A versão do último commit é ${committedVersion}, mas package.json declara ${packageJson.version}. ` +
        `Atualize com "npm version ${committedVersion} --no-git-tag-version" antes de gerar o instalador.`,
    );
  }

  console.log(`Gerando instalador da versão ${packageJson.version}.`);
};

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

await assertVersionMatchesGit();
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
