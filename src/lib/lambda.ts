import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { NodeSSH, type Config } from "node-ssh";

const HOST = process.env.LAMBDA_HOST ?? "";
const USER = process.env.LAMBDA_USER ?? "ubuntu";
const KEY_PATH = process.env.LAMBDA_KEY ?? "";
const KEY_CONTENTS = process.env.LAMBDA_KEY_CONTENTS ?? "";
const PY = process.env.LAMBDA_PYTHON ?? "~/ltxenv/bin/python";
const HOME = `/home/${USER}`;

/**
 * Build the SSH connection config. Prefers the key *contents* (works on Vercel
 * / serverless, set LAMBDA_KEY_CONTENTS) and falls back to a key file path
 * (handy for local dev, set LAMBDA_KEY).
 */
function connConfig(): Config {
  const base: Config = {
    host: HOST,
    username: USER,
    readyTimeout: 30000,
    keepaliveInterval: 10000,
  };

  if (KEY_CONTENTS.trim()) {
    // Some dashboards store newlines as the literal characters "\n".
    const normalized =
      KEY_CONTENTS.includes("\\n") && !KEY_CONTENTS.includes("\n")
        ? KEY_CONTENTS.replace(/\\n/g, "\n")
        : KEY_CONTENTS;
    return { ...base, privateKey: normalized };
  }
  return { ...base, privateKeyPath: KEY_PATH };
}

/** Open a connection, run `fn`, always dispose. */
async function withSSH<T>(fn: (ssh: NodeSSH) => Promise<T>): Promise<T> {
  const ssh = new NodeSSH();
  await ssh.connect(connConfig());
  try {
    return await fn(ssh);
  } finally {
    ssh.dispose();
  }
}

/** Start a generation job on the Lambda box. Returns a jobId. */
export async function startGeneration(
  prompt: string,
  frames = 97,
  steps = 30,
): Promise<string> {
  const jobId = Date.now().toString();
  const b64 = Buffer.from(prompt, "utf8").toString("base64");
  // setsid + full redirection detaches the job so it survives our disconnect.
  const startCmd =
    `cd ~ && echo ${b64} | base64 -d > /tmp/prompt_${jobId}.txt && ` +
    `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True setsid ${PY} ltx_generate.py ` +
    `"$(cat /tmp/prompt_${jobId}.txt)" --out output_${jobId}.mp4 ` +
    `--frames ${frames} --steps ${steps} > gen_${jobId}.log 2>&1 < /dev/null & echo STARTED`;

  // Fire the launch. The detached job can hold the channel open, so we cap the
  // wait and don't treat a timeout as a failure.
  const ssh = new NodeSSH();
  await ssh.connect(connConfig());
  try {
    await Promise.race([
      ssh.execCommand(startCmd),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  } finally {
    ssh.dispose();
  }

  // Verify the job really started by checking its log file appeared.
  await new Promise((r) => setTimeout(r, 2000));
  const ok = await withSSH(async (s) => {
    const { stdout } = await s.execCommand(
      `test -f ~/gen_${jobId}.log && echo YES || echo NO`,
    );
    return stdout.includes("YES");
  });
  if (!ok) throw new Error("Could not start the job on the GPU box");

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
  const log = await withSSH(async (s) => {
    const { stdout } = await s.execCommand(
      `cat ~/gen_${jobId}.log 2>/dev/null || echo __NOLOG__`,
    );
    return stdout;
  });

  if (log.trim() === "__NOLOG__") {
    return { percent: 1, stage: "Starting…", done: false, error: null };
  }

  const hasError =
    /Traceback \(most recent call last\)|OutOfMemoryError|RuntimeError|ModuleNotFoundError|ValueError/.test(
      log,
    ) && !/DONE! Video saved/.test(log);
  if (hasError) {
    const last = log.trim().split("\n").slice(-3).join(" ").slice(0, 240);
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
  await withSSH(async (s) => {
    await s.getFile(dest, `${HOME}/output_${jobId}.mp4`);
  });
  if (!fs.existsSync(dest)) throw new Error("Video file not found on the box");
  return dest;
}

/** Quick health check of the Lambda box. */
export async function checkMachine(): Promise<boolean> {
  try {
    return await withSSH(async (s) => {
      const { stdout } = await s.execCommand("echo ALIVE");
      return stdout.includes("ALIVE");
    });
  } catch {
    return false;
  }
}
