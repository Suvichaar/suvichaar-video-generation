import type { NextRequest } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getProgress } from "@/lib/lambda";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const progress = await getProgress(jobId);
    return Response.json(progress);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to read progress" },
      { status: 500 },
    );
  }
}
