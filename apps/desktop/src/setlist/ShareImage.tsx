import type { Gig, Song, Venue } from '@setlist/core';
import { Check, Download, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { saveFile } from './saveFile';
import { canShareSheet } from './shareSheet';
import {
  activeImageTheme,
  canvasMeasure,
  drawSetlistImage,
  imageFileName,
  layoutSetlistImage,
} from './setlistImage';
import type { BlockWithEntries } from './useGigSetlist';

type Status = { kind: 'idle' } | { kind: 'done'; message: string } | { kind: 'failed' };

/**
 * The setlist as a picture for a chat (#84). Phones get the share sheet, straight to WhatsApp;
 * elsewhere it copies to the clipboard (to paste into WhatsApp Desktop or Web) or saves a PNG.
 * A snapshot: the share link stays the way to follow later changes.
 */
export function ShareImage({
  gig,
  venue,
  blocks,
  songsById,
}: {
  gig: Gig;
  venue: Venue | null;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const name = imageFileName(gig);
  const picture = () =>
    drawSetlistImage(
      layoutSetlistImage({
        gig,
        venue,
        blocks,
        songsById,
        measure: canvasMeasure(),
        theme: activeImageTheme(),
      }),
    );

  async function run(action: () => Promise<string | null>) {
    setStatus({ kind: 'idle' });
    try {
      const message = await action();
      if (!message) return;
      setStatus({ kind: 'done', message });
      setTimeout(() => setStatus({ kind: 'idle' }), 2500);
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus({ kind: 'failed' });
      }
    }
  }

  const share = () =>
    run(async () => {
      const file = new File([await picture()], name, { type: 'image/png' });
      await navigator.share({ files: [file] });
      return null;
    });

  // The picture goes in as a promise so the clipboard is opened while the click still counts
  // (Safari's rule); it's drawn meanwhile.
  const copy = () =>
    run(async () => {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': picture() })]);
      return 'Imagen copiada';
    });

  const save = () => run(async () => saveFile(name, await picture()));

  const failed = status.kind === 'failed';
  const label = (idle: string) =>
    status.kind === 'done' ? status.message : failed ? 'Intenta de nuevo' : idle;
  const icon =
    status.kind === 'done' ? (
      <Check size={14} aria-hidden="true" />
    ) : (
      <ImageIcon size={14} aria-hidden="true" />
    );

  if (canShareSheet()) {
    return (
      <button
        type="button"
        className="sm-button"
        onClick={() => void share()}
        title={failed ? 'No se pudo compartir la imagen' : 'Comparte el setlist como imagen'}
      >
        {icon}
        {label('Compartir imagen')}
      </button>
    );
  }
  const canCopy = typeof ClipboardItem === 'function' && Boolean(navigator.clipboard?.write);
  return (
    <>
      {canCopy && (
        <button
          type="button"
          className="sm-button"
          onClick={() => void copy()}
          title={
            failed
              ? 'No se pudo copiar la imagen'
              : 'Copia el setlist como imagen, para pegarlo en un chat'
          }
        >
          {icon}
          {label('Copiar imagen')}
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label={canCopy ? 'Guardar imagen' : label('Guardar imagen')}
        title={`Guarda el setlist como imagen (${name})`}
        onClick={() => void save()}
      >
        {!canCopy && status.kind === 'done' ? (
          <Check size={18} aria-hidden="true" />
        ) : (
          <Download size={18} aria-hidden="true" />
        )}
      </button>
    </>
  );
}
