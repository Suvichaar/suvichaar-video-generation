# LTX-2 Studio

A simple dark-themed web app to generate AI videos with **LTX-2** running on your
Lambda A100 GPU box. Login → type a prompt → watch a live progress bar → download
the finished MP4 (with audio).

Built with **Next.js 16**, **shadcn/ui**, and a Node backend that talks to the GPU
box over SSH.

---

## 1. Login credentials

Set in `.env.local` (change anytime):

```
Email:    admin@suvichaar.com
Password: ltx@2026
```

## 2. Configure the GPU box

Also in `.env.local`:

```
LAMBDA_HOST=161.118.162.41          # your Lambda instance IP
LAMBDA_USER=ubuntu
LAMBDA_KEY=/Users/kumarmayank/Downloads/LTX.pem   # your SSH key
LAMBDA_PYTHON=~/ltxenv/bin/python    # python env on the box (already set up)
```

> The box must have `ltx_generate.py` in the home directory (already uploaded)
> and the `ltxenv` Python environment with diffusers/LTX-2 installed.

## 3. Run the app

```bash
npm run dev
```

Open **http://localhost:3000** → sign in → generate.

For production:

```bash
npm run build
npm start
```

---

## How it works

| Route              | Purpose                                                        |
| ------------------ | ------------------------------------------------------------- |
| `/login`           | Single-user login (email + password from `.env.local`)        |
| `/`                | Dashboard: prompt, duration/quality, progress bar, download   |
| `/api/login`       | Validates credentials, sets an httpOnly session cookie         |
| `/api/generate`    | SSHes into the box and launches a generation job, returns jobId|
| `/api/progress`    | Reads the job log on the box, returns `{percent, stage, done}` |
| `/api/download`    | `scp`s the finished video back and streams it to the browser   |
| `src/proxy.ts`     | Auth guard (Next 16 renamed "middleware" → "proxy")            |

## Deploying to Vercel ⚠️

This app's backend uses **SSH/scp** to talk to the Lambda box, with the SSH key
read from a local file path (`LAMBDA_KEY`). That works great locally, but **will
not work as-is on Vercel** because:

- Serverless functions have no persistent `.pem` file on disk.
- They have short execution limits (long generations would time out).
- `ssh`/`scp` binaries aren't available in the serverless runtime.

To deploy on Vercel you'd need to adapt the backend, e.g.:

- Use an SSH library (`node-ssh`) and pass the **private key contents** via an
  env var (`LAMBDA_KEY_CONTENTS`) instead of a file path.
- Run generation as fire-and-forget + poll (already the pattern here), and keep
  request handlers short.
- Or put a small API server on the Lambda box itself and have Vercel just call it.

Until then, **running locally (`npm run dev`) is the supported path.**

## Notes

- **Keep the Lambda box running** while using the app — it does the actual work.
- First generation after a box restart re-downloads model weights (~one-time).
- Each generation takes a few minutes depending on Duration/Quality.
- When you're done for good, **terminate** the Lambda instance to stop billing.
