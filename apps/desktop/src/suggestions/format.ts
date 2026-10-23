import { LOCALE, type VoteSummary } from '@setlist/core';

const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** "★ 4,3 · 3 votos", or "Sin votos". Only the average and count: never who voted what. */
export function averageLabel({ average, count }: VoteSummary): string {
  if (average === null) return 'Sin votos';
  return `★ ${oneDecimal.format(average)} · ${count} ${count === 1 ? 'voto' : 'votos'}`;
}
