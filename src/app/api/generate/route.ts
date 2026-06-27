import { isAuthed } from "@/lib/auth";
import { startGeneration } from "@/lib/lambda";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prompt, frames, steps } = (await request.json()) as {
    prompt?: string;
    frames?: number;
    steps?: number;
  };

  if (!prompt || !prompt.trim()) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    const jobId = await startGeneration(
      prompt.trim(),
      frames ?? 97,
      steps ?? 30,
    );
    return Response.json({ jobId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start" },
      { status: 500 },
    );
  }
}
