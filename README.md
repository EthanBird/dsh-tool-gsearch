# dsh-tool-gsearch

English | [中文](README.zh.md)

DeepSeek Harness (DSH) `web_search` provider backed by **Antigravity (Cloud Code Assist) Google Search grounding**.

`web_search` calls `https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent` with `requestType: "web_search"` and the `googleSearch` tool (`gemini-3.5-flash-lite`), reusing the OAuth multi-account pool written by `dsh-tool-antigravity` (read-only, with automatic account failover on 401/403/429). The Google-grounded synthesized answer becomes the lead snippet, and `groundingChunks` become the source list.

## Installation

```bash
dsh plugin --profile desktop add github:EthanBird/dsh-tool-gsearch
```

The package's `cordis.patch.yml` inserts row `web-search-antigravity`. To pin DSH `web_search` to this provider, add to your profile's `cordis.patch.yml`:

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: antigravity-google
    fetchProvider: http
```

Restart DSH once after installation.

## Configuration

| Field | Default | Description |
| --- | --- | --- |
| `providerId` | `antigravity-google` | Provider ID registered into `ctx.web` |
| `model` | `gemini-3.5-flash-lite` | Model that performs the grounded Google search |
| `maxResults` | `5` (up to `16`) | `googleSearch.enhancedContent.imageSearch.maxResultCount` |
| `cliVersion` / `changeList` | `1.4.2` / `1001597273` | Antigravity CLI User-Agent version and changelist |
| `storePath` | Platform default `dsh-tool-antigravity/accounts.json` | Antigravity multi-account pool path |
| `timeoutMs` | `60000` | Per-search timeout in milliseconds |

## Standalone CLI / Programmatic Usage

```bash
node bin/gsearch.mjs "rust 1.90 release date" 5
```

```js
import { searchAntigravity } from "dsh-tool-gsearch";

const res = await searchAntigravity("rust 1.90 release date", { maxResults: 3 });
console.log(res);
```

## License

[MIT](LICENSE)
