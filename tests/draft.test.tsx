import type {
  On,
  PromptBox,
  PromptDecoration,
  PromptEditInput,
  PromptOrigin,
  UiLogSink,
} from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import type { MountedPane } from "./fake-engine";
import {
  COMPOSER,
  PLUGIN,
  PRESENTATION,
  SURFACES,
  engine,
  mountPane,
  runCommand,
  startSession,
} from "./fake-engine";

const EMPTY: PromptBox = { text: "", cursor: 0 };
const DECORATION: PromptDecoration = { start: 0, end: 1, bold: true };
const LONG_LINE = "word ".repeat(30);

type Box = {
  box: PromptBox;
  after: PromptBox;
  logs: { text: string; to: UiLogSink }[];
  isBroken: boolean;
  held: Promise<void> | undefined;
  hold: () => () => void;
};

type Edit = Omit<PromptEditInput, "origin" | "key">;

type Mirror = {
  lines: string[];
  cursor: string[];
  styles: Record<string, unknown>[];
};

type Node = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

/**
 * Stands in for Claude Code's prompt box beneath the mod: applies each edit,
 * answers reads, takes what a submit or a command leaves in the box from
 * `after`, records log lines, and refuses the draft's recording while broken.
 *
 * @param on - Registers the fake's handlers on the test engine.
 * @returns The fake's controls: `box` is the current box, `after` is what a
 *   submit or a command leaves in it, `logs` collects the log lines, `isBroken`
 *   turns the draft's recording away, `held` is the pending hold on the next
 *   edit's answer, and `hold` starts one and returns its release.
 */
function promptBox(on: On): Box {
  const fake: Box = {
    box: EMPTY,
    after: EMPTY,
    logs: [],
    isBroken: false,
    held: undefined,
    hold: () => {
      let release = (): void => undefined;
      fake.held = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        release();
      };
    },
  };
  on("prompt.edit", async (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end);
    const cursor = e.start + e.inputText.length;
    fake.box = { text, cursor };
    const held = fake.held;
    fake.held = undefined;
    await held;
    return { text, cursor, decorations: [DECORATION] };
  });
  on("prompt.read", () => ({ value: fake.box }));
  on("prompt.submit", (_$, e) => {
    fake.box = fake.after;
    return { text: e.text, context: ["noted"], origin: e.origin };
  });
  on("command.run", () => {
    fake.box = fake.after;
    return { text: "done" };
  });
  on("ui.log", (_$, e) => {
    fake.logs.push({ text: e.text, to: e.to });
    return { value: undefined };
  });
  on("state.set", { plugin: PLUGIN, key: "draft" }, (_$, e, next) =>
    fake.isBroken ? { deny: "the disk is full" } : next(e),
  );
  return fake;
}

/** An edit the person makes at the composer. */
function edit(change: Edit): PromptEditInput {
  return { origin: COMPOSER, ...change };
}

/**
 * Raises `prompt.edit` as Claude Code does for the person's edit. The test
 * kit's `Engine` type leaves this call out, though the engine carries it.
 *
 * @param $ - The test engine.
 * @param input - The edit Claude Code raises.
 * @returns What the `prompt.edit` hooks answered.
 * @throws {Error} When the engine carries no `prompt.edit`.
 */
async function editPrompt($: Engine, input: PromptEditInput): Promise<unknown> {
  const prompt: object = $.prompt;
  if (!("edit" in prompt) || typeof prompt.edit !== "function") {
    throw new Error("the test engine has no prompt.edit");
  }
  return prompt.edit(input);
}

/** One key typed at `cursor` into `text`. */
function typing(text: string, cursor: number, inputText: string): PromptEditInput {
  return edit({ text, cursor, start: cursor, end: cursor, inputText });
}

/** Runs `/compact` as the person typing it at the composer. */
async function compact($: Engine): Promise<unknown> {
  return $.command.run({
    command: "compact",
    args: "",
    origin: COMPOSER,
    presentation: PRESENTATION,
  });
}

/** Whether a drawn child is an element rather than a string. */
function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value;
}

/** The text a drawn node shows, its nested elements' text included. */
function shown(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }
  return isNode(node) ? (node.children ?? []).map(shown).join("") : "";
}

/** The texts of every inverted element at or under `node`. */
function inverted(node: unknown): string[] {
  if (!isNode(node)) {
    return [];
  }
  const inner = (node.children ?? []).flatMap(inverted);
  return node.props?.["inverse"] === true ? [shown(node), ...inner] : inner;
}

/** What the draft area shows: its lines, the inverted texts, each line's props. */
async function mirror(ui: MountedPane): Promise<Mirror> {
  const draft = await ui.find({ key: "draft" });
  const lines = (draft?.children ?? []).filter(isNode);
  return {
    lines: lines.map(shown),
    cursor: lines.flatMap(inverted),
    styles: lines.map((line) => line.props ?? {}),
  };
}

/** The mirror of a draft: these lines, each wrapping, and these inverted texts. */
function drawn(lines: string[], cursor: string[]): unknown {
  return { lines, cursor, styles: lines.map(() => expect.objectContaining({ wrap: "wrap" })) };
}

const HINT = {
  lines: [expect.stringMatching(/\w/)],
  cursor: [],
  styles: [expect.objectContaining({ dimColor: true })],
};

describe("an empty prompt box", () => {
  for (const surface of SURFACES) {
    test(`shows a dim one-line hint in place of a draft on ${surface}`, async ($, on) => {
      promptBox(on);

      const ui = await mountPane($, "dock", surface);

      expect(await mirror(ui)).toStrictEqual(HINT);
    });
  }
});

describe("an edit in the prompt box", () => {
  for (const surface of SURFACES) {
    test(`shows the typed draft with an inverted space at its end on ${surface}`, async ($, on) => {
      promptBox(on);
      const ui = await mountPane($, "dock", surface);

      await editPrompt($, typing("ca", 2, "t"));

      expect(await mirror(ui)).toStrictEqual(drawn(["cat "], [" "]));
    });
  }

  const cases: readonly { name: string; change: Edit; expected: unknown }[] = [
    {
      name: "shows a paste with the character after it inverted",
      change: { text: "hello", cursor: 0, start: 0, end: 0, inputText: "oh " },
      expected: drawn(["oh hello"], ["h"]),
    },
    {
      name: "shows the draft left by a deletion",
      change: { text: "cart", cursor: 4, start: 3, end: 4, inputText: "" },
      expected: drawn(["car "], [" "]),
    },
    {
      name: "moves the inverted character with a cursor move",
      change: { text: "dog", cursor: 3, start: 1, end: 1, inputText: "" },
      expected: drawn(["dog"], ["o"]),
    },
    {
      name: "inverts a whole emoji under the cursor",
      change: { text: "a😀b", cursor: 0, start: 1, end: 1, inputText: "" },
      expected: drawn(["a😀b"], ["😀"]),
    },
    {
      name: "draws an inverted space at the end of a line before a line break",
      change: { text: "ab\ncd", cursor: 5, start: 2, end: 2, inputText: "" },
      expected: drawn(["ab ", "cd"], [" "]),
    },
    {
      name: "shows one pane line per draft line",
      change: { text: "one\ntwo", cursor: 7, start: 7, end: 7, inputText: "\nsix" },
      expected: drawn(["one", "two", "six "], [" "]),
    },
    {
      name: "keeps a line wider than the pane whole on one wrapping line",
      change: { text: LONG_LINE, cursor: LONG_LINE.length, start: 0, end: 0, inputText: "" },
      expected: drawn([LONG_LINE], ["w"]),
    },
  ];

  for (const { name, change, expected } of cases) {
    test(name, async ($, on) => {
      promptBox(on);
      const ui = await mountPane($);

      await editPrompt($, edit(change));

      expect(await mirror(ui)).toStrictEqual(expected);
    });
  }

  test("ends a burst on the latest draft when an earlier answer comes late", async ($, on) => {
    const box = promptBox(on);
    const ui = await mountPane($);
    const release = box.hold();

    const first = editPrompt($, typing("", 0, "a"));
    await editPrompt($, typing("a", 1, "b"));
    release();
    await first;

    expect(await mirror(ui)).toStrictEqual(drawn(["ab "], [" "]));
  });
});

describe("a submit or a slash command", () => {
  const submit = (origin: PromptOrigin) => async ($: Engine) =>
    $.prompt.submit({ text: "ping", wait: false, origin });

  const cases: readonly {
    name: string;
    after: PromptBox;
    act: ($: Engine) => Promise<unknown>;
    expected: unknown;
  }[] = [
    {
      name: "shows the hint once the person submits the draft",
      after: EMPTY,
      act: submit(COMPOSER),
      expected: HINT,
    },
    {
      name: "leaves the draft as it was when a prompt arrives from elsewhere",
      after: { text: "hel", cursor: 3 },
      act: submit({ kind: "peer" }),
      expected: drawn(["hel "], [" "]),
    },
    {
      name: "shows the hint once a slash command empties the box",
      after: EMPTY,
      act: compact,
      expected: HINT,
    },
    {
      name: "shows the draft a slash command leaves in the box",
      after: { text: "left over", cursor: 0 },
      act: compact,
      expected: drawn(["left over"], ["l"]),
    },
  ];

  for (const { name, after, act, expected } of cases) {
    test(name, async ($, on) => {
      const box = promptBox(on);
      const ui = await mountPane($);
      await editPrompt($, typing("he", 2, "l"));
      box.after = after;

      await act($);

      expect(await mirror(ui)).toStrictEqual(expected);
    });
  }

  test("shows the hint once /heads-up runs from the box and leaves it empty", async ($, on) => {
    const box = promptBox(on);
    engine(on);
    const ui = await mountPane($);
    await editPrompt($, typing("/heads-u", 8, "p"));
    box.box = EMPTY;

    await runCommand($);

    expect(await mirror(ui)).toStrictEqual(HINT);
  });
});

describe("the prompt box", () => {
  const settings: readonly {
    name: string;
    arrange: ($: Engine, box: Box) => Promise<void>;
  }[] = [
    {
      name: "with the pane open",
      arrange: async ($) => {
        await startSession($);
      },
    },
    {
      name: "with the pane closed",
      arrange: async ($) => {
        await startSession($);
        await runCommand($);
      },
    },
    {
      name: "when recording the draft fails",
      arrange: async ($, box) => {
        box.isBroken = true;
        await startSession($);
      },
    },
  ];

  const acts: readonly {
    name: string;
    act: ($: Engine) => Promise<unknown>;
    expected: unknown;
  }[] = [
    {
      name: "an edit",
      act: async ($) => editPrompt($, typing("ab", 2, "c")),
      expected: { text: "abc", cursor: 3, decorations: [DECORATION] },
    },
    {
      name: "a submit",
      act: async ($) => $.prompt.submit({ text: "abc", wait: false, origin: COMPOSER }),
      expected: { text: "abc", context: ["noted"], origin: COMPOSER },
    },
    {
      name: "a slash command",
      act: compact,
      expected: { text: "done", ref: undefined },
    },
  ];

  for (const setting of settings) {
    for (const { name, act, expected } of acts) {
      test(`receives what Claude Code answers for ${name} ${setting.name}`, async ($, on) => {
        const box = promptBox(on);
        engine(on);
        await setting.arrange($, box);

        const answer = await act($);

        expect(answer).toStrictEqual(expected);
      });
    }
  }
});

describe("a failing recording", () => {
  test("writes one line to the debug log and none to the transcript", async ($, on) => {
    const box = promptBox(on);
    box.isBroken = true;

    await editPrompt($, typing("", 0, "a"));
    await editPrompt($, typing("a", 1, "b"));

    expect(box.logs).toStrictEqual([{ text: expect.any(String), to: "debug" }]);
  });

  test("keeps the last draft recorded before it", async ($, on) => {
    const box = promptBox(on);
    const ui = await mountPane($);
    await editPrompt($, typing("", 0, "a"));
    box.isBroken = true;

    await editPrompt($, typing("a", 1, "b"));

    expect(await mirror(ui)).toStrictEqual(drawn(["a "], [" "]));
  });
});
