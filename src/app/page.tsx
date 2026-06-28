"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Phase = "idle" | "running" | "done" | "error";

const QUALITY = [
  { label: "Fast", steps: 20, hint: "~3 min" },
  { label: "Balanced", steps: 30, hint: "~5 min" },
  { label: "High", steps: 40, hint: "~7 min" },
];

const DURATION = [
  { label: "Short", frames: 49, hint: "~2s" },
  { label: "Medium", frames: 97, hint: "~4s" },
  { label: "Long", frames: 145, hint: "~6s" },
];

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      width="16"
      height="16"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="loading-dot" style={{ animationDelay: "0ms" }} />
      <span className="loading-dot" style={{ animationDelay: "200ms" }} />
      <span className="loading-dot" style={{ animationDelay: "400ms" }} />
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [steps, setSteps] = useState(30);
  const [frames, setFrames] = useState(97);

  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/progress?jobId=${id}`);
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          const data = await res.json();
          if (data.error && data.stage !== "Failed") return;
          setPercent(data.percent ?? 0);
          setStage(data.stage ?? "");
          if (data.stage === "Failed" || data.error) {
            setPhase("error");
            setError(data.error ?? "Generation failed");
            stopPolling();
          } else if (data.done) {
            setPercent(100);
            setPhase("done");
            stopPolling();
            toast.success("Video ready!");
          }
        } catch {
          /* ignore transient network errors */
        }
      }, 2500);
    },
    [router, stopPolling],
  );

  async function handleGenerate() {
    if (!imageFile) {
      toast.error("Please upload an image first");
      return;
    }
    setPhase("running");
    setPercent(0);
    setStage("Uploading image…");
    setError(null);
    setJobId(null);

    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("prompt", prompt);
      fd.append("frames", String(frames));
      fd.append("steps", String(steps));

      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start generation");
      setJobId(data.jobId);
      poll(data.jobId);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Failed to start");
    }
  }

  function reset() {
    stopPolling();
    setPhase("idle");
    setPercent(0);
    setStage("");
    setError(null);
    setJobId(null);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const busy = phase === "running";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-float absolute -top-40 left-1/4 h-[40rem] w-[40rem] rounded-full bg-violet-600/15 blur-[130px]" />
        <div
          className="animate-float absolute bottom-0 right-1/4 h-[30rem] w-[30rem] rounded-full bg-sky-500/10 blur-[130px]"
          style={{ animationDelay: "3s" }}
        />
      </div>

      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-sm font-bold text-white shadow-lg shadow-violet-500/30">
              ▶
            </div>
            <span className="font-semibold">LTX-2 Studio</span>
            <Badge variant="secondary" className="ml-1">
              Image → Video
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card className="border-white/10 bg-card/60 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Animate an image</CardTitle>
            <CardDescription>
              Upload a photo and LTX-2 will turn it into a video with
              synchronized audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Image upload */}
            <div className="space-y-2">
              <Label>Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickImage(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  onPickImage(e.dataTransfer.files?.[0]);
                }}
                className={`group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed p-6 text-center transition-all duration-200 disabled:opacity-60 ${
                  dragActive
                    ? "scale-[1.01] border-violet-400 bg-violet-500/10"
                    : "border-white/20 bg-black/20 hover:border-violet-500/60 hover:bg-black/30"
                }`}
              >
                {imagePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="preview"
                      className="max-h-60 rounded-xl border border-white/10 shadow-lg transition group-hover:opacity-90"
                    />
                    {!busy && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                        Change image
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-500/20 text-2xl ring-1 ring-white/10 transition group-hover:scale-110">
                      🖼️
                    </div>
                    <div className="text-sm font-medium">
                      Click to upload{" "}
                      <span className="text-muted-foreground font-normal">
                        or drag &amp; drop
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      PNG / JPG / WEBP · max 15 MB
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* Optional motion prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt">
                Motion prompt{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="prompt"
                rows={2}
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. the camera slowly zooms in, leaves sway in the wind…"
                className="resize-none"
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION.map((d) => (
                    <button
                      key={d.frames}
                      type="button"
                      disabled={busy}
                      onClick={() => setFrames(d.frames)}
                      className={`rounded-lg border px-2 py-2 text-center text-sm transition-all duration-150 ${
                        frames === d.frames
                          ? "border-violet-500 bg-violet-500/10 shadow-inner"
                          : "border-white/10 hover:border-white/20 hover:bg-white/5"
                      } disabled:opacity-50`}
                    >
                      <div className="font-medium">{d.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {d.hint}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quality</Label>
                <div className="grid grid-cols-3 gap-2">
                  {QUALITY.map((q) => (
                    <button
                      key={q.steps}
                      type="button"
                      disabled={busy}
                      onClick={() => setSteps(q.steps)}
                      className={`rounded-lg border px-2 py-2 text-center text-sm transition-all duration-150 ${
                        steps === q.steps
                          ? "border-violet-500 bg-violet-500/10 shadow-inner"
                          : "border-white/10 hover:border-white/20 hover:bg-white/5"
                      } disabled:opacity-50`}
                    >
                      <div className="font-medium">{q.label}</div>
                      <div className="text-muted-foreground text-xs">
                        {q.hint}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {phase === "idle" && (
              <Button
                onClick={handleGenerate}
                className="w-full bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90"
                size="lg"
                disabled={!imageFile}
              >
                ✨ Generate video
              </Button>
            )}

            {phase === "running" && (
              <div className="animate-fade-up space-y-3 rounded-xl border border-violet-500/30 bg-black/30 p-4 ring-1 ring-violet-500/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Spinner className="text-violet-400" />
                    {stage}
                    <LoadingDots />
                  </span>
                  <span className="font-semibold tabular-nums">{percent}%</span>
                </div>
                <div className="relative">
                  <Progress value={percent} />
                  <div
                    className="animate-shimmer pointer-events-none absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${percent}%`,
                      backgroundImage:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Keep this tab open — generation runs on the GPU and can take a
                  few minutes.
                </p>
              </div>
            )}

            {phase === "done" && jobId && (
              <div className="animate-fade-up space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="text-lg">✓</span>
                  <span className="font-medium">Your video is ready!</span>
                </div>
                <Progress value={100} />
                <video
                  src={`/api/download?jobId=${jobId}`}
                  controls
                  className="w-full rounded-lg border border-white/10 shadow-lg"
                />
                <div className="flex gap-2">
                  <a
                    href={`/api/download?jobId=${jobId}&dl=1`}
                    download
                    className={buttonVariants({
                      size: "lg",
                      className: "flex-1",
                    })}
                  >
                    Download MP4
                  </a>
                  <Button variant="outline" onClick={reset}>
                    Animate another
                  </Button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="animate-fade-up space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-center gap-2 text-red-400">
                  <span className="text-lg">✕</span>
                  <span className="font-medium">Generation failed</span>
                </div>
                {error && (
                  <p className="text-muted-foreground break-words font-mono text-xs">
                    {error}
                  </p>
                )}
                <Button variant="outline" onClick={reset}>
                  Try again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-6 bg-white/10" />
        <p className="text-muted-foreground text-center text-xs">
          Powered by LTX-2 · running on your Lambda A100
        </p>
      </div>
    </main>
  );
}
