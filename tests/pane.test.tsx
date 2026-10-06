import { describe, expect, test } from "claude-code/testing";

import {
  PANE,
  REASON,
  SURFACES,
  engine,
  host,
  mountPane,
  pane,
  runCommand,
  startSession,
} from "./fake-engine";

const NOTICE = /^.*fullscreen layout.*110 columns.*\/heads-up closes.*$/;

describe("session start", () => {
  test("opens the pane unasked, asking 50 columns docked and 1 row inline", async ($, on) => {
    const fake = engine(on);

    await startSession($);

    expect(fake.opens).toMatchObject([{ id: PANE, columns: 50, rows: 1 }]);
  });

  test("opens no pane and shows no toast when the session is not interactive", async ($, on) => {
    const fake = engine(on);

    await startSession($, false);

    expect({ opens: fake.opens, toasts: fake.toasts }).toStrictEqual({ opens: [], toasts: [] });
  });

  test("shows one toast naming /heads-up when the unasked pane is not placed", async ($, on) => {
    const fake = engine(on, { isPlaceable: false });

    await startSession($);

    expect({
      opens: fake.opens.map((open) => open.id),
      closes: fake.closes,
      toasts: fake.toasts,
    }).toStrictEqual({
      opens: [PANE],
      closes: [],
      toasts: [expect.stringContaining("/heads-up")],
    });
  });

  test("registers /heads-up to run at once while a turn is running", async ($, on) => {
    const fake = engine(on);

    await startSession($);

    expect(fake.commands).toContainEqual(
      expect.objectContaining({ name: "heads-up", immediate: true }),
    );
  });
});

describe("/heads-up", () => {
  test("opens the pane and says opened when no pane is open", async ($, on) => {
    const fake = engine(on);

    const text = await runCommand($);

    expect({ text, opens: fake.opens.length }).toStrictEqual({ text: "opened", opens: 1 });
  });

  test("closes the pane and says closed when the pane is open and drawn", async ($, on) => {
    const fake = engine(on, { panes: [pane(true)] });

    const text = await runCommand($);

    expect({ text, closes: fake.closes }).toStrictEqual({ text: "closed", closes: [PANE] });
  });

  test("seats the pane and says opened when the pane is open but not drawn", async ($, on) => {
    const fake = engine(on, { panes: [pane(false)] });

    const text = await runCommand($);

    expect({ text, opens: fake.opens.length, closes: fake.closes }).toStrictEqual({
      text: "opened",
      opens: 1,
      closes: [],
    });
  });

  test("gives Claude Code's reason when the pane still cannot be placed", async ($, on) => {
    engine(on, { isPlaceable: false });

    const text = await runCommand($);

    expect(text).toBe(REASON);
  });
});

describe("a closed pane", () => {
  test("stays closed at the next session start after /heads-up closed it", async ($, on) => {
    const fake = engine(on);
    await startSession($);
    await runCommand($);

    await startSession($);

    expect(fake.opens).toHaveLength(1);
  });

  test("opens unasked at the next session's start after /heads-up closed it", async ($, on) => {
    const sessions = host(on);
    const fake = engine(on);
    await startSession($);
    await runCommand($);
    sessions.endSession();

    await startSession($);

    expect(fake.opens).toHaveLength(2);
  });

  test("opens again with /heads-up after /heads-up closed it", async ($, on) => {
    engine(on);
    await startSession($);
    await runCommand($);

    const text = await runCommand($);

    expect(text).toBe("opened");
  });

  test("opens unasked at a later session start after /heads-up opened it again", async ($, on) => {
    const fake = engine(on);
    await startSession($);
    await runCommand($);
    await runCommand($);

    await startSession($);

    expect(fake.opens).toHaveLength(3);
  });

  test("opens again with /heads-up after Claude Code dropped it", async ($, on) => {
    const fake = engine(on);
    await startSession($);
    fake.drop();

    const text = await runCommand($);

    expect({ text, opens: fake.opens.length }).toStrictEqual({ text: "opened", opens: 2 });
  });

  test("opens unasked at the next session start after Claude Code dropped it", async ($, on) => {
    const fake = engine(on);
    await startSession($);
    fake.drop();

    await startSession($);

    expect(fake.opens).toHaveLength(2);
  });
});

describe("pane drawing", () => {
  for (const surface of SURFACES) {
    test(`shows the draft area when docked on ${surface}`, async ($) => {
      const ui = await mountPane($, "dock", surface);

      const draft = await ui.find({ key: "draft" });

      expect(draft).toBeDefined();
    });

    test(`shows one dim docking line and no draft when inline on ${surface}`, async ($) => {
      const ui = await mountPane($, "inline", surface);

      const texts = await ui.findAll({ type: "Text" });
      const shown = {
        lines: texts.map((text) => ({ text: text.text, isDim: text.props["dimColor"] })),
        draft: await ui.find({ key: "draft" }),
      };

      expect(shown).toStrictEqual({
        lines: [{ text: expect.stringMatching(NOTICE), isDim: true }],
        draft: undefined,
      });
    });
  }
});
