from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import re

# 引入所有 API 路由
from cms_core.api import music, config, picbed, drafts, moments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy

app = FastAPI(title="yukiBlogs CMS Backend", version="1.0.0")

LOCAL_ORIGIN = re.compile(r"^https?://(?:localhost|127\.0\.0\.1):\d+$")


def is_allowed_origin(origin: str | None) -> bool:
    return origin is None or bool(LOCAL_ORIGIN.fullmatch(origin))


@app.middleware("http")
async def reject_nonlocal_browser_origins(request, call_next):
    if not is_allowed_origin(request.headers.get("origin")):
        return JSONResponse({"detail": "Origin is not allowed"}, status_code=403)
    return await call_next(request)

# The desktop frontend runs on a random local port; only loopback origins are accepted.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.get("/api/status")
def get_status():
    return {"status": "online", "message": "中枢神经已连接"}

# 注册所有路由
app.include_router(music.router, prefix="/api/music", tags=["Music"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(picbed.router, prefix="/api/picbed", tags=["PicBed"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["Gallery"])
app.include_router(friends.router, prefix="/api/friends", tags=["Friends"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(moments.router, prefix="/api/moments", tags=["Moments"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["Deploy"])
