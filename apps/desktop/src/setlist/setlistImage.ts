import {
  formatDate,
  formatDuration,
  formatTime,
  formatWeekday,
  setDuration,
  type Gig,
  type Song,
  type Venue,
} from '@setlist/core';
import type { BlockWithEntries } from './useGigSetlist';

/**
 * A gig's setlist drawn as one tall, phone-width picture for a chat (#84), in the web viewer's
 * look, light or dark to match the app. The layout is plain data (boxes, lines and text at fixed spots), worked out here so
 * it can be tested; `drawSetlistImage` paints it on a canvas.
 */

export const IMAGE_WIDTH = 540;
/** Pixels per layout unit in the PNG: 1080 wide, sharp on phone screens. */
export const IMAGE_SCALE = 2;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export type ImageTheme = 'light' | 'dark';

/** The app's own colours (packages/ui), so the picture looks like the screen it came from. */
const PALETTES: Record<
  ImageTheme,
  Record<'bg' | 'surface' | 'border' | 'text' | 'muted' | 'hover' | 'accent' | 'danger', string>
> = {
  light: {
    bg: '#f7f7f8',
    surface: '#ffffff',
    border: '#dcdce1',
    text: '#1c1c21',
    muted: '#5f5f69',
    hover: '#e4e4e9',
    accent: '#5b21b6',
    danger: '#b42318',
  },
  dark: {
    bg: '#141417',
    surface: '#1c1c21',
    border: '#2e2e36',
    text: '#ececf1',
    muted: '#a0a0ac',
    hover: '#26262d',
    accent: '#c4b5fd',
    danger: '#f97066',
  },
};

/**
 * The theme the app is showing: the one picked in the app (`data-theme` on the page), or the
 * system's when it follows the system.
 */
export function activeImageTheme(): ImageTheme {
  const picked = document.documentElement.dataset.theme;
  if (picked === 'light' || picked === 'dark') return picked;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const PAD = 24;
const CARD_X = PAD;
const CARD_W = IMAGE_WIDTH - PAD * 2;
const INSET = 14;

export type ImageItem =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; stroke?: string }
  | { kind: 'line'; x: number; y: number; w: number; color: string }
  | {
      kind: 'text';
      x: number;
      /** The text's baseline. */
      y: number;
      text: string;
      font: string;
      color: string;
      align?: 'left' | 'right' | 'center';
    };

export interface ImageLayout {
  width: number;
  height: number;
  background: string;
  items: ImageItem[];
}

/** Width of `text` in `font`, in layout units: a canvas's `measureText` in the app. */
export type Measure = (text: string, font: string) => number;

const font = (size: number, weight = 400, style = '') =>
  `${style ? `${style} ` : ''}${weight} ${size}px ${FONT}`;

/** `text` cut to fit `width`, ending in "…" when it had to be cut. */
function fit(text: string, width: number, fontSpec: string, measure: Measure): string {
  if (measure(text, fontSpec) <= width) return text;
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}…`, fontSpec) > width) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/** `text` broken into lines no wider than `width`, at spaces where it can be. */
function wrap(text: string, width: number, fontSpec: string, measure: Measure): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next, fontSpec) <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => fit(l, width, fontSpec, measure));
}

export function layoutSetlistImage({
  gig,
  venue,
  blocks,
  songsById,
  measure,
  theme = 'light',
}: {
  gig: Gig;
  venue: Venue | null;
  blocks: readonly BlockWithEntries[];
  songsById: ReadonlyMap<string, Song>;
  measure: Measure;
  theme?: ImageTheme;
}): ImageLayout {
  const COLORS = PALETTES[theme];
  // Deleted songs are left out, as in the viewer.
  const sets = blocks.map(({ block, entries }) => ({
    block,
    entries: entries.filter((entry) => {
      if (entry.kind !== 'song') return true;
      const song = entry.songId ? songsById.get(entry.songId) : undefined;
      return Boolean(song && !song.deletedAt);
    }),
  }));
  const items: ImageItem[] = [];
  const text = (
    x: number,
    y: number,
    value: string,
    fontSpec: string,
    color = COLORS.text,
    align: 'left' | 'right' | 'center' = 'left',
  ) => items.push({ kind: 'text', x, y, text: value, font: fontSpec, color, align });

  // The gig: title, then when and where, then how long it all runs.
  let y = PAD;
  const titleFont = font(26, 700);
  for (const line of wrap(gig.title, IMAGE_WIDTH - PAD * 2, titleFont, measure)) {
    y += 32;
    text(PAD, y, line, titleFont);
  }
  // Short, so the line fits a phone: "sáb, 7 de nov de 2026".
  const date = `${formatWeekday(gig.date)}, ${formatDate(gig.date)}`;
  const where = venue && (venue.city ? `${venue.name}, ${venue.city}` : venue.name);
  const detailsFont = font(15);
  for (const line of wrap(
    [date, gig.startTime && formatTime(gig.startTime), where].filter(Boolean).join(' · '),
    IMAGE_WIDTH - PAD * 2,
    detailsFont,
    measure,
  )) {
    y += 22;
    text(PAD, y, line, detailsFont, COLORS.muted);
  }
  if (gig.status === 'cancelled') {
    y += 24;
    text(PAD, y, 'Cancelado', font(15, 700), COLORS.danger);
  }
  const total = sets.reduce(
    (sum, { entries }) => {
      const set = setDuration(entries, songsById);
      return { totalSec: sum.totalSec + set.totalSec, songs: sum.songs + set.songs };
    },
    { totalSec: 0, songs: 0 },
  );
  y += 24;
  text(
    PAD,
    y,
    `${formatDuration(total.totalSec)} en total · ${total.songs} ${total.songs === 1 ? 'canción' : 'canciones'}`,
    detailsFont,
    COLORS.muted,
  );

  // Each set as a card, songs numbered through the gig.
  let number = 0;
  for (const { block, entries } of sets) {
    y += 20;
    const top = y;
    const card: ImageItem = {
      kind: 'rect',
      x: CARD_X,
      y: top,
      w: CARD_W,
      h: 0,
      fill: COLORS.surface,
      stroke: COLORS.border,
    };
    items.push(card);

    const { totalSec } = setDuration(entries, songsById);
    const timeText = totalSec > 0 ? formatDuration(totalSec) : '';
    const setFont = font(18, 700);
    const timeFont = font(16);
    const timeWidth = timeText ? measure(timeText, timeFont) + 12 : 0;
    text(
      CARD_X + INSET,
      top + 28,
      fit(block.name, CARD_W - INSET * 2 - timeWidth, setFont, measure),
      setFont,
    );
    if (timeText)
      text(CARD_X + CARD_W - INSET, top + 28, timeText, timeFont, COLORS.muted, 'right');
    y = top + 44;

    for (const entry of entries) {
      if (entry.kind === 'song') {
        const song = songsById.get(entry.songId!)!;
        number += 1;
        items.push({ kind: 'line', x: CARD_X, y, w: CARD_W, color: COLORS.border });
        const key = entry.keyOverride ?? song.key;
        const length = song.durationSec !== null ? formatDuration(song.durationSec) : '';
        const keyFont = font(16, 600);
        const lengthFont = font(16);
        // Right side, from the edge in: length, then key.
        let right = CARD_X + CARD_W - INSET;
        if (length) {
          text(right, y + 30, length, lengthFont, COLORS.muted, 'right');
          right -= measure(length, lengthFont) + 12;
        }
        if (key) {
          text(right, y + 30, key, keyFont, COLORS.text, 'right');
          right -= measure(key, keyFont) + 12;
        }
        const numberRight = CARD_X + INSET + 24;
        text(numberRight, y + 30, String(number), font(16), COLORS.muted, 'right');
        const textX = numberRight + 10;
        const titleWidth = right - textX;
        const songFont = font(18, 600);
        const segue = entry.segueToNext ? ' →' : '';
        const title = fit(
          song.title,
          titleWidth - (segue ? measure(segue, songFont) : 0),
          songFont,
          measure,
        );
        text(textX, y + 30, title, songFont);
        if (segue) text(textX + measure(title, songFont), y + 30, segue, songFont, COLORS.accent);
        if (song.artist) {
          const artistFont = font(14);
          text(
            textX,
            y + 50,
            fit(song.artist, titleWidth, artistFont, measure),
            artistFont,
            COLORS.muted,
          );
          y += 62;
        } else y += 46;
      } else {
        items.push({ kind: 'line', x: CARD_X, y, w: CARD_W, color: COLORS.border });
        const isBreak = entry.kind === 'break';
        if (isBreak)
          items.push({ kind: 'rect', x: CARD_X, y, w: CARD_W, h: 38, fill: COLORS.hover });
        const label = isBreak
          ? entry.label
            ? `DESCANSO · ${entry.label.toUpperCase()}`
            : 'DESCANSO'
          : (entry.label ?? '');
        const labelFont = isBreak ? font(14, 600) : font(15, 400, 'italic');
        text(
          IMAGE_WIDTH / 2,
          y + 24,
          fit(label, CARD_W - INSET * 2, labelFont, measure),
          labelFont,
          isBreak ? COLORS.muted : COLORS.text,
          'center',
        );
        y += 38;
      }
    }
    if (entries.length === 0) {
      items.push({ kind: 'line', x: CARD_X, y, w: CARD_W, color: COLORS.border });
      text(CARD_X + INSET, y + 26, 'Aún sin canciones', font(15), COLORS.muted);
      y += 40;
    }
    card.h = y - top;
  }

  y += 28;
  text(IMAGE_WIDTH / 2, y, 'Setlist Maker', font(13), COLORS.muted, 'center');
  return { width: IMAGE_WIDTH, height: y + PAD, background: COLORS.bg, items };
}

/** Paints `layout` and hands back the PNG. */
export function drawSetlistImage(layout: ImageLayout): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width * IMAGE_SCALE;
  canvas.height = Math.ceil(layout.height * IMAGE_SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Este dispositivo no puede dibujar imágenes.'));
  ctx.scale(IMAGE_SCALE, IMAGE_SCALE);
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const item of layout.items) {
    if (item.kind === 'rect') {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, item.stroke ? 8 : 0);
      ctx.fillStyle = item.fill;
      ctx.fill();
      if (item.stroke) {
        ctx.strokeStyle = item.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    } else if (item.kind === 'line') {
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.w, 1);
    } else {
      ctx.font = item.font;
      ctx.fillStyle = item.color;
      ctx.textAlign = item.align ?? 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.text, item.x, item.y);
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))),
      'image/png',
    ),
  );
}

/** Measures with a canvas, as `drawSetlistImage` will draw. */
export function canvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  return (value, fontSpec) => {
    if (!ctx) return value.length * 9;
    ctx.font = fontSpec;
    return ctx.measureText(value).width;
  };
}

/** A file name for the picture: the gig's title and date. */
export function imageFileName(gig: Pick<Gig, 'title' | 'date'>): string {
  const slug = gig.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'setlist'}-${gig.date}.png`;
}
