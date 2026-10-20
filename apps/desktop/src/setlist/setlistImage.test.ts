import { describe, expect, it } from 'vitest';
import { imageFileName, layoutSetlistImage, type ImageItem, type Measure } from './setlistImage';
import { sampleGig } from './sampleGig';

/** Every character 9 units wide, so the layout doesn't depend on fonts. */
const measure: Measure = (text) => text.length * 9;
const texts = (items: ImageItem[]) =>
  items.flatMap((item) => (item.kind === 'text' ? [item.text] : []));

describe('layoutSetlistImage', () => {
  it('lays out the gig, its sets and their entries in order', async () => {
    const layout = layoutSetlistImage({ ...(await sampleGig()), measure, locale: 'en-GB' });
    const date = new Date(2026, 10, 7).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(texts(layout.items)).toEqual([
      'Rock Party at the Pub',
      `${date} · 21:30 · The Pub, Bogotá`,
      '7:43 total · 3 songs',
      'Set 1',
      '7:43',
      '3:45',
      'A',
      '1',
      'Basurita',
      ' →',
      '3:58',
      'C',
      '2',
      'Here Without You',
      'BREAK · 15 MIN',
      'Thank the venue',
      '3',
      'Untimed',
      'Encore',
      'No songs yet',
      'Setlist Maker',
    ]);
  });

  it('grows to fit every song, with nothing drawn past the bottom', async () => {
    const sample = await sampleGig();
    const [first] = sample.blocks;
    const song = first!.entries[0]!;
    const long = {
      ...first!,
      entries: Array.from({ length: 60 }, (_, i) => ({ ...song, id: `e${i}`, segueToNext: false })),
    };
    const layout = layoutSetlistImage({ ...sample, blocks: [long], measure });
    const numbers = layout.items.filter((item) => item.kind === 'text' && /^\d+$/.test(item.text));
    expect(numbers).toHaveLength(60);
    expect(Math.max(...layout.items.map((item) => item.y))).toBeLessThan(layout.height);
    const card = layout.items.find((item) => item.kind === 'rect' && item.stroke)!;
    expect(card.kind === 'rect' && card.y + card.h).toBeGreaterThan(numbers.at(-1)!.y);
  });

  it('uses the dark colours when the app is dark', async () => {
    const sample = await sampleGig();
    const light = layoutSetlistImage({ ...sample, measure });
    const dark = layoutSetlistImage({ ...sample, measure, theme: 'dark' });
    expect(light.background).toBe('#f7f7f8');
    expect(dark.background).toBe('#141417');
    // Same layout, other colours.
    expect(dark.items.map(({ kind, y }) => [kind, y])).toEqual(
      light.items.map(({ kind, y }) => [kind, y]),
    );
    const title = (layout: typeof light) =>
      layout.items.find((item) => item.kind === 'text' && item.text === 'Rock Party at the Pub');
    expect(title(dark)).toMatchObject({ color: '#ececf1' });
    expect(title(light)).toMatchObject({ color: '#1c1c21' });
  });

  it('shortens titles too wide for the card', async () => {
    const sample = await sampleGig();
    const id = sample.blocks[0]!.entries[0]!.songId!;
    const songsById = new Map(sample.songsById);
    songsById.set(id, { ...songsById.get(id)!, title: 'A very long song title '.repeat(4) });
    const layout = layoutSetlistImage({ ...sample, songsById, measure });
    const title = texts(layout.items).find((text) => text.startsWith('A very long'))!;
    expect(title.endsWith('…')).toBe(true);
    expect(measure(title, '')).toBeLessThan(540);
  });
});

describe('imageFileName', () => {
  it('names the file after the gig', () => {
    expect(imageFileName({ title: 'Rock Party at the Pub!', date: '2026-11-07' })).toBe(
      'rock-party-at-the-pub-2026-11-07.png',
    );
    expect(imageFileName({ title: 'Bogotá ✨', date: '2026-11-07' })).toBe('bogota-2026-11-07.png');
    expect(imageFileName({ title: '✨', date: '2026-11-07' })).toBe('setlist-2026-11-07.png');
  });
});
