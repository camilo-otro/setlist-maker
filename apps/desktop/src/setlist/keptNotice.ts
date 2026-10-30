import { formatList } from '@setlist/core';
import type { KeptNotice } from './useHistory';

/** How each field undo can leave alone is named in a sentence. */
const FIELD_NAMES: Record<string, string> = {
  keyOverride: 'el tono',
  tempoOverride: 'el tempo',
  segueToNext: 'el enlace',
  notes: 'las notas',
  label: 'el texto',
  setBlockId: 'el lugar',
  position: 'el lugar',
  name: 'el nombre',
  targetDurationSec: 'la duración objetivo',
  key: 'el tono habitual',
  tempoBpm: 'el tempo habitual',
};

/**
 * Says what an undo or redo left alone, and who changed it since: "No se deshizo todo en «editar
 * Basurita»: Dave cambió el tono después." `nameOf` gives a member's name.
 */
export function keptMessage(notice: KeptNotice, nameOf: (memberId: string) => string): string {
  const byPerson = new Map<string, Set<string>>();
  for (const { field, by } of notice.kept) {
    const who = by ? nameOf(by) : 'Alguien';
    byPerson.set(who, (byPerson.get(who) ?? new Set()).add(FIELD_NAMES[field] ?? field));
  }
  const parts = [...byPerson].map(
    ([who, fields], i) => `${i === 0 ? `${who} cambió` : who} ${formatList([...fields])}`,
  );
  const verb = notice.undid ? 'No se deshizo' : 'No se rehízo';
  return `${verb} todo en «${notice.label}»: ${formatList(parts)} después.`;
}
