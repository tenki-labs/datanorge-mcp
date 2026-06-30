/**
 * Helpers that turn FDK API objects into compact, readable text for the model.
 * We deliberately summarise rather than dump raw JSON: the model gets the ids,
 * links and labels it needs to act, without drowning in metadata.
 */

import type { LangString, SearchResponse, OpenApiSpecResult } from "./fdk.js";

/** Pick the best available language for a localized label (Norwegian first). */
export function pickLang(label?: LangString | null): string {
  if (!label) return "";
  const preferred = label.nb || label.no || label.nn || label.en;
  if (preferred) return preferred;
  for (const value of Object.values(label)) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/** Normalize a field that may be a string, an array of strings, or null. */
function asArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  if (typeof value === "string") return value ? [value] : [];
  return [];
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export interface LicenseInfo {
  /** Human-readable licence label, e.g. "NLOD 2.0" or "CC BY 4.0". */
  label: string;
  /** Licence URI, when available. */
  uri: string;
  /** true = credit required, false = not required (e.g. CC0), null = unknown. */
  requiresAttribution: boolean | null;
}

// Ordered most-specific first; the first matching rule wins.
const LICENSE_RULES: Array<{ test: RegExp; label: string; attribution: boolean }> = [
  { test: /NLOD_2_0|nlod\/(?:no|nn|en)\/2/i, label: "NLOD 2.0", attribution: true },
  { test: /NLOD_1_0|nlod\/(?:no|nn|en)\/1/i, label: "NLOD 1.0", attribution: true },
  { test: /NLOD/i, label: "NLOD", attribution: true },
  { test: /CC_BY_SA|licenses\/by-sa/i, label: "CC BY-SA 4.0", attribution: true },
  { test: /CC_BY_NC|licenses\/by-nc/i, label: "CC BY-NC 4.0", attribution: true },
  { test: /CC_BY_ND|licenses\/by-nd/i, label: "CC BY-ND 4.0", attribution: true },
  { test: /CC_BY_4_0|licenses\/by\/4|CC[_ -]?BY/i, label: "CC BY 4.0", attribution: true },
  { test: /CC0|publicdomain\/zero/i, label: "CC0 1.0", attribution: false },
  { test: /publicdomain\/mark|\bPDM\b|CC_PD/i, label: "Public Domain", attribution: false },
];

function classifyLicense(
  uri: string,
  label: string,
): { label: string; requiresAttribution: boolean | null } {
  const haystack = `${uri} ${label}`;
  for (const rule of LICENSE_RULES) {
    if (rule.test.test(haystack)) {
      return { label: rule.label, requiresAttribution: rule.attribution };
    }
  }
  return { label: label || uri, requiresAttribution: null };
}

/**
 * Normalize a licence field — which may be an array of {uri, prefLabel},
 * a single object, or a string URI — into one LicenseInfo, classifying
 * whether attribution is required.
 */
export function licenseInfo(raw: unknown): LicenseInfo | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  let uri = "";
  let label = "";
  if (typeof first === "string") {
    uri = first;
  } else if (typeof first === "object") {
    const obj = first as Record<string, any>;
    uri = typeof obj.uri === "string" ? obj.uri : "";
    label = pickLang(obj.prefLabel) || "";
  }
  if (!uri && !label) return null;
  const c = classifyLicense(uri, label);
  return { label: c.label, uri, requiresAttribution: c.requiresAttribution };
}

/**
 * Build the "Kreditering / attribution" block: which licences apply, whether
 * credit is required, and a ready-to-use credit line per licence.
 */
function buildAttribution(d: Record<string, any>, licences: LicenseInfo[]): string[] {
  const publisher =
    pickLang(d.publisher?.prefLabel) || d.publisher?.name || "utgiver";
  const title = pickLang(d.title) || "datasettet";
  const datasetPage = `https://data.norge.no/datasets/${d.id}`;

  const distinct = new Map<string, LicenseInfo>();
  for (const li of licences) distinct.set(li.label, li);
  const all = [...distinct.values()];

  const lines: string[] = ["", "## Kreditering / attribution"];

  if (!all.length) {
    lines.push(
      "Lisens er ikke oppgitt i katalogen. Sjekk vilkårene på kilden/landingssiden før bruk, og krediter utgiver for sikkerhets skyld.",
    );
    lines.push(`Kilde: ${publisher} — ${datasetPage}`);
    return lines;
  }

  lines.push(`Lisens(er): ${all.map((l) => l.label).join(", ")}.`);

  const required = all.filter((l) => l.requiresAttribution === true);
  const unknown = all.filter((l) => l.requiresAttribution === null);
  const free = all.filter((l) => l.requiresAttribution === false);

  if (required.length) {
    lines.push("Denne kilden KREVER kreditering. Bruk en kildehenvisning som denne:");
    for (const l of required) {
      if (/NLOD/i.test(l.label)) {
        lines.push(
          `  • Inneholder data under Norsk lisens for offentlige data (${l.label}) tilgjengeliggjort av ${publisher}. Kilde: ${datasetPage}`,
        );
      } else if (/CC BY/i.test(l.label)) {
        lines.push(
          `  • «${title}» av ${publisher}, lisensiert under ${l.label}. Kilde: ${datasetPage}`,
        );
      } else {
        lines.push(`  • Kilde: ${publisher} (${l.label}). ${datasetPage}`);
      }
    }
  }
  if (unknown.length) {
    lines.push(
      `Uavklart lisens (${unknown.map((l) => l.label).join(", ")}) — verifiser vilkårene på kilden før bruk, og krediter ${publisher}.`,
    );
  }
  if (free.length && !required.length) {
    lines.push(
      `${free.map((l) => l.label).join(", ")} krever ikke kreditering juridisk, men god skikk er å lenke til kilden: ${publisher} — ${datasetPage}`,
    );
  }
  return lines;
}

/** Format a search response as a numbered list of hits. */
export function formatSearchResults(
  label: string,
  query: string,
  resp: SearchResponse,
  nextTool: string,
): string {
  const hits = resp.hits ?? [];
  const page = resp.page;
  const total = page?.totalElements ?? hits.length;

  if (!hits.length) {
    return `No ${label} found for "${query}". Try broader or Norwegian-language terms.`;
  }

  const lines: string[] = [];
  const pageInfo = page
    ? ` (showing ${hits.length}, page ${page.currentPage + 1} of ${page.totalPages})`
    : "";
  lines.push(`Found ${total} ${label} for "${query}"${pageInfo}:`);
  lines.push("");

  hits.forEach((hit, i) => {
    const title = pickLang(hit.title) || "(untitled)";
    const publisher =
      hit.organization?.name ||
      pickLang(hit.organization?.prefLabel) ||
      "Unknown publisher";
    const open = hit.isOpenData ? " · open data" : "";
    const themes = (hit.losTheme ?? [])
      .map((t) => pickLang(t.name))
      .filter(Boolean)
      .slice(0, 5);
    const desc = truncate(pickLang(hit.description), 200);

    lines.push(`${i + 1}. ${title}`);
    lines.push(`   id: ${hit.id}`);
    lines.push(`   publisher: ${publisher}${open}`);
    if (themes.length) lines.push(`   themes: ${themes.join(", ")}`);
    if (desc) lines.push(`   ${desc}`);
    lines.push("");
  });

  lines.push(`Next: call ${nextTool} with an id above for full details and links.`);
  return lines.join("\n");
}

/** Format a single dataset, emphasising the distributions (where the data lives). */
export function formatDataset(d: Record<string, any>): string {
  const lines: string[] = [];
  lines.push(`# ${pickLang(d.title) || "(untitled dataset)"}`);
  lines.push(`id: ${d.id}`);
  if (d.uri) lines.push(`uri: ${d.uri}`);

  const publisher = pickLang(d.publisher?.prefLabel) || d.publisher?.name;
  if (publisher) lines.push(`publisher: ${publisher}`);
  if (d.accessRights?.code) lines.push(`access rights: ${d.accessRights.code}`);
  lines.push(`open data: ${d.isOpenData ? "yes" : "no"}`);
  if (d.modified) lines.push(`modified: ${d.modified}`);

  const themes = (d.losTheme ?? []).map((t: any) => pickLang(t?.name)).filter(Boolean);
  if (themes.length) lines.push(`themes: ${themes.join(", ")}`);
  const keywords = (d.keyword ?? []).map((k: any) => pickLang(k)).filter(Boolean);
  if (keywords.length) lines.push(`keywords: ${keywords.slice(0, 10).join(", ")}`);

  const landing = asArray(d.landingPage);
  if (landing.length) lines.push(`landing page: ${landing.join("  ")}`);

  const desc = pickLang(d.description);
  if (desc) {
    lines.push("");
    lines.push(truncate(desc, 700));
  }

  const dists: any[] = Array.isArray(d.distribution) ? d.distribution : [];
  lines.push("");
  lines.push(`## Distributions (${dists.length})`);
  if (!dists.length) {
    lines.push("None listed. Try the landing page above for access.");
  }

  const licences: LicenseInfo[] = [];
  dists.forEach((dist, i) => {
    const dtitle = pickLang(dist?.title) || `distribution ${i + 1}`;
    const formats = (dist?.fdkFormat ?? [])
      .map((f: any) => f?.name || f?.code)
      .filter(Boolean);
    const fmt = formats.length ? formats.join(", ") : asArray(dist?.format).join(", ");
    const download = asArray(dist?.downloadURL);
    const access = asArray(dist?.accessURL);

    lines.push("");
    lines.push(`${i + 1}. ${dtitle}${fmt ? ` [${fmt}]` : ""}`);
    const ddesc = truncate(pickLang(dist?.description), 200);
    if (ddesc) lines.push(`   ${ddesc}`);
    if (download.length) lines.push(`   downloadURL: ${download.join("  ")}`);
    if (access.length) lines.push(`   accessURL: ${access.join("  ")}`);
    const li = licenseInfo(dist?.license);
    if (li) {
      licences.push(li);
      const note =
        li.requiresAttribution === true
          ? " — krever kreditering"
          : li.requiresAttribution === false
            ? " — ingen kreditering påkrevd"
            : "";
      lines.push(`   licence: ${li.label}${note}`);
    }
  });

  const datasetLevel = licenseInfo(d.license);
  if (datasetLevel) licences.push(datasetLevel);

  lines.push("");
  lines.push("To pull the data itself, pass a downloadURL (or accessURL) above to fetch_data.");
  lines.push(...buildAttribution(d, licences));
  return lines.join("\n");
}

/** Format a single data service (API), emphasising the endpoint URLs. */
export function formatDataService(d: Record<string, any>): string {
  const lines: string[] = [];
  lines.push(`# ${pickLang(d.title) || "(untitled API)"}`);
  lines.push(`id: ${d.id}`);
  if (d.uri) lines.push(`uri: ${d.uri}`);

  const publisher = pickLang(d.publisher?.prefLabel) || d.publisher?.name;
  if (publisher) lines.push(`publisher: ${publisher}`);

  const desc = pickLang(d.description);
  if (desc) {
    lines.push("");
    lines.push(truncate(desc, 700));
  }

  const endpoints = asArray(d.endpointURL);
  if (endpoints.length) {
    lines.push("");
    lines.push("endpoint URL(s):");
    endpoints.forEach((u) => lines.push(`   ${u}`));
  }
  const specs = asArray(d.endpointDescription);
  if (specs.length) {
    lines.push("API description / spec:");
    specs.forEach((u) => lines.push(`   ${u}`));
  }
  const landing = asArray(d.landingPage);
  if (landing.length) lines.push(`landing page: ${landing.join("  ")}`);

  lines.push("");
  lines.push("To call the API, pass an endpoint URL above to fetch_data (add query params as needed).");
  return lines.join("\n");
}

/** Format an auto-resolved OpenAPI spec as a readable endpoint list. */
export function formatApiSpec(pageUrl: string, spec: OpenApiSpecResult): string {
  const lines: string[] = [];
  lines.push(`${pageUrl} is an API documentation page — resolved the OpenAPI spec automatically.`);
  lines.push(`spec: ${spec.specUrl}`);
  const meta = [spec.title, spec.version].filter(Boolean).join(" · ");
  if (meta) lines.push(`API: ${meta}`);
  lines.push("");
  lines.push(`Endpoints (${spec.endpoints.length}):`);
  for (const e of spec.endpoints.slice(0, 60)) {
    const sum = e.summary ? `  — ${truncate(e.summary, 90)}` : "";
    lines.push(`  ${e.method.padEnd(4)} ${e.path}${sum}`);
  }
  if (spec.endpoints.length > 60) {
    lines.push(`  … and ${spec.endpoints.length - 60} more`);
  }
  const origin = new URL(spec.specUrl).origin;
  const sample = spec.endpoints.find((e) => !e.path.includes("{")) ?? spec.endpoints[0];
  lines.push("");
  if (sample) {
    lines.push(
      `Call one by passing its full URL to fetch_data, e.g. ${origin}${sample.path} (fill in any {parameters}).`,
    );
  }
  return lines.join("\n");
}
