import { cookies } from "next/headers";
import { COOKIE_NAME, expectedToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (
    email === process.env.APP_EMAIL &&
    password === process.env.APP_PASSWORD
  ) {
    const store = await cookies();
    store.set(COOKIE_NAME, expectedToken(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return Response.json({ ok: true });
  }

  return Response.json(
    { ok: false, error: "Invalid email or password" },
    { status: 401 },
  );
}
