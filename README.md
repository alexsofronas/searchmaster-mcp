# SearchMaster MCP

This repository is the SearchMaster MCP server only. The website source stays in a private repository.

The live server is already running. Paste this URL into Claude, Cursor, Gemini CLI, or Grok. No API key is required.

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
- `gemini-extension.json`: Gemini CLI extension manifest. The GitHub topic for this repo should be `gemini-cli-extension`.
- `example-prompts.md`: prompts for directory forms.
- `ICON.md`: spec for a 512px icon. The PNG is not here yet.
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

## Deployment prerequisites and limitations

This snapshot is not a self-contained backend deployment. It needs Deno, Supabase environment configuration, trial-quota storage and the `consume_mcp_trial` / `refund_mcp_trial` RPCs, the included daily-spend migration, and the separately deployed competitor, validation, normalization, and model-analysis functions referenced in the handler. Configure provider credentials as server-side environment variables, never in this repository. Deploying this MCP-only entrypoint over the existing `get-top-competitors` backend would remove the non-MCP competitor route it depends on.

The daily cap uses estimated costs and currently allows calls if the spend ledger fails; it is not a guaranteed billing ceiling. Homepage fetching checks domain syntax but does not validate resolved IP addresses, so deployments need network-level protection against requests to private/internal addresses. Review these controls before exposing a new deployment publicly.

Run `node --test tests/index.test.mjs` with Node 26 to check the entrypoint over local HTTP. These tests use a Node adapter for Deno's HTTP server and mock Supabase and environment access. They do not verify paid tools, credentials, deployed backend functions, or production behavior.
