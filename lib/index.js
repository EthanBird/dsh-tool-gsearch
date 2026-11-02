/**
 * dsh-tool-gsearch — Google Search (Google grounding) on the Antigravity wire.
 *
 * Registers a DSH web search provider that calls the Antigravity / Cloud Code
 * Assist `v1internal:generateContent` endpoint with a `googleSearch` tool, so
 * `web_search` returns real Google-grounded answers plus their sources.
 *
 * Auth: reuses the multi-account pool written by dsh-tool-antigravity
 * (`dsh-tool-antigravity/accounts.json`, read-only) with automatic account
 * failover on HTTP 401/403/429.
 * The User-Agent carries the current CLI version (`1.4.2`, `cl=1001597273`);
 * older versions are rejected for newer models.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { refreshAntigravityToken } from "@cortexkit/antigravity-auth-core";

export function defaultStorePath(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const base = env.LOCALAPPDATA || env.APPDATA || env.USERPROFILE || homedir();
    return join(base, "dsh-tool-antigravity", "accounts.json");
  }
  const base = env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share");
  return join(base, "dsh-tool-antigravity", "accounts.json");
}

function normalizePlatform(platform = process.platform) {
  return platform === "win32" ? "windows" : platform || "unknown";
}

function normalizeArch(arch = process.arch) {
  if (arch === "x64") return "amd64";
  if (arch === "ia32") return "386";
  return arch || "unknown";
}

const DEFAULTS = {
  providerId: "antigravity-google",
  model: "gemini-3.5-flash-lite",
  maxResults: 5,
  cliVersion: "1.4.2",
  changeList: "1001597273",
  authMethod: "consumer",
  timeoutMs: 60000,
  storePath: defaultStorePath(),
  endpoint: "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
  systemInstruction:
    "You MUST perform a web search. Do not respond or interact with the user, please respond as if they typed the query into a search bar.",
};

const OFFICIAL_PROVIDER_IDS = new Set(["deepseek-official", "official"]);

export function resolveConfig(config) {
  const c = { ...DEFAULTS, ...(config ?? {}) };
  c.maxResults = Math.min(Math.max(Number(c.maxResults) || 5, 1), 16);
  const osType = normalizePlatform();
  const arch = normalizeArch();
  const clPart = c.changeList ? `; cl=${c.changeList}` : "";
  c.userAgent =
    c.userAgent ||
    `antigravity/cli/${c.cliVersion} (aidev_client; os_type=${osType}; arch=${arch}${clPart}; auth_method=${c.authMethod})`;
  return c;
}

const tokenCache = new Map();

function readOrderedAccounts(storePath) {
  const raw = JSON.parse(readFileSync(storePath, "utf8"));
  if (Array.isArray(raw.accounts) && raw.accounts.length > 0) {
    const active = Math.min(Math.max(Number(raw.activeIndex) || 0, 0), raw.accounts.length - 1);
    const ordered = [];
    for (let i = 0; i < raw.accounts.length; i++) {
      const idx = (active + i) % raw.accounts.length;
      const acc = raw.accounts[idx];
      if (acc?.refreshToken && !acc.disabled) {
        ordered.push({ index: idx, refreshToken: acc.refreshToken, projectId: acc.projectId });
      }
    }
    if (ordered.length > 0) return ordered;
  }
  if (typeof raw.refreshToken === "string" && raw.refreshToken) {
    return [{ index: 0, refreshToken: raw.refreshToken, projectId: raw.projectId }];
  }
  throw new Error("no Antigravity account with a refresh token in " + storePath);
}

async function getAccessTokenForAccount(storePath, account, forceRefresh = false) {
  const cacheKey = `${storePath}#${account.index}:${account.refreshToken.slice(-12)}`;
  const cached = tokenCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expires > Date.now() + 60_000) {
    return cached;
  }
  const { access, expires } = await refreshAntigravityToken(account.refreshToken);
  const entry = {
    access,
    projectId: account.projectId || "aicode-consumers",
    expires: typeof expires === "number" ? expires : Date.now() + 600_000,
  };
  tokenCache.set(cacheKey, entry);
  return entry;
}

/** Perform one grounded Google search with multi-account failover. Exported for tests and CLI use. */
export async function searchAntigravity(query, options = {}) {
  const cfg = resolveConfig(options);
  const q = String(query ?? "").trim();
  if (!q) throw new Error("query is required");
  if (!existsSync(cfg.storePath)) {
    throw new Error(
      "Antigravity account store not found: " + cfg.storePath + " (log in through Settings > Antigravity)",
    );
  }

  const accounts = readOrderedAccounts(cfg.storePath);
  let lastError;

  for (let attempt = 0; attempt < accounts.length; attempt++) {
    const account = accounts[attempt];
    let token;
    try {
      token = await getAccessTokenForAccount(cfg.storePath, account, false);
    } catch (err) {
      lastError = err;
      continue;
    }

    const body = {
      project: token.projectId || "aicode-consumers",
      requestId: "web_search/" + Date.now(),
      model: cfg.model,
      userAgent: "antigravity",
      requestType: "web_search",
      request: {
        contents: [{ role: "user", parts: [{ text: q }] }],
        systemInstruction: { role: "user", parts: [{ text: cfg.systemInstruction }] },
        tools: [{ googleSearch: { enhancedContent: { imageSearch: { maxResultCount: cfg.maxResults } } } }],
        generationConfig: { candidateCount: 1 },
      },
    };

    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(cfg.timeoutMs)])
      : AbortSignal.timeout(cfg.timeoutMs);

    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token.access,
        "Content-Type": "application/json",
        "User-Agent": cfg.userAgent,
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();

    if (!res.ok) {
      lastError = new Error("Antigravity search failed: HTTP " + res.status + " " + text.slice(0, 300));
      if ((res.status === 401 || res.status === 403 || res.status === 429) && attempt + 1 < accounts.length) {
        continue;
      }
      throw lastError;
    }

    const payload = JSON.parse(text);
    const candidate = payload?.response?.candidates?.[0] ?? {};
    const gm = candidate.groundingMetadata ?? {};
    const answer = (candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    const queries = gm.webSearchQueries ?? [];
    const chunks = gm.groundingChunks ?? [];

    const sources = chunks
      .map((chunk) => ({
        title: chunk.web?.title || chunk.web?.uri || "Google 来源",
        url: chunk.web?.uri ?? "",
      }))
      .filter((source) => source.url);

    if (sources.length === 0 && !answer) {
      throw new Error("Google search returned no grounded content");
    }

    if (answer) {
      if (sources.length === 0) {
        sources.push({
          title: "Google 综合结果",
          url: "https://www.google.com/search?q=" + encodeURIComponent(queries[0] ?? q),
          snippet: answer,
        });
      } else {
        sources[0] = { ...sources[0], snippet: answer };
      }
    }

    return {
      sources,
      truncated: false,
      answer,
      queries,
      modelVersion: payload?.response?.modelVersion,
    };
  }

  throw lastError ?? new Error("Antigravity search failed across all configured accounts");
}

export const name = "gsearch";
export const inject = ["web"];

export function apply(ctx, config) {
  const cfg = resolveConfig(config);
  const provider = {
    id: cfg.providerId,
    available() {
      return existsSync(cfg.storePath);
    },
    async search(request, signal) {
      if (
        request === null ||
        typeof request !== "object" ||
        typeof request.query !== "string" ||
        !request.query.trim()
      ) {
        throw new Error("query is required");
      }
      const result = await searchAntigravity(request.query, {
        ...cfg,
        maxResults: request.maxResults ?? cfg.maxResults,
        signal,
      });
      return { sources: result.sources, truncated: false };
    },
  };

  ctx.web.registerSearchProvider(provider);
  ctx.logger?.info?.(`gsearch: registered web search provider "${provider.id}"`);

  if (!ctx.web.searchProviderId || OFFICIAL_PROVIDER_IDS.has(ctx.web.searchProviderId)) {
    ctx.web.searchProviderId = provider.id;
    ctx.logger?.info?.(`gsearch: taking over web search as "${provider.id}"`);
  }
}
