import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractQuickTunnelUrl,
  sha256Hex,
} from '../src/multiplayer/quick-tunnel.ts';

test('extrai somente uma origem HTTPS legítima do Quick Tunnel', () => {
  assert.equal(
    extractQuickTunnelUrl(
      'INF Requesting new quick Tunnel... https://scarlet-boss-42.trycloudflare.com',
    ),
    'https://scarlet-boss-42.trycloudflare.com',
  );
  assert.equal(
    extractQuickTunnelUrl('https://boss.trycloudflare.com.evil.example'),
    null,
  );
  assert.equal(extractQuickTunnelUrl('http://boss.trycloudflare.com'), null);
});

test('calcula SHA-256 sem aceitar conteúdo alterado', () => {
  const trusted = new TextEncoder().encode('cloudflared oficial');
  const modified = new TextEncoder().encode('cloudflared alterado');
  assert.equal(
    sha256Hex(trusted),
    '97581c95721abef9cbc5b776be4b5e23e92d674430eb10fca4179af31234cbc2',
  );
  assert.notEqual(sha256Hex(modified), sha256Hex(trusted));
});
