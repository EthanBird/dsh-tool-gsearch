# dsh-tool-gsearch

[English](README.md) | 中文

基于 **Antigravity (Cloud Code Assist) Google Search Grounding** 的 DeepSeek Harness (DSH) `web_search` 搜索插件。

通过调用 `https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent`（`requestType: "web_search"` + `googleSearch` 工具，默认模型 `gemini-3.5-flash-lite`），直接复用 `dsh-tool-antigravity` 维护的 OAuth 多账号池（只读访问，遇 401/403/429 自动轮换账号），为 DSH 的 `web_search` 提供真实的 Google Grounding 综合回答与溯源链接列表。

## 安装方式

```bash
dsh plugin --profile desktop add github:EthanBird/dsh-tool-gsearch
```

插件自带的 `cordis.patch.yml` 会自动注册 `web-search-antigravity` 服务行。如需将 DSH 的默认 `web_search` 固定切换到该引擎，可在对应 profile 的 `cordis.patch.yml` 中配置：

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: antigravity-google
    fetchProvider: http
```

安装或修改配置后重启一次 DSH 即可生效。

## 配置项说明

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `providerId` | `antigravity-google` | 注册到 `ctx.web` 的搜索 Provider ID |
| `model` | `gemini-3.5-flash-lite` | 执行 Google Grounding 搜索的模型 |
| `maxResults` | `5`（最高 `16`） | `googleSearch.enhancedContent.imageSearch.maxResultCount` |
| `cliVersion` / `changeList` | `1.4.2` / `1001597273` | 请求头 `User-Agent` 中的 Antigravity CLI 版本号与 Changelist |
| `storePath` | 系统默认 `dsh-tool-antigravity/accounts.json` | `dsh-tool-antigravity` 账号池路径（支持 Windows / macOS / Linux） |
| `timeoutMs` | `60000` | 单次搜索超时时间（毫秒） |

## 命令行与代码调用

```bash
node bin/gsearch.mjs "rust 1.90 release date" 5
```

```js
import { searchAntigravity } from "dsh-tool-gsearch";

const res = await searchAntigravity("rust 1.90 release date", { maxResults: 3 });
console.log(res);
```

## 许可证

[MIT](LICENSE)
