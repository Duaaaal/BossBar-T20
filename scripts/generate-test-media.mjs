import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outputDirectory = path.join(projectRoot, 'tests', 'fixtures', 'media');

const fixtures = {
  'test-background.png':
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP8/x8AAwMCAHwG0LwAAAAASUVORK5CYII=',
  'test-animation.gif':
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all(Object.entries(fixtures).map(([name, base64]) => {
  const bytes = Buffer.from(base64, 'base64');
  return writeFile(path.join(outputDirectory, name), bytes);
}));
// The old patched one-frame fixture reached EOF immediately in Firefox.
const video = await readFile(path.join(projectRoot, 'scripts', 'test-fixtures', 'test-video.mp4'));
await writeFile(path.join(outputDirectory, 'test-video.mp4'), video);

const tone = await readFile(path.join(projectRoot, 'scripts', 'test-fixtures', 'test-tone.mp3'));
// The seed contains five complete MPEG-1 Layer III frames but an Info header
// describing 43. Complete its synthetic tone to the advertised one second;
// otherwise Chromium seeks beyond EOF despite reporting a valid duration.
const frameSize = 576;
const audioStart = 45 + frameSize; // ID3 + Info frame
const toneFrames = Array.from({ length: 43 }, (_, index) => {
  const offset = audioStart + (index % 5) * frameSize;
  return tone.subarray(offset, offset + frameSize);
});
const completeTone = Buffer.concat([tone.subarray(0, audioStart), ...toneFrames]);
await writeFile(path.join(outputDirectory, 'test-tone.mp3'), completeTone);

console.log(`Fixtures de mídia atualizadas em ${outputDirectory}`);
