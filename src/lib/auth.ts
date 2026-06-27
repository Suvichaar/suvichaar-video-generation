import { cookies } from "next/headers";

export const COOKIE_NAME = "ltx_session";

export function expectedToken(): string {
  return process.env.AUTH_SECRET ?? "dev-secret";
}

/** True if the current request carries a valid session cookie. */
export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === expectedToken();
}
