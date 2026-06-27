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

export default function DashboardPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "A beautiful sunset over the ocean, gentle waves, cinematic, golden hour",
  );
  const [steps, setSteps] = useState(30);
  const [frames, setFrames] = useState(97);

  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

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
          if (data.error && data.stage !== "Failed") {
            return; // transient read error, keep polling
          }
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
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    setPhase("running");
    setPercent(0);
    setStage("Starting…");
    setError(null);
    setJobId(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, frames, steps }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start generation");
      }
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
        <div className="absolute -top-40 left-1/4 h-[40rem] w-[40rem] rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-[30rem] w-[30rem] rounded-full bg-sky-500/10 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-sm font-bold text-white">
              ▶
            </div>
            <span className="font-semibold">LTX-2 Studio</span>
            <Badge variant="secondary" className="ml-1">
              A100 · GPU
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <Card className="border-white/10 bg-card/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Generate a video</CardTitle>
            <CardDescription>
              Describe your scene. LTX-2 will create a video with synchronized
              audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                rows={4}
                value={prompt}
                disabled={busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A serene mountain landscape at sunset, cinematic drone shot…"
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
                      className={`rounded-lg border px-2 py-2 text-center text-sm transition ${
                        frames === d.frames
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-white/10 hover:border-white/20"
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
                      className={`rounded-lg border px-2 py-2 text-center text-sm transition ${
                        steps === q.steps
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-white/10 hover:border-white/20"
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
              <Button onClick={handleGenerate} className="w-full" size="lg">
                Generate video
              </Button>
            )}

            {phase === "running" && (
              <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{stage}</span>
                  <span className="font-semibold tabular-nums">{percent}%</span>
                </div>
                <Progress value={percent} />
                <p className="text-muted-foreground text-xs">
                  Keep this tab open — generation runs on the GPU and can take a
                  few minutes.
                </p>
              </div>
            )}

            {phase === "done" && jobId && (
              <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="text-lg">✓</span>
                  <span className="font-medium">Your video is ready!</span>
                </div>
                <Progress value={100} />
                <video
                  src={`/api/download?jobId=${jobId}`}
                  controls
                  className="w-full rounded-lg border border-white/10"
                />
                <div className="flex gap-2">
                  <a
                    href={`/api/download?jobId=${jobId}&dl=1`}
                    download
                    className={buttonVariants({ size: "lg", className: "flex-1" })}
                  >
                    Download MP4
                  </a>
                  <Button variant="outline" onClick={reset}>
                    Generate another
                  </Button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
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
