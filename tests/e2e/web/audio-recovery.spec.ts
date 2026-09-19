import { expect, test } from '@playwright/test';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('o navegador fornece um relógio de áudio ativo sem depender do aplicativo', async ({ page }, testInfo) => {
  await page.setContent('<button>Ativar saída de áudio</button>');
  await page.evaluate(() => {
    const probe = { context: null as AudioContext | null, resume: 'not-requested' };
    Object.assign(window, { __nativeAudio: probe });
    document.querySelector('button')!.addEventListener('click', () => {
      probe.context = new AudioContext();
      probe.resume = 'pending';
      void probe.context.resume().then(() => { probe.resume = 'resolved'; }, error => { probe.resume = String(error); });
    });
  });
  const sample = () => page.evaluate(() => {
    const probe = (window as typeof window & { __nativeAudio: { context: AudioContext | null; resume: string } }).__nativeAudio;
    return { state: probe.context?.state, time: probe.context?.currentTime, sampleRate: probe.context?.sampleRate, resume: probe.resume, browser: navigator.userAgent };
  });
  try {
    await page.getByRole('button', { name: 'Ativar saída de áudio' }).click();
    await expect.poll(async () => (await sample()).state, { message: 'AudioContext nativo precisa executar no ambiente do teste' }).toBe('running');
    await expect.poll(async () => (await sample()).time).toBeGreaterThan(0.1);
  } finally {
    await testInfo.attach('native-audio-output', { body: JSON.stringify(await sample()), contentType: 'application/json' });
    await page.evaluate(() => {
      const probe = (window as typeof window & { __nativeAudio: { context: AudioContext | null } }).__nativeAudio;
      void probe.context?.close();
    });
  }
});

test('retoma o contexto suspenso por clique, sem acumular pedidos nem recriar o áudio', async ({ page }, testInfo) => {
  const session = await startHostedTestSession();
  try {
    await page.addInitScript(() => {
      const NativeContext = window.AudioContext;
      const probe = { contexts: [] as AudioContext[], resumeCalls: 0, gesture: false };
      Object.assign(window, { __audioRecovery: probe });
      document.addEventListener('pointerup', () => {
        probe.gesture = true;
        setTimeout(() => { probe.gesture = false; }, 0);
      }, true);
      window.AudioContext = class extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          probe.contexts.push(this);
          void this.suspend();
        }
        resume() {
          probe.resumeCalls += 1;
          // Reproduce a browser withholding autoplay permission. The audio
          // graph and its clock remain native; only permission is controlled.
          return probe.gesture ? super.resume() : new Promise<void>(() => undefined);
        }
      };
    });
    await joinHostedSession(page, session.inviteUrl, 'Retomar áudio');
    const resume = page.getByRole('button', { name: 'Ativar áudio', exact: true });
    await expect(resume).toBeVisible();
    expect(await resume.evaluate(element => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('audio-recovery.png') });
    const read = () => page.evaluate(() => {
      const probe = (window as typeof window & { __audioRecovery: { contexts: AudioContext[]; resumeCalls: number } }).__audioRecovery;
      return { states: probe.contexts.map(context => context.state), time: probe.contexts[0].currentTime, calls: probe.resumeCalls, count: probe.contexts.length };
    });
    const before = await read();
    await page.waitForTimeout(250);
    expect((await read()).calls).toBe(before.calls);
    await resume.click();
    await expect(resume).toBeHidden();
    await expect.poll(async () => (await read()).states.every(state => state === 'running')).toBe(true);
    await expect.poll(async () => (await read()).time).toBeGreaterThan(before.time);
    expect((await read()).count).toBe(before.count);
  } finally { await session.close(); }
});
