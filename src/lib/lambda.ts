import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const HOST = process.env.LAMBDA_HOST ?? "";
const USER = process.env.LAMBDA_USER ?? "ubuntu";
const KEY = process.env.LAMBDA_KEY ?? "";
const PY = process.env.LAMBDA_PYTHON ?? "~/ltxenv/bin/python";

type RunResult = { code: number; stdout: string; stderr: string };

function run(cmd: string, args: string[], timeoutMs = 60000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function ssh(remoteCmd: string, timeoutMs = 60000): Promise<RunResult> {
  return run(
    "ssh",
    [
      "-i", KEY,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=30",
      "-o", "ServerAliveInterval=15",
      `${USER}@${HOST}`,
      remoteCmd,
    ],
    timeoutMs,
  );
}

/** Start a generation job on the Lambda box. Returns a jobId. */
export async function startGeneration(
  prompt: string,
  frames = 97,
  steps = 30,
): Promise<string> {
  const jobId = Date.now().toString();
  const b64 = Buffer.from(prompt, "utf8").toString("base64");
  // setsid fully detaches the process so the job keeps running after we
  // disconnect. ssh may not return promptly (the background process can hold
  // the channel), so we use a short timeout and then verify separately.
  const remote =
    `cd ~ && echo ${b64} | base64 -d > /tmp/prompt_${jobId}.txt && ` +
    `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True setsid ${PY} ltx_generate.py ` +
    `"$(cat /tmp/prompt_${jobId}.txt)" --out output_${jobId}.mp4 ` +
    `--frames ${frames} --steps ${steps} > gen_${jobId}.log 2>&1 < /dev/null & echo STARTED`;

  try {
    await ssh(remote, 12000);
  } catch {
    // Expected: the detached job keeps the channel open past our short timeout.
  }

  // Verify the job actually started by checking its log file appeared.
  await new Promise((r) => setTimeout(r, 2000));
  const { stdout } = await ssh(
    `test -f ~/gen_${jobId}.log && echo YES || echo NO`,
    25000,
  );
  if (!stdout.includes("YES")) {
    throw new Error("Could not start the job on the GPU box");
  }
  return jobId;
}

export type Progress = {
  percent: number;
  stage: string;
  done: boolean;
  error: string | null;
};

/** Read the remote log for a job and turn it into a progress value. */
export async function getProgress(jobId: string): Promise<Progress> {
  const { stdout } = await ssh(
    `cat ~/gen_${jobId}.log 2>/dev/null || echo __NOLOG__`,
    30000,
  );
  const log = stdout;

  if (log.includes("__NOLOG__") && log.trim() === "__NOLOG__") {
    return { percent: 1, stage: "Starting…", done: false, error: null };
  }

  // Error detection (ignore harmless warnings).
  const hasError =
    /Traceback \(most recent call last\)|OutOfMemoryError|RuntimeError|ModuleNotFoundError|ValueError/.test(
      log,
    ) && !/DONE! Video saved/.test(log);
  if (hasError) {
    const lines = log.trim().split("\n");
    const last = lines.slice(-3).join(" ").slice(0, 240);
    return { percent: 0, stage: "Failed", done: false, error: last };
  }

  if (/DONE! Video saved/.test(log)) {
    return { percent: 100, stage: "Done", done: true, error: null };
  }
  if (/Saving to|Encoding video/.test(log)) {
    return { percent: 92, stage: "Saving video…", done: false, error: null };
  }
  if (/Generating video \+ audio/.test(log)) {
    const genPart = log.split("Generating video + audio")[1] ?? "";
    const matches = [...genPart.matchAll(/(\d+)\/(\d+)\s*\[/g)];
    const last = matches[matches.length - 1];
    if (last) {
      const cur = Number(last[1]);
      const total = Number(last[2]);
      const percent = Math.min(90, 12 + Math.round((72 * cur) / total));
      return {
        percent,
        stage: `Generating frames ${cur}/${total}`,
        done: false,
        error: null,
      };
    }
    return { percent: 12, stage: "Generating…", done: false, error: null };
  }
  if (/Loading/.test(log)) {
    return { percent: 6, stage: "Loading model…", done: false, error: null };
  }
  return { percent: 2, stage: "Starting…", done: false, error: null };
}

/** Copy the finished video locally and return the temp path. */
export async function downloadVideo(jobId: string): Promise<string> {
  const dest = path.join(os.tmpdir(), `ltx_${jobId}.mp4`);
  const { code, stderr } = await run(
    "scp",
    [
      "-i", KEY,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=30",
      `${USER}@${HOST}:~/output_${jobId}.mp4`,
      dest,
    ],
    180000,
  );
  if (code !== 0) throw new Error(`scp failed: ${stderr}`);
  return dest;
}

/** Quick health check of the Lambda box. */
export async function checkMachine(): Promise<boolean> {
  try {
    const { stdout } = await ssh("echo ALIVE", 20000);
    return stdout.includes("ALIVE");
  } catch {
    return false;
  }
}
