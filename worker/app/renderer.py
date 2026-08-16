"""Runs a single Manim scene in a subprocess and locates its rendered mp4.

Phase 0 scope: this process trusts its input (a developer-authored hardcoded
scene, dispatched by the Node orchestrator) — it is NOT yet safe to feed
arbitrary AI-generated code. The subprocess timeout and non-root container
user are baseline hygiene, not a security boundary. Real isolation
(Firecracker/E2B, no network egress, AST-validated input) is a Phase 1
requirement before untrusted code reaches this function.
"""

import glob
import os
import subprocess
import time
import uuid
from dataclasses import dataclass, field

QUALITY_FLAGS = {"low": "-ql", "high": "-qh"}
RENDER_ROOT = "/tmp/renders"


@dataclass
class RenderResult:
    success: bool
    duration_ms: int
    video_path: str | None = None
    error: str | None = None


def render_scene(scene_code: str, scene_class: str, quality: str = "low", timeout: int = 90) -> RenderResult:
    job_dir = os.path.join(RENDER_ROOT, uuid.uuid4().hex)
    os.makedirs(job_dir, exist_ok=True)

    scene_path = os.path.join(job_dir, "scene.py")
    with open(scene_path, "w", encoding="utf-8") as f:
        f.write(scene_code)

    media_dir = os.path.join(job_dir, "media")
    quality_flag = QUALITY_FLAGS.get(quality, "-ql")

    start = time.time()
    try:
        proc = subprocess.run(
            [
                "manim",
                "render",
                quality_flag,
                scene_path,
                scene_class,
                "--media_dir",
                media_dir,
                "--disable_caching",
            ],
            cwd=job_dir,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return RenderResult(
            success=False,
            duration_ms=int((time.time() - start) * 1000),
            error=f"Render timed out after {timeout}s",
        )

    duration_ms = int((time.time() - start) * 1000)

    if proc.returncode != 0:
        return RenderResult(success=False, duration_ms=duration_ms, error=proc.stderr[-4000:])

    pattern = os.path.join(media_dir, "videos", "**", f"{scene_class}.mp4")
    matches = glob.glob(pattern, recursive=True)
    # manim's ffmpeg combine step can finish writing the final file a moment
    # after the "manim" process itself has exited, especially under the CPU
    # cap on this container. Give it a brief window to land before giving up.
    wait_deadline = time.time() + 5
    while not matches and time.time() < wait_deadline:
        time.sleep(0.25)
        matches = glob.glob(pattern, recursive=True)

    if not matches:
        return RenderResult(
            success=False,
            duration_ms=duration_ms,
            error="manim exited successfully but no output mp4 was found",
        )

    return RenderResult(success=True, duration_ms=duration_ms, video_path=matches[0])
