import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleSearchMasterMcp, mcpCorsHeaders } from "./searchmasterMcp.ts";

serve(async (req) => {
  if (req.method !== "POST") return handleSearchMasterMcp(req);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    }), { status: 400, headers: { ...mcpCorsHeaders, "Content-Type": "application/json" } });
  }
  return handleSearchMasterMcp(req, body);
});
