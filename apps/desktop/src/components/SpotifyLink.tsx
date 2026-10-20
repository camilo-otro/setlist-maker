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
  const href = spotifyTrackUrl(spotifyId);
  return (
    <a
      className="spotify-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${title} in Spotify`}
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
 * Credits Spotify under results that came from it, with its full logo as its rules require. The
 * logo file is white; it's drawn as a mask so it shows black on light screens and white on dark
 * ones, Spotify's two one-colour versions.
 */
export function SpotifyAttribution() {
  return (
    <p className="spotify-attribution">
      Song details from
      <span
        className="spotify-attribution__logo"
        role="img"
        aria-label="Spotify"
        style={{ '--spotify-logo': `url("${spotifyLogo}")` } as CSSProperties}
      />
    </p>
  );
}
