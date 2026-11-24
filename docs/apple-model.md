# Apple model setup

The Catch-up can run on the Apple on-device model, through Apple Intelligence. Thread text stays on your Mac, and you need no account or server.

## What you need

- The desktop app. The release includes the helper that calls the model.
- A Mac with Apple Silicon that can run Apple Intelligence.
- macOS 26.4 or later.
- Apple Intelligence on, in System Settings › Apple Intelligence & Siri.

## Turn it on

1. Open Settings › **Catch-up**.
2. Pick **Apple model**. It shows only when the Mac can run the model now.
3. Turn on the switch. The switch is off at first for the Apple model.

## When the pick does not show

The app checks the model each time it lists the models. It hides the pick when:

- The Mac cannot run the model.
- Apple Intelligence is off.
- The model is not ready yet, for example while macOS still downloads it. Try again later.

## Limits

The model has a small context window, about 4,000 tokens. A long thread does not fit. Its Catch-up line then shows "Catch-up failed". The model also refuses some input and does not support each language.

For longer threads, use Claude, Codex or a [local model](local-model.md).

## From source

To use the Apple model with `bun start`, build the helper first:

```sh
bun run build:apple-helper
```

This needs Command Line Tools with the macOS 26.4 SDK or later.
