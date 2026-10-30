import { formatDate, type Gig, type Song } from '@setlist/core';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * A gig's setlist as a PDF to print for the stage (#34): US Letter, one page per set, the band's
 * name at the top and the set's song titles centred, as large as fit, with BPM when a song has
 * one. The layout is plain data worked out here, so it can be tested; `makeSetlistPdf` draws it.
 */

/** US Letter in PDF points (1/72 inch). */
export const PAGE = { width: 612, height: 792, margin: 54 };

const BAND_SIZE = 30;
const SUBTITLE_SIZE = 11;
/** Where the first title's line starts, below the band's name and the subtitle. */
const SONGS_TOP = PAGE.margin + BAND_SIZE + 22 + 34;
const SONGS_HEIGHT = PAGE.height - PAGE.margin - SONGS_TOP;
const LINE = 1.5;
const MAX_TITLE = 34;
const MIN_TITLE = 14;
/** Songs a page holds at the smallest size; a longer set goes on as many pages as it needs. */
const SONGS_PER_PAGE = Math.floor(SONGS_HEIGHT / (MIN_TITLE * LINE));

export interface PdfText {
  text: string;
  /** For centred text, its middle; otherwise its left edge. */
  x: number;
  /** The baseline, from the top of the page. */
  y: number;
  size: number;
  bold: boolean;
  muted: boolean;
  align: 'center' | 'left';
}

export interface PdfPage {
  items: PdfText[];
}

/** Width of `text` at `size` points, in the regular or bold face. */
export type PdfMeasure = (text: string, size: number, bold: boolean) => number;

/** The largest size, down to `min`, at which `text` fits `width`. */
function sizeToFit(
  text: string,
  size: number,
  min: number,
  width: number,
  bold: boolean,
  measure: PdfMeasure,
) {
  const at = measure(text, size, bold);
  return at <= width ? size : Math.max(min, (size * width) / at);
}

export function layoutSetlistPdf({
  bandName,
  gig,
  blocks,
  songsById,
  measure,
}: {
  bandName: string;
  gig: Gig;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  measure: PdfMeasure;
}): PdfPage[] {
  const width = PAGE.width - PAGE.margin * 2;
  const centre = PAGE.width / 2;
  const date = formatDate(gig.date);

  const header = (subtitle: string): PdfText[] => [
    {
      text: bandName,
      x: centre,
      y: PAGE.margin + BAND_SIZE,
      size: sizeToFit(bandName, BAND_SIZE, 16, width, true, measure),
      bold: true,
      muted: false,
      align: 'center',
    },
    {
      text: subtitle,
      x: centre,
      y: PAGE.margin + BAND_SIZE + 22,
      size: sizeToFit(subtitle, SUBTITLE_SIZE, 7, width, false, measure),
      bold: false,
      muted: true,
      align: 'center',
    },
  ];

  // Each set's songs, leaving out deleted ones, at this gig's tempo where it has its own; breaks
  // and notes aren't printed yet.
  const sets = blocks
    .map(({ block, entries }) => ({
      name: block.name,
      songs: entries.flatMap((entry) => {
        const song = entry.kind === 'song' && entry.songId ? songsById.get(entry.songId) : null;
        return song && !song.deletedAt
          ? [{ ...song, tempoBpm: entry.tempoOverride ?? song.tempoBpm }]
          : [];
      }),
    }))
    .filter((set) => set.songs.length > 0);

  if (sets.length === 0) {
    return [
      {
        items: [
          ...header(`${gig.title} · ${date}`),
          {
            text: 'Aún sin canciones',
            x: centre,
            y: SONGS_TOP + MAX_TITLE,
            size: 18,
            bold: false,
            muted: true,
            align: 'center',
          },
        ],
      },
    ];
  }

  const pages: PdfPage[] = [];
  for (const set of sets) {
    for (let start = 0; start < set.songs.length; start += SONGS_PER_PAGE) {
      const songs = set.songs.slice(start, start + SONGS_PER_PAGE);
      const name = start === 0 ? set.name : `${set.name} (continuación)`;
      const items = header(`${name} · ${gig.title} · ${date}`);
      // One size for the page, as large as the number of songs allows.
      const size = Math.min(MAX_TITLE, Math.max(MIN_TITLE, SONGS_HEIGHT / (songs.length * LINE)));
      songs.forEach((song, index) => {
        const y = SONGS_TOP + (index + 0.75) * size * LINE;
        const bpm = song.tempoBpm === null ? '' : `${song.tempoBpm} bpm`;
        // A long title shrinks so it and its BPM fit the line, rather than being cut.
        const full = (at: number) =>
          measure(song.title, at, true) + (bpm ? 0.4 * at + measure(bpm, at * 0.45, false) : 0);
        const at = full(size) <= width ? size : Math.max(8, (size * width) / full(size));
        const titleWidth = measure(song.title, at, true);
        items.push({
          text: song.title,
          x: centre,
          y,
          size: at,
          bold: true,
          muted: false,
          align: 'center',
        });
        if (bpm) {
          // After the centred title, so the titles line up down the page.
          items.push({
            text: bpm,
            x: Math.min(
              centre + titleWidth / 2 + 0.4 * at,
              PAGE.width - PAGE.margin - measure(bpm, at * 0.45, false),
            ),
            y,
            size: at * 0.45,
            bold: false,
            muted: true,
            align: 'left',
          });
        }
      });
      pages.push({ items });
    }
  }
  return pages;
}

/** The PDF itself. pdf-lib is loaded only when someone prints. */
export async function makeSetlistPdf(
  input: Omit<Parameters<typeof layoutSetlistPdf>[0], 'measure'>,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // The built-in fonts cover Western European letters (á, ñ, ü…); anything else (emoji, other
  // scripts) is left out rather than failing the whole PDF.
  const covered = new Set(regular.getCharacterSet());
  const clean = (text: string) =>
    [...text]
      .filter((ch) => covered.has(ch.codePointAt(0)!))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  const cleanSongs = new Map(
    [...input.songsById].map(([id, song]) => [id, { ...song, title: clean(song.title) || '?' }]),
  );
  const pages = layoutSetlistPdf({
    ...input,
    bandName: clean(input.bandName) || 'Setlist',
    gig: { ...input.gig, title: clean(input.gig.title) },
    blocks: input.blocks.map(({ block, entries }) => ({
      block: { ...block, name: clean(block.name) },
      entries,
    })),
    songsById: cleanSongs,
    measure: (text, size, isBold) => (isBold ? bold : regular).widthOfTextAtSize(text, size),
  });

  for (const { items } of pages) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    for (const item of items) {
      const font = item.bold ? bold : regular;
      const textWidth = font.widthOfTextAtSize(item.text, item.size);
      page.drawText(item.text, {
        x: item.align === 'center' ? item.x - textWidth / 2 : item.x,
        y: PAGE.height - item.y,
        size: item.size,
        font,
        color: item.muted ? rgb(0.37, 0.37, 0.41) : rgb(0, 0, 0),
      });
    }
  }
  doc.setTitle(`Setlist de ${clean(input.gig.title)}`);
  doc.setCreator('Setlist Maker');
  return doc.save();
}

/** A file name for the PDF: the gig's title and date, like the picture's. */
export function pdfFileName(gig: Pick<Gig, 'title' | 'date'>): string {
  const slug = gig.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'setlist'}-${gig.date}.pdf`;
}
