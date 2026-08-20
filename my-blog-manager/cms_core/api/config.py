from typing import Any, Dict

from fastapi import APIRouter, Body

from cms_core.config_store import apply_updates, load_config


router = APIRouter()


@router.get("/get")
def get_site_config():
    try:
        return {"success": True, "data": load_config()}
    except Exception as exc:
        return {"success": False, "message": f"读取配置失败: {exc}"}


@router.post("/update")
def update_site_config(payload: Dict[str, Any] = Body(...)):
    updates = payload.get("updates", {})
    if not isinstance(updates, dict) or not updates:
        return {"success": False, "message": "没有收到需要更新的数据"}

    try:
        _, applied = apply_updates(updates)
        if not applied:
            return {"success": False, "message": "没有可写入的有效配置字段"}
        return {
            "success": True,
            "message": f"本地配置已更新：{', '.join(applied)}",
            "applied": applied,
        }
    except Exception as exc:
        return {"success": False, "message": f"配置写入失败: {exc}"}
