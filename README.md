# heads-up

A Claude Code mod that mirrors your prompt draft at the top of a pane docked beside the transcript,
so you can keep your eyes up while you type.

## What it does

Claude Code anchors the prompt box to the bottom of the terminal. If looking down at it all day
strains your neck, heads-up copies the draft, cursor included, into the top rows of a side pane. You
keep typing in the real prompt box as usual. The pane only shows what you type.

## Install

Run this inside Claude Code:

```text
/plugin install heads-up --marketplace jeffzi/cc-heads-up
```

Claude Code then asks you to add the `jeffzi/cc-heads-up` marketplace, and then to pick a scope for
the install.

## Use

The pane opens by itself when an interactive session starts. Type `/heads-up` to close it, and again
to open it. A pane you close stays closed for the rest of the session.

Claude Code decides where the pane sits:

- It docks beside the transcript only in the fullscreen layout, in a terminal at least 110 columns
  wide. Narrower, it shows a one-line note instead of your draft.
- Opening by itself at session start needs 144 columns. Once you have opened the pane with
  `/heads-up`, 110 columns are enough, until you next close it by hand. Below the floor, a toast
  tells you to type `/heads-up`.

While the prompt box is empty, the pane shows a short hint. Once you type, it shows the full draft,
one pane line per draft line, with long lines wrapped and the cursor drawn inverted.

## Limits

- The prompt box does not move. heads-up shows a copy of the draft; you still type in the box at the
  bottom.
- Completion menus, such as slash commands and file mentions, still open at the prompt.
- Claude Code picks the side of the screen the pane docks on.
- Outside the fullscreen layout the pane cannot dock. That includes the main-screen layout, which is
  what tmux uses by default.
- When the draft is taller than the pane, the row with the cursor can sit out of view.

## Development

The mod is TypeScript that Claude Code loads from source. There is no build step.

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Set up the API declarations, then quit Claude Code once it has started:

   ```sh
   npm run declarations
   ```

   The type checks need Claude Code's API declarations. They belong to Claude Code and are not in
   this repository. This command starts the pinned Claude Code with the folder loaded as a mod,
   which writes them to `.claude-plugin/types/`. It needs a logged-in Claude Code. If you skip this
   step, `npm run check` fails and names the command.

Then run the tests and the checks:

```sh
npm test
npm run check
```

Without a logged-in Claude Code, skip the declarations check and the two type checks. CI does the
same:

```sh
LEFTHOOK_EXCLUDE=declarations,type,typelint npm run check
```

## License

[MIT](LICENSE)
