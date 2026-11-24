/** The prompt for the thread that sets up the Local model. `origin` is the app's own origin. */
export const setupPrompt = (origin: string) => `Set up the Local model for the t3-thread-tree app on this machine.

1. Stop and report if this machine is not macOS on Apple silicon, or if Homebrew is missing. Do not install Homebrew.
2. Install the Ollama app build: brew install --cask ollama-app. Do not use the formula "brew install ollama". It has no XGrammar, so every schema call fails with HTTP 501 "structured output is unavailable".
3. Start Ollama. Pull the model: ollama pull qwen3.5:4b-nvfp4. It needs about 4.2 GB of RAM when loaded.
4. Check that GET http://localhost:11434/v1/models lists qwen3.5:4b-nvfp4. Then send one POST http://localhost:11434/v1/chat/completions call with a strict json_schema response_format. Check that it returns valid JSON.
5. Save the config: PUT ${origin}/local-model with Content-Type: application/json and the body { "baseUrl": "http://localhost:11434/v1", "model": "qwen3.5:4b-nvfp4" }. If the PUT fails, report that JSON body so the user can paste the values into Settings > Local model.

Report what you did. Stop at the first failure and report the error.`;
