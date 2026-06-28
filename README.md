# LTX-2 Studio

A simple dark-themed web app to generate AI videos with **LTX-2** running on your
Lambda A100 GPU box. Login → **upload an image** → watch a live progress bar →
download the finished MP4 (with audio). The image is animated into a video
(image-to-video), with an optional motion prompt.

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

> The box must have `ltx_img2video.py` in the home directory (see `scripts/`)
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
| `/`                | Dashboard: image upload, motion prompt, progress bar, download |
| `/api/login`       | Validates credentials, sets an httpOnly session cookie         |
| `/api/generate`    | Uploads the image to the box, launches the job, returns jobId  |
| `/api/progress`    | Reads the job log on the box, returns `{percent, stage, done}` |
| `/api/download`    | `scp`s the finished video back and streams it to the browser   |
| `src/proxy.ts`     | Auth guard (Next 16 renamed "middleware" → "proxy")            |

## Deploying to Vercel

The backend talks to the Lambda box with the **`node-ssh`** library (pure JS, no
`ssh`/`scp` binary needed). Generation is fire-and-forget + polling, so request
handlers stay short. It works on Vercel as long as you provide the SSH key as an
env var.

**Set these Environment Variables** in the Vercel project (Production + Preview):

| Variable | Notes |
| --- | --- |
| `APP_EMAIL` | login email |
| `APP_PASSWORD` | login password |
| `AUTH_SECRET` | long random string |
| `LAMBDA_HOST` | Lambda instance IP |
| `LAMBDA_USER` | `ubuntu` |
| `LAMBDA_PYTHON` | `~/ltxenv/bin/python` |
| `LAMBDA_KEY_CONTENTS` | full contents of your `.pem` file (with newlines) |

> Locally you can use `LAMBDA_KEY` (a file path) instead of `LAMBDA_KEY_CONTENTS`.
> The code prefers `LAMBDA_KEY_CONTENTS` when set.

The Lambda box must be **running** for generation to work.

## Notes

- **Keep the Lambda box running** while using the app — it does the actual work.
- First generation after a box restart re-downloads model weights (~one-time).
- Each generation takes a few minutes depending on Duration/Quality.
- When you're done for good, **terminate** the Lambda instance to stop billing.
