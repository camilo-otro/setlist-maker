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
 * see the playlist once the gig has one.
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
  onOpenLink: () => void;
  onOpenPlaylist: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Compartir el setlist" onClose={onClose}>
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
        <ShareImage gig={gig} venue={venue} blocks={blocks} songsById={songsById} />
        <PrintSetlist bandName={bandName} gig={gig} blocks={blocks} songsById={songsById} />
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
