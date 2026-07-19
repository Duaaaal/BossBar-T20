import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectOutput = path.join(projectRoot, 'out');
const forgeCli = path.join(
  projectRoot,
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);

const versionSubjectPattern =
  /^Version\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/i;

const readLatestCommittedVersion = () =>
  new Promise((resolve) => {
    execFile(
      'git',
      ['log', '--pretty=%s'],
      { cwd: projectRoot, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const committedVersion = stdout
          .split(/\r?\n/)
          .map((subject) => subject.match(versionSubjectPattern)?.[1])
          .find(Boolean);
        resolve(committedVersion ?? null);
      },
    );
  });

const assertVersionMatchesGit = async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const committedVersion = await readLatestCommittedVersion();

  if (committedVersion && committedVersion !== packageJson.version) {
    throw new Error(
      `A versão do último commit é ${committedVersion}, mas package.json declara ${packageJson.version}. ` +
        `Atualize com "npm version ${committedVersion} --no-git-tag-version" antes de gerar o instalador.`,
    );
  }

  console.log(`Gerando instalador da versão ${packageJson.version}.`);
};

const runForge = (temporaryOutput) =>
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

const moveDirectory = async (source, destination) => {
  try {
    await rename(source, destination);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await cp(source, destination, { recursive: true });
  }
};

const moveOutput = async (source, destination) => {
  const stagedOutput = `${destination}.next`;
  const previousOutput = `${destination}.previous`;
  await mkdir(path.dirname(destination), { recursive: true });
  await rm(stagedOutput, { recursive: true, force: true });
  await rm(previousOutput, { recursive: true, force: true });
  await moveDirectory(source, stagedOutput);

  let previousOutputExists = false;
  try {
    await rename(destination, previousOutput);
    previousOutputExists = true;
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EBUSY') {
      // O Explorer e antivírus podem manter um handle temporário na pasta `out`.
      // Nesse caso, atualizamos seu conteúdo sem trocar o diretório raiz.
      await cp(stagedOutput, destination, { recursive: true, force: true });
      await rm(stagedOutput, { recursive: true, force: true });
      return;
    }
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    await rename(stagedOutput, destination);
  } catch (error) {
    if (previousOutputExists) await rename(previousOutput, destination);
    throw error;
  }

  if (previousOutputExists) {
    await rm(previousOutput, { recursive: true, force: true });
  }
};

await assertVersionMatchesGit();
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'bossbar-t20-forge-'),
);
const temporaryOutput = path.join(temporaryRoot, 'out');

try {
  await runForge(temporaryOutput);
  await moveOutput(temporaryOutput, projectOutput);
  console.log(`\nInstalador disponível em: ${path.join(projectOutput, 'make')}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
