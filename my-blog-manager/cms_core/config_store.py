"""Canonical yukiBlogs configuration storage and TypeScript rendering."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Mapping


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "data" / "site_config.json"
MANAGER_TS_PATH = PROJECT_ROOT / "siteConfig.ts"
DEFAULT_CONFIG_PATH = PROJECT_ROOT.parent / "scripts" / "siteConfig.defaults.json"

PRIVATE_KEYS = {"picBedName", "picBedUrl", "picBedToken"}
VALID_ROOT_KEYS = {
    "title", "siteUrl", "authorName", "bio", "avatarUrl", "useGradient", "themeColors",
    "bgImages", "defaultPostCover", "photoWallImage", "cloudMusicIds", "social",
    "counts", "chatterTitle", "chatterDescription", "picBedName", "picBedUrl",
    "picBedToken", "danmakuList", "gitalkConfig", "buildDate", "footerBadges",
    "icpConfig", "geminiConfig", "faviconUrl", "navTitle", "navSuffix",
    "navAfter", "friendLinkApplyFormat", "enableLevelSystem",
}


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    if not path.exists():
        if not DEFAULT_CONFIG_PATH.exists():
            raise FileNotFoundError(f"Missing configuration template: {DEFAULT_CONFIG_PATH}")
        with DEFAULT_CONFIG_PATH.open("r", encoding="utf-8") as handle:
            defaults = json.load(handle)
        if not isinstance(defaults, dict):
            raise ValueError("siteConfig.defaults.json must contain an object")
        atomic_write_json(path, defaults)

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("site_config.json must contain an object")
    return data


def atomic_write_json(path: Path, data: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def public_config(config: Mapping[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in config.items() if key not in PRIVATE_KEYS}
    gitalk = result.get("gitalkConfig")
    if isinstance(gitalk, dict):
        result["gitalkConfig"] = {
            key: value for key, value in gitalk.items() if key != "clientSecret"
        }
    return result


def render_typescript(config: Mapping[str, Any], *, include_private: bool = True) -> str:
    rendered = dict(config) if include_private else public_config(config)
    body = json.dumps(rendered, ensure_ascii=False, indent=2)
    return (
        "// Generated from data/site_config.json by cms_core.config_store.\n"
        "// Edit through the yukiBlogs manager instead of editing this file directly.\n"
        f"export const siteConfig = {body};\n"
    )


def write_typescript(path: Path, config: Mapping[str, Any], *, include_private: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = render_typescript(config, include_private=include_private)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def apply_updates(
    updates: Mapping[str, Any],
    *,
    config_path: Path = CONFIG_PATH,
    manager_ts_path: Path = MANAGER_TS_PATH,
) -> tuple[dict[str, Any], list[str]]:
    config = load_config(config_path)
    applied: list[str] = []
    for key, value in updates.items():
        if key in VALID_ROOT_KEYS:
            config[key] = value
            applied.append(key)
    atomic_write_json(config_path, config)
    write_typescript(manager_ts_path, config, include_private=True)
    return config, applied
