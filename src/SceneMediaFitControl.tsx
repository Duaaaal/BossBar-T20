import { useEffect, useState } from 'react';
import type { SceneMediaFit, SceneMediaSummary } from './shared/scene';

export function SceneMediaFitControl({ ownerId, media, value, onChange }: {
  ownerId: string; media: SceneMediaSummary | null; value: SceneMediaFit;
  onChange: (fit: SceneMediaFit) => void;
}) {
  const [dimensions, setDimensions] = useState<[number, number] | null>(null);
  useEffect(() => {
    setDimensions(null);
    if (!media) return;
    let active = true;
    const url = `boss-media://scene-preview/${encodeURIComponent(ownerId)}?name=${encodeURIComponent(media.name)}`;
    if (media.mediaType === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata'; video.muted = true;
      video.onloadedmetadata = () => { if (active) setDimensions([video.videoWidth, video.videoHeight]); };
      video.src = url;
      return () => { active = false; video.onloadedmetadata = null; video.removeAttribute('src'); video.load(); };
    }
    const image = new Image();
    image.onload = () => { if (active) setDimensions([image.naturalWidth, image.naturalHeight]); };
    image.src = url;
    return () => { active = false; image.onload = null; image.src = ''; };
  }, [ownerId, media?.name, media?.mediaType]);
  const incompatible = dimensions && Math.abs(dimensions[0] / dimensions[1] - 16 / 9) > .03;
  return <div className="scene-media-fit">
    <label><span>Enquadramento</span><select aria-label="Enquadramento da mídia" value={value} onChange={(event) => onChange(event.target.value as SceneMediaFit)}>
      <option value="contain">Original (sem cortes)</option>
      <option value="cover">Ampliar (sem distorcer)</option>
      <option value="fill">Esticar (preencher tela)</option>
    </select></label>
    {media && <small className={incompatible ? 'media-aspect-warning' : ''} role={incompatible ? 'status' : undefined}>
      {dimensions ? `${dimensions[0]} × ${dimensions[1]} px. ` : ''}
      {incompatible ? 'Esta proporção pode não caber na apresentação. ' : ''}
      Recomendado: 1920 × 1080 px (16:9). Original pode criar barras; Ampliar pode cortar bordas.
    </small>}
  </div>;
}
