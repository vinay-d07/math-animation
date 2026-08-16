from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .renderer import render_scene
from .validator import validate_scene

app = FastAPI(title="manim-render-worker")


class RenderRequest(BaseModel):
    scene_code: str
    scene_class: str
    quality: str = "low"


class ValidateRequest(BaseModel):
    scene_code: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/validate")
def validate(req: ValidateRequest):
    result = validate_scene(req.scene_code)
    return {"ok": result.ok, "reason": result.reason}


@app.post("/render")
def render(req: RenderRequest):
    result = render_scene(req.scene_code, req.scene_class, req.quality)

    if not result.success:
        return JSONResponse(
            status_code=422,
            content={"error": result.error, "duration_ms": result.duration_ms},
        )

    return FileResponse(
        result.video_path,
        media_type="video/mp4",
        filename=f"{req.scene_class}.mp4",
        headers={"X-Render-Duration-Ms": str(result.duration_ms)},
    )
