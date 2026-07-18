import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backgroundMediaTypeForFile,
  backgroundVideoMimeTypeForFile,
  resolveByteRange,
  resolveMediaOriginPolicy,
} from '../src/shared/media.ts';

test('identifica imagens e vídeos compatíveis para o fundo', () => {
  assert.equal(backgroundMediaTypeForFile('arena.PNG'), 'image');
  assert.equal(backgroundMediaTypeForFile('ameaça.gif'), 'image');
  assert.equal(backgroundMediaTypeForFile('entrada.MP4'), 'video');
  assert.equal(backgroundMediaTypeForFile('portal.webm'), 'video');
  assert.equal(backgroundMediaTypeForFile('arquivo.exe'), null);
  assert.equal(backgroundVideoMimeTypeForFile('entrada.mp4'), 'video/mp4');
  assert.equal(backgroundVideoMimeTypeForFile('portal.webm'), 'video/webm');
  assert.equal(backgroundVideoMimeTypeForFile('arena.png'), null);
});

test('resolve a leitura completa e intervalos explícitos de áudio', () => {
  assert.deepEqual(resolveByteRange(null, 1000), {
    start: 0,
    end: 999,
    partial: false,
  });
  assert.deepEqual(resolveByteRange('bytes=100-299', 1000), {
    start: 100,
    end: 299,
    partial: true,
  });
  assert.deepEqual(resolveByteRange('bytes=900-', 1000), {
    start: 900,
    end: 999,
    partial: true,
  });
});

test('resolve corretamente intervalos por sufixo usados no seek de MP3', () => {
  assert.deepEqual(resolveByteRange('bytes=-500', 1000), {
    start: 500,
    end: 999,
    partial: true,
  });
  assert.deepEqual(resolveByteRange('bytes=-2000', 1000), {
    start: 0,
    end: 999,
    partial: true,
  });
});

test('rejeita intervalos inválidos, múltiplos ou arquivos vazios', () => {
  assert.equal(resolveByteRange('bytes=1000-', 1000), null);
  assert.equal(resolveByteRange('bytes=200-100', 1000), null);
  assert.equal(resolveByteRange('bytes=-0', 1000), null);
  assert.equal(resolveByteRange('bytes=0-1,4-5', 1000), null);
  assert.equal(resolveByteRange(null, 0), null);
});

test('permite mídia apenas para a origem do renderer', () => {
  assert.deepEqual(resolveMediaOriginPolicy(null, 'null'), {
    allowed: true,
    responseOrigin: null,
  });
  assert.deepEqual(resolveMediaOriginPolicy('null', 'null'), {
    allowed: true,
    responseOrigin: 'null',
  });
  assert.deepEqual(
    resolveMediaOriginPolicy(
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5173',
    ),
    { allowed: true, responseOrigin: 'http://127.0.0.1:5173' },
  );
  assert.deepEqual(
    resolveMediaOriginPolicy('https://example.com', 'null'),
    { allowed: false, responseOrigin: null },
  );
});
