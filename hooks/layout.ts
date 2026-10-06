/** The cursor's display line, split around the cell the pane draws inverted. */
export type CursorCell = {
  /** The line's text before the cursor. */
  before: string;
  /** The whole character under the cursor, or a space when the cursor ends its line. */
  under: string;
  /** The line's text after the character under the cursor. */
  after: string;
};

/** A draft laid out for the pane: its display lines and where the cursor sits in them. */
export type DraftLayout = {
  /** One entry per draft line, unwrapped; the pane's `Text` element wraps them. */
  lines: string[];
  /** The index in `lines` of the line holding the cursor. */
  cursorLine: number;
  cursor: CursorCell;
};

const isHighSurrogate = (unit: number): boolean => unit >= 0xd8_00 && unit <= 0xdb_ff;
const isLowSurrogate = (unit: number): boolean => unit >= 0xdc_00 && unit <= 0xdf_ff;

/**
 * Lays out a draft as display lines, one per draft line, with the cursor's line split around the
 * character under the cursor.
 *
 * An empty draft gives a single empty line with the cursor at its end.
 *
 * @param text - The draft, its lines separated by "\n".
 * @param cursor - The cursor's offset in `text`, in UTF-16 code units. An offset between the two
 *   units of a surrogate pair moves back to the pair's start, so the cell covers the whole
 *   character.
 * @returns The display lines and the cursor's line split before, under and after the cursor.
 */
export function layoutDraft(text: string, cursor: number): DraftLayout {
  const head = text.slice(0, cursor);
  const lineStart = head.lastIndexOf("\n") + 1;
  const breakAfter = text.indexOf("\n", cursor);
  const line = text.slice(lineStart, breakAfter === -1 ? text.length : breakAfter);
  let column = cursor - lineStart;
  if (isLowSurrogate(line.charCodeAt(column)) && isHighSurrogate(line.charCodeAt(column - 1))) {
    column -= 1;
  }
  const point = line.codePointAt(column);
  const under = point === undefined ? " " : String.fromCodePoint(point);
  return {
    lines: text.split("\n"),
    cursorLine: head.split("\n").length - 1,
    cursor: {
      before: line.slice(0, column),
      under,
      after: point === undefined ? "" : line.slice(column + under.length),
    },
  };
}
