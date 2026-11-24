import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const relayUrl = "https://searchmaster-mcp.lovable.app/mcp";
const expected = {
  type: "streamable-http",
  url: relayUrl,
  extensions: { "com.openai": { auth: { type: "none" } } },
};
const version = read("plugin.json").version;
const tools = ["check_ai_visibility", "find_competitors", "generate_llms_txt", "ranked_keywords"];

async function request(url, options) {
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...options });
}

async function rpc(method, params = {}, headers = {}, id = 1) {
  const response = await request(relayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(response.status, 200, method);
  assert.match(response.headers.get("Content-Type") ?? "", /^application\/json/);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.equal(body.error, undefined, method);
  return { result: body.result, headers: response.headers };
}

test("OpenAI has its own anonymous configuration and portable clients retain the Registry URL", () => {
  const openai = read("openai-mcp.json");
  const portable = read("mcp.json").mcpServers.searchmaster;
  assert.deepEqual(openai.mcpServers, { searchmaster: expected });
  assert.equal(portable.url, read("server.json").remotes[0].url);
  assert.equal(portable.url, read("gemini-extension.json").mcpServers.searchmaster.httpUrl);
  assert.notEqual(portable.url, relayUrl);
});

test("the relay answers over HTTPS with legacy and modern MCP metadata", async () => {
  const legacyVersion = "2025-11-25";
  const init = await rpc("initialize", {
    protocolVersion: legacyVersion,
    capabilities: {},
    clientInfo: { name: "searchmaster-openai-upload-check", version: "1" },
  });
  assert.equal(init.result.protocolVersion, legacyVersion);
  assert.equal(init.result.serverInfo.name, "searchmaster");
  assert.equal(init.result.serverInfo.version, version);
  const session = init.headers.get("Mcp-Session-Id");
  const legacyHeaders = { "MCP-Protocol-Version": legacyVersion, ...(session ? { "Mcp-Session-Id": session } : {}) };
  const listing = await rpc("tools/list", {}, legacyHeaders, 2);
  assert.deepEqual(listing.result.tools.map(({ name }) => name).sort(), tools);

  const modernVersion = "2026-07-28";
  const meta = { _meta: {
    "io.modelcontextprotocol/protocolVersion": modernVersion,
    "io.modelcontextprotocol/clientCapabilities": {},
  } };
  const modern = (method) => ({ "MCP-Protocol-Version": modernVersion, "Mcp-Method": method });
  const { result: discovery } = await rpc("server/discover", meta, modern("server/discover"), 3);
  assert(discovery.supportedVersions.includes(modernVersion));
  assert.equal(discovery._meta["io.modelcontextprotocol/serverInfo"].version, version);
  const { result: newListing } = await rpc("tools/list", meta, modern("tools/list"), 4);
  assert.deepEqual(newListing.tools.map(({ name }) => name).sort(), tools);
  const { result: ping } = await rpc("ping", meta, modern("ping"), 5);
  assert.equal(ping.resultType, "complete");
});

test("the .well-known routes are on the relay hostname", async () => {
  const origin = new URL(relayUrl).origin;
  const proof = await request(`${origin}/.well-known/searchmaster-host-proof`);
  assert.equal(proof.status, 200);
  assert.match(proof.headers.get("Content-Type") ?? "", /^text\/plain/);
  assert.equal(await proof.text(), "searchmaster-host-proof-v1");
  const challenge = await request(`${origin}/.well-known/openai-apps-challenge`);
  assert([200, 404].includes(challenge.status));
  if (challenge.status === 200) assert.match(challenge.headers.get("Content-Type") ?? "", /^text\/plain/);
});
