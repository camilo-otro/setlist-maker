import type { Gig, Song, Venue } from '@setlist/core';
import { Check, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import type { Sharing } from '../sharing/sharing';
import type { BlockWithEntries } from './useGigSetlist';
import { whatsappText } from './whatsappText';

/** True on touch screens that have a system share sheet: phones, and tablets. */
const canShareSheet = () =>
  typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Puts the setlist, as WhatsApp-ready text, where it can be pasted (#83): the share sheet on a
 * phone (straight to WhatsApp), the clipboard elsewhere. Adds the gig's share link if this device
 * made one. Read-only, so viewers get it too.
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
    <button
      type="button"
      className="sm-button"
      onClick={() => void share()}
      title={failed ? "Couldn't copy the setlist" : 'Copy the setlist as text for WhatsApp'}
    >
      {done ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <MessageCircle size={14} aria-hidden="true" />
      )}
      {done ? 'Copied' : failed ? 'Try again' : 'Copy for WhatsApp'}
    </button>
  );
}
