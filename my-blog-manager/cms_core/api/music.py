from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import html
import time
from typing import Any, Callable

from fastapi import APIRouter, Query
import requests

from cms_core.config_store import load_config

router = APIRouter()

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
}

PLATFORM_NAMES = {
    "wy": "网易云音乐",
    "tx": "QQ 音乐",
    "kg": "酷狗音乐",
    "kw": "酷我音乐",
    "mg": "咪咕音乐",
}


def _artist_names(items: Any) -> str:
    if not isinstance(items, list):
        return str(items or "未知歌手")
    names = [str(item.get("name", "")).strip() for item in items if isinstance(item, dict)]
    return " / ".join(name for name in names if name) or "未知歌手"


def _netease_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    songs = payload.get("result", {}).get("songs", [])
    results: list[dict[str, Any]] = []
    for song in songs if isinstance(songs, list) else []:
        song_id = str(song.get("id", "")).strip()
        if not song_id:
            continue
        album = song.get("album") or song.get("al") or {}
        artists = song.get("artists") or song.get("ar") or []
        results.append({
            "key": f"wy:{song_id}",
            "platform": "wy",
            "platformName": PLATFORM_NAMES["wy"],
            "id": song_id,
            "name": song.get("name") or "未知歌曲",
            "artist": _artist_names(artists),
            "album": album.get("name") or "未知专辑",
            "duration": int(song.get("duration") or song.get("dt") or 0),
            "cover": album.get("picUrl") or "",
            "sourceData": {"id": song_id},
        })
    return results


def _qq_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data", {})
    songs = data.get("song", {}).get("list", []) if isinstance(data, dict) else []
    results: list[dict[str, Any]] = []
    for song in songs if isinstance(songs, list) else []:
        song_mid = str(song.get("mid") or song.get("songmid") or "").strip()
        if not song_mid:
            continue
        album = song.get("album") if isinstance(song.get("album"), dict) else {}
        album_name = album.get("name") or song.get("albumname") or "未知专辑"
        singers = song.get("singer") or []
        duration_seconds = int(song.get("interval") or 0)
        album_mid = str(album.get("mid") or song.get("albummid") or "")
        results.append({
            "key": f"tx:{song_mid}",
            "platform": "tx",
            "platformName": PLATFORM_NAMES["tx"],
            "id": song_mid,
            "songmid": song_mid,
            "name": song.get("name") or song.get("songname") or "未知歌曲",
            "artist": _artist_names(singers),
            "album": album_name,
            "duration": duration_seconds * 1000,
            "cover": (
                f"https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg"
                if album_mid else ""
            ),
            "sourceData": {
                "songmid": song_mid,
                "strMediaMid": song.get("file", {}).get("media_mid", "")
                if isinstance(song.get("file"), dict) else "",
                "albumMid": album_mid,
            },
        })
    return results


def _kugou_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    songs = payload.get("data", {}).get("lists", [])
    results: list[dict[str, Any]] = []
    for song in songs if isinstance(songs, list) else []:
        song_id = str(song.get("EMixSongID") or song.get("MixSongID") or song.get("FileHash") or "").strip()
        if not song_id:
            continue
        image = str(song.get("Image") or "").replace("{size}", "400")
        results.append({
            "key": f"kg:{song_id}",
            "platform": "kg",
            "platformName": PLATFORM_NAMES["kg"],
            "id": song_id,
            "name": song.get("SongName") or "未知歌曲",
            "artist": song.get("SingerName") or "未知歌手",
            "album": song.get("AlbumName") or "未知专辑",
            "duration": int(song.get("Duration") or 0) * 1000,
            "cover": image,
            "sourceData": {
                "hash": song.get("FileHash") or "",
                "albumId": str(song.get("AlbumID") or ""),
                "mixSongId": song_id,
            },
        })
    return results


def _kuwo_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    songs = payload.get("abslist", [])
    results: list[dict[str, Any]] = []
    for song in songs if isinstance(songs, list) else []:
        if not isinstance(song, dict):
            continue
        music_rid = str(song.get("MUSICRID") or song.get("musicrid") or "").strip()
        song_id = music_rid.removeprefix("MUSIC_")
        if not song_id:
            continue
        image = str(song.get("web_albumpic_short") or song.get("albumpic") or "").strip()
        if image and not image.startswith(("http://", "https://")):
            image = f"https://img4.kuwo.cn/star/albumcover/500/{image.lstrip('/')}"
        results.append({
            "key": f"kw:{song_id}",
            "platform": "kw",
            "platformName": PLATFORM_NAMES["kw"],
            "id": song_id,
            "songmid": song_id,
            "name": html.unescape(str(song.get("SONGNAME") or song.get("songname") or "未知歌曲")),
            "artist": html.unescape(str(song.get("ARTIST") or song.get("artist") or "未知歌手")),
            "album": html.unescape(str(song.get("ALBUM") or song.get("album") or "未知专辑")),
            "duration": int(float(song.get("DURATION") or song.get("duration") or 0)) * 1000,
            "cover": image,
            "sourceData": {
                "rid": song_id,
                "musicrid": music_rid or f"MUSIC_{song_id}",
                "albumId": str(song.get("ALBUMID") or song.get("albumid") or ""),
            },
        })
    return results


def _migu_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    groups = payload.get("songResultData", {}).get("resultList", [])
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group in groups if isinstance(groups, list) else []:
        for song in group if isinstance(group, list) else []:
            if not isinstance(song, dict):
                continue
            song_id = str(song.get("songId") or "").strip()
            copyright_id = str(song.get("copyrightId") or "").strip()
            if not song_id or not copyright_id or copyright_id in seen:
                continue
            seen.add(copyright_id)
            raw_duration = int(float(song.get("duration") or 0))
            duration = raw_duration * 1000 if 0 < raw_duration < 10_000 else raw_duration
            image = str(song.get("img3") or song.get("img2") or song.get("img1") or "").strip()
            if image and not image.startswith(("http://", "https://")):
                image = f"https://d.musicapp.migu.cn/{image.lstrip('/')}"
            results.append({
                "key": f"mg:{copyright_id}",
                "platform": "mg",
                "platformName": PLATFORM_NAMES["mg"],
                "id": copyright_id,
                "songmid": song_id,
                "name": song.get("name") or "未知歌曲",
                "artist": _artist_names(song.get("singerList") or song.get("singers") or []),
                "album": song.get("album") or "未知专辑",
                "duration": duration,
                "cover": image,
                "sourceData": {
                    "copyrightId": copyright_id,
                    "songId": song_id,
                    "albumId": str(song.get("albumId") or ""),
                    "lrcUrl": song.get("lrcUrl") or "",
                },
            })
    return results


def _search_netease(query: str) -> list[dict[str, Any]]:
    response = requests.get(
        "https://music.163.com/api/search/get",
        params={"s": query, "type": 1, "limit": 12, "offset": 0},
        headers={**REQUEST_HEADERS, "Referer": "https://music.163.com/"},
        timeout=6,
    )
    response.raise_for_status()
    return _netease_results(response.json())


def _search_qq(query: str) -> list[dict[str, Any]]:
    response = requests.get(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp",
        params={
            "w": query, "p": 1, "n": 12, "format": "json", "new_json": 1,
            "platform": "yqq.json", "needNewCode": 0,
        },
        headers={**REQUEST_HEADERS, "Referer": "https://y.qq.com/"},
        timeout=6,
    )
    response.raise_for_status()
    return _qq_results(response.json())


def _search_kugou(query: str) -> list[dict[str, Any]]:
    response = requests.get(
        "https://songsearch.kugou.com/song_search_v2",
        params={"keyword": query, "page": 1, "pagesize": 12},
        headers={**REQUEST_HEADERS, "Referer": "https://www.kugou.com/"},
        timeout=6,
    )
    response.raise_for_status()
    return _kugou_results(response.json())


def _search_kuwo(query: str) -> list[dict[str, Any]]:
    response = requests.get(
        "https://search.kuwo.cn/r.s",
        params={
            "client": "kt", "all": query, "pn": 0, "rn": 12,
            "uid": "794762570", "ver": "kwplayer_ar_9.2.2.1", "vipver": 1,
            "show_copyright_off": 1, "newver": 1, "ft": "music", "cluster": 0,
            "strategy": 2012, "encoding": "utf8", "rformat": "json",
            "vermerge": 1, "mobi": 1, "issubtitle": 1,
        },
        headers={**REQUEST_HEADERS, "Referer": "https://www.kuwo.cn/"},
        timeout=8,
    )
    response.raise_for_status()
    return _kuwo_results(response.json())


def _search_migu(query: str) -> list[dict[str, Any]]:
    timestamp = str(int(time.time() * 1000))
    device_id = "963B7AA0D21511ED807EE5846EC87D20"
    signature = hashlib.md5(
        f"{query}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50{device_id}{timestamp}".encode(),
        usedforsecurity=False,
    ).hexdigest()
    response = requests.get(
        "https://jadeite.migu.cn/music_search/v3/search/searchAll",
        params={
            "isCorrect": 0,
            "isCopyright": 1,
            "searchSwitch": '{"song":1,"album":0,"singer":0,"tagSong":1,"mvSong":0,"bestShow":1,"songlist":0,"lyricSong":0}',
            "pageSize": 12,
            "text": query,
            "pageNo": 1,
            "sort": 0,
            "sid": "USS",
        },
        headers={
            "uiVersion": "A_music_3.6.1",
            "deviceId": device_id,
            "timestamp": timestamp,
            "sign": signature,
            "channel": "0146921",
            "User-Agent": "Mozilla/5.0 (Linux; Android 11; MI 11) AppleWebKit/537.36 Mobile Safari/537.36",
        },
        timeout=8,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != "000000":
        raise ValueError(payload.get("info") or "咪咕搜索失败")
    return _migu_results(payload)


SEARCHERS: dict[str, Callable[[str], list[dict[str, Any]]]] = {
    "wy": _search_netease,
    "tx": _search_qq,
    "kg": _search_kugou,
    "kw": _search_kuwo,
    "mg": _search_migu,
}


def _resolver_for(platform: str, sources: Any) -> tuple[str, str, int] | None:
    if not isinstance(sources, list):
        return None
    for index, source in enumerate(sources):
        if not isinstance(source, dict) or not source.get("enabled", False):
            continue
        platforms = source.get("platforms", [])
        if platform in platforms:
            return str(source.get("id", "")), str(source.get("name", "未命名音源")), index
    return None


def _match_rank(query: str, result: dict[str, Any]) -> int:
    needle = query.casefold().strip()
    name = str(result.get("name", "")).casefold().strip()
    artist = str(result.get("artist", "")).casefold().strip()
    if name == needle:
        return 0
    if name.startswith(needle):
        return 1
    if needle in name:
        return 2
    if needle in artist:
        return 3
    return 4


@router.get("/search")
def search_music(query: str = Query(..., min_length=1, max_length=80)):
    """并行查询多个平台，并按匹配度与已启用音源优先级排序。"""
    keyword = query.strip()
    if not keyword:
        return {"success": False, "message": "请输入歌曲名"}

    config = load_config()
    sources = config.get("musicSources", [])
    results: list[dict[str, Any]] = []
    errors: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=len(SEARCHERS)) as executor:
        futures = {executor.submit(searcher, keyword): platform for platform, searcher in SEARCHERS.items()}
        for future in as_completed(futures):
            platform = futures[future]
            try:
                platform_results = future.result()
                resolver = _resolver_for(platform, sources)
                for item in platform_results:
                    if resolver:
                        item["resolverSourceId"], item["resolverSourceName"], item["sourcePriority"] = resolver
                        item["playable"] = True
                    else:
                        item["resolverSourceId"] = ""
                        item["resolverSourceName"] = "未配置可用音源"
                        item["sourcePriority"] = 9999
                        item["playable"] = False
                results.extend(platform_results)
            except Exception as exc:
                errors[platform] = str(exc)

    results.sort(key=lambda item: (
        _match_rank(keyword, item),
        int(item.get("sourcePriority", 9999)),
        str(item.get("platform", "")),
        str(item.get("name", "")),
    ))
    return {"success": True, "data": results, "errors": errors}


@router.get("/query/{song_id}")
def query_netease_music(song_id: str):
    """通过网易云公开接口查询歌曲详情"""
    print(f"\n[API] 🎵 收到查询网易云音乐请求, ID: {song_id}")
    try:
        api_url = f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]"
        headers = {**REQUEST_HEADERS, "Referer": "https://music.163.com/"}
        response = requests.get(api_url, headers=headers, timeout=5)

        # 把 HTTP 状态码打出来，如果是 403 就是被网易云拦截了
        print(f"[API] 📡 网易云响应状态码: {response.status_code}")

        data = response.json()

        if data.get("songs") and len(data["songs"]) > 0:
            song = data["songs"][0]
            print(f"[API] ✅ 查询成功: {song['name']} - {song['artists'][0]['name']}")
            return {
                "success": True,
                "data": {
                    "id": song_id,
                    "name": song["name"],
                    "artist": song["artists"][0]["name"],
                    "album": song["album"]["name"],
                    "cover": song["album"]["picUrl"]
                }
            }
        print(f"[API] ❌ 查无此歌 (ID: {song_id})")
        return {"success": False, "message": "未找到该歌曲，可能是 VIP 歌曲或 ID 错误"}

    except Exception as e:
        # 【关键】：在终端里把真正的报错原因打印出来！
        print(f"[API] 💥 网易云接口发生严重错误: {str(e)}")
        return {"success": False, "message": f"后端请求失败: {str(e)}"}
