import { isAuthed } from "@/lib/auth";
import { startGeneration } from "@/lib/lambda";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected an image upload" }, { status: 400 });
  }

  const image = form.get("image");
  const prompt = (form.get("prompt") as string | null) ?? "";
  const frames = Number(form.get("frames") ?? 97);
  const steps = Number(form.get("steps") ?? 30);

  if (!(image instanceof Blob) || image.size === 0) {
    return Response.json({ error: "An image is required" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return Response.json({ error: "Image too large (max 15 MB)" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const jobId = await startGeneration(bytes, prompt.trim(), frames, steps);
    return Response.json({ jobId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to start" },
      { status: 500 },
    );
  }
}
