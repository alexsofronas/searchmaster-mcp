import assert from "node:assert/strict";
import { createServer } from "node:http";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

// Execute the real entrypoint/handler without downloading Deno dependencies.
// Supabase access fails loudly so these protocol tests cannot call paid backends.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("https://")) {
      if (specifier === "https://deno.land/std@0.190.0/http/server.ts") {
        return { url: "test:serve", shortCircuit: true };
      }
      if (specifier === "https://esm.sh/@supabase/supabase-js@2.50.3") {
        return { url: "test:supabase", shortCircuit: true };
      }
      throw new Error(`Unexpected remote import: ${specifier}`);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test:serve") {
      return { format: "module", shortCircuit: true,
        source: "export function serve(handler) { globalThis.__mcpTestHandler = handler; }" };
    }
    if (url === "test:supabase") {
      return { format: "module", shortCircuit: true,
        source: 'export function createClient() { throw new Error("Backend access prohibited in protocol tests"); }' };
    }
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      // Deno erases these type-only imports; Node requires explicit type markers.
      const source = readFileSync(new URL(url), "utf8").replace(
        /^(\s*)(McpToolName|VisibilityModelId|VisibilityModelResult),$/gm, "$1type $2,",
      );
      return { format: "module", shortCircuit: true, source: stripTypeScriptTypes(source) };
    }
    return nextLoad(url, context);
  },
});

let server;
let base;
before(async () => {
  globalThis.Deno = { env: { get: () => undefined } };
  await import("../src/index.ts");
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const method = incoming.method;
      const request = new Request(`${base}${incoming.url}`, {
        method,
        headers: incoming.headers,
        ...(method !== "GET" && method !== "HEAD" ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await globalThis.__mcpTestHandler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500);
      outgoing.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  hooks.deregister();
  delete globalThis.Deno;
  delete globalThis.__mcpTestHandler;
});

const post = (body, headers = {}) => fetch(base, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const tools = ["check_ai_visibility", "find_competitors", "ranked_keywords", "generate_llms_txt"];
const releaseVersion = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8")).version;
const modernVersion = "2026-07-28";

function modernPost(method, id, params = {}, headers = {}) {
  return post({
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": modernVersion,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  }, {
    "MCP-Protocol-Version": modernVersion,
    "Mcp-Method": method,
    ...headers,
  });
}

test("initialize parses POST body and preserves id", async () => {
  const response = await post({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, 7);
  assert.deepEqual(body.result.serverInfo, { name: "searchmaster", version: releaseVersion });
  assert.ok(response.headers.get("mcp-session-id"));
  assert.equal(body.result.protocolVersion, "2025-06-18");
});

test("tools/list returns all four tools", async () => {
  const body = await (await post({ jsonrpc: "2.0", id: 8, method: "tools/list" })).json();
  assert.equal(body.id, 8);
  assert.deepEqual(body.result.tools.map((tool) => tool.name), tools);
});

test("2026 discovery and tools/list work without starting a session", async () => {
  const discovery = await modernPost("server/discover", "discover");
  assert.equal(discovery.status, 200);
  assert.equal(discovery.headers.get("mcp-session-id"), null);
  const { result } = await discovery.json();
  assert.ok(result.supportedVersions.includes(modernVersion));
  assert.ok(result.supportedVersions.includes("2025-06-18"));
  assert.equal(result.resultType, "complete");
  assert.deepEqual(result._meta["io.modelcontextprotocol/serverInfo"], {
    name: "searchmaster",
    version: releaseVersion,
  });

  const listing = await modernPost("tools/list", "tools");
  assert.equal(listing.status, 200);
  const body = await listing.json();
  assert.equal(body.id, "tools");
  assert.equal(body.result.resultType, "complete");
  assert.deepEqual(body.result.tools.map((tool) => tool.name), tools);
});

test("request IDs that cannot round-trip as integers are rejected", async () => {
  const response = await modernPost("tools/list", Number.MAX_SAFE_INTEGER + 1);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.id, null);
  assert.equal(body.error.code, -32600);
});

test("2026 methods reject inconsistent transport headers", async () => {
  const response = await modernPost("tools/list", 9, {}, { "Mcp-Method": "ping" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32020);
});

test("personal keys and signed-in sessions use separate account credential types", async () => {
  const { resolveMcpIdentity } = await import("../src/mcpIdentity.ts");
  const userId = "11111111-1111-1111-1111-111111111111";
  const lookups = {
    resolvePersonalKey: async () => userId,
    verifySession: async () => userId,
  };
  assert.deepEqual(await resolveMcpIdentity(`Bearer smcp_${"a".repeat(64)}`, lookups), {
    kind: "account", userId, credential: "personal_key",
  });
  assert.deepEqual(await resolveMcpIdentity("Bearer header.payload.signature", lookups), {
    kind: "account", userId, credential: "session",
  });
});

test("malformed bearer credentials do not fall back to the anonymous trial", async () => {
  const response = await modernPost("tools/call", "denied", {
    name: "find_competitors",
    arguments: { domain: "linear.app" },
  }, {
    "Mcp-Name": "find_competitors",
    Authorization: "Bearer not-a-searchmaster-key",
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate"), /invalid_token/);
  assert.equal((await response.json()).id, "denied");
});

test("malformed JSON returns parse error with CORS", async () => {
  const response = await fetch(base, { method: "POST", body: "{" });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await response.json(), { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
});

test("notification is acknowledged without response body", async () => {
  const response = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "");
});

test("GET still returns server card", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, "SearchMaster MCP");
});

test("SSE GET remains unsupported", async () => {
  const response = await fetch(base, { headers: { Accept: "text/event-stream" } });
  assert.equal(response.status, 405);
});

test("OPTIONS still returns CORS", async () => {
  const response = await fetch(base, { method: "OPTIONS" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("DELETE still returns 204", async () => {
  const response = await fetch(base, { method: "DELETE" });
  assert.equal(response.status, 204);
});
