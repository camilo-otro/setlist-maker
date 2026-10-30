import { describe, expect, it } from 'vitest';
import { keptMessage } from './keptNotice';

const names: Record<string, string> = { dave: 'Dave', ana: 'Ana' };
const nameOf = (id: string) => names[id] ?? 'Alguien que ya no está en la banda';

describe('keptMessage', () => {
  it('says what undo left alone and who changed it', () => {
    expect(
      keptMessage(
        {
          undid: true,
          label: 'editar Basurita',
          kept: [
            { field: 'keyOverride', by: 'dave' },
            { field: 'tempoOverride', by: 'dave' },
          ],
        },
        nameOf,
      ),
    ).toBe('No se deshizo todo en «editar Basurita»: Dave cambió el tono y el tempo después.');
  });

  it('names each person once, and says redo for redo', () => {
    expect(
      keptMessage(
        {
          undid: false,
          label: 'mover',
          kept: [
            { field: 'setBlockId', by: 'ana' },
            { field: 'position', by: 'ana' },
            { field: 'notes', by: null },
          ],
        },
        nameOf,
      ),
    ).toBe('No se rehízo todo en «mover»: Ana cambió el lugar y Alguien las notas después.');
  });
});
