import { describe, expect, test } from "claude-code/testing";

import type { DraftLayout } from "../hooks/layout";
import { layoutDraft } from "../hooks/layout";

type Case = {
  name: string;
  text: string;
  cursor: number;
  expected: DraftLayout;
};

const LONG_LINE = "word ".repeat(200);

const cases: readonly Case[] = [
  {
    name: "gives one display line per draft line",
    text: "one\ntwo\nthree",
    cursor: 0,
    expected: {
      lines: ["one", "two", "three"],
      cursorLine: 0,
      cursor: { before: "", under: "o", after: "ne" },
    },
  },
  {
    name: "splits the cursor line around the character under the cursor",
    text: "one\ntwo",
    cursor: 5,
    expected: {
      lines: ["one", "two"],
      cursorLine: 1,
      cursor: { before: "t", under: "w", after: "o" },
    },
  },
  {
    name: "puts the cursor on the first character of a line after a line break",
    text: "ab\ncd",
    cursor: 3,
    expected: {
      lines: ["ab", "cd"],
      cursorLine: 1,
      cursor: { before: "", under: "c", after: "d" },
    },
  },
  {
    name: "draws a space under a cursor at the end of the draft",
    text: "ab",
    cursor: 2,
    expected: {
      lines: ["ab"],
      cursorLine: 0,
      cursor: { before: "ab", under: " ", after: "" },
    },
  },
  {
    name: "draws a space under a cursor just before a line break",
    text: "ab\ncd",
    cursor: 2,
    expected: {
      lines: ["ab", "cd"],
      cursorLine: 0,
      cursor: { before: "ab", under: " ", after: "" },
    },
  },
  {
    name: "puts a cursor after a trailing line break on an empty last line",
    text: "ab\n",
    cursor: 3,
    expected: {
      lines: ["ab", ""],
      cursorLine: 1,
      cursor: { before: "", under: " ", after: "" },
    },
  },
  {
    name: "covers a whole two-unit character when the cursor is on its first unit",
    text: "a😀b",
    cursor: 1,
    expected: {
      lines: ["a😀b"],
      cursorLine: 0,
      cursor: { before: "a", under: "😀", after: "b" },
    },
  },
  {
    name: "covers a whole two-unit character when the cursor falls between its units",
    text: "a😀b",
    cursor: 2,
    expected: {
      lines: ["a😀b"],
      cursorLine: 0,
      cursor: { before: "a", under: "😀", after: "b" },
    },
  },
  {
    name: "covers an emoji with a skin tone when the cursor is on its start",
    text: "a👍🏽b",
    cursor: 1,
    expected: {
      lines: ["a👍🏽b"],
      cursorLine: 0,
      cursor: { before: "a", under: "👍🏽", after: "b" },
    },
  },
  {
    name: "covers an emoji with a skin tone when the cursor is on the skin tone",
    text: "a👍🏽b",
    cursor: 3,
    expected: {
      lines: ["a👍🏽b"],
      cursorLine: 0,
      cursor: { before: "a", under: "👍🏽", after: "b" },
    },
  },
  {
    name: "covers a character with its variation selector",
    text: "a❤️b",
    cursor: 1,
    expected: {
      lines: ["a❤️b"],
      cursorLine: 0,
      cursor: { before: "a", under: "❤️", after: "b" },
    },
  },
  {
    name: "covers a character when the cursor is on its variation selector",
    text: "a❤️b",
    cursor: 2,
    expected: {
      lines: ["a❤️b"],
      cursorLine: 0,
      cursor: { before: "a", under: "❤️", after: "b" },
    },
  },
  {
    name: "covers a whole flag when the cursor is on its first letter",
    text: "a🇫🇷b",
    cursor: 1,
    expected: {
      lines: ["a🇫🇷b"],
      cursorLine: 0,
      cursor: { before: "a", under: "🇫🇷", after: "b" },
    },
  },
  {
    name: "covers a whole flag when the cursor falls inside its second letter",
    text: "a🇫🇷b",
    cursor: 4,
    expected: {
      lines: ["a🇫🇷b"],
      cursorLine: 0,
      cursor: { before: "a", under: "🇫🇷", after: "b" },
    },
  },
  {
    name: "covers a whole joined emoji sequence when the cursor is on its start",
    text: "a👩‍💻b",
    cursor: 1,
    expected: {
      lines: ["a👩‍💻b"],
      cursorLine: 0,
      cursor: { before: "a", under: "👩‍💻", after: "b" },
    },
  },
  {
    name: "covers a whole joined emoji sequence when the cursor is on its last emoji",
    text: "a👩‍💻b",
    cursor: 4,
    expected: {
      lines: ["a👩‍💻b"],
      cursorLine: 0,
      cursor: { before: "a", under: "👩‍💻", after: "b" },
    },
  },
  {
    name: "covers an emoji sequence ending a line without reaching the next line",
    text: "ab👍🏽\ncd",
    cursor: 4,
    expected: {
      lines: ["ab👍🏽", "cd"],
      cursorLine: 0,
      cursor: { before: "ab", under: "👍🏽", after: "" },
    },
  },
  {
    name: "keeps a long line whole on one display line",
    text: LONG_LINE,
    cursor: 0,
    expected: {
      lines: [LONG_LINE],
      cursorLine: 0,
      cursor: { before: "", under: "w", after: LONG_LINE.slice(1) },
    },
  },
  {
    name: "gives an empty draft a single empty line with the cursor at its end",
    text: "",
    cursor: 0,
    expected: {
      lines: [""],
      cursorLine: 0,
      cursor: { before: "", under: " ", after: "" },
    },
  },
];

describe("layoutDraft", () => {
  for (const { name, text, cursor, expected } of cases) {
    test(name, () => {
      const layout = layoutDraft(text, cursor);

      expect(layout).toStrictEqual(expected);
    });
  }
});
