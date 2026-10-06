/** The prompt draft the pane mirrors, as the prompt box held it after one change. */
export type MirroredDraft = {
  /** The draft's text. */
  text: string;
  /** The cursor's offset in `text`, in UTF-16 code units. */
  cursor: number;
  /** The order of the change that left this draft; an earlier change's draft never replaces it. */
  order: number;
};

// The values the heads-up mod keeps in the session's `$.state`.
declare module "claude-code" {
  interface PluginState {
    "heads-up": {
      /** Whether the person closed the pane this session; a reload keeps it, a new session starts false. */
      isClosed: boolean;
      /** The latest draft recorded for the pane to mirror. */
      draft: MirroredDraft;
      /** How many changes to the prompt box this session has begun recording; the last one's order. */
      changeCount: number;
      /** Whether a failure to record the draft has been written to the debug log this session. */
      isFailureLogged: boolean;
    };
  }
}
