import os
import re
import secrets
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Body, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
import httpx

from cms_core.config_store import load_config

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
MAX_CROPPED_COVER_BYTES = 10 * 1024 * 1024
COVER_FILENAME = re.compile(r"^cover-\d{13}-[0-9a-f]{8}\.jpg$")


def atomic_write_bytes(destination: Path, content: bytes) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{destination.stem}-", suffix=".tmp", dir=destination.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, destination)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


@router.get("/covers/{filename}")
async def get_cropped_cover(filename: str):
    if not COVER_FILENAME.fullmatch(filename):
        raise HTTPException(status_code=404, detail="裁剪封面不存在")

    source = Path(PROJECT_ROOT) / "public" / "uploads" / "covers" / filename
    if not source.is_file():
        raise HTTPException(status_code=404, detail="裁剪封面不存在")

    return FileResponse(
        source,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/upload-cover")
async def upload_cropped_cover(file: UploadFile = File(...)):
    if file.content_type != "image/jpeg":
        raise HTTPException(status_code=400, detail="裁剪封面必须是 JPEG 图片")

    content = await file.read(MAX_CROPPED_COVER_BYTES + 1)
    if not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="裁剪封面必须是 JPEG 图片")
    if len(content) > MAX_CROPPED_COVER_BYTES:
        raise HTTPException(status_code=413, detail="裁剪封面不能超过 10MB")

    upload_dir = Path(PROJECT_ROOT) / "public" / "uploads" / "covers"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"cover-{int(time.time() * 1000)}-{secrets.token_hex(4)}.jpg"
    destination = upload_dir / filename
    runtime_public = Path(PROJECT_ROOT) / ".next" / "standalone" / "public"

    try:
        atomic_write_bytes(destination, content)
        if runtime_public.is_dir():
            atomic_write_bytes(runtime_public / "uploads" / "covers" / filename, content)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return {
        "success": True,
        "message": "裁剪封面已保存到本地资源目录",
        "url": f"/uploads/covers/{filename}",
        "runtimeMirrored": runtime_public.is_dir(),
    }


@router.post("/test")
async def test_picbed_connection(payload: dict = Body(...)):
    url = payload.get("url", "").strip().rstrip('/')
    token = payload.get("token", "").strip()

    if not url or not token:
        return {"success": False, "message": "图床 API 地址和 Token 不能为空"}

    test_endpoint = f"{url}/api/v1/profile"
    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    headers = {"Authorization": token, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(test_endpoint, headers=headers)
            if response.status_code != 200:
                return {"success": False, "message": f"校验失败，服务器返回了 {response.status_code} 错误"}

            data = response.json()
            if data.get("status") is True:
                user_email = data.get("data", {}).get("email", "未知用户")
                return {"success": True, "message": f"连接成功！当前账户: {user_email}"}
            else:
                return {"success": False, "message": f"Token 无效: {data.get('message', '未知错误')}"}
    except Exception as e:
        return {"success": False, "message": f"网络异常: {str(e)}"}


# 👇 【全新追加】：真实的图床图片上传接口
@router.post("/upload")
async def upload_image(
        file: UploadFile = File(...),
        url: str = Form(""),
        token: str = Form("")
):
    config = load_config()
    url = (url or str(config.get("picBedUrl", ""))).strip().rstrip('/')
    token = (token or str(config.get("picBedToken", ""))).strip()

    if not url or not token:
        return {"success": False, "message": "请先在设置中配置图床 API 地址和 Token"}

    if not token.startswith("Bearer "):
        token = f"Bearer {token}"

    upload_endpoint = f"{url}/api/v1/upload"
    headers = {
        "Authorization": token,
        "Accept": "application/json"
    }

    try:
        content = await file.read()
        # 封装为 httpx 支持的文件上传格式
        files = {'file': (file.filename, content, file.content_type)}

        # 上传图片可能较慢，将超时设置为 30 秒
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(upload_endpoint, headers=headers, files=files)

            if response.status_code != 200:
                return {"success": False, "message": f"上传失败，图床返回了 {response.status_code} 错误"}

            data = response.json()
            # 兼容 Lsky Pro 的返回格式
            if data.get("status") is True:
                img_url = data.get("data", {}).get("links", {}).get("url")
                return {"success": True, "message": "上传成功", "url": img_url}
            else:
                return {"success": False, "message": f"图床拒绝接收: {data.get('message', '未知')}"}
    except httpx.ReadTimeout:
        return {"success": False, "message": "图片上传超时，请检查网络或图片是否过大"}
    except Exception as e:
        return {"success": False, "message": f"服务器异常: {str(e)}"}
