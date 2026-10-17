/**
 * A small RFC 4180 CSV reader: quoted fields (with "" for a literal quote and line breaks inside),
 * CRLF or LF line endings, and a leading byte-order mark. Spreadsheet apps in many regions save
 * with semicolons, so the delimiter is detected from the first line unless one is given.
 */

// Built from its code point: written literally it's invisible, and Prettier turns the escape back
// into the literal character.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const DELIMITERS = [',', ';', '\t'] as const;
export type CsvDelimiter = (typeof DELIMITERS)[number];

/** The delimiter that appears most often in the first line, outside quotes. Commas win ties. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best: CsvDelimiter = ',';
  for (const delimiter of DELIMITERS) {
    if (counts.get(delimiter)! > counts.get(best)!) best = delimiter;
  }
  return best;
}

/** Rows of fields. Blank lines are skipped; fields are returned exactly as written (untrimmed). */
export function parseCsv(
  input: string,
  delimiter: CsvDelimiter = detectDelimiter(input),
): string[][] {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
