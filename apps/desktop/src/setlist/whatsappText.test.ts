import { describe, expect, it } from 'vitest';
import { sampleGig as sample } from './sampleGig';
import { whatsappText } from './whatsappText';

// Dates are always Colombian Spanish, whatever the device's language.
const DATE = 'sábado, 7 de noviembre de 2026';

describe('whatsappText', () => {
  it('lays out the gig for a WhatsApp chat', async () => {
    const { gig, venue, blocks, songsById } = await sample();
    expect(whatsappText({ gig, venue, blocks, songsById })).toBe(
      [
        '*Rock Party at the Pub*',
        `${DATE} · 9:30 p. m. · The Pub, Bogotá`,
        '',
        '*Set 1* (7:43)',
        '1. Basurita · A →',
        '2. Here Without You · C',
        '— Descanso · 15 min —',
        '_Thank the venue_',
        '3. Untimed',
        '',
        '*Encore*',
        '_Aún sin canciones_',
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
    });
    expect(text.split('\n').slice(0, 3)).toEqual(['*Rock Party at the Pub*', DATE, '_Cancelado_']);
    expect(text.endsWith('\n\nSetlist actualizado: https://setlist.rockthehouse.app/#abc')).toBe(
      true,
    );
  });
});
