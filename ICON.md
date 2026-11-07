# 512px icon placeholder

Do not commit a branded image in this folder until the public listing repo is created.

Required file, added later as `icon-512.png` next to `server.json`:

- Size: 512 by 512 pixels
- Format: PNG
- File size: under 1 MB
- Square, no rounded-corner mask baked in
- Opaque background
- The word SearchMaster or a simple SM monogram, readable at 48 pixels
- No customer logos, no model-provider logos, no screenshots

The official MCP registry `icons` entry, once the file exists:

```json
{
  "src": "https://raw.githubusercontent.com/alexsofronas/searchmaster-mcp/main/icon-512.png",
  "mimeType": "image/png",
  "sizes": ["512x512"]
}
```

Google Connected Apps also asks for a 512x512 icon under 1 MB. Use this same file.
