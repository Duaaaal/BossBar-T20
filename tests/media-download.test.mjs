import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeMediaDownload, createMediaDownloadWatchdog } from '../src/shared/media-download.ts';

test('o prazo de download mede inatividade e é reiniciado pelo progresso', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const watch = createMediaDownloadWatchdog(controller, 100);
  t.mock.timers.tick(80);
  watch.progress();
  t.mock.timers.tick(80);
  assert.equal(controller.signal.aborted, false);
  t.mock.timers.tick(20);
  assert.equal(controller.signal.aborted, true);
  watch.dispose();
});

test('a conclusão cancela o prazo e o consumo preserva os bytes somente quando solicitado', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const watch = createMediaDownloadWatchdog(controller, 100);
  const blob = await consumeMediaDownload(new Response('audio', { headers: { 'content-type': 'audio/mpeg' } }), watch.progress, true);
  assert.equal(await blob.text(), 'audio');
  assert.equal(blob.type, 'audio/mpeg');
  assert.equal((await consumeMediaDownload(new Response('large'), watch.progress, false)).size, 0);
  watch.dispose();
  t.mock.timers.tick(1000);
  assert.equal(controller.signal.aborted, false);
});
