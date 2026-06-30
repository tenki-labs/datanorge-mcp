/**
 * Tiny client for the public data.norge.no (Felles datakatalog / FDK) APIs.
 *
 * Two endpoints are used, both open and unauthenticated:
 *  - Search:   POST https://search.api.fellesdatakatalog.digdir.no/search/{type}
 *  - Resource: GET  https://resource.api.fellesdatakatalog.digdir.no/v1/{type}/{id}
 *
 * Docs: https://data.norge.no/en/technical/api
 */

const SEARCH_BASE = "https://search.api.fellesdatakatalog.digdir.no";
const RESOURCE_BASE = "https://resource.api.fellesdatakatalog.digdir.no";

const USER_AGENT =
  "datanorge-mcp (+https://github.com/tenki-labs/datanorge-mcp)";

/** Options accepted by the global fetch, derived so we don't depend on DOM libs. */
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** A localized label: language code -> text (e.g. { nb: "Luftkvalitet", en: "Air quality" }). */
export type LangString = Record<string, string | null | undefined>;

export type ResourceType =
  | "datasets"
  | "data-services"
  | "concepts"
  | "information-models"
  | "services"
  | "events";

export interface SearchHit {
  id: string;
  uri?: string;
  title?: LangString;
  description?: LangString;
  organization?: { name?: string; orgPath?: string; prefLabel?: LangString };
  losTheme?: Array<{ name?: LangString; losPaths?: string[] }>;
  keyword?: LangString[];
  accessRights?: { code?: string; prefLabel?: LangString };
  isOpenData?: boolean;
  fdkFormatPrefixed?: string[];
  metadata?: { modified?: string; firstHarvested?: string };
  searchType?: string;
}

export interface PageMeta {
  currentPage: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  page?: PageMeta;
  aggregations?: unknown;
}

export interface SearchOptions {
  query?: string;
  size?: number;
  page?: number;
  openDataOnly?: boolean;
  orgPath?: string;
  formats?: string[];
}

/** Error carrying the HTTP status (0 for client-side/validation errors). */
export class FdkError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FdkError";
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch wrapper that adds a User-Agent and transparently retries on HTTP 429.
 * The FDK search API is rate limited to ~10 req/min, so we back off politely.
 */
async function fdkFetch(
  url: string,
  init?: FetchInit,
  attempt = 0,
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
  });
  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : (attempt + 1) * 2000;
    await sleep(waitMs);
    return fdkFetch(url, init, attempt + 1);
  }
  return res;
}

/** Search a catalogue (datasets, data-services, concepts, ...) by free text + filters. */
export async function search(
  type: ResourceType,
  opts: SearchOptions,
): Promise<SearchResponse> {
  const filters: Record<string, { value: unknown }> = {};
  if (opts.openDataOnly) filters.openData = { value: true };
  if (opts.orgPath) filters.orgPath = { value: opts.orgPath };
  if (opts.formats && opts.formats.length) {
    filters.formats = { value: opts.formats };
  }

  const body: Record<string, unknown> = {
    pagination: { size: opts.size ?? 10, page: opts.page ?? 0 },
  };
  if (opts.query) body.query = opts.query;
  if (Object.keys(filters).length) body.filters = filters;

  const res = await fdkFetch(`${SEARCH_BASE}/search/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new FdkError(
      `Search request failed (HTTP ${res.status} ${res.statusText}).`,
      res.status,
    );
  }
  return (await res.json()) as SearchResponse;
}

/** Fetch full metadata for a single resource by its FDK id. */
export async function getResource(
  type: ResourceType,
  id: string,
): Promise<Record<string, any>> {
  const res = await fdkFetch(
    `${RESOURCE_BASE}/v1/${type}/${encodeURIComponent(id)}`,
    { headers: { Accept: "application/json" } },
  );
  if (res.status === 404) {
    throw new FdkError(
      `No ${type.replace(/s$/, "")} found with id "${id}". Use a search tool to get a valid id.`,
      404,
    );
  }
  if (!res.ok) {
    throw new FdkError(
      `Lookup failed (HTTP ${res.status} ${res.statusText}).`,
      res.status,
    );
  }
  return (await res.json()) as Record<string, any>;
}

export interface FetchedData {
  url: string;
  status: number;
  contentType: string;
  byteLength: number;
  truncated: boolean;
  isText: boolean;
  body?: string;
}

function looksTextual(contentType: string, pathname: string): boolean {
  const ct = contentType.toLowerCase();
  if (
    /^text\//.test(ct) ||
    /^application\/(json|ld\+json|[\w.+-]*\+json|xml|[\w.+-]*\+xml|csv|x-ndjson|ndjson|javascript|x-javascript|ecmascript|yaml|x-yaml|graphql|sql|n-triples|n-quads|trig|turtle|x-turtle|rdf|x-www-form-urlencoded)/.test(ct)
  ) {
    return true;
  }
  // Missing or generic content-type: fall back to the URL's file extension.
  if (
    (!ct || /^application\/octet-stream/.test(ct)) &&
    /\.(json|jsonl|ndjson|geojson|csv|tsv|xml|txt|md|rdf|ttl|nt|nq|yaml|yml|js|mjs|html?)$/i.test(pathname)
  ) {
    return true;
  }
  return false;
}

/**
 * Heuristic binary sniff for when the content-type is unhelpful: treat the body
 * as text if it has no NUL bytes and few control characters in the first 4 KB.
 */
function isProbablyText(buf: Buffer): boolean {
  if (buf.byteLength === 0) return true;
  const sample = buf.subarray(0, Math.min(buf.byteLength, 4096));
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false; // NUL byte → treat as binary
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / sample.length < 0.3;
}

/**
 * Download the content at an arbitrary http(s) URL (typically a distribution's
 * downloadURL/accessURL), reading at most `maxBytes`. Text formats are returned
 * as a string; binary content returns metadata only.
 */
export async function fetchData(
  url: string,
  maxBytes: number,
): Promise<FetchedData> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FdkError(`Not a valid URL: ${url}`, 0);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FdkError(
      `Only http(s) URLs are supported (got "${parsed.protocol}").`,
      0,
    );
  }

  const res = await fdkFetch(url, { headers: { Accept: "*/*" } });
  if (!res.ok) {
    throw new FdkError(
      `Download failed (HTTP ${res.status} ${res.statusText}).`,
      res.status,
    );
  }

  const contentType = (res.headers.get("content-type") ?? "").trim();

  const chunks: Buffer[] = [];
  let received = 0;
  let truncated = false;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (received + value.byteLength > maxBytes) {
        const remaining = maxBytes - received;
        if (remaining > 0) chunks.push(Buffer.from(value.subarray(0, remaining)));
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(Buffer.from(value));
      received += value.byteLength;
    }
  }

  const buf = Buffer.concat(chunks);
  const isText = looksTextual(contentType, parsed.pathname) || isProbablyText(buf);
  const result: FetchedData = {
    url,
    status: res.status,
    contentType: contentType || "unknown",
    byteLength: buf.byteLength,
    truncated,
    isText,
  };
  if (isText) result.body = buf.toString("utf8");
  return result;
}

// ─── OpenAPI / Swagger docs auto-resolution (issue #1) ───────────────────────

export interface OpenApiEndpoint {
  method: string;
  path: string;
  summary?: string;
}

export interface OpenApiSpecResult {
  specUrl: string;
  title?: string;
  version?: string;
  endpoints: OpenApiEndpoint[];
}

const API_DOCS_MARKERS =
  /swagger-ui|swagger-ui-bundle|swagger-ui-init|redoc|rapidoc|<title>\s*swagger|swagger\.json|\/api-docs|openapi\.json/i;

/** True if the response looks like a Swagger UI / OpenAPI docs HTML page. */
export function looksLikeApiDocs(contentType: string, body: string | undefined): boolean {
  if (!body) return false;
  const isHtml = /html/i.test(contentType) || /<!doctype html|<html[\s>]/i.test(body);
  if (!isHtml) return false;
  return API_DOCS_MARKERS.test(body);
}

const COMMON_SPEC_PATHS = [
  "/swagger/v1/swagger.json",
  "/swagger/v1-public/swagger.json",
  "/openapi.json",
  "/openapi/v1.json",
  "/v3/api-docs",
  "/v2/api-docs",
  "/api-docs",
  "/swagger.json",
  "/swagger/doc.json",
];

/** Pull candidate spec/script URLs out of an HTML or JS blob. */
function extractRefs(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /spec-?url\s*[=:]\s*["']([^"']+)["']/gi,
    /["']?configUrl["']?\s*:\s*["']([^"']+)["']/gi,
    /urls\s*:\s*\[\s*\{[^}]*["']url["']\s*:\s*["']([^"']+)["']/gi,
    /["']?url["']?\s*:\s*["']([^"']+\.(?:json|ya?ml)(?:[?#][^"']*)?)["']/gi,
    /["']?url["']?\s*:\s*["']([^"']*(?:api-docs|\/swagger\/|openapi)[^"']*)["']/gi,
    /["']([^"']*\/(?:swagger|openapi|api-docs|v3\/api-docs)[^"']*\.(?:json|ya?ml))["']/gi,
    /(?:src|href)\s*=\s*["']([^"']*(?:swagger-ui-init|index)\.js(?:[?#][^"']*)?)["']/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) out.push(m[1]);
    }
  }
  return out;
}

function isOpenApiSpec(obj: any): boolean {
  return (
    !!obj &&
    typeof obj === "object" &&
    (obj.openapi || obj.swagger) &&
    obj.paths &&
    typeof obj.paths === "object"
  );
}

function endpointsFromSpec(spec: any): OpenApiEndpoint[] {
  const eps: OpenApiEndpoint[] = [];
  const paths = spec.paths || {};
  for (const p of Object.keys(paths)) {
    const ops = paths[p];
    if (!ops || typeof ops !== "object") continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const op = ops[method];
      if (op) {
        const raw = (op.summary || op.description || "").toString();
        const summary = raw.split("\n")[0].trim();
        eps.push({ method: method.toUpperCase(), path: p, summary: summary || undefined });
      }
    }
  }
  return eps;
}

async function fetchTextCapped(url: string): Promise<string | null> {
  try {
    const res = await fdkFetch(url, {
      headers: { Accept: "application/json, application/yaml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > 8_000_000) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Given the URL + HTML of a Swagger/OpenAPI docs page, locate and parse the real
 * OpenAPI spec and return its endpoint list. Returns null if nothing resolves.
 * Reads the spec URL from the page's init script and/or probes common paths.
 */
export async function resolveOpenApiSpec(
  pageUrl: string,
  html: string,
): Promise<OpenApiSpecResult | null> {
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const specCandidates: string[] = [];
  const abs = (u: string): string | null => {
    try {
      return new URL(u, pageUrl).href;
    } catch {
      return null;
    }
  };

  // 1) refs in the page HTML — separate init scripts from direct spec URLs
  const initScripts: string[] = [];
  for (const ref of extractRefs(html)) {
    const a = abs(ref);
    if (!a) continue;
    if (/(swagger-ui-init|index)\.js(?:[?#]|$)/i.test(a)) initScripts.push(a);
    else specCandidates.push(a);
  }
  if (!initScripts.length) {
    const a = abs("./swagger-ui-init.js") ?? abs("./index.js");
    if (a) initScripts.push(a);
  }
  // 2) extract spec URLs from the init scripts
  for (const js of initScripts.slice(0, 3)) {
    const txt = await fetchTextCapped(js);
    if (!txt) continue;
    for (const ref of extractRefs(txt)) {
      if (/(swagger-ui-init|index)\.js(?:[?#]|$)/i.test(ref)) continue;
      const a = abs(ref);
      if (a) specCandidates.push(a);
    }
  }
  // 3) common probe paths at the host root
  for (const p of COMMON_SPEC_PATHS) specCandidates.push(`${origin}${p}`);

  // try candidates (cap total attempts), return first valid OpenAPI spec
  let attempts = 0;
  for (const url of specCandidates) {
    if (seen.has(url) || attempts >= 14) continue;
    seen.add(url);
    attempts++;
    const txt = await fetchTextCapped(url);
    if (!txt) continue;
    let obj: any;
    try {
      obj = JSON.parse(txt);
    } catch {
      continue;
    }
    if (isOpenApiSpec(obj)) {
      return {
        specUrl: url,
        title: obj.info?.title,
        version: obj.info?.version,
        endpoints: endpointsFromSpec(obj),
      };
    }
  }
  return null;
}
