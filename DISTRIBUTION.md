# Directory publication

SearchMaster compares a company with its competitors across ChatGPT, Claude, Gemini, Grok and Perplexity. It also finds competitor domains and ranked keywords, and drafts an llms.txt file.

Use the Streamable HTTP endpoint in [server.json](server.json). The current connection uses a limited anonymous trial. Use [searchmaster.app](https://searchmaster.app/) as the product site and [the SearchMaster privacy policy](https://searchmaster.app/privacy) in listing forms.

## How to release

| Directory | Release route |
| --- | --- |
| Official MCP Registry | Verify the production endpoint and the released version in `server.json`. Either run **Publish SearchMaster to the MCP Registry** from `main` in [GitHub Actions](https://github.com/alexsofronas/searchmaster-mcp/actions/workflows/publish-mcp.yml) or merge a dedicated release approval PR as described below. SearchMaster 1.2.0 is [active in the Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.alexsofronas%2Fsearchmaster&version=latest). See the [publication receipt](https://github.com/alexsofronas/searchmaster-mcp/actions/runs/45455314975). See [the Registry’s OIDC guide](https://modelcontextprotocol.io/registry/github-actions). |
| Glama | After Registry publication, look for the imported Streamable HTTP connector and claim it. Glama syncs the Registry hourly. A direct hosted submission is also available under **Add Server** at [Glama MCP Connectors](https://glama.ai/mcp/connectors). See [Glama’s requirements](https://glama.ai/mcp/faq). |
| Gemini CLI extension gallery | Keep `gemini-extension.json` at the public repository root and the existing `gemini-cli-extension` topic on the repository. Check [the public gallery](https://geminicli.com/extensions/) for the indexed entry. Users can install the extension directly with `gemini extensions install https://github.com/alexsofronas/searchmaster-mcp`. See [Google’s publishing guide](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/releasing.md). |
| Claude | Use the [Claude directory submission form](https://claude.ai/directory/manage/new) on a paid plan, choose a single MCP connector and enter the production endpoint. Track review in the portal and confirm the public listing when live. See [Anthropic’s submission overview](https://claude.com/resources/articles/build-plugins-for-claude). |
| ChatGPT and Codex | Use one **With MCP** plugin submission at the [OpenAI Plugins portal](https://platform.openai.com/plugins). The project needs a verified publisher, an endpoint domain that can pass the portal challenge, the [OpenAI upload ZIP](#build-the-chatgpt-and-codex-upload), five positive and three negative tests run against the submitted release, and a reviewer-accessible walkthrough video. Enter a reviewer account if authentication is required. After approval, publish the release in the portal. See [OpenAI’s submission guide](https://developers.openai.com/plugins/deploy/submission). |
| Gemini app and Google Search | Apply for the [Google Connected Apps preview](https://connected.google.com/). Once admitted, register the endpoint, verify its domain, supply the app icon and capability details, validate in tester preview, submit for review and publish the approved release. See [Google’s console guide](https://developers.google.com/connected-apps/gpc/perform-the-steps). |
| Cursor | The repository contains a [portable plugin manifest](plugin.json) and [MCP configuration](mcp.json). [Public Marketplace submission](https://cursor.com/marketplace/publish) requires an open-source Git repository and manual review. Choose and add the project license before submitting. See [Cursor’s plugin docs](https://cursor.com/docs/plugins). |
| Microsoft Copilot Studio | A verified service publisher can package the MCP server as a Power Platform connector and submit through Partner Center for [Microsoft MCP certification](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-server-certification). Microsoft 365 Copilot’s [federated search connector](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/submit-federated-connector) requires read-only search and fetch tools. |
| GitHub Copilot | [GitHub’s curated MCP Registry](https://github.com/mcp) has a separate [onboarding discussion](https://github.com/github/github-mcp-server/discussions/1257). The request calls for an active, latest entry in the Official MCP Registry first. |
| Zed | [Zed’s publishing docs](https://zed.dev/docs/extensions/mcp-extensions) direct MCP publishers to the Official MCP Registry. |
| Cline | The [SearchMaster submission #4076](https://github.com/cline/mcp-marketplace/issues/4076) is open and awaiting review. It includes the repository URL, the 400 × 400 marketplace icon and installation verification. |
| MCPServers.org | The [submission form](https://mcpservers.org/submit) accepted SearchMaster for review at 18:21:28 UTC on November 24, 2026. |
| MCP.Directory | The [submission form](https://mcp.directory/submit) accepted SearchMaster for review at 18:21:36 UTC on November 24, 2026. |
| Awesome Remote MCP Servers | Wait for a live Glama connector. Follow the [contribution guide](https://github.com/punkpeye/awesome-remote-mcp-servers/blob/main/CONTRIBUTING.md) to open a pull request containing its connector badge. |
| Kiro | The [Kiro publisher form](https://kiro.dev/registry/submit/?type=mcp) requires a public GitHub repository, the publisher’s contact information, and agreement to the publisher terms. |
| MCP.so | The [Remote Server form](https://mcp.so/submit?type=remote-server) displays a $39 payment for immediate listing. |

Perplexity, Grok and Gemini Spark document custom MCP installs for users or workspace admins. These installs leave the connector private to the user or workspace. Smithery now operates a curated directory following the October 31, 2026 shutdown of its CLI, accounts and API. [PulseMCP’s intake](https://www.pulsemcp.com/submit) is paused.

When changing the endpoint or release version, keep `server.json`, `gemini-extension.json`, `mcp.json` and `plugin.json` consistent. Record a review receipt on submission and the live page after publication.

## Approve a Registry release through a pull request

When the production release is ready, open a pull request that changes only `.mcp-registry-release.json`. Generate that record from the released manifest:

```sh
jq '{version, url: .remotes[0].url}' server.json > .mcp-registry-release.json
```

The pull request validates the version and URL without publishing. Merging that record into `main` starts a new run that checks the live MCP handshake and publishes the manifest. Changes to other files do not start a publication run. Use a new server version for a subsequent public release.

## Build the ChatGPT and Codex upload

Open the [Build SearchMaster plugin ZIP workflow](https://github.com/alexsofronas/searchmaster-mcp/actions/workflows/build-plugin.yml) and download the **searchmaster-openai-upload** artifact from a successful run. The [verified draft artifact](https://github.com/alexsofronas/searchmaster-mcp/actions/runs/45455129025/artifacts/14949882067) is one example. Extract the inner `searchmaster-openai-upload.zip` from GitHub’s download and choose that file in the OpenAI portal’s **With MCP** flow. The workflow also emits **searchmaster-plugin**, the portable package for clients such as Cursor.

The OpenAI ZIP contains `plugin.json`, `mcp.json` and `icon-512.png`. At build time, [openai-review.json](openai-review.json) adds five positive cases, three negative cases, the commerce disclosure and release notes to `extensions.com.openai`. The portable manifest stays separate from the OpenAI review fields. See [OpenAI’s manifest schema for review and publication](https://developers.openai.com/plugins/deploy/submission#configure-onboarding-review-and-publication).

The archive is prepared for a draft upload. Publisher submission is pending. Before submitting for review, complete the domain challenge, run the eight cases in the target client and supply a reviewer-accessible walkthrough URL. If the portal requires reviewer credentials, enter them in its secure review form.

### Reviewer preview

[Download the SearchMaster MCP walkthrough](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/searchmaster-mcp-walkthrough.mp4). The recording shows the signed-out production Connect page, a live MCP initialization and tool discovery, and four labeled excerpts from previously recorded production results. OpenAI’s target-client review cases and walkthrough are pending.

## Listing assets

| Download | Dimensions | Use |
| --- | ---: | --- |
| [Plugin icon](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/icon-512.png) | 512 × 512 | Primary plugin logo and composer icon. Use for listings requesting a 512-pixel icon. |
| [Cline Marketplace icon](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/icon-cline-400.png) | 400 × 400 | Use for Cline’s square marketplace icon. |
| [SearchMaster listing banner](https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/banner-1920x1080.png) | 1920 × 1080 | Use wherever the directory accepts a 16:9 listing visual. Independently rendered from the SearchMaster monogram. |
