import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CLOUDFLARED_VERSION = '2026.7.2';
export const CLOUDFLARED_WINDOWS_X64_SHA256 =
  'cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9';
export const CLOUDFLARED_WINDOWS_X64_URL =
  `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`;

const MAX_CLOUDFLARED_DOWNLOAD_BYTES = 120 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_TUNNEL_START_TIMEOUT_MS = 45_000;
const QUICK_TUNNEL_URL_PATTERN =
  /https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com(?=$|[\s"'<>),;\]])/i;

export type CloudflaredDownloadOptions = {
  binaryPath: string;
  fetchBinary?: typeof fetch;
  timeoutMs?: number;
  onProgress?: (progress: number) => void;
};

export type QuickTunnelStartOptions = {
  binaryPath: string;
  localOrigin: string;
  timeoutMs?: number;
  onUnexpectedExit?: (message: string) => void;
};

export type QuickTunnelHandle = {
  publicBaseUrl: string;
  close: () => Promise<void>;
};

export const sha256Hex = (contents: Uint8Array) =>
  createHash('sha256').update(contents).digest('hex');

export const extractQuickTunnelUrl = (output: string) =>
  output.match(QUICK_TUNNEL_URL_PATTERN)?.[0] ?? null;

const existingBinaryIsTrusted = async (binaryPath: string) => {
  try {
    const contents = await readFile(binaryPath);
    return sha256Hex(contents) === CLOUDFLARED_WINDOWS_X64_SHA256;
  } catch {
    return false;
  }
};

export const ensureCloudflaredBinary = async ({
  binaryPath,
  fetchBinary = fetch,
  timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  onProgress,
}: CloudflaredDownloadOptions) => {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('O túnel automático requer Windows de 64 bits.');
  }
  if (await existingBinaryIsTrusted(binaryPath)) {
    onProgress?.(1);
    return binaryPath;
  }

  await mkdir(path.dirname(binaryPath), { recursive: true });
  const temporaryPath = `${binaryPath}.${process.pid}.download`;
  await rm(temporaryPath, { force: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchBinary(CLOUDFLARED_WINDOWS_X64_URL, {
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Download do túnel falhou com HTTP ${response.status}.`);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_CLOUDFLARED_DOWNLOAD_BYTES
    ) {
      throw new Error('O componente de túnel excedeu o tamanho esperado.');
    }
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      let streamComplete = false;
      while (!streamComplete) {
        const { done, value } = await reader.read();
        if (done) {
          streamComplete = true;
          continue;
        }
        downloadedBytes += value.byteLength;
        if (downloadedBytes > MAX_CLOUDFLARED_DOWNLOAD_BYTES) {
          await reader.cancel();
          throw new Error('O componente de tÃºnel excedeu o tamanho esperado.');
        }
        chunks.push(value);
        if (declaredLength > 0) {
          onProgress?.(Math.min(0.99, downloadedBytes / declaredLength));
        }
      }
    } else {
      const fallback = new Uint8Array(await response.arrayBuffer());
      downloadedBytes = fallback.byteLength;
      chunks.push(fallback);
    }
    const contents = new Uint8Array(downloadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      contents.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (contents.byteLength > MAX_CLOUDFLARED_DOWNLOAD_BYTES) {
      throw new Error('O componente de túnel excedeu o tamanho esperado.');
    }
    if (sha256Hex(contents) !== CLOUDFLARED_WINDOWS_X64_SHA256) {
      throw new Error('A assinatura SHA-256 do túnel não corresponde à versão oficial.');
    }
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rm(binaryPath, { force: true });
    await rename(temporaryPath, binaryPath);
    onProgress?.(1);
    return binaryPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('O download do túnel HTTPS excedeu o tempo limite.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const cloudflaredExitMessage = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => code === null
  ? `O túnel HTTPS foi encerrado pelo sinal ${signal ?? 'desconhecido'}.`
  : `O túnel HTTPS foi encerrado com o código ${code}.`;

export const startCloudflareQuickTunnel = ({
  binaryPath,
  localOrigin,
  timeoutMs = DEFAULT_TUNNEL_START_TIMEOUT_MS,
  onUnexpectedExit,
}: QuickTunnelStartOptions) => new Promise<QuickTunnelHandle>((resolve, reject) => {
  const child: ChildProcess = spawn(binaryPath, [
    'tunnel',
    '--no-autoupdate',
    '--url',
    localOrigin,
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  let stopping = false;
  let recentOutput = '';

  const timeout = setTimeout(() => {
    stopping = true;
    child.kill();
    reject(new Error('O túnel HTTPS não ficou disponível dentro do tempo limite.'));
  }, timeoutMs);

  const captureOutput = (chunk: Buffer | string) => {
    recentOutput = `${recentOutput}${chunk.toString()}`.slice(-16_384);
    if (ready) return;
    const publicBaseUrl = extractQuickTunnelUrl(recentOutput);
    if (!publicBaseUrl) return;
    ready = true;
    clearTimeout(timeout);
    resolve({
      publicBaseUrl,
      close: () => new Promise<void>((resolveClose) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveClose();
          return;
        }
        stopping = true;
        const forceTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
        child.once('exit', () => {
          clearTimeout(forceTimer);
          resolveClose();
        });
        child.kill();
      }),
    });
  };

  child.stdout?.on('data', captureOutput);
  child.stderr?.on('data', captureOutput);
  child.once('error', (error) => {
    clearTimeout(timeout);
    if (!ready) reject(new Error(`Não foi possível iniciar o túnel HTTPS: ${error.message}`));
    else if (!stopping) onUnexpectedExit?.(error.message);
  });
  child.once('exit', (code, signal) => {
    clearTimeout(timeout);
    const message = cloudflaredExitMessage(code, signal);
    if (!ready) {
      reject(new Error(message));
      return;
    }
    if (!stopping) onUnexpectedExit?.(message);
  });
});
