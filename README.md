# SearchMaster MCP

This repository is the SearchMaster MCP server only. The website source stays in a private repository.

Add SearchMaster as a Streamable HTTP connector using the endpoint below. Gemini CLI can also install the extension from this repository. The anonymous trial uses no API key.

`https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors`

Anonymous use is subject to a trial quota and a shared daily spend cap.

## ChatGPT and Codex directory package

The OpenAI upload uses an [anonymous HTTPS relay](https://searchmaster-mcp.lovable.app/mcp). Download the current **searchmaster-openai-upload** artifact using the [directory build instructions](DISTRIBUTION.md#build-the-chatgpt-and-codex-upload). The verified publisher still needs to complete the portal’s domain challenge and submit for review.

## Tools

- `check_ai_visibility`: for a company, its top competitors and the average rank of each across ChatGPT, Claude, Gemini, Grok, and Perplexity.
- `find_competitors`: competitor domains for a website.
- `ranked_keywords`: keywords a domain ranks for.
- `generate_llms_txt`: an llms.txt draft for a domain.

Send JSON-RPC over `POST`. Clients using the 2025 MCP protocol can start with `initialize`. Clients using `2026-07-28` can start with `server/discover`. The endpoint does not offer a standalone SSE stream.

## Files

- `src/`: the server. `src/index.ts` serves only the MCP.
- `server.json`: MCP Registry manifest.
- `gemini-extension.json`: Gemini CLI extension manifest. The repository has the `gemini-cli-extension` topic.
- `example-prompts.md`: prompts for directory forms.
- `icon-512.png`: 512×512 PNG for directory listings.
- `DISTRIBUTION.md`: publication routes and candidate directory review prompts.
- `free_daily_spend.sql`: the daily spend ledger. It does not include the rest of the database.

## Cursor

```json
{
  "mcpServers": {
    "searchmaster": {
      "url": "https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors"
    }
  }
}
```

Gemini CLI uses `httpUrl` with the same address. See `gemini-extension.json`.

## Cline CLI

Install the remote connector using the Cline CLI:

```sh
cline mcp add searchmaster https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors --transport http --yes
cline config mcp --json
```

SearchMaster should appear in the MCP server list. The anonymous trial needs no authentication headers.

## Use an account key

Sign in at [SearchMaster MCP settings](https://searchmaster.app/settings?tab=mcp) to create or revoke a personal key. The [connection guide](https://searchmaster.app/connect) shows client setup options. Use a client that accepts a custom `Authorization` header.

In Cline CLI, with `SEARCHMASTER_MCP_KEY` set in your shell:

```sh
cline mcp add searchmaster-account https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors \
  --transport http --header "Authorization: Bearer ${SEARCHMASTER_MCP_KEY}" --yes
```

Keep the key in your client’s private configuration. Personal keys identify your account for tool calls. Included use is subject to limits. Only a personal MCP key can authorize additional eligible usage from prepaid credits, when enabled for your account. Check MCP settings for your available balance and access.

A client can retry an account request with the same request identifier. Streamable HTTP clients may supply an `Idempotency-Key` header. With the `2026-07-28` protocol, the usual JSON-RPC request ID also supports retry recognition.

## Deployment prerequisites and limitations

This snapshot is not a self-contained backend deployment. It needs Deno, Supabase environment configuration, trial-quota storage and the `consume_mcp_trial` / `refund_mcp_trial` RPCs, the included daily-spend migration, and the separately deployed competitor, validation, normalization, and model-analysis functions referenced in the handler. Configure provider credentials as server-side environment variables, never in this repository. Deploying this MCP-only entrypoint over the existing `get-top-competitors` backend would remove the non-MCP competitor route it depends on.

Anonymous tool calls reserve estimated usage against the configured limits before they reach paid providers. Account use additionally needs the private key, usage reservation and settlement backend. Its services and database definitions are outside this MCP-only snapshot.

Run `node --test tests/index.test.mjs` with Node 26 to check the entrypoint over local HTTP. These tests use a Node adapter for Deno's HTTP server and mock Supabase and environment access. They do not verify paid tools, credentials, deployed backend functions, or production behavior.
