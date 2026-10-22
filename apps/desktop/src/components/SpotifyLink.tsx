import { spotifyTrackUrl } from '@setlist/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink } from 'lucide-react';
import spotifyLogo from '../assets/brand/spotify-logo.svg';
import type { CSSProperties } from 'react';
import { currentPlatform } from '../storage/workspace';

/**
 * "Open Spotify" for a track: the link Spotify's rules ask for wherever its data shows (ADR
 * 0003). The desktop app hands it to the system, which opens the Spotify app or the browser.
 */
export function SpotifyLink({ spotifyId, title }: { spotifyId: string; title: string }) {
  return <OpenSpotify href={spotifyTrackUrl(spotifyId)} label={`Abrir ${title} en Spotify`} />;
}

/** "Open Spotify" for a gig's playlist (ADR 0003). */
export function SpotifyPlaylistLink({ url }: { url: string }) {
  return <OpenSpotify href={url} label="Abrir la playlist en Spotify" />;
}

function OpenSpotify({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="spotify-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={(event) => {
        if (currentPlatform() !== 'desktop') return;
        event.preventDefault();
        void openUrl(href);
      }}
    >
      Open Spotify
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

/**
 * Credits Spotify wherever its data or service shows, with its full logo as its rules require.
 * The logo file is white; it's drawn as a mask so it shows black on light screens and white on
 * dark ones, Spotify's two one-colour versions.
 */
export function SpotifyAttribution({ label = 'Datos de canciones de' }: { label?: string }) {
  return (
    <p className="spotify-attribution">
      {label}
      <span
        className="spotify-attribution__logo"
        role="img"
        aria-label="Spotify"
        style={{ '--spotify-logo': `url("${spotifyLogo}")` } as CSSProperties}
      />
    </p>
  );
}
