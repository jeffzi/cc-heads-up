import { atom, read, update } from "claude-code";
import type {
  EngineInterface,
  Frozen,
  NextResult,
  On,
  PaneCloseInput,
  PromptBox,
  Register,
  UiOpenResult,
} from "claude-code";

import type { MirroredDraft } from "../types";
import { drawPane, PANE_ID } from "./pane";

const COMMAND = "heads-up";
const DOCK_COLUMNS = 50;
const INLINE_ROWS = 1;

const NO_DRAFT: MirroredDraft = { text: "", cursor: 0, order: 0 };

const isClosed = atom({ plugin: "heads-up", key: "isClosed" } as const, false);
const draft = atom({ plugin: "heads-up", key: "draft" } as const, NO_DRAFT);
const changeCount = atom({ plugin: "heads-up", key: "changeCount" } as const, 0);
const isFailureLogged = { plugin: "heads-up", key: "isFailureLogged" } as const;

/**
 * Asks Claude Code to open the pane, or to seat it when it is open but not yet drawn.
 *
 * @param $ - The engine interface of the calling hook.
 * @returns Whether the pane is drawn, or Claude Code's reason it waits.
 */
function openPane($: EngineInterface): Promise<UiOpenResult> {
  return $.ui.open({ id: PANE_ID, title: "Heads-up", columns: DOCK_COLUMNS, rows: INLINE_ROWS });
}

/**
 * Closes the pane when it is open and drawn, and otherwise opens or seats it, going by Claude
 * Code's own record of the pane rather than anything the mod remembers.
 *
 * @param $ - The engine interface of the command hook.
 * @returns `closed`, `opened`, or Claude Code's reason the pane still cannot be placed.
 */
async function togglePane($: EngineInterface): Promise<string> {
  const panes = await $.ui.panes();
  if (panes.some((pane) => pane.id === PANE_ID && pane.isPlaced)) {
    await $.ui.close({ id: PANE_ID });
    return "closed";
  }
  const opened = await openPane($);
  await update($, isClosed, () => false);

  return opened.isPlaced ? "opened" : opened.reason;
}

/**
 * Writes a failure to record the draft to Claude Code's debug log, the first time one happens
 * this session; later failures add nothing.
 *
 * @param $ - The engine interface of the calling hook.
 * @param error - What the failed recording threw.
 * @returns Once the failure is logged, or known to be logged already.
 * @throws When the mod's own `$.state` cannot be read or written.
 */
async function reportFailure($: EngineInterface, error: unknown): Promise<void> {
  const held = await $.state.get(isFailureLogged);
  if (held.value === true) return;
  const written = await $.state.set(isFailureLogged, true, { ifVersion: held.version });
  if (!written.isSet) return;
  const reason = error instanceof Error ? error.message : "an unknown error";
  $.ui.log(`heads-up could not record the prompt draft; the pane keeps the last one: ${reason}`, {
    to: "debug",
  });
}

/**
 * Hands a change to the prompt box its order, one past the last change's, so that its draft is
 * recorded only if no later change's draft is recorded first.
 *
 * @param $ - The engine interface of the calling hook.
 * @returns The change's order, or `undefined` when it could not be handed one; the failure is
 *   then reported and the change is not mirrored.
 * @throws When the failure cannot be reported either.
 */
async function beginChange($: EngineInterface): Promise<number | undefined> {
  try {
    return await update($, changeCount, (count) => count + 1);
  } catch (error) {
    await reportFailure($, error);
    return undefined;
  }
}

/**
 * Records the prompt box `box` resolves to as the draft the pane mirrors, unless a later change's
 * draft is already recorded. A failure is reported rather than thrown, so the hook that records
 * still returns Claude Code's own answer.
 *
 * @param $ - The engine interface of the calling hook.
 * @param order - The change's order from `beginChange`; `undefined` records nothing.
 * @param box - Resolves to the prompt box after the change.
 * @returns Once the draft is recorded, or the failure reported.
 * @throws When a failure cannot be reported.
 */
async function recordDraft(
  $: EngineInterface,
  order: number | undefined,
  box: () => Promise<PromptBox>,
): Promise<void> {
  if (order === undefined) return;
  try {
    const { text, cursor } = await box();
    await update($, draft, (current) =>
      current.order > order ? current : { text, cursor, order },
    );
  } catch (error) {
    await reportFailure($, error);
  }
}

/**
 * Runs a hook's `next` and records the prompt box after it, returning exactly what `next` gave.
 *
 * @param $ - The engine interface of the calling hook.
 * @param next - Claude Code's answer for the hook, called once.
 * @param box - Resolves to the prompt box after the change, given `next`'s answer.
 * @returns What `next` resolved to.
 * @throws What `next` throws or rejects with, or when a failure to record cannot be reported.
 */
async function mirrorAround<T>(
  $: EngineInterface,
  next: () => Promise<T>,
  box: (answer: T) => Promise<PromptBox>,
): Promise<T> {
  const order = await beginChange($);
  const answer = await next();
  await recordDraft($, order, () => box(answer));

  return answer;
}

/**
 * Mirrors the prompt box into the pane after every change the person makes to it, and after
 * every prompt and slash command, without changing what Claude Code answers for any of them.
 *
 * @param on - Claude Code's hook registrar.
 */
function mirrorDraft(on: On): void {
  // An edit's own answer is the box the editor shows after it; a submit's or a command's answer
  // carries no box, so those read it back.
  on("prompt.edit", ($, e, next) =>
    mirrorAround(
      $,
      () => next(e),
      (edited) => Promise.resolve(edited),
    ),
  );
  on("prompt.submit", ($, e, next) =>
    mirrorAround(
      $,
      () => next(e),
      () => $.prompt.read(),
    ),
  );
  on("command.run", ($, e, next) =>
    mirrorAround(
      $,
      () => next(e),
      () => $.prompt.read(),
    ),
  );
}

/**
 * Whether a close of the pane stays remembered for the rest of the session, so that the next
 * session start, a hot reload's included, does not open the pane unasked. The person's close
 * (mark or key) and a plugin's `$.ui.close` are remembered once carried out; a close a hook
 * beneath denied is not, and neither is an `unload`, which drops a pane rather than closing it.
 *
 * @param e - The close as the `ui.close` hook heard it.
 * @param closed - What the rest of the chain answered for the close.
 * @returns Whether to mark the pane closed.
 */
export function remembersClose(e: Frozen<PaneCloseInput>, closed: NextResult<"ui.close">): boolean {
  return e.origin.kind !== "unload" && closed.deny === undefined;
}

/**
 * Wires the session-start pane open, the `/heads-up` toggle, the `ui.close` memory of a
 * person-closed pane, the prompt-draft mirroring, and the `Pane` render.
 *
 * @param on - Claude Code's hook registrar.
 */
export const register: Register = (on) => {
  // A plugin's hooks nest first-registered outermost: the mirror must wrap the `/heads-up` hook,
  // which answers without `next`, or the box is never read back after `/heads-up` runs.
  mirrorDraft(on);

  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Open or close the heads-up pane",
      immediate: true,
    });
    if (e.isInteractive && !(await read($, isClosed))) {
      const opened = await openPane($);
      if (!opened.isPlaced) $.ui.toast("Type /heads-up to show the heads-up pane");
    }

    return next(e);
  });

  on("command.run", { command: COMMAND }, async ($) => ({ text: await togglePane($) }));

  on("ui.close", { id: PANE_ID }, async ($, e, next) => {
    const closed = await next(e);
    if (remembersClose(e, closed)) {
      await update($, isClosed, () => true);
    }

    return closed;
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, async ($, e) =>
    drawPane($.ui.resolve(e), e.props.placement, await read($, draft)),
  );
};
