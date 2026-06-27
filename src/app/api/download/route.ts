import fs from "node:fs";
import type { NextRequest } from "next/server";
import { isAuthed } from "@/lib/auth";
import { downloadVideo } from "@/lib/lambda";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const asDownload = request.nextUrl.searchParams.get("dl") === "1";

  try {
    const localPath = await downloadVideo(jobId);
    const data = await fs.promises.readFile(localPath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": asDownload
          ? `attachment; filename="ltx_${jobId}.mp4"`
          : `inline; filename="ltx_${jobId}.mp4"`,
        "Content-Length": String(data.length),
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 },
    );
  }
}
