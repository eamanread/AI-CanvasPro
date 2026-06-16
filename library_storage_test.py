import os
import tempfile
import unittest
from unittest import mock

from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_connection_state,
    library_status,
    machine_id,
    migrate_into_library,
    next_gen_filename,
    parse_gen_seq,
    validate_library_dir,
    resolve_startup_library_dir,
)


class DeriveLibraryPathsTest(unittest.TestCase):
    def test_all_paths_are_under_library_dir_with_expected_layout(self):
        root = os.path.abspath(os.path.join(os.sep, "nas", "team-lib"))
        paths = derive_library_paths(root)

        self.assertEqual(paths["assetsDir"], os.path.join(root, "assets"))
        self.assertEqual(
            paths["assetThumbsDir"], os.path.join(root, "assets", "thumbs")
        )
        self.assertEqual(paths["workflowsDir"], os.path.join(root, "workflows"))
        self.assertEqual(
            paths["workflowThumbsDir"], os.path.join(root, "workflows", "thumbs")
        )
        self.assertEqual(paths["outputDir"], os.path.join(root, "output"))
        self.assertEqual(paths["uploadsDir"], os.path.join(root, "uploads"))
        self.assertEqual(
            paths["presetDefinitionsPath"],
            os.path.join(root, "presets", "prompt-presets.json"),
        )
        self.assertEqual(
            paths["presetRootDir"], os.path.join(root, "presets", "prompt")
        )

        # 全部子路径必须真的落在 root 之下
        root_prefix = root if root.endswith(os.sep) else root + os.sep
        for key, value in paths.items():
            self.assertTrue(
                value.startswith(root_prefix),
                f"{key}={value} should be under {root}",
            )


class ValidateLibraryDirTest(unittest.TestCase):
    def test_empty_or_none_raises(self):
        with self.assertRaises(ValueError):
            validate_library_dir("", "/home/user")
        with self.assertRaises(ValueError):
            validate_library_dir(None, "/home/user")
        with self.assertRaises(ValueError):
            validate_library_dir("   ", "/home/user")

    def test_rejects_same_as_user_dir(self):
        with tempfile.TemporaryDirectory() as user_dir:
            with self.assertRaises(ValueError):
                validate_library_dir(user_dir, user_dir)

    def test_rejects_library_nested_inside_user_dir(self):
        with tempfile.TemporaryDirectory() as user_dir:
            nested = os.path.join(user_dir, "shared")
            with self.assertRaises(ValueError):
                validate_library_dir(nested, user_dir)

    def test_rejects_user_dir_nested_inside_library(self):
        with tempfile.TemporaryDirectory() as parent:
            library = os.path.join(parent, "lib")
            user_dir = os.path.join(library, "user")
            with self.assertRaises(ValueError):
                validate_library_dir(library, user_dir)

    def test_accepts_unrelated_path_and_returns_abspath(self):
        with tempfile.TemporaryDirectory() as user_dir:
            with tempfile.TemporaryDirectory() as library:
                normalized = validate_library_dir(library, user_dir)
                self.assertEqual(normalized, os.path.abspath(library))

    def test_accepts_chinese_and_spaces(self):
        result = validate_library_dir(
            os.path.join(os.sep, "挂载点", "团队 共享库"),
            os.path.join(os.sep, "home", "user"),
        )
        self.assertTrue(result.endswith(os.path.join("挂载点", "团队 共享库")))

    def test_accepts_unc_path(self):
        # UNC \\nas\share 不应被拒绝；abspath 在任意平台都保留可识别的 share 段。
        unc = r"\\nas\team-share"
        result = validate_library_dir(unc, os.path.join(os.sep, "home", "user"))
        self.assertIn("team-share", result)


class LibraryStatusTest(unittest.TestCase):
    def test_nonexistent_dir_degrades_safely(self):
        missing = os.path.join(tempfile.gettempdir(), "huanying-no-such-lib-xyz-987")
        self.assertFalse(os.path.exists(missing))

        status = library_status(missing)
        self.assertFalse(status["reachable"])
        self.assertFalse(status["writable"])
        self.assertEqual(
            status["counts"], {"assets": 0, "workflows": 0, "presets": 0}
        )
        # 不可达即 reachable=False —— server.py 启动期据此判定"未连接、不回退"
        self.assertIs(status["reachable"], False)

    def test_empty_input_degrades_safely(self):
        status = library_status("")
        self.assertFalse(status["reachable"])
        self.assertFalse(status["writable"])
        self.assertEqual(
            status["counts"], {"assets": 0, "workflows": 0, "presets": 0}
        )

    def test_reachable_writable_dir_counts_preset_like_files(self):
        with tempfile.TemporaryDirectory() as root:
            paths = derive_library_paths(root)
            os.makedirs(paths["assetsDir"], exist_ok=True)
            os.makedirs(paths["workflowsDir"], exist_ok=True)
            os.makedirs(os.path.join(root, "presets"), exist_ok=True)

            with open(os.path.join(paths["assetsDir"], "a.json"), "w") as f:
                f.write("{}")
            with open(os.path.join(paths["assetsDir"], "note.txt"), "w") as f:
                f.write("hi")
            with open(os.path.join(paths["workflowsDir"], "w.json"), "w") as f:
                f.write("{}")
            with open(
                os.path.join(root, "presets", "prompt-presets.json"), "w"
            ) as f:
                f.write("{}")

            status = library_status(root)
            self.assertTrue(status["reachable"])
            self.assertTrue(status["writable"])
            self.assertEqual(status["counts"]["assets"], 2)
            self.assertEqual(status["counts"]["workflows"], 1)
            self.assertEqual(status["counts"]["presets"], 1)
            # 写探针必须自清理
            self.assertFalse(
                os.path.exists(os.path.join(root, ".huanying_probe"))
            )


class LibraryConnectionStateTest(unittest.TestCase):
    def test_disabled_when_dir_empty(self):
        state = library_connection_state("")
        self.assertFalse(state["enabled"])
        self.assertFalse(state["connected"])
        self.assertFalse(state["disconnected"])
        self.assertEqual(state["libraryDir"], "")
        self.assertFalse(state["status"]["reachable"])

    def test_disabled_when_dir_none(self):
        state = library_connection_state(None)
        self.assertFalse(state["enabled"])
        self.assertFalse(state["connected"])
        self.assertFalse(state["disconnected"])

    def test_configured_but_unreachable_is_disconnected_not_fallback(self):
        missing = os.path.join(
            tempfile.gettempdir(), "huanying-no-such-lib-conn-state-555"
        )
        self.assertFalse(os.path.exists(missing))

        state = library_connection_state(missing)
        # 配了库 -> enabled，但目录不可达 -> disconnected（绝不静默当成"没配库"）
        self.assertTrue(state["enabled"])
        self.assertFalse(state["connected"])
        self.assertTrue(state["disconnected"])
        self.assertEqual(state["libraryDir"], missing)
        self.assertFalse(state["status"]["reachable"])

    def test_configured_and_reachable_is_connected(self):
        with tempfile.TemporaryDirectory() as root:
            state = library_connection_state(root)
            self.assertTrue(state["enabled"])
            self.assertTrue(state["connected"])
            self.assertFalse(state["disconnected"])
            self.assertEqual(state["libraryDir"], os.path.abspath(root))
            self.assertTrue(state["status"]["reachable"])

    def test_status_payload_is_library_status_shape(self):
        with tempfile.TemporaryDirectory() as root:
            state = library_connection_state(root)
            self.assertEqual(
                set(state["status"].keys()),
                {"reachable", "writable", "counts"},
            )
            self.assertEqual(
                set(state["status"]["counts"].keys()),
                {"assets", "workflows", "presets"},
            )


class MachineIdTest(unittest.TestCase):
    def test_only_allowed_charset_and_length(self):
        mid = machine_id()
        self.assertTrue(mid)
        self.assertLessEqual(len(mid), 12)
        self.assertRegex(mid, r"^[a-z0-9-]+$")

    def test_sanitizes_messy_hostname(self):
        with mock.patch(
            "services.library_storage.socket.gethostname",
            return_value="DESKTOP_办公室.Local",
        ):
            mid = machine_id()
        self.assertRegex(mid, r"^[a-z0-9-]+$")
        self.assertLessEqual(len(mid), 12)
        self.assertTrue(mid.startswith("desktop"))

    def test_empty_hostname_falls_back_to_host(self):
        with mock.patch(
            "services.library_storage.socket.gethostname", return_value=""
        ):
            self.assertEqual(machine_id(), "host")

    def test_all_invalid_hostname_falls_back_to_host(self):
        with mock.patch(
            "services.library_storage.socket.gethostname", return_value="办公室"
        ):
            self.assertEqual(machine_id(), "host")


class AtomicReplaceWithRetryTest(unittest.TestCase):
    def test_succeeds_after_two_permission_errors(self):
        calls = {"n": 0}

        def fake_replace(src, dst):
            calls["n"] += 1
            if calls["n"] <= 2:
                raise PermissionError("locked by another machine")
            return None

        with mock.patch(
            "services.library_storage.os.replace", side_effect=fake_replace
        ), mock.patch("services.library_storage.time.sleep") as sleep_mock:
            atomic_replace_with_retry(
                "tmp", "dst", attempts=5, base_delay=0.01
            )

        self.assertEqual(calls["n"], 3)
        # 两次失败 -> 两次退避 sleep
        self.assertEqual(sleep_mock.call_count, 2)

    def test_raises_after_exhausting_attempts(self):
        with mock.patch(
            "services.library_storage.os.replace",
            side_effect=PermissionError("still locked"),
        ), mock.patch("services.library_storage.time.sleep"):
            with self.assertRaises(PermissionError):
                atomic_replace_with_retry(
                    "tmp", "dst", attempts=3, base_delay=0.01
                )

    def test_first_attempt_success_does_not_sleep(self):
        with mock.patch(
            "services.library_storage.os.replace", return_value=None
        ) as replace_mock, mock.patch(
            "services.library_storage.time.sleep"
        ) as sleep_mock:
            atomic_replace_with_retry("tmp", "dst")
        self.assertEqual(replace_mock.call_count, 1)
        self.assertEqual(sleep_mock.call_count, 0)


class ResolveStartupLibraryDirTest(unittest.TestCase):
    def test_missing_key_returns_empty(self):
        with tempfile.TemporaryDirectory() as user_dir:
            self.assertEqual(resolve_startup_library_dir({}, user_dir), "")

    def test_empty_value_returns_empty(self):
        with tempfile.TemporaryDirectory() as user_dir:
            self.assertEqual(
                resolve_startup_library_dir({"libraryDir": ""}, user_dir), ""
            )
            self.assertEqual(
                resolve_startup_library_dir({"libraryDir": "   "}, user_dir), ""
            )

    def test_none_settings_returns_empty(self):
        with tempfile.TemporaryDirectory() as user_dir:
            self.assertEqual(resolve_startup_library_dir(None, user_dir), "")

    def test_valid_value_returns_abspath(self):
        with tempfile.TemporaryDirectory() as user_dir:
            with tempfile.TemporaryDirectory() as library:
                result = resolve_startup_library_dir(
                    {"libraryDir": library}, user_dir
                )
                self.assertEqual(result, os.path.abspath(library))

    def test_illegal_nested_value_is_swallowed_to_empty(self):
        # 库目录嵌套在 user_dir 内 -> validate_library_dir 抛 ValueError,
        # resolve 必须吞成 "" (启动期不能因配置非法而崩)。
        with tempfile.TemporaryDirectory() as user_dir:
            nested = os.path.join(user_dir, "shared")
            self.assertEqual(
                resolve_startup_library_dir({"libraryDir": nested}, user_dir), ""
            )


class DeriveLibraryPathsServerWiringContractTests(unittest.TestCase):
    """钉死 server.py _refresh_storage_globals 启用库时的键<->全局映射。

    server.py 无法直接单测；本契约测确保 derive_library_paths 暴露的键
    恰好覆盖 server 要替换的 6 个存储全局所需的键，且都落在库根下。
    """

    # server.py 启用库时覆盖的全局 -> 它从 derive_library_paths 取的键
    #   ASSETS_DIR          <- assetsDir
    #   ASSET_THUMBS_DIR    <- assetThumbsDir
    #   WORKFLOWS_DIR       <- workflowsDir
    #   WORKFLOW_THUMBS_DIR <- workflowThumbsDir
    #   OUTPUT_DIR          <- outputDir
    #   UPLOADS_DIR         <- uploadsDir
    REQUIRED_KEYS = (
        "assetsDir",
        "assetThumbsDir",
        "workflowsDir",
        "workflowThumbsDir",
        "outputDir",
        "uploadsDir",
    )

    def setUp(self):
        self.library_dir = os.path.abspath(os.path.join("X:", "team-share", "幻映库"))
        self.paths = derive_library_paths(self.library_dir)

    def test_derive_exposes_every_key_server_uses_to_override_storage_globals(self):
        for key in self.REQUIRED_KEYS:
            with self.subTest(key=key):
                self.assertIn(
                    key,
                    self.paths,
                    f"server.py _refresh_storage_globals 需要 derive_library_paths()['{key}']",
                )

    def test_overridden_paths_are_all_inside_library_dir(self):
        root = os.path.abspath(self.library_dir)
        for key in self.REQUIRED_KEYS:
            with self.subTest(key=key):
                value = os.path.abspath(self.paths[key])
                self.assertTrue(
                    value == root or value.startswith(root + os.sep),
                    f"{key}={value} 必须落在库根 {root} 下",
                )

    def test_thumbs_dirs_nest_under_their_parent_dirs(self):
        self.assertTrue(
            os.path.abspath(self.paths["assetThumbsDir"]).startswith(
                os.path.abspath(self.paths["assetsDir"]) + os.sep
            ),
            "assetThumbsDir 必须在 assetsDir 之下",
        )
        self.assertTrue(
            os.path.abspath(self.paths["workflowThumbsDir"]).startswith(
                os.path.abspath(self.paths["workflowsDir"]) + os.sep
            ),
            "workflowThumbsDir 必须在 workflowsDir 之下",
        )


class NextGenFilenameTest(unittest.TestCase):
    def test_includes_machine_prefix_and_zero_pads_seq(self):
        name = next_gen_filename("deskabc123", "20260616", 7, "png")
        self.assertEqual(name, "gen_deskabc123_20260616_0007.png")

    def test_different_machine_ids_produce_different_prefixes(self):
        a = next_gen_filename("alpha", "20260616", 1, "png")
        b = next_gen_filename("bravo", "20260616", 1, "png")
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("gen_alpha_"))
        self.assertTrue(b.startswith("gen_bravo_"))

    def test_same_prefix_seq_increments_monotonically(self):
        first = next_gen_filename("alpha", "20260616", 4, "png")
        second = next_gen_filename("alpha", "20260616", 5, "png")
        n1 = parse_gen_seq(first, "alpha", "20260616")
        n2 = parse_gen_seq(second, "alpha", "20260616")
        self.assertEqual(n1, 4)
        self.assertEqual(n2, 5)
        self.assertGreater(n2, n1)

    def test_ext_leading_dot_is_normalized(self):
        # 调用方既可能传 "png" 也可能传 ".png"，结果不能出现两个点。
        self.assertEqual(
            next_gen_filename("alpha", "20260616", 1, ".png"),
            "gen_alpha_20260616_0001.png",
        )

    def test_roundtrips_through_parse_gen_seq(self):
        name = next_gen_filename("nodexyz", "20260616", 42, "mp4")
        self.assertEqual(parse_gen_seq(name, "nodexyz", "20260616"), 42)

    def test_filename_contains_literal_dot_before_ext(self):
        # §H bug guard: 产出文件名中扩展名前必须有字面点号，绝不出现 "...0001png"。
        name = next_gen_filename("alpha", "20260616", 1, "png")
        base, _, ext = name.rpartition(".")
        self.assertTrue(base, "文件名必须含点号")
        self.assertEqual(ext, "png")

    def test_uppercase_ext_is_lowercased(self):
        # _normalize_ext 文档说"转小写"，此前代码缺 .lower()；
        # 大写扩展名会让 parse_gen_seq 的 [a-z0-9] 正则匹配失败，round-trip 断裂。
        name = next_gen_filename("alpha", "20260616", 1, "PNG")
        self.assertEqual(name, "gen_alpha_20260616_0001.png")

    def test_uppercase_ext_roundtrips_through_parse_gen_seq(self):
        # 用大写扩展名生成文件名后，parse_gen_seq 仍能正确解析序号。
        name = next_gen_filename("alpha", "20260616", 1, "PNG")
        self.assertEqual(parse_gen_seq(name, "alpha", "20260616"), 1)


class ParseGenSeqTest(unittest.TestCase):
    def test_matches_own_machine_prefix(self):
        self.assertEqual(
            parse_gen_seq("gen_alpha_20260616_0009.png", "alpha", "20260616"),
            9,
        )

    def test_ignores_other_machine_prefix(self):
        # 别机的文件不能算进本机序号，否则会被跨机拉高。
        self.assertIsNone(
            parse_gen_seq("gen_bravo_20260616_9999.png", "alpha", "20260616")
        )

    def test_accepts_legacy_no_prefix_name(self):
        # 升级前的历史文件 gen_{date}_{seq} 没有机器段，本机仍应认领，避免重号。
        self.assertEqual(
            parse_gen_seq("gen_20260616_0003.png", "alpha", "20260616"),
            3,
        )

    def test_rejects_other_date(self):
        self.assertIsNone(
            parse_gen_seq("gen_alpha_20260101_0003.png", "alpha", "20260616")
        )

    def test_rejects_non_gen_name(self):
        self.assertIsNone(
            parse_gen_seq("random_file.png", "alpha", "20260616")
        )

    def test_rejects_non_numeric_seq(self):
        self.assertIsNone(
            parse_gen_seq("gen_alpha_20260616_abcd.png", "alpha", "20260616")
        )

    def test_machine_id_with_dash_is_matched_literally(self):
        # machine_id 允许含 '-'，正则必须按字面转义，不当成元字符。
        self.assertEqual(
            parse_gen_seq("gen_desk-01_20260616_0005.png", "desk-01", "20260616"),
            5,
        )


class MigrateIntoLibraryTest(unittest.TestCase):
    def _seed_local(self, base):
        """造一个假的本机库布局，返回 previous_paths。"""
        user = os.path.join(base, "user")
        prompt = os.path.join(user, "prompt")
        assets = os.path.join(base, "data", "assets")
        workflows = os.path.join(base, "data", "workflows")
        output = os.path.join(base, "output")
        uploads = os.path.join(base, "data", "uploads")
        for d in (prompt, os.path.join(assets, "thumbs"), workflows, output, uploads):
            os.makedirs(d, exist_ok=True)

        def _w(path, text):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)

        _w(os.path.join(assets, "a1.json"), '{"name":"a1"}')
        _w(os.path.join(assets, "thumbs", "a1.png"), "PNGDATA")
        _w(os.path.join(workflows, "w1.json"), '{"flow":1}')
        _w(os.path.join(user, "prompt-presets.json"), '{"presets":[]}')
        _w(os.path.join(prompt, "p1.txt"), "你好 prompt")
        _w(os.path.join(output, "gen_001.png"), "OUT")
        _w(os.path.join(uploads, "u1.bin"), "UP")

        return {
            "userDir": user,
            "outputDir": output,
            "uploadsDir": uploads,
            "assetsDir": assets,
            "workflowsDir": workflows,
            "presetDefinitionsPath": os.path.join(user, "prompt-presets.json"),
            "presetRootDir": prompt,
        }

    def test_copies_assets_workflows_presets_output_uploads(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)

            result = migrate_into_library(previous, library)

            # assets（含 thumbs 子目录）
            self.assertTrue(
                os.path.isfile(os.path.join(library["assetsDir"], "a1.json"))
            )
            self.assertTrue(
                os.path.isfile(
                    os.path.join(library["assetThumbsDir"], "a1.png")
                )
            )
            # workflows
            self.assertTrue(
                os.path.isfile(os.path.join(library["workflowsDir"], "w1.json"))
            )
            # presets：整表文件 + 逐 txt prompt 目录
            self.assertTrue(os.path.isfile(library["presetDefinitionsPath"]))
            self.assertTrue(
                os.path.isfile(os.path.join(library["presetRootDir"], "p1.txt"))
            )
            # 本机 output / uploads
            self.assertTrue(
                os.path.isfile(os.path.join(library["outputDir"], "gen_001.png"))
            )
            self.assertTrue(
                os.path.isfile(os.path.join(library["uploadsDir"], "u1.bin"))
            )
            self.assertGreater(result["copied"], 0)
            self.assertFalse(result["cancelled"])

    def test_does_not_rewrite_json_bytes(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)
            migrate_into_library(previous, library)

            with open(
                os.path.join(library["assetsDir"], "a1.json"),
                "r",
                encoding="utf-8",
            ) as f:
                self.assertEqual(f.read(), '{"name":"a1"}')
            with open(
                library["presetDefinitionsPath"], "r", encoding="utf-8"
            ) as f:
                self.assertEqual(f.read(), '{"presets":[]}')

    def test_idempotent_second_run_copies_nothing_and_keeps_content(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)

            first = migrate_into_library(previous, library)
            self.assertGreater(first["copied"], 0)

            second = migrate_into_library(previous, library)
            self.assertEqual(second["copied"], 0)
            self.assertGreater(second["skipped"], 0)

    def test_existing_destination_file_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)

            # 库里先放一份不同内容的同名文件
            os.makedirs(library["assetsDir"], exist_ok=True)
            preexisting = os.path.join(library["assetsDir"], "a1.json")
            with open(preexisting, "w", encoding="utf-8") as f:
                f.write('{"name":"KEEP-ME"}')

            migrate_into_library(previous, library)

            with open(preexisting, "r", encoding="utf-8") as f:
                self.assertEqual(f.read(), '{"name":"KEEP-ME"}')

    def test_progress_callback_fires_per_step(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)

            events = []
            migrate_into_library(
                previous, library, progress=lambda ev: events.append(ev)
            )
            steps = {ev["step"] for ev in events}
            self.assertIn("assets", steps)
            self.assertIn("workflows", steps)
            self.assertIn("presets-prompt", steps)
            self.assertIn("output", steps)
            self.assertIn("uploads", steps)

    def test_cancelled_stops_before_remaining_steps(self):
        with tempfile.TemporaryDirectory() as local, \
             tempfile.TemporaryDirectory() as lib:
            previous = self._seed_local(local)
            library = derive_library_paths(lib)

            # 第一个单元(assets)开始前就取消：库里应一片空白
            result = migrate_into_library(
                previous, library, cancelled=lambda: True
            )
            self.assertTrue(result["cancelled"])
            self.assertFalse(
                os.path.exists(os.path.join(library["assetsDir"], "a1.json"))
            )
            self.assertFalse(
                os.path.exists(os.path.join(library["workflowsDir"], "w1.json"))
            )

    def test_missing_source_dirs_are_skipped_safely(self):
        with tempfile.TemporaryDirectory() as lib:
            library = derive_library_paths(lib)
            # 全部源路径指向不存在的位置
            ghost = os.path.join(tempfile.gettempdir(), "huanying-ghost-src-xyz")
            previous = {
                "userDir": ghost,
                "outputDir": os.path.join(ghost, "output"),
                "uploadsDir": os.path.join(ghost, "uploads"),
                "assetsDir": os.path.join(ghost, "assets"),
                "workflowsDir": os.path.join(ghost, "workflows"),
                "presetDefinitionsPath": os.path.join(ghost, "prompt-presets.json"),
                "presetRootDir": os.path.join(ghost, "prompt"),
            }
            result = migrate_into_library(previous, library)
            self.assertEqual(result["copied"], 0)
            self.assertFalse(result["cancelled"])


if __name__ == "__main__":
    unittest.main()
