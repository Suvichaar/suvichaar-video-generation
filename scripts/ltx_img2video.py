#!/usr/bin/env python
"""LTX-2 image-to-video generator (single-stage, memory-safe for 40GB GPUs).

Usage:
    python ltx_img2video.py --image input.png --prompt "gentle motion" --out out.mp4
"""
import argparse
import torch
from diffusers.pipelines.ltx2 import LTX2ImageToVideoPipeline
from diffusers.pipelines.ltx2.export_utils import encode_video
from diffusers.utils import load_image

p = argparse.ArgumentParser()
p.add_argument("--image", required=True)        # path to the input image
p.add_argument("--prompt", default="")          # optional: describe the motion
p.add_argument("--out", default="output.mp4")
p.add_argument("--maxside", type=int, default=704)  # longest output side (px)
p.add_argument("--frames", type=int, default=97)    # divisible by 8, +1
p.add_argument("--steps", type=int, default=30)
p.add_argument("--fps", type=float, default=24.0)
p.add_argument("--seed", type=int, default=42)
args = p.parse_args()

device = "cuda:0"
neg = ("shaky, glitchy, low quality, worst quality, deformed, distorted, disfigured, "
       "motion smear, motion artifacts, fused fingers, bad anatomy, weird hand, ugly, "
       "transition, static.")

# Load the image and derive an output size that keeps its aspect ratio and is
# divisible by 32 (a model requirement).
img = load_image(args.image)
w, h = img.size
scale = args.maxside / max(w, h)
W = max(32, round(w * scale / 32) * 32)
H = max(32, round(h * scale / 32) * 32)
print(f">>> Input {w}x{h} -> output {W}x{H}", flush=True)

print(">>> Loading LTX-2 image-to-video (weights cached, quick)...", flush=True)
pipe = LTX2ImageToVideoPipeline.from_pretrained(
    "Lightricks/LTX-2", torch_dtype=torch.bfloat16
)
pipe.enable_sequential_cpu_offload(device=device)
pipe.vae.enable_slicing()

gen = torch.Generator().manual_seed(args.seed)

print(">>> Generating video + audio from image...", flush=True)
video, audio = pipe(
    image=img,
    prompt=args.prompt, negative_prompt=neg,
    width=W, height=H,
    num_frames=args.frames, frame_rate=args.fps,
    num_inference_steps=args.steps,
    guidance_scale=4.0, generator=gen,
    output_type="np", return_dict=False,
)

print(f">>> Saving to {args.out} ...", flush=True)
encode_video(
    video[0], fps=args.fps,
    audio=audio[0].float().cpu(),
    audio_sample_rate=pipe.vocoder.config.output_sampling_rate,
    output_path=args.out,
)
print(f">>> DONE! Video saved: {args.out}", flush=True)
