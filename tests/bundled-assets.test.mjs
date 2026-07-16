import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bundledAssetUrl,
  statusIconUrl,
} from '../src/shared/bundled-assets.ts';

test('creates stable local URLs for packaged assets', () => {
  assert.equal(
    bundledAssetUrl('status-icons/status icon.png'),
    'boss-asset://local/status-icons/status%20icon.png',
  );
  assert.equal(
    statusIconUrl('status-01-abalado.png'),
    'boss-asset://local/status-icons/status-01-abalado.png',
  );
  assert.equal(
    bundledAssetUrl('cog.png'),
    'boss-asset://local/cog.png',
  );
});
