import type { Gig, Song, Venue } from '@setlist/core';
import { Check, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Sharing } from '../sharing/sharing';
import { canShareSheet } from './shareSheet';
import { ShareTile } from './ShareTile';
import type { BlockWithEntries } from './useGigSetlist';
import { whatsappText } from './whatsappText';

/**
 * Puts the setlist, as WhatsApp-ready text, where it can be pasted (#83): the share sheet on a
 * phone (straight to WhatsApp), the clipboard elsewhere. Adds the gig's share link if this device
 * made one. Read-only, so viewers get it too. A tile in the share sheet.
 */
export function CopyForWhatsApp({
  gig,
  venue,
  blocks,
  songsById,
  sharing,
}: {
  gig: Gig;
  venue: Venue | null;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  sharing: Sharing | null | undefined;
}) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    setFailed(false);
    // Offline, or not shared yet: the text goes without a link.
    const link = await sharing?.links
      .active(gig.id)
      .then((found) => found?.url ?? null)
      .catch(() => null);
    const text = whatsappText({ gig, venue, blocks, songsById, link });
    try {
      if (canShareSheet()) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true);
    }
  }

  return (
    <ShareTile
      icon={
        done ? (
          <Check size={22} aria-hidden="true" />
        ) : (
          <MessageCircle size={22} aria-hidden="true" />
        )
      }
      label={done ? 'Copiado' : failed ? 'Intenta de nuevo' : 'WhatsApp'}
      title={failed ? 'No se pudo copiar el setlist' : 'Copia el setlist como texto para WhatsApp'}
      onClick={() => void share()}
    />
  );
}
