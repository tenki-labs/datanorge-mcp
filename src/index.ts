#!/usr/bin/env node
/**
 * datanorge-mcp — an MCP server for data.norge.no (Felles datakatalog).
 *
 * Exposes tools to search the Norwegian national data catalogue and pull the
 * actual data, over stdio, for use with Claude Code and other MCP clients.
 * No authentication or API key is required.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { search, getResource, fetchData, FdkError } from "./fdk.js";
import {
  formatSearchResults,
  formatDataset,
  formatDataService,
} from "./format.js";

const VERSION = "0.1.0";

const server = new McpServer({
  name: "datanorge",
  version: VERSION,
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function describeError(e: unknown): string {
  if (e instanceof FdkError) {
    if (e.status === 429) {
      return "data.norge.no rate limit reached (~10 requests/minute). Wait a few seconds and try again.";
    }
    return e.message;
  }
  if (e instanceof Error) return `Request failed: ${e.message}`;
  return `Unexpected error: ${String(e)}`;
}

server.registerTool(
  "search_datasets",
  {
    title: "Search datasets",
    description:
      "Search data.norge.no (the Norwegian national data catalogue) for datasets by keyword or topic. " +
      "Returns matching datasets with their id, publisher, themes and a short description. " +
      "Norwegian search terms usually match best. Use a returned id with get_dataset to get download links.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Free-text search, e.g. 'luftkvalitet', 'befolkning', 'eiendom', 'air quality'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (default 10)."),
      page: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Zero-based page number for paging through results (default 0)."),
      openDataOnly: z
        .boolean()
        .optional()
        .describe("If true, only return datasets flagged as open data."),
      orgPath: z
        .string()
        .optional()
        .describe("Filter by publisher org path, e.g. '/STAT/972417904/971032081'."),
    },
  },
  async ({ query, limit, page, openDataOnly, orgPath }): Promise<ToolResult> => {
    try {
      const resp = await search("datasets", {
        query,
        size: limit,
        page,
        openDataOnly,
        orgPath,
      });
      return ok(formatSearchResults("datasets", query, resp, "get_dataset"));
    } catch (e) {
      return fail(describeError(e));
    }
  },
);

server.registerTool(
  "get_dataset",
  {
    title: "Get dataset details",
    description:
      "Fetch full metadata for one dataset by its id (from search_datasets), including every distribution " +
      "with its download/access URL, format and licence. This is how you find where to actually get the data.",
    inputSchema: {
      id: z
        .string()
        .min(1)
        .describe("The dataset id returned by search_datasets (a UUID-like string)."),
    },
  },
  async ({ id }): Promise<ToolResult> => {
    try {
      const dataset = await getResource("datasets", id);
      return ok(formatDataset(dataset));
    } catch (e) {
      return fail(describeError(e));
    }
  },
);

server.registerTool(
  "search_apis",
  {
    title: "Search APIs (data services)",
    description:
      "Search data.norge.no for APIs / data services — live endpoints serving Norwegian public data " +
      "(e.g. Statistics Norway, Kartverket, Brønnøysundregistrene). Use get_api with a returned id for endpoint URLs.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Free-text search for an API / data service, e.g. 'vær', 'adresser', 'foretak'."),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)."),
      page: z.number().int().min(0).optional().describe("Zero-based page number (default 0)."),
    },
  },
  async ({ query, limit, page }): Promise<ToolResult> => {
    try {
      const resp = await search("data-services", { query, size: limit, page });
      return ok(formatSearchResults("APIs", query, resp, "get_api"));
    } catch (e) {
      return fail(describeError(e));
    }
  },
);

server.registerTool(
  "get_api",
  {
    title: "Get API details",
    description:
      "Fetch full metadata for one API / data service by its id (from search_apis), including its endpoint " +
      "URL(s) and a link to the machine-readable description (e.g. OpenAPI spec).",
    inputSchema: {
      id: z.string().min(1).describe("The API/data-service id returned by search_apis."),
    },
  },
  async ({ id }): Promise<ToolResult> => {
    try {
      const service = await getResource("data-services", id);
      return ok(formatDataService(service));
    } catch (e) {
      return fail(describeError(e));
    }
  },
);

server.registerTool(
  "fetch_data",
  {
    title: "Fetch data from a URL",
    description:
      "Download the actual data from a distribution's downloadURL or accessURL (from get_dataset), an API " +
      "endpoint (from get_api), or any http(s) data URL. Returns the content for text formats (CSV, JSON, XML, " +
      "GeoJSON); large responses are truncated and binary content returns metadata only. " +
      "Use this to retrieve the data itself, not just its catalogue metadata.",
    inputSchema: {
      url: z
        .string()
        .min(1)
        .describe("The http(s) URL to fetch — typically a downloadURL/accessURL from get_dataset."),
      maxKilobytes: z
        .number()
        .int()
        .min(1)
        .max(5000)
        .optional()
        .describe("Maximum amount to download, in KB (default 256, hard cap 5000)."),
    },
  },
  async ({ url, maxKilobytes }): Promise<ToolResult> => {
    try {
      const cap = Math.min((maxKilobytes ?? 256) * 1024, 5000 * 1024);
      const data = await fetchData(url, cap);
      const header =
        `Fetched ${data.url}\n` +
        `status ${data.status} · ${data.contentType} · ${data.byteLength} bytes` +
        (data.truncated ? ` (truncated to ~${Math.round(cap / 1024)} KB)` : "");
      if (!data.isText || data.body == null) {
        return ok(
          `${header}\n\n(Binary or non-text content — not displayed. Download it directly from the URL if you need the file.)`,
        );
      }
      return ok(`${header}\n\n${data.body}`);
    } catch (e) {
      return fail(describeError(e));
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol; log to stderr only.
  console.error(`datanorge-mcp v${VERSION} ready on stdio`);
}

main().catch((e) => {
  console.error("Fatal error starting datanorge-mcp:", e);
  process.exit(1);
});
