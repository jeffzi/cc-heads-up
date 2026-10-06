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

/** Splits a line into user-perceived characters: an emoji sequence or a flag is one segment. */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Walks the segments rather than calling `containing`: in Claude Code's engine, `containing` at
// the start of a character made of several code units returns it merged with the one before it.
function characterAt(line: string, column: number): Intl.SegmentData | undefined {
  for (const part of graphemes.segment(line)) {
    if (column < part.index + part.segment.length) {
      return part;
    }
  }
  return undefined;
}

/**
 * Lays out a draft as display lines, one per draft line, with the cursor's line split around the
 * character under the cursor.
 *
 * An empty draft gives a single empty line with the cursor at its end.
 *
 * @param text - The draft, its lines separated by "\n".
 * @param cursor - The cursor's offset in `text`, in UTF-16 code units. An offset inside a
 *   user-perceived character (a surrogate pair, an emoji with a skin tone or variation selector, a
 *   flag, a joined emoji sequence) moves back to that character's start, so the cell covers the
 *   whole character.
 * @returns The display lines and the cursor's line split before, under and after the cursor.
 */
export function layoutDraft(text: string, cursor: number): DraftLayout {
  const head = text.slice(0, cursor);
  const lineStart = head.lastIndexOf("\n") + 1;
  const breakAfter = text.indexOf("\n", cursor);
  const line = text.slice(lineStart, breakAfter === -1 ? text.length : breakAfter);
  const cell = characterAt(line, cursor - lineStart);
  return {
    lines: text.split("\n"),
    cursorLine: head.split("\n").length - 1,
    cursor:
      cell === undefined
        ? { before: line, under: " ", after: "" }
        : {
            before: line.slice(0, cell.index),
            under: cell.segment,
            after: line.slice(cell.index + cell.segment.length),
          },
  };
}
