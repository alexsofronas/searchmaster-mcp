# Directory publication

SearchMaster compares a company with its competitors across ChatGPT, Claude, Gemini, Grok and Perplexity. It also finds competitor domains and ranked keywords, and drafts an llms.txt file.

Use the Streamable HTTP endpoint in [server.json](server.json). The current connection uses a limited anonymous trial. Use [searchmaster.app](https://searchmaster.app/) as the product site and [the SearchMaster privacy policy](https://searchmaster.app/privacy) in listing forms.

## How to release

| Directory | Release route |
| --- | --- |
| Official MCP Registry | Verify the production endpoint and the released version in `server.json`. Either run **Publish SearchMaster to the MCP Registry** from `main` in [GitHub Actions](https://github.com/alexsofronas/searchmaster-mcp/actions/workflows/publish-mcp.yml) or merge a dedicated release approval PR as described below. SearchMaster 1.2.0 is [active in the Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.alexsofronas%2Fsearchmaster&version=latest). See the [publication receipt](https://github.com/alexsofronas/searchmaster-mcp/actions/runs/45455314975). See [the Registry’s OIDC guide](https://modelcontextprotocol.io/registry/github-actions). |
| LightNow | [SearchMaster 1.2.0](https://lightnow.ai/servers/io.github.alexsofronas/searchmaster) is listed as an import from the Official MCP Registry. |
| Glama | [SearchMaster is published on Glama](https://glama.ai/mcp/connectors/io.github.alexsofronas/searchmaster) and its [connector badge](https://glama.ai/mcp/connectors/io.github.alexsofronas/searchmaster/badges/score.svg) reports a responding endpoint with four tools. Glama imported the connector from the Official MCP Registry. |
| mcptry | The [public SearchMaster listing](https://mcptry.com/servers/io.github.alexsofronas/searchmaster) is marked as claimed by its maintainer. Its anonymous status check passed and it lists four discovered tools. |
| FindMCP | [SearchMaster is listed on FindMCP](https://findmcp.dev/servers/io-github-alexsofronas-searchmaster), which identifies the Official MCP Registry as its source. |
| Serverdex | [SearchMaster is listed on Serverdex](https://serverdex.io/server/io-github-alexsofronas-searchmaster), which provides installation instructions for the hosted MCP endpoint. |
| Gemini CLI extension gallery | Keep `gemini-extension.json` at the public repository root and the existing `gemini-cli-extension` topic on the repository. SearchMaster did not appear in [the public gallery](https://geminicli.com/extensions/) when checked on November 25, 2026. Users can install the extension directly with `gemini extensions install https://github.com/alexsofronas/searchmaster-mcp`. See [Google’s publishing guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/releasing.md). |
| Claude | Use the [Claude directory submission form](https://claude.ai/directory/manage/new) on a paid plan, choose a single MCP connector and enter the production endpoint. Track review in the portal and confirm the public listing when live. See [Anthropic’s submission overview](https://claude.com/resources/articles/build-plugins-for-claude). |
| ChatGPT and Codex | Version 1.2.0 remains a **With MCP** draft in the [OpenAI Plugins portal](https://platform.openai.com/plugins). The portal verified the [anonymous relay](https://searchmaster-mcp.lovable.app/mcp) and scanned all four tools. Six of the eight [review cases](openai-review.json) were completed in ChatGPT on November 26. Review submission is pending. |
| Gemini app and Google Search | Google confirmed receipt of SearchMaster’s [Connected Apps preview access application](https://connected.google.com/console/help/?apply) for server-side MCP. App registration, review and publication follow preview admission. See [Google’s console guide](https://developers.google.com/connected-apps/gpc/perform-the-steps). |
| Cursor Marketplace | The [official Marketplace publisher form](https://cursor.com/marketplace/publish) confirmed receipt of SearchMaster on November 24 and will review it. The public MCP software is [MIT-licensed](LICENSE). For direct setup, see the [portable plugin manifest](plugin.json) and [MCP configuration](mcp.json). |
| Cursor Directory (community) | The [community submission form](https://cursor.directory/plugins/new) requires sign-in with GitHub or Google and uses the Open Plugins standard. Listings are submitted through the website. |
| Microsoft Copilot Studio | Use the [Microsoft MCP certification intake](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-certification#certification-process) and the **Apps and Agents for M365 and Copilot** offer in Partner Center. Microsoft requires business verification, program enrollment and a manifest referencing Azure Key Vault for authentication. The current MCP endpoint documents a personal bearer key. Publisher eligibility and a compatible Key Vault OAuth configuration need verification before packaging. Microsoft 365 Copilot’s [federated search connector](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/submit-federated-connector) requires read-only search and fetch tools. |
| GitHub Copilot | [GitHub’s curated MCP Registry](https://github.com/mcp) has a separate [onboarding discussion](https://github.com/github/github-mcp-server/discussions/1257). The request calls for an active, latest entry in the Official MCP Registry first. |
| Zed | [Zed’s publishing docs](https://zed.dev/docs/extensions/mcp-extensions) direct MCP publishers to the Official MCP Registry. |
| Goose | [Goose’s directory guidance](https://github.com/aaif-goose/goose/blob/main/documentation/AGENTS.md#mcp-extension-directory) directs publishers to the Official MCP Registry. |
| Cline | The [SearchMaster submission #4076](https://github.com/cline/mcp-marketplace/issues/4076) is open and awaiting review. It includes the repository URL, the 400 × 400 marketplace icon and installation verification. |
| MCPServers.org | [SearchMaster is published on MCPServers.org](https://mcpservers.org/servers/searchmaster-app-docs-mcp). The listing links to SearchMaster and provides its hosted MCP endpoint. Verified November 26, 2026. |
| MCP.Directory | The [submission form](https://mcp.directory/submit) accepted SearchMaster for review at 18:21:36 UTC on November 24, 2026. |
| MCPServer.cc | The [submission form](https://mcpserver.cc/submit) confirmed receipt of SearchMaster for review. |
| MCP Server Hub | The [submission form](https://mcpserverhub.net/submit) confirmed receipt of SearchMaster with the hosted Streamable HTTP configuration in Research and Data. |
| MCP Market | The [live GitHub repository form](https://mcpmarket.com/submit) showed only a $29 paid listing option when checked. |
| Awesome Remote MCP Servers | Use the [live Glama connector](https://glama.ai/mcp/connectors/io.github.alexsofronas/searchmaster). Follow the [contribution guide](https://github.com/punkpeye/awesome-remote-mcp-servers/blob/main/CONTRIBUTING.md) to open a pull request containing its connector badge. |
| Kiro | Kiro [confirmed receipt](https://kiro.dev/registry/submit/thank-you/) of SearchMaster’s registry submission and will review it. See the [Kiro instructions](README.md#kiro) for direct installation. |
| MCP.so | The [Remote Server form](https://mcp.so/submit?type=remote-server) displays a $39 payment for immediate listing. |

Perplexity, Grok and Gemini Spark document custom MCP installs for users or workspace admins. These installs leave the connector private to the user or workspace. Smithery now operates a curated directory following the October 31, 2026 shutdown of its CLI, accounts and API. [PulseMCP’s intake](https://www.pulsemcp.com/submit) is paused.

Keep the canonical URL in `server.json`, `gemini-extension.json` and `mcp.json` aligned. The separate `openai-mcp.json` configures the OpenAI-only relay. Record a review receipt on submission and the live page after publication.

## Approve a Registry release through a pull request

When the production release is ready, open a pull request that changes only `.mcp-registry-release.json`. Generate that record from the released manifest:

```sh
jq '{version, url: .remotes[0].url}' server.json > .mcp-registry-release.json
```

The pull request validates the version and URL without publishing. Merging that record into `main` starts a new run that checks the live MCP handshake and publishes the manifest. Changes to other files do not start a publication run. Use a new server version for a subsequent public release.

## Build the ChatGPT and Codex upload

Open the [latest successful main build](https://github.com/alexsofronas/searchmaster-mcp/actions/workflows/build-plugin.yml?query=branch%3Amain+is%3Asuccess) and download the **searchmaster-openai-upload** artifact. Extract the inner `searchmaster-openai-upload.zip` from GitHub’s download and choose that file in the OpenAI portal’s **With MCP** flow. The workflow also emits **searchmaster-plugin**, the portable package for clients such as Cursor.

The OpenAI ZIP contains `plugin.json`, `mcp.json` and `icon-512.png`. The build copies [openai-mcp.json](openai-mcp.json) to the archive’s `mcp.json` and checks the relay’s legacy and modern MCP discovery, hostname proof and exact challenge response over HTTPS. [openai-review.json](openai-review.json) sets the anonymous-trial description and adds the review cases, commerce disclosure and release notes. The portable ZIP uses the canonical [mcp.json](mcp.json). See [OpenAI’s manifest schema for review and publication](https://developers.openai.com/plugins/deploy/submission#configure-onboarding-review-and-publication).

The [OpenAI Plugins portal](https://platform.openai.com/plugins) verified the relay domain on November 24, 2026. On November 26 it listed all four tools and reported “No findings in the latest MCP scan”. Signed-in ChatGPT completed the visibility comparison, competitor lookup, keyword lookup and combined competitor/keyword report. It also handled the invalid domain and unsupported publication cases. The llms.txt draft confirmation and refusal of a purchase or quota override remain to be verified.

### Reviewer preview

[Download the November 26 ChatGPT walkthrough](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/f70ab90bdf9ca01c5bfa44c7b56c9d2dfdc224cc/searchmaster-chatgpt-review-2026-11-26.mp4). It covers the six completed target-client cases.

[Download the SearchMaster MCP walkthrough](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/searchmaster-mcp-walkthrough.mp4). The recording shows the signed-out production Connect page, a live MCP initialization and tool discovery, and four labeled excerpts from previously recorded production results.

## Listing assets

| Download | Dimensions | Use |
| --- | ---: | --- |
| [Plugin icon](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/icon-512.png) | 512 × 512 | Primary plugin logo and composer icon. Use for listings requesting a 512-pixel icon. |
| [Cline Marketplace icon](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/icon-cline-400.png) | 400 × 400 | Use for Cline’s square marketplace icon. |
| [SearchMaster listing banner](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/banner-1920x1080.png) | 1920 × 1080 | Use wherever the directory accepts a 16:9 listing visual. Independently rendered from the SearchMaster monogram. |
