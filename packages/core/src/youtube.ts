import type { CatalogTrack } from './schemas/catalog';
import { normalizeForSearch } from './songs';

/**
 * The video ID in a YouTube link: `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`,
 * `/embed/…`, and the same on `m.` and `music.youtube.com`. Null for anything else.
 */
export function readYoutubeId(text: string): string | null {
  // Read with patterns rather than URL: core has no web platform types (it runs anywhere).
  const link =
    /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(youtu\.be|youtube(?:-nocookie)?\.com)\/(\S*)$/i.exec(
      text.trim(),
    );
  if (!link) return null;
  const [, host, rest] = link;
  const id =
    host!.toLowerCase() === 'youtu.be'
      ? /^([^/?#]+)/.exec(rest!)?.[1]
      : (/^watch\?(?:.*&)?v=([^&#]+)/.exec(rest!)?.[1] ??
        /^(?:shorts|live|embed)\/([^/?#]+)/.exec(rest!)?.[1]);
  return id && /^[0-9A-Za-z_-]{11}$/.test(id) ? id : null;
}

/** What a video's title and channel suggest the song is, and what to search for. */
export interface VideoGuess {
  title: string;
  artist: string | null;
  query: string;
}

// Bits of video titles that aren't part of the song's name.
const NOISE = [
  /\((?:[^()]*\b(?:official|oficial|video|v[ií]deo|audio|lyrics?|letra|visualizer|visualiser|live|en vivo|ao vivo|hd|hq|4k|remaster(?:ed)?|clip)\b[^()]*)\)/gi,
  /\[(?:[^[\]]*\b(?:official|oficial|video|v[ií]deo|audio|lyrics?|letra|visualizer|visualiser|live|en vivo|hd|hq|4k|remaster(?:ed)?|clip)\b[^[\]]*)\]/gi,
  /\b(?:official|oficial)\s+(?:music\s+)?(?:video|v[ií]deo|audio|lyric video)\b/gi,
  /\|.*$/,
  /#\S+/g,
];

const tidy = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|·]+|[\s\-–—:|·]+$/g, '')
    .trim();

/** A channel's name as an artist: without " - Topic", "VEVO" or "Official". */
function channelArtist(author: string): string {
  return tidy(
    author
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\b(?:official|oficial)\b/gi, ''),
  );
}

/**
 * The song a YouTube video is probably of, from its title and channel (#89): "Artist - Song
 * (Official Video)" splits at the dash; otherwise the channel is the artist, as on official and
 * YouTube Music ("Artist - Topic") channels. A guess to search with and confirm, never final.
 */
export function guessSongFromVideo(video: { title: string; author: string }): VideoGuess {
  let title = video.title;
  for (const pattern of NOISE) title = title.replace(pattern, ' ');
  // Featured artists help nobody find the song.
  title = title.replace(/\s*[([]?\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi, ' ');
  title = tidy(title);

  const quoted = /^["“'](.+?)["”']$/;
  const parts = title.split(/\s+[-–—]\s+/).map(tidy);
  let artist: string | null;
  if (parts.length > 1) {
    const before = parts[0]!;
    // Some channels repeat the artist: "The Beatles - The Beatles - Hey Jude".
    const after = parts
      .slice(1)
      .filter((part) => normalizeForSearch(part) !== normalizeForSearch(before))
      .join(' - ');
    // '"Song" - Artist' quotes the song; otherwise it's 'Artist - Song'.
    const song = quoted.exec(before);
    [artist, title] = song ? [after, song[1]!] : [before, after];
  } else {
    artist = channelArtist(video.author) || null;
  }
  title = tidy(title.replace(/^["“']+|["”']+$/g, ''));
  return { title, artist, query: [title, artist].filter(Boolean).join(' ') };
}

const simple = (text: string) =>
  normalizeForSearch(text)
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Whether a search result is clearly the guessed song: same title (ignoring extras like
 * "- Remastered 2015" or "(Live)") and, when there's a guessed artist, one of its artists. Only
 * then is it picked in advance; the band still confirms it.
 */
export function matchesGuess(guess: VideoGuess, track: Pick<CatalogTrack, 'title' | 'artists'>) {
  if (simple(track.title) !== simple(guess.title)) return false;
  if (!guess.artist) return true;
  const artist = simple(guess.artist);
  return track.artists.some((name) => {
    const candidate = simple(name);
    return candidate === artist || candidate.includes(artist) || artist.includes(candidate);
  });
}
