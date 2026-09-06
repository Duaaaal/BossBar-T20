import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { volumeToGain } from './shared/battle';
import { cutsceneFade, cutsceneBlackoutSeconds, cutscenePosition, cutsceneMusicPosition, cutsceneNextMusicPosition, type CutscenePlayback, type ScenePlaylistSummary } from './shared/scene';
import { presentationMediaUrl } from './presentation-media-cache';
import { retainPhaseAudio } from './phase-audio-handoff';
import { installGaplessLoop, mediaPlaybackTime, seekMediaPlayback } from './gapless-audio-loop';
import './cutscene.css';

const waitForMedia = (media: HTMLMediaElement, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (media.readyState >= 3) { resolve(); return; }
  const cleanup = () => { clearTimeout(timer); media.removeEventListener('canplay', ready); media.removeEventListener('error', error); signal.removeEventListener('abort', error); };
  const ready = () => { cleanup(); resolve(); };
  const error = () => { cleanup(); reject(new Error('Não foi possível carregar a mídia da cutscene.')); };
  const timer = setTimeout(error, 60_000);
  media.addEventListener('canplay', ready, { once: true });
  media.addEventListener('error', error, { once: true });
  signal.addEventListener('abort', error, { once: true });
  media.load();
});

/** Electron and browser share this renderer and the host's synchronized scene timeline. */
export const CutscenePlayer = ({ playback, musicScale = 1, soundScale = 1 }: {
  playback: CutscenePlayback;
  musicScale?: number;
  soundScale?: number;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const scales = useRef({ musicScale, soundScale });
  scales.current = { musicScale, soundScale };
  const [prepared, setPrepared] = useState(false);
  const [started, setStarted] = useState(false);
  const [ending, setEnding] = useState(false);
  const [blackoutFinished, setBlackoutFinished] = useState(false);
  const [error, setError] = useState('');
  const muted = useRef(false);
  const boundaryTick = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (playback.stage !== 'ending' || playback.endingAt == null) return;
    const timer = setTimeout(() => boundaryTick.current?.(), Math.max(0, playback.endingAt - window.bossAPI.getPresentationTime()));
    return () => clearTimeout(timer);
  }, [playback.stage, playback.endingAt]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const updateMute = (state: { universalMuted: boolean }) => { muted.current = state.universalMuted; };
    void window.bossAPI.getMusicState().then((state) => { if (active) updateMute(state); });
    const unsubscribe = window.bossAPI.subscribeMusic(updateMute);
    const context = new AudioContext();
    const video = videoRef.current;
    // Keep the visual element permanently silent. Its audio has an independent
    // transport/gain, so hiding/fading the picture cannot mute the soundtrack.
    const videoAudio = video ? new Audio() : null;
    if (videoAudio) {
      videoAudio.crossOrigin = 'anonymous'; videoAudio.preload = 'auto';
      videoAudio.dataset.cutsceneVideoAudio = 'true';
      videoAudio.src = presentationMediaUrl(playback.backgroundUrl!);
    }
    const videoSource = videoAudio ? context.createMediaElementSource(videoAudio) : null;
    const videoGain = context.createGain();
    videoSource?.connect(videoGain).connect(context.destination);
    if (video) video.muted = true;
    const audioEntries = new Map<string, { audio: HTMLAudioElement; gain: GainNode; source: MediaElementAudioSourceNode; disposeLoop: () => void }>();
    for (const [role, playlist] of [['music', playback.music], ['sound', playback.sound], ['next', playback.nextMusic]] as const) {
      for (const track of playlist?.tracks ?? []) {
        const audio = new Audio();
        audio.crossOrigin = 'anonymous';
        audio.src = presentationMediaUrl(track.url);
        audio.preload = 'auto';
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(context.destination);
        audio.loop = playlist?.loop === true && playlist.tracks.length === 1;
        const disposeLoop = installGaplessLoop(audio, context, source, gain);
        audioEntries.set(`${role}:${track.id}`, { audio, gain, source, disposeLoop });
      }
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const seek = (media: HTMLMediaElement, time: number, force = false) => {
      if (!Number.isFinite(time) || media.readyState < 1) return;
      const target = Math.max(0, Math.min(time, Number.isFinite(media.duration) ? media.duration : time));
      const difference = Math.abs(mediaPlaybackTime(media) - target);
      const drift = media.loop && Number.isFinite(media.duration) ? Math.min(difference, Math.abs(media.duration - difference)) : difference;
      // Do not interrupt the decoder for normal clock jitter or loop wrapping.
      if (force || drift > (media.paused ? 0.05 : 1.5)) seekMediaPlayback(media, target);
    };
    const transportVersions = new Map<string, number | undefined>();
    const syncPlaylist = (role: string, playlist: ScenePlaylistSummary | null | undefined, elapsed: number, scale: number, envelope: number, paused = false, transportVersion?: number) => {
      if (!playlist) return;
      const firstIndex = Math.max(0, playlist.tracks.findIndex(({ id }) => id === playlist.currentTrackId));
      const tracks = [...playlist.tracks.slice(firstIndex), ...playlist.tracks.slice(0, firstIndex)];
      const duration = tracks.reduce((sum, track) => sum + (audioEntries.get(`${role}:${track.id}`)?.audio.duration || track.duration || 0), 0);
      let position = playlist.loop && duration > 0 ? elapsed % duration : elapsed;
      let currentId: string | null = null;
      for (const track of tracks) {
        const entry = audioEntries.get(`${role}:${track.id}`);
        if (!entry) continue;
        const length = Number.isFinite(entry.audio.duration) ? entry.audio.duration : track.duration;
        if (position < length) {
          currentId = track.id;
          entry.audio.loop = playlist.loop && tracks.length === 1;
          seek(entry.audio, position, transportVersion !== transportVersions.get(role));
          transportVersions.set(role, transportVersion);
          const targetGain = muted.current || playlist.muted ? 0 : volumeToGain(playlist.volume * scale) * envelope;
          entry.gain.gain.setTargetAtTime(targetGain, context.currentTime, 0.02);
          if (paused) entry.audio.pause();
          else if (entry.audio.paused) void entry.audio.play().catch(() => { if (active) setError('Clique na apresentação para permitir o áudio.'); });
          break;
        }
        position -= Math.max(0, length);
      }
      for (const track of tracks) if (track.id !== currentId) audioEntries.get(`${role}:${track.id}`)?.audio.pause();
    };
    const tick = () => {
      if (!active) return;
      const current = playbackRef.current;
      const now = window.bossAPI.getPresentationTime();
      const ending = current.stage === 'ending' && now >= (current.endingAt ?? 0);
      setEnding(ending);
      const blackoutFinished = ending && now >= (current.endingAt ?? now) + cutsceneBlackoutSeconds(current) * 1000;
      setBlackoutFinished(blackoutFinished);
      if (current.stage === 'loading' || current.startedAt === null || now < current.startedAt) return;
      setStarted(true);
      document.documentElement.classList.toggle('cutscene-active', !blackoutFinished);
      if (context.state === 'suspended') void context.resume();
      const position = cutscenePosition(current, now);
      const fadeIn = cutsceneFade(current, 'audio', 'in');
      const fadeOut = cutsceneFade(current, 'audio', 'out');
      const entrance = fadeIn > 0 ? Math.min(1, Math.max(0, (now - current.startedAt) / 1000 / fadeIn)) : 1;
      const exit = ending && fadeOut > 0 ? Math.max(0, 1 - (now - (current.endingAt ?? now)) / 1000 / fadeOut) : ending ? 0 : 1;
      const envelope = entrance * exit;
      const video = videoRef.current;
      if (video) {
        video.muted = true;
        videoGain.gain.setTargetAtTime(muted.current || current.videoMuted === true ? 0 : volumeToGain((current.videoVolume ?? 0.8) * scales.current.soundScale) * envelope, context.currentTime, 0.02);
        seek(video, position);
        if (position < video.duration && video.paused) void video.play().catch(() => undefined);
      }
      if (videoAudio) {
        seek(videoAudio, position);
        if (position < videoAudio.duration && videoAudio.paused) void videoAudio.play().catch(() => undefined);
      }
      syncPlaylist('music', current.music, cutsceneMusicPosition(current, now), scales.current.musicScale, envelope, current.musicTransport?.playing === false, current.musicTransport?.updatedAt);
      syncPlaylist('sound', current.sound, position, scales.current.soundScale, envelope);
      if (ending) {
        const elapsed = Math.max(0, now - (current.endingAt ?? now)) / 1000;
        const nextFade = current.nextAudioFadeInSeconds ?? 0;
        syncPlaylist('next', current.nextMusic, cutsceneNextMusicPosition(current, now), scales.current.musicScale, nextFade > 0 ? Math.min(1, elapsed / nextFade) : 1, current.nextMusicTransport?.playing === false, current.nextMusicTransport?.updatedAt);
      }
    };
    // Start a preloaded following track on the actual end event, without waiting
    boundaryTick.current = tick;
    // for the periodic clock reconciliation (especially noticeable with short SFX).
    for (const { audio } of audioEntries.values()) audio.addEventListener('ended', tick);
    const prepare = async () => {
      const media: Promise<unknown>[] = [...audioEntries.values()].map(({ audio }) => waitForMedia(audio, controller.signal));
      if (videoRef.current) media.push(waitForMedia(videoRef.current, controller.signal));
      if (videoAudio) media.push(waitForMedia(videoAudio, controller.signal));
      else if (playback.backgroundUrl) {
        const image = new Image(); image.src = playback.backgroundUrl;
        media.push(image.decode());
      }
      await Promise.all(media);
      if (!active) return;
      setPrepared(true);
      const playlistDuration = (role: string, playlist: ScenePlaylistSummary | null) => (playlist?.tracks ?? []).reduce((sum, track) => sum + (audioEntries.get(`${role}:${track.id}`)?.audio.duration || track.duration || 0), 0);
      const duration = Math.max(videoRef.current?.duration || 0, videoAudio?.duration || 0,
        playlistDuration('music', playback.music), playlistDuration('sound', playback.sound)) || playback.durationSeconds;
      window.bossAPI.reportCutsceneReady(playback.id, duration && Number.isFinite(duration) ? duration : null);
      timer = setInterval(tick, 25);
      tick();
    };
    void prepare().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Falha ao carregar a cutscene.'); });
    return () => {
      active = false; controller.abort(); if (timer) clearInterval(timer);
      boundaryTick.current = null;
      document.documentElement.classList.remove('cutscene-active');
      const incoming = [...audioEntries].find(([key, entry]) => key.startsWith('next:') && !entry.audio.paused);
      const releaseEntry = ({ audio, gain, source, disposeLoop }: NonNullable<ReturnType<typeof audioEntries.get>>) => {
        audio.removeEventListener('ended', tick); disposeLoop();
        audio.pause(); audio.removeAttribute('src'); audio.load(); source.disconnect(); gain.disconnect();
      };
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        for (const entry of audioEntries.values()) releaseEntry(entry);
        audioEntries.clear();
        void context.close();
      };
      for (const [key, entry] of audioEntries) if (key !== incoming?.[0]) { releaseEntry(entry); audioEntries.delete(key); }
      videoSource?.disconnect(); videoGain.disconnect();
      if (videoAudio) { videoAudio.pause(); videoAudio.removeAttribute('src'); videoAudio.load(); }
      // Keep the incoming decoder running, but remove cutscene listeners now.
      unsubscribe();
      for (const { audio } of audioEntries.values()) audio.removeEventListener('ended', tick);
      if (incoming && playbackRef.current.stage === 'ending') retainPhaseAudio(incoming[0].slice(5), {
        audio: incoming[1].audio, context, source: incoming[1].source, gain: incoming[1].gain, release,
      });
      else release();
    };
  // One media graph per cutscene instance. Timeline stages update through the ref.
  }, [playback.id]);

  return <div className={`cutscene-presentation ${prepared && started ? 'is-playing' : ''} ${ending ? 'is-ending' : ''} ${blackoutFinished ? 'blackout-finished' : ''}`}
    style={{ '--cutscene-fade-in': `${cutsceneFade(playback, 'visual', 'in')}s`, '--cutscene-fade-out': `${cutsceneFade(playback, 'visual', 'out')}s` } as CSSProperties}
    data-cutscene-id={playback.id} data-cutscene-stage={playback.stage}>
    {playback.mediaType === 'video' && playback.backgroundUrl
      ? <video ref={videoRef} src={presentationMediaUrl(playback.backgroundUrl)} crossOrigin="anonymous" muted playsInline preload="auto" />
      : playback.backgroundUrl ? <img src={presentationMediaUrl(playback.backgroundUrl)} alt="" /> : null}
    {(!prepared || error) && <span className="cutscene-preparing">{error || 'Preparando cutscene…'}</span>}
  </div>;
};
