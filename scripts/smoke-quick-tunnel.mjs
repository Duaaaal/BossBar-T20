import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import {
  CLOUDFLARED_VERSION,
  ensureCloudflaredBinary,
  startCloudflareQuickTunnel,
} from '../src/multiplayer/quick-tunnel.ts';

const server = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true }));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
assert(address && typeof address !== 'string');
let tunnel = null;
try {
  const binaryPath = await ensureCloudflaredBinary({
    binaryPath: path.join(
      process.cwd(),
      '.cache',
      `cloudflared-${CLOUDFLARED_VERSION}.exe`,
    ),
  });
  tunnel = await startCloudflareQuickTunnel({
    binaryPath,
    localOrigin: `http://127.0.0.1:${address.port}`,
  });

  let response = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      response = await fetch(`${tunnel.publicBaseUrl}/health`);
      if (response.ok) break;
    } catch {
      // O hostname pode levar alguns instantes para ficar acessível globalmente.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert(response?.ok, 'O endereço público do túnel não respondeu.');
  assert.deepEqual(await response.json(), { ok: true });
  process.stdout.write(`Quick Tunnel validado: ${tunnel.publicBaseUrl}\n`);
} finally {
  await tunnel?.close();
  await new Promise((resolve) => server.close(resolve));
}
