import type { Gig, Song } from '@setlist/core';
import {
  SpotifyPlaylistError,
  type SpotifyPlaylistInfo,
  type SpotifyPlaylistProblem,
} from '@setlist/storage';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { SpotifyAttribution, SpotifyPlaylistLink } from '../components/SpotifyLink';
import type { Sharing } from '../sharing/sharing';
import { playlistName, playlistTracks } from './playlistTracks';
import type { BlockWithEntries } from './useGigSetlist';

const PROBLEMS: Record<SpotifyPlaylistProblem, string> = {
  forbidden: 'Solo los administradores y editores de la banda pueden cambiar sus playlists.',
  limited: 'Tu banda ha creado muchas playlists en la última hora. Intenta de nuevo más tarde.',
  'not-connected': 'Las playlists de Spotify aún no están configuradas en el servidor.',
  unavailable: 'No se pudo conectar con Spotify. Revisa tu conexión e intenta de nuevo.',
};

const problemOf = (error: unknown) =>
  PROBLEMS[error instanceof SpotifyPlaylistError ? error.problem : 'unavailable'];

/** What the gig page knows about the gig's playlist. */
export interface GigPlaylist {
  /** Null until known; whether the band is shared, which playlists need. */
  shared: boolean | null;
  /** Undefined while loading; null when the gig has none. */
  playlist: SpotifyPlaylistInfo | null | undefined;
  setPlaylist: (playlist: SpotifyPlaylistInfo | null) => void;
}

/**
 * The gig's Spotify playlist, in the app's own Spotify account (ADR 0003), looked up in the
 * background. Only shared bands have one, since the server checks who's asking.
 */
export function useGigPlaylist(
  sharing: Sharing | null | undefined,
  bandId: string,
  gigId: string,
): GigPlaylist {
  const [shared, setShared] = useState<boolean | null>(null);
  const [playlist, setPlaylist] = useState<SpotifyPlaylistInfo | null | undefined>(undefined);

  useEffect(() => {
    if (!sharing) return;
    let current = true;
    // Any failure leaves the gig without a known playlist; the dialog can still create one.
    void (async () => {
      const isShared = await sharing.isShared();
      if (!current) return;
      setShared(isShared);
      if (!isShared) return;
      const found = await sharing.playlists.get(bandId, gigId);
      if (current) setPlaylist(found);
    })().catch(() => {
      if (current) setPlaylist(null);
    });
    return () => {
      current = false;
    };
  }, [sharing, bandId, gigId]);

  return { shared, playlist, setPlaylist };
}

/**
 * Whether the share sheet offers the playlist: to owners and editors once it's known whether the
 * band is shared, and to viewers only once the gig has one, which they can open.
 */
export function offersPlaylist(
  sharing: Sharing | null | undefined,
  { shared, playlist }: GigPlaylist,
  canEdit: boolean,
): boolean {
  if (!sharing || shared === null) return false;
  return canEdit || Boolean(playlist);
}

/** Create or update the gig's playlist, open it, or remove it from Spotify. */
export function SpotifyPlaylistDialog({
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
      return result.created ? 'Playlist creada.' : 'Playlist actualizada.';
    });

  const remove = () =>
    run(async () => {
      await sharing.playlists.remove(bandId, gig.id);
      onPlaylist(null);
      setConfirmRemove(false);
      return 'Playlist eliminada de Spotify.';
    });

  const songs = (n: number) => `${n} ${n === 1 ? 'canción' : 'canciones'}`;

  return (
    <Modal title="Playlist de Spotify" busy={busy} onClose={onClose}>
      {!shared ? (
        <p>
          Las playlists son para bandas compartidas, así el servidor sabe quién las pide. Primero
          comparte la banda, desde el botón Compartir.
        </p>
      ) : (
        <>
          <p className="muted">
            La playlist es pública: cualquiera con el enlace puede abrirla. Se llama como el toque,
            con su fecha, y se guarda en la cuenta de Spotify de Setlist Maker.
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
                {songs(trackIds.length)} con enlace de Spotify
                {playlist
                  ? trackIds.length === 1
                    ? ' reemplazará lo que tiene la playlist ahora.'
                    : ' reemplazarán lo que tiene la playlist ahora.'
                  : trackIds.length === 1
                    ? ' irá en la playlist.'
                    : ' irán en la playlist.'}
              </p>
            ) : (
              <p>Ninguna canción de este setlist tiene enlace de Spotify todavía.</p>
            ))}
          {canEdit && leftOut.length > 0 && (
            <p className="muted">
              Quedaron por fuera, sin enlace de Spotify: {leftOut.join(', ')}.
            </p>
          )}
          {confirmRemove && (
            <div className="share-dialog__confirm" role="alert">
              <p>La playlist se eliminará de Spotify y su enlace dejará de funcionar.</p>
              <div className="modal__actions">
                <button
                  type="button"
                  className="sm-button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  Conservarla
                </button>
                <button
                  type="button"
                  className="sm-button sm-button--danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Eliminar de Spotify
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
      <SpotifyAttribution label="Playlists en" />
      <div className="modal__actions">
        {shared && canEdit && playlist && !confirmRemove && (
          <div className="modal__actions-start">
            <button
              type="button"
              className="sm-button"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Eliminar de Spotify
            </button>
          </div>
        )}
        <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
        {shared && canEdit && (
          <button
            type="button"
            className="sm-button sm-button--primary"
            disabled={busy || trackIds.length === 0}
            onClick={() => void exportGig()}
          >
            {playlist ? 'Actualizar playlist' : 'Crear playlist'}
          </button>
        )}
      </div>
    </Modal>
  );
}
