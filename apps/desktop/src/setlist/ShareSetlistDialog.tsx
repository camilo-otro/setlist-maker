import type { Gig, Song, Venue } from '@setlist/core';
import { Link2, ListMusic } from 'lucide-react';
import { Modal } from '../components/Modal';
import type { Sharing } from '../sharing/sharing';
import { CopyForWhatsApp } from './CopyForWhatsApp';
import { PrintSetlist } from './PrintSetlist';
import { ShareImage } from './ShareImage';
import { ShareTile } from './ShareTile';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * Every way to get the gig's setlist out, in one place: the share link, WhatsApp text, the
 * image, printing and the Spotify playlist. On a phone it rises from the bottom like the phone's
 * own share sheet. Each person only sees what they can do: viewers can't make links, and only
 * see the playlist once the gig has one. From the rehearsal order, `blocks` is that order as one
 * set: the text, image and PDF follow it, while the link and playlist keep the gig's order.
 */
export function ShareSetlistDialog({
  bandName,
  gig,
  venue,
  blocks,
  songsById,
  sharing,
  canMakeLink,
  showPlaylist,
  rehearsal = false,
  onOpenLink,
  onOpenPlaylist,
  onClose,
}: {
  bandName: string;
  gig: Gig;
  venue: Venue | null;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  sharing: Sharing | null | undefined;
  canMakeLink: boolean;
  showPlaylist: boolean;
  /** Shared from the rehearsal order (Orden de ensayo). */
  rehearsal?: boolean;
  onOpenLink: () => void;
  onOpenPlaylist: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={rehearsal ? 'Compartir el orden de ensayo' : 'Compartir el setlist'}
      onClose={onClose}
    >
      {rehearsal && (
        <p className="muted share-sheet__note">
          WhatsApp, la imagen y la impresión van en orden de ensayo. El enlace y la playlist siguen
          el orden del toque.
        </p>
      )}
      <div className="share-sheet">
        {canMakeLink && (
          <ShareTile
            icon={<Link2 size={22} aria-hidden="true" />}
            label="Enlace"
            title="Un enlace para ver el setlist en vivo, sin instalar nada"
            onClick={onOpenLink}
          />
        )}
        <CopyForWhatsApp
          gig={gig}
          venue={venue}
          blocks={blocks}
          songsById={songsById}
          sharing={sharing}
        />
        <ShareImage
          gig={gig}
          venue={venue}
          blocks={blocks}
          songsById={songsById}
          rehearsal={rehearsal}
        />
        <PrintSetlist
          bandName={bandName}
          gig={gig}
          blocks={blocks}
          songsById={songsById}
          rehearsal={rehearsal}
        />
        {showPlaylist && (
          <ShareTile
            icon={<ListMusic size={22} aria-hidden="true" />}
            label="Playlist de Spotify"
            title="Las canciones del setlist como playlist de Spotify"
            onClick={onOpenPlaylist}
          />
        )}
      </div>
      <div className="modal__actions">
        <button type="button" className="sm-button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
