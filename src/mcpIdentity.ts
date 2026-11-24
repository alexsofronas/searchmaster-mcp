export type McpIdentity =
  | { kind: "anonymous" }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "account"; userId: string };

type IdentityLookups = {
  resolvePersonalKey: (token: string) => Promise<string | null>;
  verifySession: () => Promise<string | null>;
  publicProjectToken?: string;
};

const PERSONAL_KEY = /^smcp_[a-f0-9]{64}$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function resolveMcpIdentity(
  authorization: string | null,
  lookups: IdentityLookups,
): Promise<McpIdentity> {
  if (authorization === null) return { kind: "anonymous" };
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (!token) return { kind: "invalid" };
  if (token === lookups.publicProjectToken) return { kind: "anonymous" };

  try {
    const userId = PERSONAL_KEY.test(token)
      ? await lookups.resolvePersonalKey(token)
      : JWT.test(token)
        ? await lookups.verifySession()
        : null;

    return typeof userId === "string" && UUID.test(userId)
      ? { kind: "account", userId }
      : { kind: "invalid" };
  } catch {
    return { kind: "unavailable" };
  }
}
