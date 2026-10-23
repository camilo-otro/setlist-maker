import { describe, expect, it } from 'vitest';
import { guessSongFromVideo, matchesGuess, readYoutubeId } from './youtube';

describe('readYoutubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=A_MjCqQoLLA', 'A_MjCqQoLLA'],
    ['https://youtube.com/watch?v=A_MjCqQoLLA&list=PL123&t=42s', 'A_MjCqQoLLA'],
    ['https://youtu.be/A_MjCqQoLLA?si=xyz', 'A_MjCqQoLLA'],
    ['https://m.youtube.com/watch?v=A_MjCqQoLLA', 'A_MjCqQoLLA'],
    ['https://music.youtube.com/watch?v=A_MjCqQoLLA&feature=share', 'A_MjCqQoLLA'],
    ['https://www.youtube.com/shorts/A_MjCqQoLLA', 'A_MjCqQoLLA'],
    ['https://www.youtube.com/live/A_MjCqQoLLA?feature=shared', 'A_MjCqQoLLA'],
    ['  https://www.youtube-nocookie.com/embed/A_MjCqQoLLA  ', 'A_MjCqQoLLA'],
  ])('reads %s', (link, id) => {
    expect(readYoutubeId(link)).toBe(id);
  });

  it.each([
    'hey jude',
    'https://open.spotify.com/track/0aym2LBJBk9DAYuHHutrIl',
    'https://www.youtube.com/@thebeatles',
    'https://www.youtube.com/watch?v=short',
    'https://notyoutube.com/watch?v=A_MjCqQoLLA',
  ])('ignores %s', (text) => {
    expect(readYoutubeId(text)).toBeNull();
  });
});

describe('guessSongFromVideo', () => {
  it.each([
    ['The Beatles - Hey Jude', 'The Beatles - Topic', { title: 'Hey Jude', artist: 'The Beatles' }],
    ['Oasis - Wonderwall (Official Video)', 'Oasis', { title: 'Wonderwall', artist: 'Oasis' }],
    [
      'Hey Jude (Remastered 2015)',
      'The Beatles - Topic',
      { title: 'Hey Jude', artist: 'The Beatles' },
    ],
    ['Wonderwall', 'OasisVEVO', { title: 'Wonderwall', artist: 'Oasis' }],
    [
      'The Beatles - The Beatles - Hey Jude (Official Music Video) [Remastered 2015]',
      'TheBeatlesVEVO',
      { title: 'Hey Jude', artist: 'The Beatles' },
    ],
    [
      'Shakira - Hips Don’t Lie ft. Wyclef Jean (Official 4K Video)',
      'shakiraVEVO',
      { title: 'Hips Don’t Lie', artist: 'Shakira' },
    ],
    [
      'Aterciopelados – Florecita Rockera [Video Oficial] | Rock en Español',
      'Aterciopelados Oficial',
      { title: 'Florecita Rockera', artist: 'Aterciopelados' },
    ],
    [
      'Carlos Vives, Shakira - La Bicicleta (Letra/Lyrics)',
      'CarlosVivesVEVO',
      { title: 'La Bicicleta', artist: 'Carlos Vives, Shakira' },
    ],
    [
      'Bersuit Vergarabat - Mi Caramelo (En Vivo)',
      'Bersuit',
      { title: 'Mi Caramelo', artist: 'Bersuit Vergarabat' },
    ],
    [
      '"Creep" - Radiohead live #rock #90s',
      'Some Fan',
      // Messy titles don't clean up perfectly: the band confirms or types it.
      { title: 'Creep', artist: 'Radiohead live' },
    ],
  ])('guesses %s (%s)', (title, author, expected) => {
    const guess = guessSongFromVideo({ title, author });
    expect({ title: guess.title, artist: guess.artist }).toEqual(expected);
    expect(guess.query).toBe(`${expected.title} ${expected.artist}`);
  });
});

describe('matchesGuess', () => {
  const guess = guessSongFromVideo({ title: 'Hey Jude', author: 'The Beatles - Topic' });

  it('matches the same song, ignoring extras in Spotify’s title', () => {
    expect(
      matchesGuess(guess, { title: 'Hey Jude - Remastered 2015', artists: ['The Beatles'] }),
    ).toBe(true);
    expect(matchesGuess(guess, { title: 'Hey Jude (Live)', artists: ['Beatles'] })).toBe(true);
  });

  it('doesn’t match another song or another artist', () => {
    expect(matchesGuess(guess, { title: 'Hey Joe', artists: ['The Beatles'] })).toBe(false);
    expect(matchesGuess(guess, { title: 'Hey Jude', artists: ['Wilson Pickett'] })).toBe(false);
  });
});
