# SearchMaster MCP

This repository is the SearchMaster MCP server only. The website source stays in a private repository.

The public Streamable HTTP endpoint is listed below. Add it as a custom connector in Claude, Cursor or Grok. Gemini CLI can install the extension from this repository. The anonymous trial uses no API key.

`https://oowilxxepsyzpjnubyyk.supabase.co/functions/v1/get-top-competitors`

Anonymous use is limited by a trial quota and a shared daily spend cap. The default cap is $5.

## Tools

- `check_ai_visibility`: for a company, its top competitors and the average rank of each across ChatGPT, Claude, Gemini, Grok, and Perplexity.
- `find_competitors`: competitor domains for a website.
- `ranked_keywords`: keywords a domain ranks for.
- `generate_llms_txt`: an llms.txt draft for a domain.

`GET` with `Accept: text/event-stream` returns 405. Send JSON-RPC with `POST`.

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

## Deployment prerequisites and limitations

This snapshot is not a self-contained backend deployment. It needs Deno, Supabase environment configuration, trial-quota storage and the `consume_mcp_trial` / `refund_mcp_trial` RPCs, the included daily-spend migration, and the separately deployed competitor, validation, normalization, and model-analysis functions referenced in the handler. Configure provider credentials as server-side environment variables, never in this repository. Deploying this MCP-only entrypoint over the existing `get-top-competitors` backend would remove the non-MCP competitor route it depends on.

The daily cap uses estimated costs and currently allows calls if the spend ledger fails; it is not a guaranteed billing ceiling. Homepage fetching checks domain syntax but does not validate resolved IP addresses, so deployments need network-level protection against requests to private/internal addresses. Review these controls before exposing a new deployment publicly.

Run `node --test tests/index.test.mjs` with Node 26 to check the entrypoint over local HTTP. These tests use a Node adapter for Deno's HTTP server and mock Supabase and environment access. They do not verify paid tools, credentials, deployed backend functions, or production behavior.
