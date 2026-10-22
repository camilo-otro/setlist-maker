import {
  checkImportRows,
  countImportRows,
  formatNumber,
  guessMapping,
  parseCsv,
  SONG_IMPORT_FIELDS,
  type ImportRow,
  type Song,
  type SongImportField,
  type SongImportMapping,
} from '@setlist/core';
import { FileUp } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useWorkspace } from '../storage/WorkspaceProvider';

const PREVIEW_ROWS = 200;
const plural = (n: number, one: string, many: string) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

interface LoadedFile {
  name: string;
  headers: string[];
  rows: string[][];
}

const STATUS_LABELS: Record<ImportRow['status'], string> = {
  ready: 'Lista',
  duplicate: 'Duplicada',
  invalid: 'Con problemas',
};

/**
 * Imports songs from a CSV file: pick the file, check which column fills which field, review the
 * rows, then import the ready ones in one go. Duplicates and rows with problems are skipped.
 */
export function ImportDialog({
  existing,
  onClose,
  onImported,
}: {
  existing: readonly Song[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { repository, band } = useWorkspace();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<SongImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'review' | 'importing' | 'done'>('review');
  const [imported, setImported] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  const checked = useMemo(
    () => (file ? checkImportRows(file.rows, mapping, existing) : []),
    [file, mapping, existing],
  );
  const counts = countImportRows(checked);
  const busy = phase === 'importing';

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setFileError(null);
    try {
      const [headers, ...rows] = parseCsv(await chosen.text());
      if (!headers) return setFileError(`${chosen.name} está vacío.`);
      if (rows.length === 0)
        return setFileError(`${chosen.name} tiene la fila de encabezados pero ninguna canción.`);
      setFile({ name: chosen.name, headers, rows });
      setMapping(guessMapping(headers));
    } catch (error) {
      setFileError(`No se pudo leer ${chosen.name}: ${String(error)}`);
    }
  }

  function setColumn(field: SongImportField, value: string) {
    setMapping((current) => {
      const next = { ...current };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  async function runImport() {
    const songs = checked.flatMap((row) => (row.status === 'ready' && row.song ? [row.song] : []));
    setPhase('importing');
    setFailure(null);
    try {
      await repository.songs.createMany(songs.map((song) => ({ bandId: band.id, ...song })));
      setImported(songs.length);
      setPhase('done');
      onImported();
    } catch (error) {
      setFailure(String(error));
      setPhase('review');
    }
  }

  const filePicker = (
    <label className="sm-button import__file">
      <FileUp size={16} aria-hidden="true" />
      {file ? 'Elegir otro archivo' : 'Elegir un archivo CSV'}
      <input
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="visually-hidden"
        aria-label="Archivo CSV"
        onChange={(event) => void chooseFile(event)}
      />
    </label>
  );

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}
      >
        <h2 id="import-title" className="modal__title">
          Importar canciones desde CSV
        </h2>

        {phase === 'done' ? (
          <>
            <p role="status">
              {imported === 1 ? 'Se importó' : 'Se importaron'}{' '}
              {plural(imported, 'canción', 'canciones')} a tu repertorio.
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="sm-button sm-button--primary"
                onClick={onClose}
                autoFocus
              >
                Listo
              </button>
            </div>
          </>
        ) : !file ? (
          <>
            <p className="muted">
              Exporta tu lista de canciones desde una hoja de cálculo como CSV. La primera fila debe
              nombrar las columnas, por ejemplo Título, Artista, Tono, BPM, Duración y Etiquetas.
              Vas a ver cada canción antes de importar nada.
            </p>
            {filePicker}
            {fileError && (
              <p className="sm-field__error" role="alert">
                {fileError}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="sm-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="import__file-row">
              <span>
                <strong>{file.name}</strong> · {plural(file.rows.length, 'fila', 'filas')}
              </span>
              {filePicker}
            </div>
            {fileError && (
              <p className="sm-field__error" role="alert">
                {fileError}
              </p>
            )}

            <section aria-labelledby="import-columns">
              <h3 id="import-columns" className="import__heading">
                Columnas
              </h3>
              <div className="import__columns">
                {SONG_IMPORT_FIELDS.map(({ field, label }) => {
                  const column = mapping[field];
                  const sample = column === undefined ? '' : (file.rows[0]?.[column] ?? '');
                  return (
                    <div key={field} className="import__column">
                      <label className="sm-field__label" htmlFor={`import-field-${field}`}>
                        {label}
                      </label>
                      <select
                        id={`import-field-${field}`}
                        className="sm-input"
                        value={column ?? ''}
                        onChange={(e) => setColumn(field, e.target.value)}
                      >
                        <option value="">No importar</option>
                        {file.headers.map((header, i) => (
                          <option key={i} value={i}>
                            {header || `Columna ${i + 1}`}
                          </option>
                        ))}
                      </select>
                      <span className="import__sample muted" title={sample}>
                        {sample || ' '}
                      </span>
                    </div>
                  );
                })}
              </div>
              {mapping.title === undefined && (
                <p className="sm-field__error" role="alert">
                  Elige la columna que tiene los títulos de las canciones.
                </p>
              )}
            </section>

            <section aria-labelledby="import-review">
              <h3 id="import-review" className="import__heading">
                Revisión
              </h3>
              <p className="import__summary" aria-live="polite">
                <span className="import__count import__count--ready">
                  {plural(counts.ready, 'canción lista', 'canciones listas')}
                </span>
                <span className="import__count">
                  {plural(counts.duplicate, 'duplicada omitida', 'duplicadas omitidas')}
                </span>
                <span className="import__count import__count--invalid">
                  {plural(
                    counts.invalid,
                    'fila con problemas omitida',
                    'filas con problemas omitidas',
                  )}
                </span>
              </p>
              <div className="import__preview">
                <table className="song-table">
                  <thead>
                    <tr>
                      <th scope="col">Línea</th>
                      <th scope="col">Título</th>
                      <th scope="col">Artista</th>
                      <th scope="col">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checked.slice(0, PREVIEW_ROWS).map((row) => (
                      <tr key={row.line} className={`import__row--${row.status}`}>
                        <td className="song-table__numeric">{row.line}</td>
                        <td>{row.song?.title ?? file.rows[row.line - 2]?.[mapping.title ?? -1]}</td>
                        <td>{row.song?.artist}</td>
                        <td>
                          {STATUS_LABELS[row.status]}
                          {row.messages.length > 0 && `: ${row.messages.join('; ')}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {checked.length > PREVIEW_ROWS && (
                <p className="muted">
                  Se muestran las primeras {PREVIEW_ROWS} de {formatNumber(checked.length)} filas.
                </p>
              )}
            </section>

            {failure && (
              <p className="sm-field__error" role="alert">
                No se importó nada: {failure}
              </p>
            )}

            <div className="modal__actions">
              <button type="button" className="sm-button" disabled={busy} onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="sm-button sm-button--primary"
                disabled={busy || counts.ready === 0}
                onClick={() => void runImport()}
              >
                {busy
                  ? `Importando ${formatNumber(counts.ready)}…`
                  : `Importar ${plural(counts.ready, 'canción', 'canciones')}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
