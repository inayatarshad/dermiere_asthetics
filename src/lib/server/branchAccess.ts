import type { SessionClaims } from "./session";
import { pgListUsers } from "./db";

/** Resolve the signed-in user's current branch from the server-side row. */
export async function sessionBranchId(
  session: Pick<SessionClaims, "cid" | "uid">
): Promise<string | null> {
  const users = await pgListUsers<{ branch_id?: string }>(session.cid);
  return users.find((user) => user.id === session.uid)?.payload?.branch_id ?? null;
}
