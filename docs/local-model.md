# Local model setup

The Catch-up can run on a model on your Mac. Thread text then stays on your Mac. The app works with any server that has an OpenAI-compatible API and can return structured output. This page uses Ollama.

## Ollama

1. Install the Ollama app build:

   ```sh
   brew install --cask ollama-app
   ```

   Do not use the Homebrew formula (`brew install ollama`). It cannot return structured output.

2. Start Ollama, and pull a model. For example:

   ```sh
   ollama pull qwen3.5:4b-nvfp4
   ```

3. In the app, open Settings › **Local model**. Type these values and save:
   - Base URL: `http://localhost:11434/v1`
   - Model: the name that you pulled, for example `qwen3.5:4b-nvfp4`

4. Open Settings › **Catch-up**, pick **Local model** and turn on the switch. The switch is off at first for a local model.

The Local model fold shows its state:

| State           | What to do                                 |
| --------------- | ------------------------------------------ |
| Ready           | Nothing.                                   |
| Not reachable   | Start Ollama, and check the base URL.      |
| Model not found | Pull the model, and check the name.        |
| Not set         | Type the base URL and the model, and save. |

## apfel

apfel serves the Apple on-device model with an OpenAI-compatible API. Install it with `brew install apfel` and start it. Then use the base URL `http://localhost:11434/v1` and the model `apple-foundationmodel`.

In the desktop app on macOS 26.4 or later, the built-in Apple model needs no extra server. See [Apple model setup](apple-model.md).
