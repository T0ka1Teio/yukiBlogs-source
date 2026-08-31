import asyncio
import ipaddress
import os
import re
import secrets
import socket
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

from fastapi import APIRouter, Body, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import FileResponse, Response
import httpx

from cms_core.config_store import load_config

router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
MAX_CROPPED_COVER_BYTES = 10 * 1024 * 1024
MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024
COVER_FILENAME = re.compile(r"^cover-\d{13}-[0-9a-f]{8}\.jpg$")
DESKTOP_PROXY_FAKE_IP_NETWORK = ipaddress.ip_network("198.18.0.0/15")
PICBED_PROVIDER_DUSAYS = "dusays"
PICBED_PROVIDER_CLOUDFLARE_IMGBED = "cloudflare-imgbed"
SUPPORTED_PICBED_PROVIDERS = {
    PICBED_PROVIDER_DUSAYS,
    PICBED_PROVIDER_CLOUDFLARE_IMGBED,
}
INVALID_UPLOAD_PATH_CHARS = re.compile(r'''[\\:*?"'<>| ()\[\]{}#%^`~;@&=+$,]''')
MAX_DIRECTORY_SUGGESTIONS = 500


def normalize_picbed_provider(value: object) -> str:
    provider = str(value or PICBED_PROVIDER_DUSAYS).strip().lower()
    return provider if provider in SUPPORTED_PICBED_PROVIDERS else PICBED_PROVIDER_DUSAYS


def with_bearer_token(token: str) -> str:
    token = token.strip()
    return token if token.startswith("Bearer ") else f"Bearer {token}"


def get_picbed_profile(config: dict, provider: str) -> dict[str, str]:
    profiles = config.get("picBedProfiles")
    if isinstance(profiles, dict) and isinstance(profiles.get(provider), dict):
        profile = profiles[provider]
        return {
            "url": str(profile.get("url", "")).strip().rstrip("/"),
            "token": str(profile.get("token", "")).strip(),
        }

    # Backward compatibility for the original single Dusays configuration.
    if provider == PICBED_PROVIDER_DUSAYS:
        return {
            "url": str(config.get("picBedUrl", "")).strip().rstrip("/"),
            "token": str(config.get("picBedToken", "")).strip(),
        }
    return {"url": "", "token": ""}


def build_picbed_test_endpoint(base_url: str, provider: str) -> str:
    if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED:
        return f"{base_url}/api/manage/list?start=0&count=1"
    return f"{base_url}/api/v1/profile"


def normalize_cloud_path(value: object) -> str:
    """Return the user-facing absolute path used by the upload path combobox."""
    raw_path = str(value or "").strip().replace("\\", "/")
    if not raw_path or raw_path == "/":
        return "/"

    segments: list[str] = []
    for segment in raw_path.split("/"):
        segment = segment.strip()
        if not segment:
            continue
        if segment in {".", ".."} or ".." in segment:
            raise ValueError("上传路径不能包含 . 或 ..")
        if any(ord(character) < 32 for character in segment):
            raise ValueError("上传路径不能包含控制字符")
        sanitized = INVALID_UPLOAD_PATH_CHARS.sub("_", segment)
        if sanitized:
            segments.append(sanitized)

    return f"/{'/'.join(segments)}" if segments else "/"


def build_picbed_upload_endpoint(base_url: str, provider: str, upload_path: object = "/") -> str:
    if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED:
        endpoint = f"{base_url}/upload?uploadChannel=cfr2&returnFormat=full&autoRetry=false"
        normalized_path = normalize_cloud_path(upload_path)
        if normalized_path != "/":
            endpoint += f"&uploadFolder={quote(normalized_path.lstrip('/'), safe='/')}"
        return endpoint
    return f"{base_url}/api/v1/upload"


def flatten_cloudflare_directory_tree(data: object) -> list[str]:
    if not isinstance(data, dict) or not isinstance(data.get("tree"), dict):
        return ["/"]

    paths = {"/"}

    def visit(node: object) -> None:
        if not isinstance(node, dict):
            return
        raw_path = node.get("path")
        if isinstance(raw_path, str) and raw_path.strip("/"):
            try:
                paths.add(normalize_cloud_path(raw_path))
            except ValueError:
                pass
        children = node.get("children")
        if isinstance(children, list):
            for child in children:
                visit(child)

    visit(data["tree"])
    return sorted(paths, key=lambda path: (path != "/", path.casefold()))


async def fetch_cloudflare_directories(base_url: str, token: str) -> list[str]:
    headers = {"Authorization": with_bearer_token(token), "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=12.0) as client:
        tree_response = await client.get(
            f"{base_url}/api/directoryTree?cacheTime=0",
            headers=headers,
        )
        if tree_response.status_code == 200:
            paths = flatten_cloudflare_directory_tree(tree_response.json())
            if len(paths) > 1:
                return paths[:MAX_DIRECTORY_SUGGESTIONS]

        # Older deployments may not expose directoryTree. Walk the management
        # list endpoint so the combobox still receives existing nested paths.
        paths = {"/"}
        pending = [""]
        visited: set[str] = set()
        while pending and len(paths) < MAX_DIRECTORY_SUGGESTIONS:
            directory = pending.pop(0)
            if directory in visited:
                continue
            visited.add(directory)
            list_endpoint = (
                f"{base_url}/api/manage/list?start=0&count=1"
                f"&dir={quote(directory, safe='/')}"
            )
            response = await client.get(list_endpoint, headers=headers)
            if response.status_code != 200:
                if not directory:
                    raise HTTPException(
                        status_code=502,
                        detail=f"读取云端路径失败，图床返回 HTTP {response.status_code}",
                    )
                continue
            payload = response.json()
            raw_directories = payload.get("directories") if isinstance(payload, dict) else None
            if not isinstance(raw_directories, list):
                continue
            for raw_directory in raw_directories:
                if not isinstance(raw_directory, str):
                    continue
                try:
                    normalized = normalize_cloud_path(raw_directory)
                except ValueError:
                    continue
                if normalized == "/" or normalized in paths:
                    continue
                paths.add(normalized)
                pending.append(normalized.lstrip("/") + "/")

        return sorted(paths, key=lambda path: (path != "/", path.casefold()))


def parse_picbed_upload_response(data: object, provider: str, base_url: str) -> str | None:
    if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED:
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        item = data[0]
        image_url = item.get("publicUrl") or item.get("src")
        if not isinstance(image_url, str) or not image_url.strip():
            return None
        return urljoin(f"{base_url}/", image_url.strip())

    if not isinstance(data, dict) or data.get("status") is not True:
        return None
    image_url = data.get("data", {}).get("links", {}).get("url")
    return image_url if isinstance(image_url, str) and image_url.strip() else None


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


async def validate_public_image_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="仅支持 HTTP 或 HTTPS 图片链接")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="图片链接不能包含登录凭据")

    try:
        addresses = [ipaddress.ip_address(parsed.hostname)]
        hostname_is_literal = True
    except ValueError:
        hostname_is_literal = False
        try:
            loop = asyncio.get_running_loop()
            records = await loop.getaddrinfo(
                parsed.hostname,
                parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
            addresses = list({ipaddress.ip_address(record[4][0]) for record in records})
        except (OSError, ValueError) as error:
            raise HTTPException(status_code=502, detail="无法解析图片服务器地址") from error

    def is_allowed_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        if address.is_global:
            return True
        # Transparent desktop proxies such as Clash use RFC 2544's benchmark
        # range as synthetic DNS answers. Only permit it when it came from a
        # hostname lookup; a user-supplied literal 198.18/15 address stays blocked.
        return (
            not hostname_is_literal
            and isinstance(address, ipaddress.IPv4Address)
            and address in DESKTOP_PROXY_FAKE_IP_NETWORK
        )

    if not addresses or any(not is_allowed_address(address) for address in addresses):
        raise HTTPException(status_code=400, detail="图片链接不能指向本机或内网地址")


async def save_cropped_asset(file: UploadFile, folder: str, prefix: str, label: str):
    if file.content_type != "image/jpeg":
        raise HTTPException(status_code=400, detail=f"裁剪{label}必须是 JPEG 图片")

    content = await file.read(MAX_CROPPED_COVER_BYTES + 1)
    if not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail=f"裁剪{label}必须是 JPEG 图片")
    if len(content) > MAX_CROPPED_COVER_BYTES:
        raise HTTPException(status_code=413, detail=f"裁剪{label}不能超过 10MB")

    upload_dir = Path(PROJECT_ROOT) / "public" / "uploads" / folder
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{prefix}-{int(time.time() * 1000)}-{secrets.token_hex(4)}.jpg"
    destination = upload_dir / filename
    runtime_public = Path(PROJECT_ROOT) / ".next" / "standalone" / "public"

    try:
        atomic_write_bytes(destination, content)
        if runtime_public.is_dir():
            atomic_write_bytes(runtime_public / "uploads" / folder / filename, content)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return {
        "success": True,
        "message": f"裁剪{label}已保存到本地资源目录",
        "url": f"/uploads/{folder}/{filename}",
        "runtimeMirrored": runtime_public.is_dir(),
    }


@router.get("/proxy-image")
async def proxy_image(url: str = Query(..., min_length=8, max_length=4096)):
    """Read a public image through the local backend so browser canvas remains CORS-safe."""
    current_url = url.strip()
    headers = {
        "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "yukiBlogs-Manager/1.0",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            for _ in range(6):
                await validate_public_image_url(current_url)
                async with client.stream("GET", current_url, headers=headers) as remote:
                    if remote.status_code in {301, 302, 303, 307, 308}:
                        location = remote.headers.get("location")
                        if not location:
                            raise HTTPException(status_code=502, detail="图片服务器返回了无效跳转")
                        current_url = urljoin(current_url, location)
                        continue

                    if remote.status_code != 200:
                        raise HTTPException(
                            status_code=502,
                            detail=f"图片服务器返回 HTTP {remote.status_code}",
                        )

                    content_type = remote.headers.get("content-type", "").split(";", 1)[0].lower()
                    if not content_type.startswith("image/"):
                        raise HTTPException(status_code=415, detail="链接返回的内容不是图片")

                    content_length = remote.headers.get("content-length")
                    if content_length and int(content_length) > MAX_REMOTE_IMAGE_BYTES:
                        raise HTTPException(status_code=413, detail="远程图片不能超过 20MB")

                    chunks = []
                    total = 0
                    async for chunk in remote.aiter_bytes():
                        total += len(chunk)
                        if total > MAX_REMOTE_IMAGE_BYTES:
                            raise HTTPException(status_code=413, detail="远程图片不能超过 20MB")
                        chunks.append(chunk)

                    return Response(
                        content=b"".join(chunks),
                        media_type=content_type,
                        headers={"Cache-Control": "private, max-age=300"},
                    )

            raise HTTPException(status_code=508, detail="图片链接跳转次数过多")
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"远程图片读取失败: {error}") from error


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
    return await save_cropped_asset(file, "covers", "cover", "封面")


@router.post("/test")
async def test_picbed_connection(payload: dict = Body(...)):
    provider = normalize_picbed_provider(payload.get("provider"))
    url = payload.get("url", "").strip().rstrip('/')
    token = payload.get("token", "").strip()

    if not url or not token:
        return {"success": False, "message": "图床 API 地址和 Token 不能为空"}

    test_endpoint = build_picbed_test_endpoint(url, provider)
    headers = {"Authorization": with_bearer_token(token), "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(test_endpoint, headers=headers)
            if response.status_code != 200:
                if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED and response.status_code in {401, 403}:
                    return {
                        "success": False,
                        "message": "Token 无效，或没有 upload 与 list 权限",
                    }
                return {"success": False, "message": f"校验失败，服务器返回了 {response.status_code} 错误"}

            data = response.json()
            if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED:
                if isinstance(data, dict) and ("files" in data or "totalCount" in data):
                    total_count = data.get("totalCount", 0)
                    return {
                        "success": True,
                        "message": f"连接成功！CloudFlare-ImgBed 当前索引 {total_count} 个对象",
                    }
                return {"success": False, "message": "服务响应格式不符合 CloudFlare-ImgBed 接口"}

            if isinstance(data, dict) and data.get("status") is True:
                user_email = data.get("data", {}).get("email", "未知用户")
                return {"success": True, "message": f"连接成功！当前账户: {user_email}"}
            message = data.get("message", "未知错误") if isinstance(data, dict) else "响应格式错误"
            return {"success": False, "message": f"Token 无效: {message}"}
    except Exception as e:
        return {"success": False, "message": f"网络异常: {str(e)}"}


@router.get("/directories")
async def list_picbed_directories():
    config = load_config()
    provider = normalize_picbed_provider(config.get("picBedProvider"))
    profile = get_picbed_profile(config, provider)

    if provider != PICBED_PROVIDER_CLOUDFLARE_IMGBED:
        return {
            "success": True,
            "paths": ["/"],
            "message": "当前图床不提供目录读取接口，仍可使用根目录上传",
        }
    if not profile["url"] or not profile["token"]:
        return {"success": False, "paths": ["/"], "message": "请先在设置中配置图床 API 地址和 Token"}

    try:
        paths = await fetch_cloudflare_directories(profile["url"], profile["token"])
        return {"success": True, "paths": paths}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"读取云端路径失败: {error}") from error


# 👇 【全新追加】：真实的图床图片上传接口
@router.post("/upload")
async def upload_image(
        file: UploadFile = File(...),
        url: str = Form(""),
        token: str = Form(""),
        provider: str = Form(""),
        path: str = Form("/")
):
    config = load_config()
    provider = normalize_picbed_provider(provider or config.get("picBedProvider"))
    profile = get_picbed_profile(config, provider)
    url = (url or profile["url"]).strip().rstrip('/')
    token = (token or profile["token"]).strip()

    if not url or not token:
        return {"success": False, "message": "请先在设置中配置图床 API 地址和 Token"}

    try:
        normalized_path = normalize_cloud_path(path if isinstance(path, str) else "/")
        upload_endpoint = build_picbed_upload_endpoint(url, provider, normalized_path)
    except ValueError as error:
        return {"success": False, "message": str(error)}
    headers = {
        "Authorization": with_bearer_token(token),
        "Accept": "application/json"
    }

    try:
        content = await file.read()
        # 封装为 httpx 支持的文件上传格式
        files = {'file': (file.filename, content, file.content_type)}

        # 上传图片可能较慢，将超时设置为 30 秒
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(upload_endpoint, headers=headers, files=files)

            if not 200 <= response.status_code < 300:
                return {"success": False, "message": f"上传失败，图床返回了 {response.status_code} 错误"}

            data = response.json()
            img_url = parse_picbed_upload_response(data, provider, url)
            if img_url:
                return {
                    "success": True,
                    "message": "上传成功",
                    "url": img_url,
                    "path": normalized_path,
                }
            if provider == PICBED_PROVIDER_CLOUDFLARE_IMGBED:
                return {"success": False, "message": "CloudFlare-ImgBed 未返回有效图片链接"}
            message = data.get("message", "未知") if isinstance(data, dict) else "响应格式错误"
            return {"success": False, "message": f"图床拒绝接收: {message}"}
    except httpx.ReadTimeout:
        return {"success": False, "message": "图片上传超时，请检查网络或图片是否过大"}
    except Exception as e:
        return {"success": False, "message": f"服务器异常: {str(e)}"}
