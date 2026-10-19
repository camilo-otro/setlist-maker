import { describe, expect, it } from 'vitest';
import { sampleGig as sample } from './sampleGig';
import { whatsappText } from './whatsappText';

// The date is written in the reader's locale, so the expectation is built the same way.
const DATE = new Date(2026, 10, 7).toLocaleDateString('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

describe('whatsappText', () => {
  it('lays out the gig for a WhatsApp chat', async () => {
    const { gig, venue, blocks, songsById } = await sample();
    expect(whatsappText({ gig, venue, blocks, songsById, locale: 'en-GB' })).toBe(
      [
        '*Rock Party at the Pub*',
        `${DATE} · 21:30 · The Pub, Bogotá`,
        '',
        '*Set 1* (7:43)',
        '1. Basurita · A →',
        '2. Here Without You · C',
        '— Break · 15 min —',
        '_Thank the venue_',
        '3. Untimed',
        '',
        '*Encore*',
        '_No songs yet_',
      ].join('\n'),
    );
  });

  it('ends with the share link, and says when the gig is cancelled', async () => {
    const { gig, blocks, songsById } = await sample();
    const text = whatsappText({
      gig: { ...gig, status: 'cancelled', startTime: null },
      venue: null,
      blocks,
      songsById,
      link: 'https://setlist.rockthehouse.app/#abc',
      locale: 'en-GB',
    });
    expect(text.split('\n').slice(0, 3)).toEqual(['*Rock Party at the Pub*', DATE, '_Cancelled_']);
    expect(text.endsWith('\n\nLive setlist: https://setlist.rockthehouse.app/#abc')).toBe(true);
  });
});
