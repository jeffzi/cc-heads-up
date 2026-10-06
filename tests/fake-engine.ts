import type {
  CommandSpec,
  On,
  PaneOpenArgs,
  PromptEditOrigin,
  RenderPropsOf,
  RenderSurface,
  StateRead,
  UiOpenResult,
  UiPane,
} from "claude-code";
import type { Engine, Mounted } from "claude-code/testing";
import { mock } from "claude-code/testing";

export const PLUGIN = "heads-up";
export const PANE = "heads-up";
export const REASON = "the terminal is 90 columns wide";
export const SURFACES: readonly RenderSurface[] = ["terminal", "desktop", "vscode", "mobile"];
export const COMPOSER: PromptEditOrigin = { kind: "composer" };
export const PRESENTATION = { isFullscreen: true, columns: 200 };

export type MountedPane = Mounted<RenderSurface, "Pane">;

export type Fake = {
  opens: PaneOpenArgs[];
  closes: string[];
  toasts: string[];
  commands: CommandSpec[];
  drop: () => void;
};

export type Setup = {
  isPlaceable?: boolean;
  panes?: readonly UiPane[];
};

/** One of the mod's panes as `$.ui.panes()` lists it. */
export function pane(isPlaced: boolean): UiPane {
  return { id: PANE, title: PANE, isShown: isPlaced, isFocused: false, isPlaced };
}

/**
 * Stands in for Claude Code beneath the mod: keeps the open panes, places or
 * refuses each open, and records what the mod asked of it.
 *
 * @param on - Registers the fake's handlers on the test engine.
 * @param setup - Whether opens are placed (`isPlaceable`, default true) and the
 *   panes already open (`panes`, default none).
 * @returns The record of opens, closes, toasts and registered commands, plus
 *   `drop`, which forgets every open pane.
 */
export function engine(on: On, setup: Setup = {}): Fake {
  const isPlaceable = setup.isPlaceable ?? true;
  let panes: UiPane[] = [...(setup.panes ?? [])];
  const fake: Fake = {
    opens: [],
    closes: [],
    toasts: [],
    commands: [],
    drop: () => {
      panes = [];
    },
  };
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("command.register", (_$, e) => {
    fake.commands.push(e);
    return { value: { command: e.name } };
  });
  on("ui.open", (_$, e) => {
    fake.opens.push(e);
    panes = [...panes.filter((one) => one.id !== e.id), pane(isPlaceable)];
    const result: UiOpenResult = isPlaceable
      ? { isPlaced: true }
      : { isPlaced: false, reason: REASON };
    return { value: result };
  });
  on("ui.panes", () => ({ value: panes }));
  on("ui.close", (_$, e) => {
    fake.closes.push(e.id);
    panes = panes.filter((one) => one.id !== e.id);
    return { value: undefined };
  });
  on("ui.toast", (_$, e) => {
    fake.toasts.push(e.text);
    return { value: undefined };
  });
  return fake;
}

export type Host = {
  endSession: () => void;
};

/**
 * Stands in for the host that keeps the mod's values: `$.state` for the
 * session alone, `$.store` across sessions.
 *
 * @param on - Registers the host's handlers on the test engine.
 * @returns `endSession`, which drops every `$.state` value as a new session
 *   starts with none, while the `$.store` values stay.
 */
export function host(on: On): Host {
  let values = new Map<string, StateRead>();
  const standing = (plugin: string, key: string): StateRead =>
    values.get(`${plugin}/${key}`) ?? { value: undefined, version: 0 };
  on("state.get", (_$, e) => ({ value: standing(e.plugin, e.key) }));
  on("state.set", (_$, e) => {
    const { version } = standing(e.plugin, e.key);
    if (e.ifVersion !== undefined && e.ifVersion !== version) {
      return { value: { isSet: false, version } };
    }
    values.set(`${e.plugin}/${e.key}`, { value: e.value, version: version + 1 });
    return { value: { isSet: true, version: version + 1 } };
  });
  mock.store(on);
  return {
    endSession: () => {
      values = new Map();
    },
  };
}

/** Starts a session as Claude Code does, interactive unless told otherwise. */
export async function startSession($: Engine, isInteractive = true): Promise<void> {
  await $.session.start({ cwd: "/work", surface: "terminal", isInteractive });
}

/** Runs `/heads-up` as the person typing it at the prompt. */
export async function runCommand($: Engine): Promise<string | undefined> {
  const { text } = await $.command.run({
    command: "heads-up",
    args: "",
    origin: COMPOSER,
    presentation: PRESENTATION,
  });
  return text;
}

/** The `Pane` render props for a pane seated where `placement` says. */
function paneProps(placement: "dock" | "inline"): RenderPropsOf["Pane"] {
  return {
    title: PANE,
    isFocused: false,
    bodyColumns: 50,
    placement,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  };
}

/** Mounts the pane on `surface`, seated where `placement` says. */
export async function mountPane(
  $: Engine,
  placement: "dock" | "inline" = "dock",
  surface: RenderSurface = "terminal",
): Promise<MountedPane> {
  return $.ui.mount({
    plugin: PLUGIN,
    surface,
    component: "Pane",
    requestId: PANE,
    props: paneProps(placement),
  });
}
