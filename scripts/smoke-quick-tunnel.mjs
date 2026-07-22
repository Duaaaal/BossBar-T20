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
  let firstResponseLatencyMs = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const startedAt = performance.now();
      response = await fetch(`${tunnel.publicBaseUrl}/health`);
      firstResponseLatencyMs = Math.round(performance.now() - startedAt);
      if (response.ok) break;
    } catch {
      // O hostname pode levar alguns instantes para ficar acessível globalmente.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert(response?.ok, 'O endereço público do túnel não respondeu.');
  assert.deepEqual(await response.json(), { ok: true });
  const roundTripSamples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const startedAt = performance.now();
    const sampleResponse = await fetch(`${tunnel.publicBaseUrl}/health`, {
      cache: 'no-store',
    });
    assert(sampleResponse.ok, 'O túnel deixou de responder durante a medição.');
    await sampleResponse.arrayBuffer();
    roundTripSamples.push(Math.round(performance.now() - startedAt));
  }
  const orderedSamples = [...roundTripSamples].sort((first, second) => first - second);
  const medianRoundTripMs = orderedSamples[Math.floor(orderedSamples.length / 2)];
  process.stdout.write([
    `Quick Tunnel validado: ${tunnel.publicBaseUrl}`,
    `Primeira resposta: ${firstResponseLatencyMs ?? '-'} ms`,
    `RTT HTTP mediano: ${medianRoundTripMs} ms (${roundTripSamples.join(', ')} ms)`,
    '',
  ].join('\n'));
} finally {
  await tunnel?.close();
  await new Promise((resolve) => server.close(resolve));
}
