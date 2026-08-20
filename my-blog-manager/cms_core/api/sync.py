import os
import shutil
import json
from pathlib import Path
from fastapi import APIRouter, Request

from cms_core.config_store import load_config, write_typescript

router = APIRouter()

# 动态定位 Manager 根目录
CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
DEPLOY_CONFIG_FILE = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")

# 需要镜像覆盖的文件夹 (先清空目标，再全量复制)
SYNC_DIRS = ["posts", "chatters", "moments", "public/uploads/covers"]
# 需要精确覆盖的单文件
SYNC_FILES = [
    "app/about/about.md",
    "data/albums.ts",
    "data/friends.ts",
    "data/projects.ts",
    "siteConfig.ts"
]


def is_safe_blog_dir(target_path):
    """Validate the exact frontend module before destructive mirroring."""
    if not target_path:
        return False
    resolved = os.path.realpath(target_path)
    if resolved == os.path.realpath(PROJECT_ROOT):
        return False
    package_path = os.path.join(resolved, "package.json")
    required = ["app", "components", "siteConfig.ts"]
    if not os.path.isfile(package_path) or not all(os.path.exists(os.path.join(resolved, item)) for item in required):
        return False
    try:
        with open(package_path, "r", encoding="utf-8") as handle:
            return json.load(handle).get("name") == "yukiblogs"
    except (OSError, json.JSONDecodeError):
        return False


def get_configured_blog_path():
    try:
        with open(DEPLOY_CONFIG_FILE, "r", encoding="utf-8") as handle:
            return str(json.load(handle).get("blogPath", "")).strip()
    except (OSError, json.JSONDecodeError):
        return ""


def sync_about_to_configured_blog():
    """Mirror the published About document to the configured frontend source."""
    target_path = get_configured_blog_path()
    if not is_safe_blog_dir(target_path):
        return False, "前端路径尚未配置或校验失败"

    source = os.path.join(PROJECT_ROOT, "app", "about", "about.md")
    destination = os.path.join(os.path.realpath(target_path), "app", "about", "about.md")
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    shutil.copy2(source, destination)
    return True, destination


def delete_moment_from_configured_blog(moment_id):
    """Delete only the matching moment from the configured frontend source."""
    target_path = get_configured_blog_path()
    if not is_safe_blog_dir(target_path):
        return False, "前端路径尚未配置或校验失败"

    target_root = os.path.realpath(target_path)
    removed = []
    for relative in [
        os.path.join("moments", f"{moment_id}.md"),
        os.path.join("posts", "moments", f"{moment_id}.md"),
    ]:
        candidate = os.path.join(target_root, relative)
        if os.path.isfile(candidate):
            os.remove(candidate)
            removed.append(candidate)
    return True, removed


def delete_document_from_configured_blog(doc_type, document_id):
    """Delete one post or chatter from the configured frontend source."""
    target_path = get_configured_blog_path()
    if not is_safe_blog_dir(target_path):
        return False, "前端路径尚未配置或校验失败"
    if doc_type not in {"post", "chatter"}:
        return False, "文档类型不支持同步删除"

    folder = "posts" if doc_type == "post" else "chatters"
    candidate = os.path.join(os.path.realpath(target_path), folder, f"{document_id}.md")
    if os.path.isfile(candidate):
        os.remove(candidate)
        return True, candidate
    return True, "前端文件已不存在"


@router.post("/check")
async def check_blog_path(request: Request):
    """检测目标路径是否合法且具备基本结构"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        if not target_path or not os.path.exists(target_path):
            return {"success": False, "message": "🚫 目标物理路径不存在，请检查输入！"}

        if not is_safe_blog_dir(target_path):
            return {"success": False,
                    "message": "⚠️ 危险！目标路径未检测到 package.json，似乎不是一个有效的前端项目，已拦截操作。"}

        missing = []
        for d in ["posts", "data", "app"]:
            if not os.path.exists(os.path.join(target_path, d)):
                missing.append(d)

        if missing:
            return {"success": True,
                    "message": f"✅ 路径安全。但目标缺失以下文件夹：{', '.join(missing)}。同步时将自动创建。"}

        return {"success": True, "message": "✅ 路径校验通过，目录结构完美！"}
    except Exception as e:
        return {"success": False, "message": f"校验异常: {str(e)}"}


@router.post("/execute")
async def execute_sync(request: Request):
    """执行物理覆盖同步"""
    try:
        payload = await request.json()
        target_path = payload.get("blogPath", "").strip()

        success, message = sync_blog_tree(target_path)
        return {"success": success, "message": message}
    except Exception as e:
        return {"success": False, "message": f"同步过程中发生致命错误: {str(e)}"}


def sync_blog_tree(target_path):
    """Mirror manager content and sanitized configuration into the frontend source tree."""
    try:

        if not is_safe_blog_dir(target_path):
            return False, "安全拦截：目标路径不合法！"

        target_path = os.path.realpath(target_path)

        # 1. 同步文件夹 (先彻底删除目标文件夹，再把 Manager 的复制过去)
        for d in SYNC_DIRS:
            src_dir = os.path.join(PROJECT_ROOT, d)
            dst_dir = os.path.join(target_path, d)

            if os.path.exists(src_dir):
                if os.path.exists(dst_dir):
                    shutil.rmtree(dst_dir)
                shutil.copytree(src_dir, dst_dir)

        # 2. 同步单个文件 (直接覆盖或过滤)
        for f in SYNC_FILES:
            src_file = os.path.join(PROJECT_ROOT, f.replace("/", os.sep))
            dst_file = os.path.join(target_path, f.replace("/", os.sep))

            if os.path.exists(src_file):
                os.makedirs(os.path.dirname(dst_file), exist_ok=True)

                # Generate the public configuration from canonical JSON.
                if f == "siteConfig.ts":
                    write_typescript(Path(dst_file), load_config(), include_private=False)
                else:
                    # 其他普通文件，直接物理拷贝
                    shutil.copy2(src_file, dst_file)

        return True, "🎉 所有文章与公开配置已镜像到前端源码。"
    except Exception as e:
        return False, f"同步过程中发生致命错误: {str(e)}"
