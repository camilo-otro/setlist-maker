import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('title,artist\nWasteland,10 Years\n')).toEqual([
      ['title', 'artist'],
      ['Wasteland', '10 Years'],
    ]);
  });

  it('handles quotes, escaped quotes, delimiters and line breaks inside quotes', () => {
    const csv = 'title,notes\n"Hello, Goodbye","Say ""hi""\nthen leave"\n';
    expect(parseCsv(csv)).toEqual([
      ['title', 'notes'],
      ['Hello, Goodbye', 'Say "hi"\nthen leave'],
    ]);
  });

  it('accepts CRLF line endings, a byte-order mark, blank lines and a missing final newline', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'a,b\r\n\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3\n,,\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
      ['', '', ''],
    ]);
  });

  it('reads semicolon and tab separated files', () => {
    expect(parseCsv('title;bpm\nWasteland;74')).toEqual([
      ['title', 'bpm'],
      ['Wasteland', '74'],
    ]);
    expect(parseCsv('title\tbpm\nWasteland\t74')).toEqual([
      ['title', 'bpm'],
      ['Wasteland', '74'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('ignores delimiters inside quotes and looks only at the first line', () => {
    expect(detectDelimiter('"a,b,c";d\n1,2,3,4,5')).toBe(';');
    expect(detectDelimiter('title\n1')).toBe(',');
  });
});
