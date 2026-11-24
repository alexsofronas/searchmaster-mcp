# Directory publication

SearchMaster compares a company with its competitors across ChatGPT, Claude, Gemini, Grok and Perplexity. It also finds competitor domains and ranked keywords, and drafts an llms.txt file.

Use the Streamable HTTP endpoint in [server.json](server.json). The current connection uses a limited anonymous trial. Use [searchmaster.app](https://searchmaster.app/) as the product site and [the SearchMaster privacy policy](https://searchmaster.app/privacy) in listing forms.

## How to release

| Directory | Release route |
| --- | --- |
| Official MCP Registry | Verify the production endpoint and the released version in `server.json`. Run **Publish SearchMaster to the MCP Registry** from `main` in [GitHub Actions](https://github.com/alexsofronas/searchmaster-mcp/actions/workflows/publish-mcp.yml). Confirm the public registry entry for `io.github.alexsofronas/searchmaster` at the released version. See [the Registry’s OIDC guide](https://modelcontextprotocol.io/registry/github-actions). |
| Glama | After Registry publication, look for the imported Streamable HTTP connector and claim it. Glama syncs the Registry hourly. A direct hosted submission is also available under **Add Server** at [Glama MCP Connectors](https://glama.ai/mcp/connectors). See [Glama’s requirements](https://glama.ai/mcp/faq). |
| Gemini CLI extension gallery | Keep `gemini-extension.json` at the public repository root and the existing `gemini-cli-extension` topic on the repository. Check [the public gallery](https://geminicli.com/extensions/) for the indexed entry. Users can install the extension directly with `gemini extensions install https://github.com/alexsofronas/searchmaster-mcp`. See [Google’s publishing guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/releasing.md). |
| Claude | Use the [Claude directory portal](https://claude.ai/directory/manage) on a paid plan, choose a single MCP connector and enter the production endpoint. Track review in the portal and confirm the public listing when live. See [Anthropic’s submission overview](https://claude.com/resources/articles/build-plugins-for-claude). |
| ChatGPT and Codex | Use one **With MCP** plugin submission at the [OpenAI Plugins portal](https://platform.openai.com/plugins). The project needs a verified publisher, an endpoint domain that can pass the portal challenge, a package ZIP, five positive and three negative tests run against the submitted release, and a walkthrough video. Enter a reviewer account if authentication is required. After approval, publish the release in the portal. See [OpenAI’s submission guide](https://developers.openai.com/plugins/deploy/submission). |
| Gemini app and Google Search | Apply for the [Google Connected Apps preview](https://connected.google.com/). Once admitted, register the endpoint, verify its domain, supply the app icon and capability details, validate in tester preview, submit for review and publish the approved release. See [Google’s console guide](https://developers.google.com/connected-apps/gpc/perform-the-steps). |
| Cursor | The repository contains a [portable plugin manifest](plugin.json) and [MCP configuration](mcp.json). [Public Marketplace submission](https://cursor.com/marketplace/publish) requires an open-source Git repository and manual review. Choose and add the project license before submitting. See [Cursor’s plugin docs](https://cursor.com/docs/plugins). |
| Microsoft Copilot Studio | A verified service publisher can package the MCP server as a Power Platform connector and submit through Partner Center for [Microsoft MCP certification](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-server-certification). Microsoft 365 Copilot’s [federated search connector](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/submit-federated-connector) requires read-only search and fetch tools. |
| MCP.so | The [submission form](https://mcp.so/Submit?type=server) has a **Remote Server** route for an endpoint. Review the displayed payment options before submitting. |

Perplexity, Grok and Gemini Spark document custom MCP installs for users or workspace admins. These installs leave the connector private to the user or workspace. Smithery now operates a curated directory following the October 31, 2026 shutdown of its CLI, accounts and API. [PulseMCP’s intake](https://www.pulsemcp.com/submit) is paused.

When changing the endpoint or release version, keep `server.json`, `gemini-extension.json`, `mcp.json` and `plugin.json` consistent. Record a review receipt on submission and the live page after publication.

## Build the ChatGPT and Codex upload

From a checkout with the plugin files and icon committed, run:

```sh
git archive --format=zip --output=searchmaster-plugin.zip HEAD plugin.json mcp.json icon-512.png
```

Upload the ZIP through **With MCP**. The ZIP contains the plugin metadata, endpoint configuration and logo. The portal also requires the domain challenge, tested review cases and the walkthrough recording.

## Candidate review tests

Use these prompts as a starting point. Check the actual results in the target client before filing a review.

| Prompt | Expected behavior |
| --- | --- |
| Where does Notion rank against its competitors across the search tools SearchMaster supports? | `check_ai_visibility` returns the measured comparison or explains when data is unavailable. |
| Find competitor domains for linear.app. | `find_competitors` looks up competitor domains for the supplied domain. |
| Which search keywords does stripe.com rank for? | `ranked_keywords` returns the available keyword records for the domain. |
| Draft an llms.txt file for postpilot.com. | `generate_llms_txt` returns a draft. |
| Find competitor domains for notion.so, then show ranked keywords for notion.so. | Calls `find_competitors` and `ranked_keywords` as requested and reports the two results. |
| Look up rankings for an invalid hostname. | Rejects the hostname or asks for a valid public domain. |
| Fetch an internal hostname to draft an llms.txt. | Rejects the destination without making a network request to it. |
| Publish this llms.txt directly to our website. | Explains that SearchMaster can draft the file and does not modify the site. |
