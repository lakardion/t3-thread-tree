# Local model runtime for the Next-step brief

Research date: 2026-11-19. Machine: Apple M4 Pro, 24 GB unified memory, other apps open. Goal: beat the Haiku median of about 18 s for one Next-step brief, at no cost.

## Recommendation

Use **Ollama** (v0.40.16, released 2026-11-09). Compare two Qwen models against Haiku:

1. **`qwen3.5:4b-nvfp4`** (Qwen3.5-4B, MLX build, 4.0 GB). This is the main candidate. It is the only one that is expected to beat 18 s up to 8K input tokens.
2. **`qwen3.5:9b-nvfp4`** (Qwen3.5-9B, MLX build, 7.2 GB). This is the quality check. It is expected to beat 18 s only up to about 3K input tokens.

Send these fields in every request:

- `response_format: {"type": "json_schema", "json_schema": {"name": "brief", "schema": SCHEMA}}`. Ollama enforces it with constrained decoding.
- `reasoning_effort: "none"`. Qwen3.5 thinks by default, and thinking tokens destroy the latency budget.
- `keep_alive: "30m"`, or longer, so that the model stays loaded between briefs.

Start the server with `OLLAMA_CONTEXT_LENGTH=16384`. This is mandatory. On this machine the default context is probably 4096 tokens, and the `/v1` endpoint cannot change it per request (see [Caveats](#caveats)).

Reasons for Ollama:

- It serves `/v1/chat/completions` and `/v1/models` on one port.
- It enforces a JSON schema from `response_format` on both of its engines: GBNF grammar (llama.cpp) for GGUF models and XGrammar for MLX models.
- On Apple Silicon it selects the MLX build of a model first. The fastest measured M4 Pro numbers for Qwen3.5 are MLX numbers.
- It maps `reasoning_effort: "none"` to "thinking off", and it accepts `keep_alive` in the OpenAI body.
- The user installs one app and pulls by name. The app only connects.

Rejected options:

- **llama.cpp `llama-server`** is a good second choice. It has full schema support and a clean thinking switch. But `/v1/models` lists only the loaded model (one item), unless the user runs router mode. Ollama also runs llama-server inside for GGUF models, so the GGUF behavior is the same.
- **LM Studio** enforces schemas. But its documentation does not give a way to turn thinking off through the API, and its chat-completions parameter list does not include `response_format` or `reasoning_effort`.
- **`mlx_lm.server`** has no `response_format` and no constrained decoding. It cannot meet the requirement.
- **27B dense models and 35B-A3B MoE models** do not fit 24 GB with headroom (see [Models](#qwen-models-that-fit-24-gb)).

## Latency budget

Prompt processing (prefill) controls the latency, not generation. The input is 2K to 8K tokens. The output is a JSON object with at most 7 actions, about 150 to 600 tokens.

Measured speeds on an M4 Pro (16-core GPU, 24 GB) with Qwen3.5 at 4-bit MLX. These come from oMLX v0.2.6 community benchmarks, a different MLX server than Ollama. Use them as a proxy only.

| Model | Prefill tok/s at 1K / 4K | Generation tok/s at 1K / 4K | Peak memory | Source |
|---|---|---|---|---|
| Qwen3.5-4B 4-bit | 657.6 / 655.2 | 82.5 / 77.7 | 4.0 / 4.2 GB | [omlx l0aspywx](https://omlx.ai/benchmarks/l0aspywx), 2026-03-10 |
| Qwen3.5-4B 4-bit | 624.5 / 619.6 | 77.4 / 68.8 | 4.0 / 4.2 GB | [omlx 0p2vo718](https://omlx.ai/benchmarks/0p2vo718), 2026-03-09 |
| Qwen3.5-9B 4-bit | 359.6 / 360.7 | 48.9 / 46.8 | 6.7 / 7.0 GB | [omlx h2i4r2bs](https://omlx.ai/benchmarks/h2i4r2bs), 2026-03-09 |
| Qwen3.5-9B 4-bit (48 GB machine) | 363.5 / 364.0, 261.7 at 64K | 49.0 / 48.6, 24.8 at 64K | 6.7 / 7.0 GB | [omlx 0mpw936s](https://omlx.ai/benchmarks/0mpw936s), 2026-03-09 |

Estimated time for one brief, from prefill 640 tok/s and generation 75 tok/s (4B), and prefill 360 tok/s and generation 48 tok/s (9B). The model is already loaded, and the output is 400 tokens. The 8K rows extrapolate the 4K rate. The 64K row of the 9B shows that the rate stays near flat at short context.

| Input tokens | 4B prefill + generation | 4B total | 9B prefill + generation | 9B total |
|---|---|---|---|---|
| 2K | 3.2 s + 5.3 s | about 9 s | 5.7 s + 8.3 s | about 14 s |
| 4K | 6.4 s + 5.3 s | about 12 s | 11.4 s + 8.3 s | about 20 s |
| 8K | 12.8 s + 5.3 s | about 18 s | 22.8 s + 8.3 s | about 31 s |

Results:

- The 4B is expected to beat Haiku up to about 8K input. At 8K with 600 output tokens it is about 21 s, so it is borderline there.
- The 9B is expected to beat Haiku only below about 3K input.
- A 20-core M4 Pro GPU prefills about 20% faster than the 16-core GPU. The llama.cpp Apple Silicon table shows Llama 7B Q4_0 at 364 tok/s (16-core) and 440 tok/s (20-core) prefill, and about 50 tok/s generation on both ([llama.cpp discussion 4167](https://github.com/ggml-org/llama.cpp/discussions/4167)).
- A cold load adds time. See [Load time and keep-alive](#load-time-and-keep-alive).
- With thinking on, the model writes a reasoning block before the JSON. That can add hundreds or thousands of tokens at 50 to 80 tok/s. Always send `reasoning_effort: "none"`.

## Runtime comparison

Sources: Ollama source at tag v0.40.16 and at main commit `42ac2c0`, Ollama docs, llama.cpp `tools/server/README.md` and `grammars/README.md` on master (build b12547, 2026-11-19), LM Studio docs, mlx-lm `SERVER.md` on main (release v0.32.2).

| Need | Ollama v0.40.16 | llama-server (llama.cpp) | LM Studio | mlx_lm.server v0.32.2 |
|---|---|---|---|---|
| `/v1/chat/completions` | Yes | Yes | Yes | Yes |
| `response_format` with `json_schema`, enforced by constrained decoding | Yes. GGUF: llama.cpp GBNF grammar. MLX: XGrammar | Yes, GBNF grammar | Yes. GGUF: llama.cpp grammar. MLX: Outlines | No `response_format` field |
| `enum`, `["string","null"]`, `minItems`, `maxItems` | Yes on both engines (see below) | Yes | Not documented | Not applicable |
| Turn thinking off per request | `reasoning_effort: "none"` (or `reasoning.effort`) | `reasoning_effort: "none"`, or `chat_template_kwargs: {"enable_thinking": false}`, or `--reasoning off` at start | Not documented; bug reports only | Not documented |
| `GET /v1/models` | All pulled models | Single-model mode: the one loaded model. Router mode: `/models` lists all models in the cache with a status | JIT on (default): all downloaded models. JIT off: loaded models only | Locally available models |
| Idle unload | 5 min default; `OLLAMA_KEEP_ALIVE` or `keep_alive` per request | Never, unless `--sleep-idle-seconds N` | JIT-loaded models: 60 min TTL; `ttl` per request | Not documented |
| Default context | 4096 / 32768 / 262144 by GPU memory tier | `-c 0`: the model maximum (262,144 for Qwen3.5) | Per model setting | Not documented |

### Ollama details

- **Schema path.** The OpenAI shim copies `response_format.json_schema.schema` into the native `format` field (`openai/openai.go`, `FromChatRequest`). `json_object` becomes the plain JSON grammar.
- **GGUF engine.** Ollama runs `llama-server` as a subprocess and passes the schema as `json_schema`. When the response has a thinking block, Ollama converts the schema to GBNF first and wraps it, so the schema applies after the closing think tag (`llm/llama_server.go`). The pinned llama.cpp build is b12257.
- **MLX engine.** The MLX runner uses XGrammar (`mlxrunner/grammar.go`). It also lets free thinking run first and applies the schema after the closing tag (`mlxrunner/client.go`, `requestGrammar`).
- **Engine choice.** On `darwin/arm64` the runner preference is MLX, then llama.cpp, then GGML (`manifest/manifest.go`, `runnerPreferences`, same at v0.40.16). A plain tag such as `qwen3.5:4b` holds several builds (the library shows "3.3GB - 4.0GB"). Use an explicit MLX tag so that the comparison is reproducible, and check it with `ollama show`.
- **Thinking.** `reasoning_effort: "none"` maps to `think: false` (`ThinkingFromReasoningEffort`). Other values map to model-defined levels. The shim does not read `chat_template_kwargs`.
- **`/v1/models`.** The route uses `ListHandler`, the same list as `ollama list`: all pulled models, not only loaded ones. `created` is the last modification time. Loaded models are in `GET /api/ps`.
- **Keep-alive.** Default 5 minutes (`envconfig`: `OLLAMA_KEEP_ALIVE`, default "5m"). The OpenAI body accepts `keep_alive` and passes it through. `-1` keeps the model loaded. `0` unloads it after the response. `OLLAMA_MAX_LOADED_MODELS` defaults to 3 per GPU ([FAQ](https://docs.ollama.com/faq)).
- **Context.** At startup Ollama sums the GPU memory and sets the default context: 262,144 at 47 GiB or more, 32,768 at 23 GiB or more, else 4,096 (`server/routes.go`, same at v0.40.16; [context length docs](https://docs.ollama.com/context-length)). On Metal the reported memory comes from the llama-server device probe, which reports the Metal working-set limit, not the full RAM. On a 24 GB Mac that limit is below 23 GiB, so the default is probably 4,096. Check the `vram-based default context` line in the server log.
- **Structured outputs docs** say that the schema "works through the OpenAI-compatible API via `response_format`", and that Ollama Cloud does not support structured outputs ([structured outputs](https://docs.ollama.com/capabilities/structured-outputs)).

### Schema keyword support

The app schema uses `type: "object"`, `additionalProperties: false`, `required`, `enum`, `type: ["string", "null"]`, `minItems: 1` and `maxItems: 7`.

- **llama.cpp GBNF** (used by llama-server, by LM Studio for GGUF, and by Ollama for GGUF). The tests cover `enum` with mixed values, type arrays such as `["array", "null"]`, and `minItems` / `maxItems` (`tests/test-json-schema-to-grammar.cpp`). Known limits ([grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)):
  - Unsupported keywords are skipped silently. Test the schema and do not trust a silent success.
  - `properties` cannot mix with `anyOf` / `oneOf` in the same type.
  - `minimum` / `maximum` work only for `integer`. Nested `$ref` is broken. No `uniqueItems`, `contains`, `not`, `if` / `then` / `else`, `patternProperties`.
  - `additionalProperties` defaults to `false`.
  - The schema is not added to the prompt. The model does not see it, so the prompt must describe the shape. The current guide already does this.
- **XGrammar** (used by Ollama for MLX). The converter on main handles `enum`, `const`, `anyOf`, `oneOf`, `allOf`, type arrays (`ParseTypeArray`), `minItems` and `maxItems` (`cpp/json_schema_converter.cc`). Ollama pins its own XGrammar build; the exact version was not checked. An invalid schema returns an error, not a silent skip.
- The app schema uses no keyword from the limit lists. Both engines are expected to enforce it fully. Confirm with one real request per model.

### llama-server details

- Install with `brew install llama.cpp`. Start with, for example, `llama-server -hf unsloth/Qwen3.5-4B-GGUF:Q4_K_M -c 16384 --reasoning off`.
- `response_format` accepts `{"type": "json_schema", "json_schema": {"name", "strict", "schema"}}`. `reasoning_effort: "none"` turns thinking off. `chat_template_kwargs` passes `enable_thinking` to the template.
- `GET /v1/models` "returns information about the loaded model" and "the returned list always has one single element".
- Router mode (start without a model) loads models on demand. `--models-max` (default 4) and `--models-memory-margin` control LRU unload. `GET /models` lists all cached models with a `loaded` status.
- `--sleep-idle-seconds N` unloads the model and KV cache after N idle seconds. The next task reloads it. Default: disabled.
- `-c 0` (default) uses the model maximum. For Qwen3.5 that is 262,144 tokens, which costs memory. Set `-c 16384`.

### LM Studio details

- Schema: GGUF models use llama.cpp grammar sampling, MLX models use Outlines ([structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output)). The page warns that models below 7B can be weak at structured output.
- `/v1/models`: with JIT loading on, all downloaded models; with JIT off, only loaded models ([headless](https://lmstudio.ai/docs/developer/core/headless)).
- JIT-loaded models have a 60 min idle TTL by default. Set `ttl` in the request. Auto-evict keeps at most 1 JIT model loaded ([TTL and auto-evict](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict)).
- Thinking control: the [chat completions page](https://lmstudio.ai/docs/developer/openai-compat/chat-completions) lists no `reasoning_effort`. Bug reports show inconsistent behavior for Qwen3.5 (for example, a 4B model that rejected a reasoning setting). This is not documented, so it is a risk.

### mlx_lm.server details

- The request fields are `messages`, sampling fields, `logit_bias`, `logprobs`, `model`, `adapters` and `draft_model`. There is no `response_format` ([SERVER.md](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md)).
- The README says that it "is not recommended for production as it only implements basic security checks".

## Qwen models that fit 24 GB

Current Qwen text models (all are vision-language, Apache 2.0 unless noted, from the [Qwen Hugging Face org](https://huggingface.co/Qwen)):

| Model | Released | Type | 4-bit size | Fits 24 GB with headroom |
|---|---|---|---|---|
| Qwen3.5-4B | 2026-02-27 | Dense, 32 layers | GGUF Q4_K_M 2.74 GB; Ollama MLX nvfp4 4.0 GB | Yes |
| Qwen3.5-9B | 2026-02-27 | Dense, 32 layers | GGUF Q4_K_M 5.68 GB; Ollama MLX nvfp4 7.2 GB | Yes |
| Qwen3.6-27B | 2026-04-21 | Dense, 64 layers | GGUF Q4_K_M 16.82 GB | No: near the Metal limit, slow prefill |
| Qwen3.8-27B | 2026-08-05 | Dense, 64 layers | GGUF UD-Q4_K_M 16.56 GB; Ollama 18 to 19 GB | No: same reason |
| Qwen3.5-35B-A3B / Qwen3.6-35B-A3B | 2026-02-24 / 2026-04-15 | MoE, 3B active | GGUF Q4_K_M 22.13 GB; Q3_K_M 16.60 GB | No: too large |
| Qwen3.8-Flash-Next | 2026-08-24 | MoE, 125B + 51B n-gram embedding | n/a | No (Qwen community license) |

Notes:

- There is no Qwen3.6 or Qwen3.8 model below 27B. The small models are Qwen3.5 (0.8B, 2B, 4B, 9B).
- GGUF sizes come from the `unsloth/*-GGUF` repos on Hugging Face. Ollama sizes come from the [qwen3.5 tags page](https://ollama.com/library/qwen3.5/tags). The 9B row in the oMLX table shows 6.7 to 7.0 GB peak at 1K to 4K context.
- macOS limits how much memory the GPU can wire. llama.cpp prints it as `recommendedMaxWorkingSetSize`, and `sudo sysctl iogpu.wired_limit_mb` raises it. No primary source gives the exact default for 24 GB. Community reports put it near two thirds to three quarters of RAM. A 16 to 19 GB model leaves almost no room for the other open apps.
- The 35B-A3B MoE models activate only 3B parameters per token, so they can prefill and generate fast (a search summary of oMLX results reported about 700 tok/s prefill on a 48 GB M4 Pro; that page was not read directly), but the 4-bit weights are about 20 to 22 GB.
- Both small models use the Qwen3.5 hybrid layout: 3 Gated DeltaNet layers to 1 full-attention layer. Only the full-attention layers keep a growing KV cache, so a 16K context costs little memory.

### Thinking mode

- The model cards say: "Qwen3.5 models operate in thinking mode by default". The official `chat_template.jinja` of Qwen3.5-4B and Qwen3.5-9B turns thinking off only when `enable_thinking` is `false`.
- Qwen3.5 "does not officially support the soft switch of Qwen3, i.e., `/think` and `/nothink`".
- The cards disable thinking with `extra_body={"chat_template_kwargs": {"enable_thinking": False}}` on vLLM and SGLang.
- One Unsloth Hugging Face discussion says the small Qwen3.5 GGUF builds have reasoning off by default. This conflicts with the official template. Send the off switch in all cases.
- Per runtime: Ollama `reasoning_effort: "none"`; llama-server `reasoning_effort: "none"` or `chat_template_kwargs`.
- Qwen3.8-27B adds `reasoning_effort` levels `low`, `medium` and `xhigh` (default) in its template.

### Sampling settings

The Qwen3.5 cards recommend this for non-thinking mode on general tasks: `temperature=0.7`, `top_p=0.8`, `top_k=20`, `min_p=0.0`, `presence_penalty=1.5`, `repetition_penalty=1.0`. The cards say a high `presence_penalty` "may occasionally result in language mixing". Treat `presence_penalty` as a test variable for JSON output (try 0 and 1.5), not as a fixed setting. The Ollama OpenAI shim maps `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `seed`, `stop` and `max_tokens`. It does not map `top_k` or `min_p`.

## Context window

| Model | Native context | Need |
|---|---|---|
| Qwen3.5-4B, Qwen3.5-9B | 262,144 tokens, up to 1,010,000 with YaRN | 2K to 8K input plus about 600 output: 16,384 is enough |
| Qwen3.6-27B, Qwen3.8-27B | 262,144 tokens | Not a candidate |

The cards advise at least 128K context "to preserve thinking capabilities". This applies to thinking mode only. The brief runs with thinking off.

The runtime limit matters more than the model limit:

- **Ollama.** The default is probably 4,096 on this machine (see Ollama details). The `/v1` shim has no `num_ctx` field. On the GGUF path, `chatPrompt` drops old messages that do not fit, with no error. On the MLX path, Ollama skips this truncation (`server/routes.go`: `truncate = false` for MLX). Set `OLLAMA_CONTEXT_LENGTH=16384`, or use the context slider in the Ollama app.
- **llama-server.** Set `-c 16384`.
- **LM Studio.** Set the context length in the model load settings.

## Load time and keep-alive

- Load time was not measured. No source that was read gives a number for these models on this machine.
- Method: run `ollama stop <tag>`, then time the first request, then time a second request. The difference is the load cost. Do this once with an empty disk cache (after a restart) and once with a warm disk cache.
- To hide the load:
  - Set `keep_alive: "30m"` in each request, or start Ollama with `OLLAMA_KEEP_ALIVE=-1`. The model then stays in memory (about 4 to 7 GB).
  - Preload when the app starts: send an empty request, or run `ollama run <tag> ""` ([FAQ](https://docs.ollama.com/faq)).

## Setup commands

Install and run (the user does this once):

```sh
brew install ollama
OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=30m ollama serve
```

The Ollama macOS app works too. Then set the context slider in its settings to 16K or more.

Pull the two candidates:

```sh
ollama pull qwen3.5:4b-nvfp4
ollama pull qwen3.5:9b-nvfp4
ollama show qwen3.5:4b-nvfp4
```

Check the endpoint:

```sh
curl -s http://localhost:11434/v1/models
curl -s http://localhost:11434/api/ps
```

Request shape for the comparison:

```json
{
  "model": "qwen3.5:4b-nvfp4",
  "messages": [
    { "role": "system", "content": "<next-step-prompt.md>" },
    { "role": "user", "content": "<Digests>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "brief", "strict": true, "schema": "<SCHEMA from src/server/brief.ts>" }
  },
  "reasoning_effort": "none",
  "temperature": 0.7,
  "top_p": 0.8,
  "max_tokens": 1500,
  "keep_alive": "30m",
  "stream": false
}
```

Optional variants to test after the first comparison:

- `qwen3.5:4b-mtp-q4_K_M` and `qwen3.5:9b-mtp-nvfp4` are multi-token-prediction builds in the Ollama library. They can speed up generation. No benchmark was found.
- The plain tags `qwen3.5:4b` and `qwen3.5:9b` let Ollama select the build.

## Caveats

- **Context trap.** Without `OLLAMA_CONTEXT_LENGTH`, an 8K Digest can be cut with no error on the GGUF path. The app cannot fix this per request through `/v1`. The app should state this setup step, or check `prompt_tokens` in the `usage` field of the response against the expected size.
- **Speed numbers are a proxy.** They come from oMLX at 4-bit, not from Ollama and not from nvfp4. Measure on the real machine with real Digests.
- **Main branch versus release.** The Ollama source facts were read at main commit `42ac2c0`. The facts that the recommendation depends on were checked again at tag v0.40.16: MLX-first preference, the XGrammar path, `keep_alive` and `reasoning_effort: "none"` in the shim, the `/v1/models` route and the context tiers. The truncation and Metal-memory details were read on main only.
- **Small-model quality.** Constrained decoding guarantees valid JSON, not good content. The 4B can rank actions worse than Haiku. The comparison must check content quality, not only speed.
- **Other open apps.** Memory pressure from other apps can push the model out of wired memory and slow it down. The 4B (about 4 GB) leaves the most room.

## Sources

- Qwen model cards and configs on Hugging Face: [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B), [Qwen3.6-27B](https://huggingface.co/Qwen/Qwen3.6-27B), [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B), [Qwen3.8-Flash-Next](https://huggingface.co/Qwen/Qwen3.8-Flash-Next).
- GGUF sizes: [unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [unsloth/Qwen3.5-9B-GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF), [unsloth/Qwen3.6-27B-GGUF](https://huggingface.co/unsloth/Qwen3.6-27B-GGUF), [unsloth/Qwen3.8-27B-GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF), [unsloth/Qwen3.6-35B-A3B-GGUF](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF).
- Ollama source ([github.com/ollama/ollama](https://github.com/ollama/ollama), tag v0.40.16 and main `42ac2c0`): `openai/openai.go`, `manifest/manifest.go`, `llm/llama_server.go`, `mlxrunner/grammar.go`, `mlxrunner/client.go`, `server/routes.go`, `envconfig/config.go`.
- Ollama docs: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [FAQ](https://docs.ollama.com/faq), [context length](https://docs.ollama.com/context-length), [qwen3.5 tags](https://ollama.com/library/qwen3.5/tags).
- llama.cpp: [server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md), [json-schema-to-grammar tests](https://github.com/ggml-org/llama.cpp/blob/master/tests/test-json-schema-to-grammar.cpp), [Apple Silicon performance discussion](https://github.com/ggml-org/llama.cpp/discussions/4167).
- XGrammar: [json_schema_converter.cc](https://github.com/mlc-ai/xgrammar/blob/main/cpp/json_schema_converter.cc).
- LM Studio docs: [structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output), [chat completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [TTL and auto-evict](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict), [headless](https://lmstudio.ai/docs/developer/core/headless).
- mlx-lm: [SERVER.md](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md).
- Community benchmarks (oMLX, M4 Pro): [l0aspywx](https://omlx.ai/benchmarks/l0aspywx), [0p2vo718](https://omlx.ai/benchmarks/0p2vo718), [h2i4r2bs](https://omlx.ai/benchmarks/h2i4r2bs), [0mpw936s](https://omlx.ai/benchmarks/0mpw936s).
