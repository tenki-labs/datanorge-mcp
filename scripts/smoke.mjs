#!/usr/bin/env node
/**
 * Smoke test: spawn the built server and exercise the MCP handshake end-to-end
 * (initialize -> tools/list -> tools/call). Hits the live data.norge.no API.
 *
 *   npm run build && npm run smoke
 *
 * Exits 0 on success, 1 on any failure.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "inherit"],
});

const pending = new Map();
let nextId = 1;

createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id != null && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 30000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return promise;
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function die(message) {
  console.error("\n  SMOKE FAIL:", message);
  child.kill();
  process.exit(1);
}

try {
  const init = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0" },
  });
  if (!init.result?.serverInfo?.name) die("initialize returned no serverInfo");
  console.log("  initialize OK →", JSON.stringify(init.result.serverInfo));
  notify("notifications/initialized", {});

  const list = await send("tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name).sort();
  console.log("  tools/list OK →", names.join(", "));
  for (const required of ["search_datasets", "get_dataset", "search_apis", "get_api", "fetch_data"]) {
    if (!names.includes(required)) die(`missing expected tool: ${required}`);
  }

  const call = await send("tools/call", {
    name: "search_datasets",
    arguments: { query: "luftkvalitet", limit: 2 },
  });
  const text = call.result?.content?.[0]?.text ?? "";
  if (call.result?.isError) die("search_datasets returned isError:\n" + text);
  if (!/Found \d+ datasets/.test(text)) die("unexpected search output:\n" + text);
  console.log("  tools/call search_datasets OK →", text.split("\n")[0]);

  console.log("\n  ALL SMOKE CHECKS PASSED\n");
  child.kill();
  process.exit(0);
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
