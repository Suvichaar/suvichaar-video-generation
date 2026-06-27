import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return Response.json({ ok: true });
}
