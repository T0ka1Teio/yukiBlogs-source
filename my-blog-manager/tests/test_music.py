import unittest

from cms_core.api.music import (
    _kugou_results,
    _kuwo_results,
    _migu_results,
    _netease_results,
    _qq_results,
    _resolver_for,
)


class MusicNormalizationTests(unittest.TestCase):
    def test_netease_results_are_normalized(self):
        results = _netease_results({
            "result": {
                "songs": [{
                    "id": 42,
                    "name": "夜曲",
                    "artists": [{"name": "周杰伦"}],
                    "album": {"name": "十一月的萧邦", "picUrl": "https://img.test/42.jpg"},
                    "duration": 226000,
                }]
            }
        })
        self.assertEqual(results[0]["key"], "wy:42")
        self.assertEqual(results[0]["artist"], "周杰伦")
        self.assertEqual(results[0]["duration"], 226000)

    def test_qq_new_json_results_keep_source_fields(self):
        results = _qq_results({
            "data": {
                "song": {
                    "list": [{
                        "mid": "song-mid",
                        "name": "夜曲",
                        "singer": [{"name": "周杰伦"}],
                        "album": {"name": "十一月的萧邦", "mid": "album-mid"},
                        "interval": 226,
                        "file": {"media_mid": "media-mid"},
                    }]
                }
            }
        })
        self.assertEqual(results[0]["key"], "tx:song-mid")
        self.assertEqual(results[0]["sourceData"]["strMediaMid"], "media-mid")
        self.assertEqual(results[0]["duration"], 226000)

    def test_kugou_results_keep_hash_for_lx_resolver(self):
        results = _kugou_results({
            "data": {
                "lists": [{
                    "EMixSongID": "mix-id",
                    "FileHash": "file-hash",
                    "SongName": "夜曲",
                    "SingerName": "周杰伦",
                    "Duration": 226,
                }]
            }
        })
        self.assertEqual(results[0]["key"], "kg:mix-id")
        self.assertEqual(results[0]["sourceData"]["hash"], "file-hash")

    def test_kuwo_results_keep_rid_for_lx_resolver(self):
        results = _kuwo_results({
            "abslist": [{
                "MUSICRID": "MUSIC_123456",
                "SONGNAME": "夜曲",
                "ARTIST": "周杰伦",
                "ALBUM": "十一月的萧邦",
                "ALBUMID": "album-id",
                "DURATION": "226",
            }]
        })
        self.assertEqual(results[0]["key"], "kw:123456")
        self.assertEqual(results[0]["songmid"], "123456")
        self.assertEqual(results[0]["sourceData"]["rid"], "123456")
        self.assertEqual(results[0]["duration"], 226000)

    def test_migu_results_keep_song_and_copyright_ids(self):
        results = _migu_results({
            "songResultData": {
                "resultList": [[{
                    "songId": "song-id",
                    "copyrightId": "copyright-id",
                    "name": "夜曲",
                    "singerList": [{"name": "周杰伦"}],
                    "album": "十一月的萧邦",
                    "albumId": "album-id",
                    "duration": 226000,
                    "img3": "https://img.test/migu.jpg",
                }]],
            }
        })
        self.assertEqual(results[0]["key"], "mg:copyright-id")
        self.assertEqual(results[0]["songmid"], "song-id")
        self.assertEqual(results[0]["sourceData"]["copyrightId"], "copyright-id")
        self.assertEqual(results[0]["duration"], 226000)

    def test_resolver_uses_enabled_source_order(self):
        sources = [
            {"id": "off", "name": "关闭", "enabled": False, "platforms": ["wy"]},
            {"id": "first", "name": "第一音源", "enabled": True, "platforms": ["tx", "wy"]},
            {"id": "second", "name": "第二音源", "enabled": True, "platforms": ["wy"]},
        ]
        self.assertEqual(_resolver_for("wy", sources), ("first", "第一音源", 1))
        self.assertIsNone(_resolver_for("kg", sources))


if __name__ == "__main__":
    unittest.main()
