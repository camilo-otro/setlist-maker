import type { Gig, Song } from '@setlist/core';
import {
  SpotifyPlaylistError,
  type SpotifyPlaylistInfo,
  type SpotifyPlaylistProblem,
} from '@setlist/storage';
import { ListMusic } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { SpotifyAttribution, SpotifyPlaylistLink } from '../components/SpotifyLink';
import type { Sharing } from '../sharing/sharing';
import { playlistName, playlistTracks } from './playlistTracks';
import type { BlockWithEntries } from './useGigSetlist';

const PROBLEMS: Record<SpotifyPlaylistProblem, string> = {
  forbidden: 'Only the band’s owners and editors can change its playlists.',
  limited: 'Your band has made a lot of playlists in the last hour. Try again later.',
  'not-connected': 'Spotify playlists aren’t set up on the server yet.',
  unavailable: 'Couldn’t reach Spotify. Check your connection and try again.',
};

const problemOf = (error: unknown) =>
  PROBLEMS[error instanceof SpotifyPlaylistError ? error.problem : 'unavailable'];

/**
 * The gig as a Spotify playlist, in the app's own Spotify account (ADR 0003): create or update
 * it, open it, or remove it from Spotify. Only for shared bands, since the server checks who's
 * asking. Viewers see the button only once the gig has a playlist, and can only open it.
 */
export function SpotifyPlaylist({
  bandId,
  gig,
  blocks,
  songsById,
  sharing,
  canEdit,
}: {
  bandId: string;
  gig: Gig;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  sharing: Sharing | null | undefined;
  canEdit: boolean;
}) {
  const [shared, setShared] = useState<boolean | null>(null);
  // Undefined while loading; null when the gig has none.
  const [playlist, setPlaylist] = useState<SpotifyPlaylistInfo | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sharing) return;
    let current = true;
    void sharing.isShared().then(async (isShared) => {
      if (!current) return;
      setShared(isShared);
      if (!isShared) return;
      const found = await sharing.playlists.get(bandId, gig.id).catch(() => null);
      if (current) setPlaylist(found);
    });
    return () => {
      current = false;
    };
  }, [sharing, bandId, gig.id]);

  if (!sharing || shared === null) return null;
  if (!canEdit && !playlist) return null;

  return (
    <>
      <button type="button" className="sm-button" onClick={() => setOpen(true)}>
        <ListMusic size={14} aria-hidden="true" />
        Spotify playlist
      </button>
      {open && (
        <PlaylistDialog
          bandId={bandId}
          gig={gig}
          blocks={blocks}
          songsById={songsById}
          sharing={sharing}
          shared={shared}
          canEdit={canEdit}
          playlist={playlist ?? null}
          onPlaylist={setPlaylist}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PlaylistDialog({
  bandId,
  gig,
  blocks,
  songsById,
  sharing,
  shared,
  canEdit,
  playlist,
  onPlaylist,
  onClose,
}: {
  bandId: string;
  gig: Gig;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  sharing: Sharing;
  shared: boolean;
  canEdit: boolean;
  playlist: SpotifyPlaylistInfo | null;
  onPlaylist: (playlist: SpotifyPlaylistInfo | null) => void;
  onClose: () => void;
}) {
  const { trackIds, leftOut } = useMemo(
    () => playlistTracks(blocks, songsById),
    [blocks, songsById],
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      setDone(await work());
    } catch (error) {
      setFailure(problemOf(error));
    } finally {
      setBusy(false);
    }
  }

  const exportGig = () =>
    run(async () => {
      const result = await sharing.playlists.export({
        bandId,
        gigId: gig.id,
        name: playlistName(gig),
        trackIds,
      });
      onPlaylist(result.playlist);
      return result.created ? 'Playlist created.' : 'Playlist updated.';
    });

  const remove = () =>
    run(async () => {
      await sharing.playlists.remove(bandId, gig.id);
      onPlaylist(null);
      setConfirmRemove(false);
      return 'Playlist removed from Spotify.';
    });

  const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

  return (
    <Modal title="Spotify playlist" busy={busy} onClose={onClose}>
      {!shared ? (
        <p>
          Playlists are for shared bands, so the server knows who&apos;s asking. Share the band
          first, from the Share button.
        </p>
      ) : (
        <>
          <p className="muted">
            The playlist is public: anyone with its link can open it, and it shows on the Setlist
            Maker account&apos;s Spotify profile. Its name is the gig&apos;s title and date.
          </p>
          {playlist && (
            <p className="spotify-playlist__link">
              <span>{playlistName(gig)}</span>
              <SpotifyPlaylistLink url={playlist.url} />
            </p>
          )}
          {canEdit &&
            (trackIds.length > 0 ? (
              <p>
                {songs(trackIds.length)} with Spotify links
                {playlist
                  ? ' will replace what the playlist has now.'
                  : ' will go in the playlist.'}
              </p>
            ) : (
              <p>None of this setlist&apos;s songs have Spotify links yet.</p>
            ))}
          {canEdit && leftOut.length > 0 && (
            <p className="muted">Left out, with no Spotify link: {leftOut.join(', ')}.</p>
          )}
          {confirmRemove && (
            <div className="share-dialog__confirm" role="alert">
              <p>The playlist will be deleted from Spotify, and its link will stop working.</p>
              <div className="modal__actions">
                <button
                  type="button"
                  className="sm-button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  className="sm-button sm-button--danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Remove from Spotify
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="muted" aria-live="polite">
        {done}
      </p>
      {failure && (
        <p className="sm-field__error" role="alert">
          {failure}
        </p>
      )}
      <SpotifyAttribution label="Playlists on" />
      <div className="modal__actions">
        {shared && canEdit && playlist && !confirmRemove && (
          <div className="modal__actions-start">
            <button
              type="button"
              className="sm-button"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Remove from Spotify
            </button>
          </div>
        )}
        <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
          Close
        </button>
        {shared && canEdit && (
          <button
            type="button"
            className="sm-button sm-button--primary"
            disabled={busy || trackIds.length === 0}
            onClick={() => void exportGig()}
          >
            {playlist ? 'Update playlist' : 'Create playlist'}
          </button>
        )}
      </div>
    </Modal>
  );
}
