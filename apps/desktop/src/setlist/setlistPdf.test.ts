import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { sampleGig } from './sampleGig';
import { layoutSetlistPdf, makeSetlistPdf, PAGE, pdfFileName, type PdfMeasure } from './setlistPdf';

/** Every character 0.55 of the size wide, so the layout doesn't depend on fonts. */
const measure: PdfMeasure = (text, size) => text.length * size * 0.55;

/** The sample gig's first set, with `count` songs, the first with a BPM. */
async function setOf(count: number, title = (i: number) => `Song ${i + 1}`) {
  const sample = await sampleGig();
  const [first] = sample.blocks;
  const song = sample.songsById.get(first!.entries[0]!.songId!)!;
  const songsById = new Map(sample.songsById);
  const entries = Array.from({ length: count }, (_, i) => {
    songsById.set(`s${i}`, {
      ...song,
      id: `s${i}`,
      title: title(i),
      tempoBpm: i === 0 ? 128 : null,
    });
    return { ...first!.entries[0]!, id: `e${i}`, songId: `s${i}` };
  });
  return { ...sample, songsById, blocks: [{ block: first!.block, entries }] };
}

describe('layoutSetlistPdf', () => {
  it('puts each set on a page: the band name, then its song titles centred', async () => {
    const pages = layoutSetlistPdf({
      ...(await sampleGig()),
      bandName: 'The Rock House',
      measure,
    });
    // The encore has no songs yet, so it gets no page.
    expect(pages).toHaveLength(1);
    const [band, subtitle, ...songs] = pages[0]!.items;
    expect(band).toMatchObject({ text: 'The Rock House', bold: true, align: 'center' });
    expect(subtitle!.text).toMatch(/^Set 1 · Rock Party at the Pub · 7 de nov de 2026$/);
    // The deleted song, the break and the note aren't printed.
    expect(songs.map((item) => item.text)).toEqual(['Basurita', 'Here Without You', 'Untimed']);
    expect(songs.every((item) => item.align === 'center' && item.x === PAGE.width / 2)).toBe(true);
  });

  it('fits a 16-song set on one page, large enough to read on stage', async () => {
    const pages = layoutSetlistPdf({ ...(await setOf(16)), bandName: 'Band', measure });
    expect(pages).toHaveLength(1);
    const titles = pages[0]!.items.filter((item) => item.text.startsWith('Song '));
    expect(titles).toHaveLength(16);
    expect(titles[0]!.size).toBeGreaterThan(22);
    expect(titles.at(-1)!.y).toBeLessThanOrEqual(PAGE.height - PAGE.margin);
  });

  it('shows BPM next to songs that have one', async () => {
    const pages = layoutSetlistPdf({ ...(await setOf(3)), bandName: 'Band', measure });
    const bpm = pages[0]!.items.filter((item) => item.text.endsWith('bpm'));
    expect(bpm).toHaveLength(1);
    const first = pages[0]!.items.find((item) => item.text === 'Song 1')!;
    expect(bpm[0]).toMatchObject({ text: '128 bpm', muted: true, y: first.y });
    expect(bpm[0]!.x).toBeGreaterThan(first.x + measure('Song 1', first.size, true) / 2);
  });

  it('prints the tempo set for this gig over the song’s usual one', async () => {
    const set = await setOf(2);
    const [first, second] = set.blocks[0]!.entries;
    const blocks = [
      {
        block: set.blocks[0]!.block,
        entries: [
          { ...first!, tempoOverride: 140 },
          { ...second!, tempoOverride: 96 },
        ],
      },
    ];
    const pages = layoutSetlistPdf({ ...set, blocks, bandName: 'Band', measure });
    expect(pages[0]!.items.filter((item) => item.text.endsWith('bpm')).map((i) => i.text)).toEqual([
      '140 bpm',
      '96 bpm',
    ]);
  });

  it('shrinks a long title to fit its line instead of cutting it', async () => {
    const long = 'A very long song title that goes on and on '.repeat(2).trim();
    const pages = layoutSetlistPdf({
      ...(await setOf(4, (i) => (i === 2 ? long : `Song ${i + 1}`))),
      bandName: 'Band',
      measure,
    });
    const items = pages[0]!.items;
    const title = items.find((item) => item.text === long)!;
    const normal = items.find((item) => item.text === 'Song 2')!;
    expect(title.size).toBeLessThan(normal.size);
    expect(measure(long, title.size, true)).toBeLessThanOrEqual(PAGE.width - PAGE.margin * 2);
  });

  it('carries a very long set on to another page', async () => {
    const pages = layoutSetlistPdf({ ...(await setOf(40)), bandName: 'Band', measure });
    expect(pages.length).toBe(2);
    expect(pages[1]!.items[1]!.text).toMatch(/^Set 1 \(continuación\)/);
    const count = (page: (typeof pages)[number]) =>
      page.items.filter((item) => item.text.startsWith('Song ')).length;
    expect(count(pages[0]!) + count(pages[1]!)).toBe(40);
  });
});

describe('makeSetlistPdf', () => {
  it('makes a Letter-size PDF with a page per set, even with characters the fonts lack', async () => {
    const sample = await setOf(5, (i) => (i === 0 ? 'Canción ñandú 🎸' : `Song ${i + 1}`));
    const bytes = await makeSetlistPdf({ ...sample, bandName: 'The Rock House ⚡' });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toBe('Setlist de Rock Party at the Pub');
  });

  it('names the file after the gig', () => {
    expect(pdfFileName({ title: 'Rock Party at the Pub!', date: '2026-11-07' })).toBe(
      'rock-party-at-the-pub-2026-11-07.pdf',
    );
  });
});
