import type { Elements, PromptBox, RenderElement, RenderPropsOf, RenderSurface } from "claude-code";

import { layoutDraft } from "./layout";

/** The id the mod's one pane is opened, drawn and closed under. */
export const PANE_ID = "heads-up";

/** The element table of whichever surface draws the pane, from `$.ui.resolve(e)`. */
type SurfaceElements = Elements[RenderSurface];

const INLINE_NOTICE =
  "heads-up needs the fullscreen layout at 110 columns or more to dock; /heads-up closes it";

const EMPTY_HINT = "Your prompt draft shows here as you type.";

/**
 * Draws the docked pane's draft area, keyed `draft`: one wrapping line per draft line with the
 * character under the cursor inverted, or a dim hint while the prompt box is empty.
 *
 * @param elements - The drawing surface's element table.
 * @param draft - The prompt box to mirror.
 * @returns The draft area.
 */
function drawDraft(elements: SurfaceElements, draft: PromptBox): RenderElement {
  const { Box, Text } = elements;
  if (draft.text === "") {
    return (
      <Box key="draft" flexDirection="column">
        <Text dimColor>{EMPTY_HINT}</Text>
      </Box>
    );
  }
  const { lines, cursorLine, cursor } = layoutDraft(draft.text, draft.cursor);

  return (
    <Box key="draft" flexDirection="column">
      {lines.map((line, index) =>
        index === cursorLine ? (
          <Text wrap="wrap">
            {cursor.before}
            <Text inverse>{cursor.under}</Text>
            {cursor.after}
          </Text>
        ) : (
          <Text wrap="wrap">{line}</Text>
        ),
      )}
    </Box>
  );
}

/**
 * Draws the pane for where the surface seated it: the draft area in the dock, or one dim line
 * inline, where the pane is too short to mirror a draft.
 *
 * @param elements - The drawing surface's element table, from `$.ui.resolve(e)`.
 * @param placement - Where the surface seated the pane, from the `Pane` render props.
 * @param draft - The prompt box to mirror in the dock.
 * @returns The pane's tree.
 */
export function drawPane(
  elements: SurfaceElements,
  placement: RenderPropsOf["Pane"]["placement"],
  draft: PromptBox,
): RenderElement {
  if (placement === "dock") return drawDraft(elements, draft);
  const { Text } = elements;

  return <Text dimColor>{INLINE_NOTICE}</Text>;
}
