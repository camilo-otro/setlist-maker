import type { Gig, Song } from '@setlist/core';
import { Check, Printer } from 'lucide-react';
import { useState } from 'react';
import { saveFile } from './saveFile';
import { makeSetlistPdf, pdfFileName } from './setlistPdf';
import { canShareSheet } from './shareSheet';
import type { BlockWithEntries } from './useGigSetlist';

type Status =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; message: string } | { kind: 'failed' };

/**
 * Print (#34): the setlist as a PDF for the stage, a page per set. The desktop app saves it to
 * Downloads and opens it, ready to print; phones get the share sheet, which can print or send
 * it; browsers download it. Read-only, so viewers get it too.
 */
export function PrintSetlist({
  bandName,
  gig,
  blocks,
  songsById,
}: {
  bandName: string;
  gig: Gig;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function print() {
    setStatus({ kind: 'busy' });
    try {
      const bytes = await makeSetlistPdf({ bandName, gig, blocks, songsById });
      const name = pdfFileName(gig);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const file = new File([blob], name, { type: 'application/pdf' });
      if (canShareSheet() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setStatus({ kind: 'idle' });
        return;
      }
      const message = await saveFile(name, blob, { open: true });
      setStatus({ kind: 'done', message });
      setTimeout(() => setStatus({ kind: 'idle' }), 2500);
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') setStatus({ kind: 'idle' });
      else setStatus({ kind: 'failed' });
    }
  }

  return (
    <button
      type="button"
      className="sm-button"
      disabled={status.kind === 'busy'}
      onClick={() => void print()}
      title={
        status.kind === 'failed'
          ? "Couldn't make the PDF"
          : 'A PDF of the setlist to print: the band name and song titles, a page per set'
      }
    >
      {status.kind === 'done' ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Printer size={14} aria-hidden="true" />
      )}
      {status.kind === 'done'
        ? status.message
        : status.kind === 'failed'
          ? 'Try again'
          : status.kind === 'busy'
            ? 'Making PDF…'
            : 'Print'}
    </button>
  );
}
