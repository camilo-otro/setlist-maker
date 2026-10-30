import type { ChangeLogEntry } from '@setlist/core';
import { describe, expect, it } from 'vitest';
import { changeLines, describeChange, type ChangeLogNames } from './changeLog';

const DAVE = '01900000-0000-7000-8000-0000000000a3';
const ANA = '01900000-0000-7000-8000-0000000000a4';
const SONG = '01900000-0000-7000-8000-000000000091';
const ENTRY = '01900000-0000-7000-8000-0000000000e1';
const SET_1 = '01900000-0000-7000-8000-000000000081';
const ENCORE = '01900000-0000-7000-8000-000000000082';

const names: ChangeLogNames = {
  member: (id) => ({ [DAVE]: 'Dave', [ANA]: 'Ana' })[id] ?? 'Alguien que ya no está en la banda',
  song: (id) => (id === SONG ? 'Basurita' : undefined),
  entry: (id) => (id === ENTRY ? { kind: 'song', songId: SONG, label: null } : undefined),
  set: (id) => ({ [SET_1]: 'Set 1', [ENCORE]: 'Encore' })[id],
  venue: () => 'El Bar',
};

let n = 0;
function logged(
  values: Pick<ChangeLogEntry, 'tableName' | 'action'> & Partial<ChangeLogEntry>,
): ChangeLogEntry {
  n += 1;
  return {
    id: `01a18e17-00${String(n).padStart(2, '0')}-7000-8000-000000000000`,
    bandId: '01900000-0000-7000-8000-00000000000a',
    createdAt: `2026-10-30T18:${String(n).padStart(2, '0')}:00.000Z`,
    updatedAt: '2026-10-30T18:00:00.000Z',
    updatedBy: null,
    deletedAt: null,
    version: 1,
    seq: n,
    gigId: '01900000-0000-7000-8000-000000000062',
    memberId: DAVE,
    rowId: ENTRY,
    changes: {},
    ...values,
  };
}

describe('describeChange', () => {
  it.each([
    [
      logged({
        tableName: 'set_entries',
        action: 'add',
        changes: { kind: { new: 'song' }, song_id: { new: SONG }, set_block_id: { new: SET_1 } },
      }),
      'agregó Basurita a Set 1',
    ],
    [logged({ tableName: 'set_entries', action: 'remove' }), 'quitó Basurita'],
    [logged({ tableName: 'set_entries', action: 'restore' }), 'volvió a poner Basurita'],
    [
      logged({
        tableName: 'set_entries',
        action: 'change',
        changes: { set_block_id: { old: SET_1, new: ENCORE }, position: { old: 'a0', new: 'a1' } },
      }),
      'movió Basurita a Encore',
    ],
    [
      logged({
        tableName: 'set_entries',
        action: 'change',
        changes: {
          key_override: { old: null, new: 'C' },
          tempo_override: { old: null, new: 132 },
        },
      }),
      'cambió el tono de Basurita a C y cambió el tempo de Basurita a 132 bpm',
    ],
    [
      logged({
        tableName: 'set_entries',
        action: 'change',
        changes: { key_override: { old: 'C', new: null } },
      }),
      'volvió al tono habitual de Basurita',
    ],
    [
      logged({
        tableName: 'set_blocks',
        action: 'change',
        rowId: ENCORE,
        changes: { name: { old: 'Set 2', new: 'Encore' } },
      }),
      'cambió el nombre de «Set 2» a «Encore»',
    ],
    [
      logged({
        tableName: 'gigs',
        action: 'change',
        changes: { start_time: { old: '20:00', new: '21:30' } },
      }),
      'cambió la hora de inicio a 9:30 p. m.',
    ],
    [
      logged({
        tableName: 'gigs',
        action: 'change',
        changes: { status: { old: 'upcoming', new: 'cancelled' } },
      }),
      'canceló el toque',
    ],
    [logged({ tableName: 'gigs', action: 'add' }), 'creó el toque'],
  ])('%#: %s', (entry, text) => {
    expect(describeChange(entry, names)).toBe(text);
  });
});

describe('changeLines', () => {
  it('lists changes newest first, naming who made each', () => {
    const lines = changeLines(
      [
        logged({ tableName: 'gigs', action: 'add' }),
        logged({
          tableName: 'set_entries',
          action: 'change',
          memberId: ANA,
          changes: { segue_to_next: { old: false, new: true } },
        }),
      ],
      names,
    );
    expect(lines.map((line) => `${line.who}: ${line.text}`)).toEqual([
      'Ana: enlazó Basurita con la siguiente',
      'Dave: creó el toque',
    ]);
  });

  it('reads songs added in one go as one line, and leaves out cleared entries', () => {
    const add = () =>
      logged({
        tableName: 'set_entries',
        action: 'add',
        rowId: '01900000-0000-7000-8000-0000000000e9',
        changes: { kind: { new: 'song' }, song_id: { new: SONG } },
      });
    const lines = changeLines(
      [
        add(),
        add(),
        add(),
        logged({ tableName: 'gigs', action: 'add', deletedAt: '2026-10-31T00:00:00.000Z' }),
      ],
      names,
    );
    expect(lines.map((line) => line.text)).toEqual(['agregó 3 canciones']);
  });
});
