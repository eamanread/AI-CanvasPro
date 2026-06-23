# NAS 团队共享库（方案乙/4.2-B）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 让幻映团队把资产/工作流/预设+其配套媒体(output/uploads)统一存到一个 NAS 共享文件夹，多人共用一份库；不裂图、无需 app 鉴权、管理员手动备份。

**Architecture:** 新逻辑集中在新模块 `services/library_storage.py`（纯函数、可单测），`server.py` 只做薄包装调用——对齐仓库"可测服务+薄 server"既有模式。库目录启用时，资产/工作流/缩略图/output/uploads/预设路径全部派生自单一 `LIBRARY_DIR` 全局并经 `_refresh_storage_globals` 运行时刷新。

**Tech Stack:** Python 标准库 + 现有 HTTP 服务（server.py / services/*）；测试用 `python -m unittest`（测试文件在仓库根，命名 `<module>_test.py`，依赖注入、不联网）；前端为重度混淆产物，库目录设置 UI 用新建非混淆模块旁挂。

**关联文档:** PRD `docs/ui-upgrade/23-nas-shared-library-prd.md`（§8 改动、§11 测试、§13 阶段）。

---

## File Structure（文件结构）

**新建：**

| 文件 | 职责 |
|---|---|
| `services/library_storage.py` | 库逻辑唯一纯函数模块：路径派生/校验/状态探测/机器标识/原子替换重试/启动解析/文件名防撞/迁移/旧预设清理。只用标准库，可单测。 |
| `library_storage_test.py`（仓库根） | 上述模块的单元测试，依赖注入、不联网。 |
| `sam3_service_test.py`（仓库根） | Sam3Service `assets_dir` getter 化的回归测试（provider 可变、构造期不冻结）。 |
| `server_library_settings_test.py`（仓库根） | 服务级 server 测试：保存带 `libraryDir` 的 settings 会校验 + 落 system settings + 刷新存储 globals。 |
| `modules/settings/librarySettings.js`（前端，非混淆新增） | 设置面板"团队共享库目录"输入 + 状态行，旁挂在混淆面板旁，零风险不碰混淆体。 |
| `docs/ui-upgrade/23-nas-smoke-checklist.md` | §11.2 真机 NAS 手动冒烟验收清单（7 条门禁）落盘手册。 |

**修改：**

| 文件 | 职责 |
|---|---|
| `server.py` | 引入 `LIBRARY_DIR`/`_library_enabled()`、顶部统一 import 库纯函数、启动读取、`_refresh_storage_globals`/`_ensure_storage_dirs` 库覆盖、文件名防撞、`_atomic_write_json` 走 SMB 重试、`_write_user_settings`/`_read_user_settings` 识别 `libraryDir`、状态端点注入。 |
| `services/json_file_route_service.py` | `_save_asset`/`_save_workflow` 改用注入的 `self._atomic_write_json`（对齐 `_save_project`）。 |
| `services/library_file_route_service.py` | 新增 `preset_root_getter`，自定义/系统预设跟随库；`_write_preset_definitions` 改 temp + `atomic_replace_with_retry`。 |
| `services/sam3_service.py` | `assets_dir` 参数改为 `assets_dir_provider`（callable），用到时取值。 |
| `services/runtime_paths.py` | 新增 `cleanup_legacy_user_presets` 纯函数（不改既有出厂覆盖判定）。 |
| `services/http_route_dispatcher.py` | 构造器新增 `library_status_getter`，挂 `GET /api/v2/library/status` 只读路由。 |
| `api/userSettingsApi.js`（前端） | 末尾追加非混淆出口 `fetchLibraryStatusFromServer`。 |
| `api/index.js`（前端） | 再导出 `fetchLibraryStatusFromServer`。 |
| `index.html`（前端） | 设置卡片后新增"团队共享库目录"卡（输入 + 状态行）。 |

---

## 共享契约附录（所有任务引用此处的固定名字）

**纯函数（均由 `services/library_storage.py` 导出）：**

| 名字 | 签名 / 职责 |
|---|---|
| `derive_library_paths(library_dir)` | 从库根派生 8 个 camelCase 键路径（见下）。 |
| `validate_library_dir(library_dir, user_dir)` | 校验并返回规范化绝对路径；空/嵌套 user_dir 抛 `ValueError`。 |
| `library_status(library_dir)` | 可达/可写 + 计数；不可达安全降级全 0。 |
| `machine_id()` | 基于主机名的稳定短标识，`[a-z0-9-]`、≤12 字符，空回退 `"host"`。 |
| `atomic_replace_with_retry(tmp, dst, attempts=5, base_delay=0.05)` | `os.replace` 遇 SMB 共享冲突退避重试。 |
| `resolve_startup_library_dir(system_settings, user_dir)` | 从 system settings 读 `libraryDir`，校验后返回 abspath，非法/缺键吞成 `""`。 |
| `next_gen_filename(machine, date_str, seq, ext)` | 构造 `gen_{machine}_{date}_{seq:04d}.{ext}`（ext 不含前导点）。 |
| `parse_gen_seq(filename, machine, date_str)` | 解析本机该日序号；别机前缀返回 `None`，认旧无前缀历史名。 |
| `migrate_into_library(previous_paths, library_paths, *, progress=None, cancelled=None)` | 首次设库 copy-missing 迁入，目标存在即跳过，不改写 JSON 字节。 |
| `cleanup_legacy_user_presets(writable_root, *, dry_run=True)` | 报告/清理迁库后本机 `user/` 下旧预设残留。 |

**`derive_library_paths` 返回的 8 个 camelCase 键：** `assetsDir / assetThumbsDir / workflowsDir / workflowThumbsDir / outputDir / uploadsDir / presetDefinitionsPath / presetRootDir`。

**server 模块全局 / 设置键：** `LIBRARY_DIR`（默认 `""`）、`_library_enabled()`（`return bool(LIBRARY_DIR)`）；设置键 `libraryDir`（独立顶层字段，不并入 `fileSavePaths`）。

**端点：** `GET /api/v2/library/status`；保存走 `POST /api/v2/user/settings.json`，请求体带顶层 `libraryDir` 字段。

> **对账护栏（务必读）：** `derive_library_paths` 的 camelCase 键（`assetsDir/uploadsDir/outputDir/...`）与 server 模块全局的 UPPER_SNAKE（`ASSETS_DIR/UPLOADS_DIR/OUTPUT_DIR/...`）是**两层概念、故意不同名**——前者是库派生键、后者是 server 模块全局变量。对账时**勿"统一"成同名**。另注：上传目录在 `fileSavePaths` 侧叫 `tempDir`、在 library 侧叫 `uploadsDir`，也是同一目录两套键名。

---

### Task 0: server.py 接入库目录地基（LIBRARY_DIR + _library_enabled + 启动读取）

> 这是阶段 1 的**真正地基**（排在 Task 1 之后、Task 2 之前）。它一处性承担"定义 `LIBRARY_DIR` 模块全局 + `_library_enabled()` + 顶部统一 import 库纯函数 + 启动期从 system settings 读 `libraryDir` 设值"这件事——Task 2/4/6/8/9/11/12 全部把这两个符号当**已存在**消费，本任务是它们唯一的定义方。各任务里"若未则补的兜底 import / 防御式补齐 import"一律删除，**顶部 import 的唯一落点就是本任务**。

**Files:** Modify `server.py`（存储全局初始化区 ~210-240、顶部 import、启动读 system settings 区 ~615-650）; Test 扩展 `library_storage_test.py`。

- [ ] **Step 1: 写失败测试** 在 `library_storage_test.py` 加一个纯函数 `resolve_startup_library_dir(system_settings, user_dir)` 的测试。把下面这个测试类追加到文件末尾 `if __name__` 之前（同时把 `resolve_startup_library_dir` 并入顶部 import 块）：

```python
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
```

- [ ] **Step 2: 跑测试确认失败** Run: `python -m unittest library_storage_test -v`
  Expected: **FAIL** — `ImportError: cannot import name 'resolve_startup_library_dir' from 'services.library_storage'`（函数未定义，import 阶段即崩）。

- [ ] **Step 3: 最小实现（services/library_storage.py 新增纯函数）** 在 `validate_library_dir` 之后追加：

```python
def resolve_startup_library_dir(system_settings, user_dir):
    """启动期从 system settings 解析库目录（纯函数，供 server.py 薄包装）。

    - 取 system_settings.get("libraryDir")；空/None -> ""。
    - 否则交给 validate_library_dir 校验：合法返回 abspath；
      非法（与 user_dir 相同/嵌套等）catch ValueError 吞成 ""，
      不让一个坏配置在启动期把进程顶崩。reachability 不在此判定。
    """
    settings = system_settings or {}
    raw = "" if settings.get("libraryDir") is None else str(settings.get("libraryDir")).strip()
    if not raw:
        return ""
    try:
        return validate_library_dir(raw, user_dir)
    except ValueError:
        return ""
```

- [ ] **Step 4: 跑测试确认通过** Run: `python -m unittest library_storage_test -v`
  Expected: **OK** — `ResolveStartupLibraryDirTest` 5 个用例全过，原有用例不回归。

- [ ] **Step 5: server.py 薄接线（给 before/after 真实片段）**

  **① 顶部统一 import（全员 late-binding 的唯一落点）。** 在 server.py 已有 `from services...` import 区追加：

  ```python
  from services.library_storage import (
      derive_library_paths,
      validate_library_dir,
      library_status,
      machine_id,
      atomic_replace_with_retry,
      resolve_startup_library_dir,
  )
  ```

  **② 存储全局区新增 `LIBRARY_DIR` 与 `_library_enabled()`。** 在 `ASSETS_DIR` 等存储全局定义之后（约 234 行后）新增：

  ```python
  # === NAS 共享库（方案乙/4.2-B）===
  LIBRARY_DIR = ""


  def _library_enabled():
      return bool(LIBRARY_DIR)
  ```

  **③ 启动期读完 system settings 后设值。** 在启动读 system settings 段（~615-650）拿到 `system_settings` 后插入：

  ```python
  global LIBRARY_DIR
  LIBRARY_DIR = resolve_startup_library_dir(system_settings, USER_DIR)
  if _library_enabled():
      # 库感知刷新（库覆盖逻辑由 Task 2 在 _refresh_storage_globals 内实现）。
      _refresh_storage_globals(_current_file_save_paths())
  ```

  > 说明：**reachability 不在此判定**——即便 NAS 当前不可达也记住配置值（`LIBRARY_DIR` 保留），未连接态由 **Task 8** 处理，绝不回退本地。server.py 这层薄接线不可直接单测，靠服务级测试（`resolve_startup_library_dir` 已绿）+ 启动冒烟（`python server.py` 起得来 + `GET /api/v2/library/status` 可达）验证。

- [ ] **Step 6: 提交**
  ```
  git add server.py services/library_storage.py library_storage_test.py
  git commit -m "feat(library): server.py 接入 LIBRARY_DIR 地基 + resolve_startup_library_dir"
  ```

---

### Task 1: 地基 — services/library_storage.py 五个纯函数 + 单测

> 这是地基任务，其它任务（server.py 薄包装、Sam3Service provider、预设注入、输出文件名前缀、/api/v2/library/status 端点、设置 UI）全部依赖本模块导出的 5 个固定名字函数。本模块**只用标准库**（os/re/socket/time），不联网、不读全局状态、不落盘（除 `library_status` 的写探针），完全可单测。
>
> 已在本机 Python 3.14.4 真机跑通：`python -m unittest library_storage_test -v` → **Ran 18 tests OK**。下面给出可逐字落地的完整代码。

**Files:**
- Create: `services/library_storage.py`
- Test: `library_storage_test.py`（仓库根，沿用现有 `<module>_test.py` 命名 + 根目录约定，对齐 `library_file_route_service_test.py` / `server_runtime_paths_test.py`）

参考来源（已 Read）：
- `services/runtime_paths.py` 的 `build_runtime_paths`（纯字符串派生、`os.path.abspath(os.fspath(...))` 风格，子目录 `assets/thumbs`、`workflows/thumbs` 命名与本模块一致）
- `library_file_route_service_test.py`（`tempfile.TemporaryDirectory()` + DI getter 风格，预设逐 txt 落盘 + 中文标题）
- `server_runtime_paths_test.py`（`unittest` + `unittest.mock`、`mock.patch.dict(os.environ,...)`、`os.path.abspath` 断言风格）

---

- [ ] **Step 1: 写失败测试** 创建 `library_storage_test.py`，完整内容：

```python
import os
import tempfile
import unittest
from unittest import mock

from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_status,
    machine_id,
    validate_library_dir,
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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑测试确认失败** Run: `python -m unittest library_storage_test -v`
  Expected: **FAIL** — collection 阶段就报 `ModuleNotFoundError: No module named 'services.library_storage'`（实现文件还没建）。

- [ ] **Step 3: 最小实现** 创建 `services/library_storage.py`，完整内容（无占位符，已真机跑通）：

```python
"""Pure helpers for the NAS shared team library (方案乙/4.2-B).

新逻辑放进这个可单测的纯函数模块，server.py 只做薄包装调用。
这些函数不联网、不读取全局状态，所有输入都通过参数传入，便于依赖注入测试。
"""

import os
import re
import socket
import time


# Windows SMB 共享冲突: ERROR_SHARING_VIOLATION (winerror 32)。
# 网络替换/删除时另一台机器短暂持有句柄会抛出，退避重试即可。
_SHARING_VIOLATION_WINERROR = 32


def derive_library_paths(library_dir):
    """从库根目录派生所有共享子目录/文件路径（全部位于 library_dir 之下）。

    与 runtime_paths.build_runtime_paths 的派生风格一致：纯字符串拼接，不落盘。
    """
    root = os.path.abspath(os.fspath(library_dir))
    assets_dir = os.path.join(root, "assets")
    workflows_dir = os.path.join(root, "workflows")
    presets_dir = os.path.join(root, "presets")
    return {
        "assetsDir": assets_dir,
        "assetThumbsDir": os.path.join(assets_dir, "thumbs"),
        "workflowsDir": workflows_dir,
        "workflowThumbsDir": os.path.join(workflows_dir, "thumbs"),
        "outputDir": os.path.join(root, "output"),
        "uploadsDir": os.path.join(root, "uploads"),
        "presetDefinitionsPath": os.path.join(presets_dir, "prompt-presets.json"),
        "presetRootDir": os.path.join(presets_dir, "prompt"),
    }


def _normalize_dir(path):
    return os.path.abspath(os.path.expandvars(os.path.expanduser(os.fspath(path))))


def _is_same_or_nested(a, b):
    """True 当 a 与 b 相同，或其中一个是另一个的子目录。"""
    a_norm = os.path.normcase(a)
    b_norm = os.path.normcase(b)
    if a_norm == b_norm:
        return True
    a_prefix = a_norm if a_norm.endswith(os.sep) else a_norm + os.sep
    b_prefix = b_norm if b_norm.endswith(os.sep) else b_norm + os.sep
    return b_norm.startswith(a_prefix) or a_norm.startswith(b_prefix)


def validate_library_dir(library_dir, user_dir):
    """校验库目录并返回规范化绝对路径。

    - 空/None 抛 ValueError。
    - 与 user_dir 相同或互相嵌套抛 ValueError（防止把共享库指到本机用户目录里）。
    - 允许中文/空格/UNC（\\\\nas\\share）。
    """
    raw = "" if library_dir is None else str(library_dir).strip()
    if not raw:
        raise ValueError("库目录不能为空")

    normalized = _normalize_dir(raw)

    user_norm = _normalize_dir(user_dir) if user_dir else ""
    if user_norm and _is_same_or_nested(normalized, user_norm):
        raise ValueError("库目录不能与用户目录相同或互相嵌套")

    return normalized


def machine_id():
    """基于主机名的稳定短标识：只留 [a-z0-9-]、小写、截断到 ~12 字符。"""
    try:
        host = socket.gethostname()
    except Exception:
        host = ""
    cleaned = re.sub(r"[^a-z0-9-]", "-", str(host or "").lower())
    cleaned = cleaned.strip("-")
    cleaned = cleaned[:12].strip("-")
    return cleaned or "host"


def _count_preset_like(directory):
    total = 0
    try:
        for root, _dirs, files in os.walk(directory):
            for name in files:
                lowered = name.lower()
                if lowered.endswith(".json") or lowered.endswith(".txt"):
                    total += 1
    except Exception:
        return total
    return total


def library_status(library_dir):
    """库可达性/可写性 + 各子目录文件计数。不可达时安全降级。"""
    result = {
        "reachable": False,
        "writable": False,
        "counts": {"assets": 0, "workflows": 0, "presets": 0},
    }

    raw = "" if library_dir is None else str(library_dir).strip()
    if not raw:
        return result

    root = os.path.abspath(os.path.expandvars(os.path.expanduser(raw)))
    if not os.path.isdir(root):
        return result

    result["reachable"] = bool(os.access(root, os.R_OK))

    # 写探针：实际写一个临时文件再删，比 os.access(W_OK) 更可信（SMB 只读挂载会骗 os.access）。
    probe_path = os.path.join(root, ".huanying_probe")
    try:
        with open(probe_path, "w", encoding="utf-8") as probe:
            probe.write("ok")
        result["writable"] = True
    except Exception:
        result["writable"] = False
    finally:
        try:
            os.remove(probe_path)
        except Exception:
            pass

    paths = derive_library_paths(root)
    result["counts"]["assets"] = _count_preset_like(paths["assetsDir"])
    result["counts"]["workflows"] = _count_preset_like(paths["workflowsDir"])
    result["counts"]["presets"] = _count_preset_like(
        os.path.join(root, "presets")
    )
    return result


def _is_sharing_violation(exc):
    winerror = getattr(exc, "winerror", None)
    return winerror == _SHARING_VIOLATION_WINERROR


def atomic_replace_with_retry(tmp_path, dst_path, attempts=5, base_delay=0.05):
    """os.replace(tmp,dst)，遇 SMB 共享冲突/权限错误退避重试，用尽后 raise。

    退避用 base_delay 的指数序列；最后一次失败照原样抛出，调用方可感知真实错误。
    """
    last_exc = None
    for attempt in range(max(1, int(attempts))):
        try:
            os.replace(tmp_path, dst_path)
            return
        except (PermissionError, OSError) as exc:
            # 只对权限/共享冲突重试；其它 OSError（如目标父目录不存在）也重试一次后照样抛。
            if isinstance(exc, OSError) and not isinstance(exc, PermissionError):
                if not _is_sharing_violation(exc):
                    # 非共享冲突的普通 OSError：直接抛，重试无意义。
                    raise
            last_exc = exc
            if attempt < max(1, int(attempts)) - 1:
                time.sleep(base_delay * (2 ** attempt))
    if last_exc is not None:
        raise last_exc
```

  实现要点（给后续任务对账用）：
  - `derive_library_paths` 返回的 8 个键全部在 `library_dir` 子目录下，命名与契约逐字一致；**与 `runtime_paths.build_runtime_paths` 的 `assetsDir/assetThumbsDir/workflowsDir/workflowThumbsDir/outputDir/uploadsDir` 同名**，方便 `_refresh_storage_globals` 启用库时整体覆盖。
  - `validate_library_dir` 用 `expanduser+expandvars+abspath`；嵌套判断用 `os.path.normcase`（Windows 大小写不敏感）+ `os.sep` 前缀比对，避免 `/a/userX` 被误判成 `/a/user` 的子目录。
  - `library_status` 不可达/空输入一律返回安全降级的全 0 结构；写探针 `.huanying_probe` 在 `finally` 里删除，不残留。
  - `machine_id` 用 `socket.gethostname()`，非法字符替为 `-`，截断到 12，空/全非法回退 `"host"`。
  - `atomic_replace_with_retry` 对 `PermissionError` 与 SMB `ERROR_SHARING_VIOLATION`(winerror 32) 退避重试，普通 OSError（如父目录缺失）直接抛，用尽 attempts 后抛最后一次异常。

- [ ] **Step 4: 跑测试确认通过** Run: `python -m unittest library_storage_test -v`
  Expected: **Ran 18 tests in ~0.0Xs / OK**（18 个用例全绿；本机已实跑通过）。
  补充冒烟（可选）：`python -c "import services.library_storage as m; print(sorted(n for n in dir(m) if not n.startswith('_')))"` 应输出 `['atomic_replace_with_retry', 'derive_library_paths', 'library_status', 'machine_id', 'os', 're', 'socket', 'time', 'validate_library_dir']`。

- [ ] **Step 5: 提交** 当前已在分支 `feature/codex-work-20260609`（非 master，可直接提交）：
  ```
  git add services/library_storage.py library_storage_test.py
  git commit -m "feat(library): NAS 共享库地基纯函数模块 + 单测(契约5函数)

  - derive_library_paths/validate_library_dir/library_status/machine_id/atomic_replace_with_retry
  - 全部标准库、可单测、不联网；server.py 后续做薄包装
  - library_storage_test.py 18 用例覆盖派生/校验/降级/字符集/退避重试

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 2: 把库目录接进 server.py 存储全局刷新

**前置依赖**：Task 1 已创建 `services/library_storage.py`（含纯函数 `derive_library_paths`）与根级 `library_storage_test.py`，且 `derive_library_paths` 返回的 dict 含键 `assetsDir / assetThumbsDir / workflowsDir / workflowThumbsDir / outputDir / uploadsDir / presetDefinitionsPath / presetRootDir`。本任务依赖 Task 1 已合入。
**前置依赖**：**Task 0**（`LIBRARY_DIR`/`_library_enabled()`/顶部 import 的唯一定义方）必须先合入。本任务**只消费 `LIBRARY_DIR` 与 `_library_enabled()`，不定义、不补兜底 import**——import 唯一落点是 Task 0。

> 可测性说明：`server.py` 是巨型有副作用模块、无法直接 `import` 做单测（导入即起服务、连真实路径）。因此本任务的**自动化验证锚点**放在纯函数 `derive_library_paths` 上——在 `library_storage_test.py` 增补"derive 的键恰好覆盖 server 要替换的 6 个存储全局所需键"的断言（这把"server 拿哪些键去覆盖哪些全局"用机器可读方式钉死）。server.py 本身的接线给**真实 before/after 代码**，验证靠：①服务单测绿；②启动冒烟（`python server.py` 起得来 + `/api/v2/library/status` 可达）。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`（`_refresh_storage_globals` 约 459-477、`_ensure_storage_dirs` 约 480-484）
- Test (augment, Task 1 已创建): `D:\Aic\huanying-source-windows-20260430-122116\library_storage_test.py`

---

- [ ] **Step 1: 写失败测试（增补到 library_storage_test.py 末尾）**

把下面这个测试类追加到 `library_storage_test.py` 文件末尾。它把"server.py 的 `_refresh_storage_globals` 启用库时要从 `derive_library_paths` 取哪些键覆盖哪 6 个存储全局"用断言钉死——一旦 Task 1 改了键名，或本契约漂移，立即红。

```python
import os
import unittest

from services.library_storage import derive_library_paths


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


if __name__ == "__main__":
    unittest.main()
```

> 注：`library_storage_test.py` 已被 Task 1 写过一次 `if __name__ == "__main__": unittest.main()`，本增补段落开头的 `import`/末尾的 `__main__` 块只是确保单文件可独立跑；若 Task 1 文件已含相同 import / `__main__` 块，**只追加 `DeriveLibraryPathsServerWiringContractTests` 这一个类**，不要重复 import 与 `__main__` 块。

- [ ] **Step 2: 跑测试确认失败**

Run:
```
python -m unittest library_storage_test -v
```
Expected：若 Task 1 的 `derive_library_paths` 已实现且键齐全，本新增 3 个用例应直接 **PASS**（本任务测是"契约护栏"，钉死键名而非驱动新纯函数）。
- 若出现 `AttributeError: module 'services.library_storage' has no attribute 'derive_library_paths'` 或 `KeyError`/`AssertionError(需要 derive_library_paths()['...'])` → 说明 Task 1 未合入或键名漂移，**停下来对齐 Task 1，不要在本任务改 library_storage.py**。
- 这一步的"失败"语义是：在 server.py 接线**之前**，这些断言就是 server 接线正确性的前置门；它们绿 = 我们有了机器可读的键契约，可以放心去改 server.py。

- [ ] **Step 3: 最小实现（改 server.py 接线，真实 before/after）**

先 Read 确认当前两段函数原文（见下方 before）。

**3a. 顶部 import 已由 Task 0 统一落地** —— `derive_library_paths` 等库纯函数已在 server.py 顶部 import（Task 0 Step 5①），本任务不再补 import。

> 注：下方 after 片段用 `library_storage.derive_library_paths(...)`；若 Task 0 采用 `from services.library_storage import derive_library_paths` 的具名形态，则相应写成 `derive_library_paths(...)`（去掉 `library_storage.` 前缀），二选一与 Task 0 实际落地保持一致。

**3b. `_refresh_storage_globals` —— before（server.py 约 459-477，逐字现状）：**

```python
def _refresh_storage_globals(paths):
    global USER_DIR, CANVAS_DIR, UPLOADS_DIR, OUTPUT_DIR, CONFIG_FILE, SETTINGS_FILE
    global GEN_SEQ_STATE_FILE, DREAMINA_CLI_SERVICE, DREAMINA_ROUTE_SERVICE
    USER_DIR = os.path.abspath(paths["userDir"])
    CANVAS_DIR = os.path.join(USER_DIR, "Canvas Project")
    UPLOADS_DIR = os.path.abspath(paths["tempDir"])
    OUTPUT_DIR = os.path.abspath(paths["outputDir"])
    CONFIG_FILE = os.path.join(USER_DIR, "config.json")
    SETTINGS_FILE = os.path.join(USER_DIR, "settings.json")
    GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")
    try:
        DREAMINA_CLI_SERVICE = DreaminaCliService(CONFIG_FILE, output_root_dir=OUTPUT_DIR)
        DREAMINA_ROUTE_SERVICE = DreaminaRouteService(
            cli_service=DREAMINA_CLI_SERVICE,
            subscription_gate_service=SUBSCRIPTION_GATE_SERVICE,
            video_required_model_id=DREAMINA_VIDEO_VIP_MODEL_ID,
        )
    except NameError:
        pass
```

**键 → 全局映射表（§C 护栏，对账时勿"统一"camelCase 键与 UPPER_SNAKE 全局）：**

| `derive_library_paths` 键 | server 模块全局 |
|---|---|
| `assetsDir` | `ASSETS_DIR` |
| `assetThumbsDir` | `ASSET_THUMBS_DIR` |
| `workflowsDir` | `WORKFLOWS_DIR` |
| `workflowThumbsDir` | `WORKFLOW_THUMBS_DIR` |
| `outputDir` | `OUTPUT_DIR` |
| `uploadsDir` | `UPLOADS_DIR` |

**`_refresh_storage_globals` —— after：**
- ① `global` 列表加入 `ASSETS_DIR, ASSET_THUMBS_DIR, WORKFLOWS_DIR, WORKFLOW_THUMBS_DIR`。
- ② 在 `GEN_SEQ_STATE_FILE = ...` 之后、`try:` 起 DreaminaCli 之前，插入"启用库则用 `derive_library_paths(LIBRARY_DIR)` 覆盖 ASSETS/thumbs/WORKFLOWS/thumbs/OUTPUT/UPLOADS"的块。**注意**：覆盖必须放在 `OUTPUT_DIR`/`UPLOADS_DIR` 赋值之后，这样启用库时库根胜出（覆盖掉 fileSavePaths 给的 output/temp）；并在覆盖 `OUTPUT_DIR` 后**重算** `GEN_SEQ_STATE_FILE`，让 gen 序列状态文件也落到库的 output 下。

```python
def _refresh_storage_globals(paths):
    global USER_DIR, CANVAS_DIR, UPLOADS_DIR, OUTPUT_DIR, CONFIG_FILE, SETTINGS_FILE
    global GEN_SEQ_STATE_FILE, DREAMINA_CLI_SERVICE, DREAMINA_ROUTE_SERVICE
    global ASSETS_DIR, ASSET_THUMBS_DIR, WORKFLOWS_DIR, WORKFLOW_THUMBS_DIR
    USER_DIR = os.path.abspath(paths["userDir"])
    CANVAS_DIR = os.path.join(USER_DIR, "Canvas Project")
    UPLOADS_DIR = os.path.abspath(paths["tempDir"])
    OUTPUT_DIR = os.path.abspath(paths["outputDir"])
    CONFIG_FILE = os.path.join(USER_DIR, "config.json")
    SETTINGS_FILE = os.path.join(USER_DIR, "settings.json")
    GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")
    if _library_enabled():
        lib = library_storage.derive_library_paths(LIBRARY_DIR)
        ASSETS_DIR = os.path.abspath(lib["assetsDir"])
        ASSET_THUMBS_DIR = os.path.abspath(lib["assetThumbsDir"])
        WORKFLOWS_DIR = os.path.abspath(lib["workflowsDir"])
        WORKFLOW_THUMBS_DIR = os.path.abspath(lib["workflowThumbsDir"])
        OUTPUT_DIR = os.path.abspath(lib["outputDir"])
        UPLOADS_DIR = os.path.abspath(lib["uploadsDir"])
        GEN_SEQ_STATE_FILE = os.path.join(OUTPUT_DIR, ".gen_seq_state.json")
    try:
        DREAMINA_CLI_SERVICE = DreaminaCliService(CONFIG_FILE, output_root_dir=OUTPUT_DIR)
        DREAMINA_ROUTE_SERVICE = DreaminaRouteService(
            cli_service=DREAMINA_CLI_SERVICE,
            subscription_gate_service=SUBSCRIPTION_GATE_SERVICE,
            video_required_model_id=DREAMINA_VIDEO_VIP_MODEL_ID,
        )
    except NameError:
        pass
```

**3c. `_ensure_storage_dirs` —— before（server.py 约 480-484，逐字现状）：**

```python
def _ensure_storage_dirs():
    os.makedirs(USER_DIR, exist_ok=True)
    os.makedirs(CANVAS_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
```

**`_ensure_storage_dirs` —— after：**启用库时，把库的资产/缩略图/工作流/缩略图四个子目录也 `makedirs`（OUTPUT_DIR/UPLOADS_DIR 已在上面被覆盖成库子目录，原有两行 makedirs 会自动建到库里，无需重复）。

```python
def _ensure_storage_dirs():
    os.makedirs(USER_DIR, exist_ok=True)
    os.makedirs(CANVAS_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    if _library_enabled():
        os.makedirs(ASSETS_DIR, exist_ok=True)
        os.makedirs(ASSET_THUMBS_DIR, exist_ok=True)
        os.makedirs(WORKFLOWS_DIR, exist_ok=True)
        os.makedirs(WORKFLOW_THUMBS_DIR, exist_ok=True)
```

> 行为级要点（混淆/巨模块无法单测处的口头契约）：
> 1. `_refresh_storage_globals` 由 `_apply_file_save_paths`（约 496）调用，后者紧接着调 `_ensure_storage_dirs`（约 497）。所以启用库后，存储全局刷新 + 目录创建在同一条路径里串起来——只要 `LIBRARY_DIR` 已被前置任务在设置保存 / 启动时填好，本任务两段改动即在每次刷新时生效。
> 2. 未启用库（`LIBRARY_DIR == ""`，`_library_enabled()` False）时，两段函数的 `if` 分支都不进，**行为与改前逐字相同**（ASSETS_DIR 等仍由 RUNTIME_PATHS/模块初始化给的本机 data/ 路径），保证零回归。
> 3. server.py 启动末尾约 688-691 已有一次性 `os.makedirs(ASSETS_DIR ...)` 等；那是模块加载期、`LIBRARY_DIR` 可能尚未就绪的本机兜底，**保留不动**——真正让库目录成型的是后续 `_apply_file_save_paths -> _ensure_storage_dirs` 这条带 `_library_enabled()` 判断的路径。

- [ ] **Step 4: 跑测试确认通过 + 启动冒烟**

Run（自动化锚点，必过）：
```
python -m unittest library_storage_test -v
```
Expected：含本任务 3 个新用例在内全部 `OK`。

Run（接线冒烟，人工 / 半自动）：
```
python -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read()); print('server.py parse OK')"
```
Expected：打印 `server.py parse OK`（保证 4.8 改动语法合法、`global` 行无误）。

Run（启动冒烟，可选但建议；需本机 8779 空闲）：
```
python server.py
```
Expected：服务正常起来无栈回溯；另开终端 `curl http://127.0.0.1:8779/api/v2/library/status` 返回 JSON（该端点由"共享契约"里另一任务提供，此处仅借它确认 server 起得来且库分支不炸）。冒烟后 Ctrl+C 收工。

- [ ] **Step 5: 提交**

```
git add server.py library_storage_test.py
git commit -m "feat(library): _refresh_storage_globals/_ensure_storage_dirs 启用库时覆盖资产·工作流·缩略图·输出·上传到库根

- _refresh_storage_globals global 列表加入 ASSETS_DIR/ASSET_THUMBS_DIR/WORKFLOWS_DIR/WORKFLOW_THUMBS_DIR
- _library_enabled() 时用 library_storage.derive_library_paths(LIBRARY_DIR) 覆盖六个存储全局并重算 GEN_SEQ_STATE_FILE
- _ensure_storage_dirs 启用库时 makedirs 四个库子目录
- library_storage_test 增补键<->全局映射契约护栏(server.py 无法直接单测)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sam3Service.assets_dir 改为 provider/getter（对齐 uploads/output）

**背景（真实代码确认）：**
- `services/sam3_service.py` `__init__`（第 11-19 行）当前签名收 `assets_dir`，并在第 21 行 `self.assets_dir = os.path.abspath(assets_dir)` 把值在构造期冻结。
- 唯一使用点是 `safe_resolve_image_path`（方法定义第 312 行）第 332 行：`if self._is_path_inside(abs_path, self.assets_dir) and os.path.isfile(abs_path):`。`abs_path` 由 `self.directory` + 传入 `data/assets/...` 路径拼出（第 331 行）。
- `server.py` 第 759-765 行构造 `Sam3Service(directory=DIRECTORY, assets_dir=ASSETS_DIR, uploads_dir_provider=lambda: UPLOADS_DIR, output_dir_provider=lambda: OUTPUT_DIR, path_inside_checker=_is_path_inside)`——`uploads/output` 已是 getter，唯独 `assets_dir` 按值冻结。库启用后 `ASSETS_DIR` 会被 `_refresh_storage_globals` 改写指向 NAS，按值冻结会导致 SAM3 仍用旧目录做 path-inside 校验。

**目标：** `assets_dir` 改为 `assets_dir_provider`（callable），用到时调用 `self._assets_dir_provider()`，与 `uploads_dir_provider/output_dir_provider` 完全对齐；`server.py` 注入 `assets_dir_provider=lambda: ASSETS_DIR`。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\sam3_service.py`
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`
- Create (Test): `sam3_service_test.py`（仓库根，与全仓 `<module>_test.py` 约定对齐）

---

- [ ] **Step 1: 写失败测试**

新建 `sam3_service_test.py`（仓库根），完整内容：

```python
import os
import tempfile
import unittest

from services.sam3_service import Sam3Service


def _is_path_inside(target, base):
    try:
        target_abs = os.path.abspath(target)
        base_abs = os.path.abspath(base)
        common = os.path.commonpath([target_abs, base_abs])
        return common == base_abs
    except Exception:
        return False


class Sam3ServiceAssetsProviderTests(unittest.TestCase):
    def _build_service(self, directory, assets_dir_provider):
        return Sam3Service(
            directory=directory,
            assets_dir_provider=assets_dir_provider,
            uploads_dir_provider=lambda: os.path.join(directory, "data", "uploads"),
            output_dir_provider=lambda: os.path.join(directory, "output"),
            path_inside_checker=_is_path_inside,
        )

    def test_safe_resolve_image_path_follows_mutable_assets_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 真实磁盘上的素材文件：<dir>/data/assets/pic.png
            assets_dir = os.path.join(temp_dir, "data", "assets")
            os.makedirs(assets_dir, exist_ok=True)
            asset_file = os.path.join(assets_dir, "pic.png")
            with open(asset_file, "wb") as handle:
                handle.write(b"\x89PNG\r\n")

            # 一个起初指向"错误"目录的可变 provider
            state = {"assets_dir": os.path.join(temp_dir, "wrong_assets")}
            provider = lambda: state["assets_dir"]

            service = self._build_service(temp_dir, provider)

            # provider 指向错误目录时：data/assets/pic.png 不在 assets_dir 内 -> None
            self.assertIsNone(service.safe_resolve_image_path("data/assets/pic.png"))

            # 改变 provider 返回值为真实素材目录（不重建 service）
            state["assets_dir"] = assets_dir

            # path-inside 校验应跟随新目录通过，解析出真实绝对路径
            resolved = service.safe_resolve_image_path("data/assets/pic.png")
            self.assertEqual(resolved, os.path.abspath(asset_file))

    def test_assets_dir_not_frozen_at_construction(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            assets_dir = os.path.join(temp_dir, "data", "assets")
            os.makedirs(assets_dir, exist_ok=True)
            asset_file = os.path.join(assets_dir, "frame.png")
            with open(asset_file, "wb") as handle:
                handle.write(b"\x89PNG\r\n")

            calls = {"count": 0}

            def provider():
                calls["count"] += 1
                return assets_dir

            service = self._build_service(temp_dir, provider)

            # 构造期不得调用 provider（不冻结）
            self.assertEqual(calls["count"], 0)

            resolved = service.safe_resolve_image_path("data/assets/frame.png")
            self.assertEqual(resolved, os.path.abspath(asset_file))
            # 用到时才调用 provider
            self.assertGreaterEqual(calls["count"], 1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑测试确认失败**
  Run: `python -m unittest sam3_service_test -v`
  Expected: FAIL —— 当前 `__init__` 收的是 `assets_dir` 而非 `assets_dir_provider`，传 `assets_dir_provider=` 会触发 `TypeError: __init__() got an unexpected keyword argument 'assets_dir_provider'`（同时缺少必填的 `assets_dir`）。两个用例均 error/fail。

- [ ] **Step 3: 最小实现**

(3a) `services/sam3_service.py` `__init__` 改签名 + 去掉冻结。Read 确认当前第 11-24 行为：

```python
    def __init__(
        self,
        *,
        directory,
        assets_dir,
        uploads_dir_provider,
        output_dir_provider,
        path_inside_checker,
    ):
        self.directory = os.path.abspath(directory)
        self.assets_dir = os.path.abspath(assets_dir)
        self._get_uploads_dir = uploads_dir_provider
        self._get_output_dir = output_dir_provider
        self._is_path_inside = path_inside_checker
```

改为（Edit）：

```python
    def __init__(
        self,
        *,
        directory,
        assets_dir_provider,
        uploads_dir_provider,
        output_dir_provider,
        path_inside_checker,
    ):
        self.directory = os.path.abspath(directory)
        self._get_assets_dir = assets_dir_provider
        self._get_uploads_dir = uploads_dir_provider
        self._get_output_dir = output_dir_provider
        self._is_path_inside = path_inside_checker
```

说明：删除了 `assets_dir` 参数与 `self.assets_dir = os.path.abspath(assets_dir)` 这行构造期冻结；新增 `self._get_assets_dir`，命名/位置与 `self._get_uploads_dir`/`self._get_output_dir` 对齐。

(3b) `services/sam3_service.py` `safe_resolve_image_path` 使用点改为用到时取值。Read 确认当前第 318-333 行（含 uploads/output 的取值写法范本）。把第 330-333 行的 assets 分支：

```python
        if value.startswith("data/assets/"):
            abs_path = os.path.abspath(os.path.join(self.directory, value))
            if self._is_path_inside(abs_path, self.assets_dir) and os.path.isfile(abs_path):
                return abs_path
        return None
```

改为（Edit）：

```python
        if value.startswith("data/assets/"):
            assets_dir = os.path.abspath(self._get_assets_dir())
            abs_path = os.path.abspath(os.path.join(self.directory, value))
            if self._is_path_inside(abs_path, assets_dir) and os.path.isfile(abs_path):
                return abs_path
        return None
```

说明：`assets_dir = os.path.abspath(self._get_assets_dir())` 与同方法第 318-319 行 `uploads_dir = os.path.abspath(self._get_uploads_dir())` / `output_dir = os.path.abspath(self._get_output_dir())` 写法完全一致——用到时取、用到时 abspath。`self.assets_dir` 这一属性在仓库内仅此一处使用（已用 codegraph/grep 确认 sam3_service.py 内只有第 21、332 两处），改完无残留引用。

(3c) `server.py` 改注入。Read 确认当前第 759-765 行：

```python
SAM3_SERVICE = Sam3Service(
    directory=DIRECTORY,
    assets_dir=ASSETS_DIR,
    uploads_dir_provider=lambda: UPLOADS_DIR,
    output_dir_provider=lambda: OUTPUT_DIR,
    path_inside_checker=_is_path_inside,
)
```

改为（Edit）：

```python
SAM3_SERVICE = Sam3Service(
    directory=DIRECTORY,
    assets_dir_provider=lambda: ASSETS_DIR,
    uploads_dir_provider=lambda: UPLOADS_DIR,
    output_dir_provider=lambda: OUTPUT_DIR,
    path_inside_checker=_is_path_inside,
)
```

说明：`assets_dir=ASSETS_DIR`（按值，构造期冻结）→ `assets_dir_provider=lambda: ASSETS_DIR`（每次取最新全局），与紧邻的 `uploads_dir_provider=lambda: UPLOADS_DIR` / `output_dir_provider=lambda: OUTPUT_DIR` 三行完全对齐。库启用后 `_refresh_storage_globals` 改写 `ASSETS_DIR` 即对 SAM3 立即生效。

- [ ] **Step 4: 跑测试确认通过**
  Run: `python -m unittest sam3_service_test -v`
  Expected: PASS —— `test_safe_resolve_image_path_follows_mutable_assets_provider`、`test_assets_dir_not_frozen_at_construction` 均 ok（Ran 2 tests ... OK）。
  额外回归（确保未破坏 server 导入/其他 sam3 调用方）：
  Run: `python -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read()); ast.parse(open('services/sam3_service.py',encoding='utf-8').read()); print('syntax ok')"`
  Expected: 打印 `syntax ok`（仅做语法/签名一致性核对，server.py 整体 import 可能拉起重依赖，故用 ast 解析而非 import）。

- [ ] **Step 5: 提交**
  Run: `git add services/sam3_service.py server.py sam3_service_test.py && git commit -m "refactor(sam3): assets_dir 改 provider/getter,对齐 uploads/output,库启用后跟随 ASSETS_DIR"`

---

### Task 4: 系统预设整表 + 自定义逐 txt 预设跟随库目录

让 `LibraryFileRouteService` 的自定义逐 txt 预设根（当前硬编码 `os.path.join(user_dir,'prompt')`）改由可注入的 `preset_root_getter` 决定；server.py 在启用库时把它指向 `derive_library_paths(LIBRARY_DIR)['presetRootDir']`，系统预设整表 lambda 同步切到 `presetDefinitionsPath`。未启用库时行为与现状逐字一致（仍指 `os.path.join(USER_DIR,'prompt')` 与 `os.path.join(USER_DIR,'prompt-presets.json')`）。

**依赖**：本任务依赖 Task 1（`derive_library_paths` 返回含 `presetRootDir`、`presetDefinitionsPath` 键）、**Task 0**（`LIBRARY_DIR`/`_library_enabled()` 定义方 + 顶部 import）、**Task 2**（`_refresh_storage_globals` 库覆盖扩展）。**Task 3（Sam3 getter 化）与本任务无依赖关系**。若并行执行，Step 3-server 段需在 Task 0/1/2 落地后再跑联调；本任务的单测（Step 1）只测 `LibraryFileRouteService` 自身、不依赖前述任务即可独立绿。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\library_file_route_service.py`
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`（构造处 779-785，注入 `preset_root_getter` + 系统整表 lambda 切换）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\library_file_route_service_test.py`（扩展，文件在仓库根，沿用现有 `unittest` 风格）

---

- [ ] **Step 1: 写失败测试**

在 `D:\Aic\huanying-source-windows-20260430-122116\library_file_route_service_test.py` 里，先把 `_build_service` 增加一个 `preset_root` 形参（默认 `None`，保持旧调用不变），再追加两个用例。

把现有 `_build_service`（第 10-27 行）整体替换为：

```python
    def _build_service(
        self,
        temp_dir,
        *,
        preset_definitions_path=None,
        preset_definitions_seed_path=None,
        preset_root=None,
    ):
        return LibraryFileRouteService(
            user_dir_getter=lambda: temp_dir,
            asset_thumbs_dir_getter=lambda: os.path.join(temp_dir, "asset-thumbs"),
            workflow_thumbs_dir_getter=lambda: os.path.join(temp_dir, "workflow-thumbs"),
            preset_definitions_path_getter=(
                (lambda: preset_definitions_path) if preset_definitions_path else None
            ),
            preset_definitions_seed_path_getter=(
                (lambda: preset_definitions_seed_path) if preset_definitions_seed_path else None
            ),
            preset_root_getter=((lambda: preset_root) if preset_root else None),
        )
```

然后在 `test_save_preset_definitions_writes_writable_file_without_modifying_seed`（结尾约第 313 行 `self.assertEqual(seed["ai-text"][0]["title"], "Seed")`）之后、`if __name__ == "__main__":` 之前，插入这两个用例：

```python
    def test_preset_root_getter_redirects_custom_presets_to_library_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            user_dir = os.path.join(temp_dir, "user")
            library_root = os.path.join(temp_dir, "library", "presets", "prompt")
            os.makedirs(user_dir, exist_ok=True)
            service = self._build_service(user_dir, preset_root=library_root)

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-image",
                        "title": "共享海报",
                        "template": "团队共享模板",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            # 自定义预设落到库目录，而不是用户目录
            self.assertTrue(
                os.path.exists(os.path.join(library_root, "ai-image", "共享海报.txt"))
            )
            self.assertFalse(
                os.path.exists(os.path.join(user_dir, "prompt", "ai-image", "共享海报.txt"))
            )

            # 读取也从库目录回放
            presets = service.handle_get(handler=None, path="/api/v2/user/presets")
            self.assertEqual(presets["data"]["ai-image"][0]["title"], "共享海报")
            self.assertEqual(presets["data"]["ai-image"][0]["template"], "团队共享模板")

    def test_preset_root_getter_falls_back_to_user_prompt_when_absent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 不传 preset_root：保持旧行为，落 <user_dir>/prompt
            service = self._build_service(temp_dir)

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-text",
                        "title": "本机预设",
                        "template": "仅本机",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertTrue(
                os.path.exists(os.path.join(temp_dir, "prompt", "ai-text", "本机预设.txt"))
            )

    def test_preset_root_getter_delete_targets_library_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            user_dir = os.path.join(temp_dir, "user")
            library_root = os.path.join(temp_dir, "library", "presets", "prompt")
            os.makedirs(user_dir, exist_ok=True)
            service = self._build_service(user_dir, preset_root=library_root)
            preset_path = os.path.join(library_root, "ai-video", "镜头B.txt")
            os.makedirs(os.path.dirname(preset_path), exist_ok=True)
            with open(preset_path, "w", encoding="utf-8") as file:
                file.write("dolly shot")

            response = service.handle_delete(
                handler=None,
                path="/api/v2/user/presets/dev/ai-video/%E9%95%9C%E5%A4%B4B",
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertFalse(os.path.exists(preset_path))
```

说明：第一条证明"传入指向库的 preset_root_getter 后，保存/读取自定义预设落到库目录、且用户目录下不再落盘"；第二条守住"不传时回退到 `<user_dir>/prompt`（用户目录不变前提下仍生效）"；第三条顺带证明删除路径也走库根（因为 `_delete_prompt_preset` 复用 `_preset_file_path → _preset_root_dir`）。

- [ ] **Step 2: 跑测试确认失败**

Run:
```
python -m unittest library_file_route_service_test -v
```
Expected: FAIL。三个新用例报 `TypeError: __init__() got an unexpected keyword argument 'preset_root_getter'`（因为构造尚未接受该参数）；旧用例仍应通过。

- [ ] **Step 3: 最小实现**

**(3a) `services/library_file_route_service.py` —— 构造接受 `preset_root_getter`**

Read 后将构造（第 12-29 行）改为：

before：
```python
    def __init__(
        self,
        *,
        user_dir_getter,
        asset_thumbs_dir_getter,
        workflow_thumbs_dir_getter,
        preset_definitions_path_getter=None,
        preset_definitions_seed_path_getter=None,
    ):
        self._get_user_dir = user_dir_getter
        self._get_asset_thumbs_dir = asset_thumbs_dir_getter
        self._get_workflow_thumbs_dir = workflow_thumbs_dir_getter
        self._get_preset_definitions_path = (
            preset_definitions_path_getter or self._default_preset_definitions_path
        )
        self._get_preset_definitions_seed_path = (
            preset_definitions_seed_path_getter or self._default_preset_definitions_path
        )
```

after：
```python
    def __init__(
        self,
        *,
        user_dir_getter,
        asset_thumbs_dir_getter,
        workflow_thumbs_dir_getter,
        preset_definitions_path_getter=None,
        preset_definitions_seed_path_getter=None,
        preset_root_getter=None,
    ):
        self._get_user_dir = user_dir_getter
        self._get_asset_thumbs_dir = asset_thumbs_dir_getter
        self._get_workflow_thumbs_dir = workflow_thumbs_dir_getter
        self._get_preset_definitions_path = (
            preset_definitions_path_getter or self._default_preset_definitions_path
        )
        self._get_preset_definitions_seed_path = (
            preset_definitions_seed_path_getter or self._default_preset_definitions_path
        )
        self._get_preset_root = (
            preset_root_getter or self._default_preset_root
        )
```

并在 `_default_preset_definitions_path`（第 31-35 行，`@staticmethod`）之后、`_json_ok`（第 37 行）之前，新增一个默认 prompt 根方法（实例方法，因为要读 `self._get_user_dir`）：

```python
    def _default_preset_root(self):
        return os.path.join(self._get_user_dir(), "prompt")
```

**(3b) `_read_presets` 改用 `self._resolve_preset_root()`**

把 `_read_presets`（第 187-188 行开头）的：
```python
    def _read_presets(self):
        prompt_dir = os.path.join(self._get_user_dir(), "prompt")
```
改为：
```python
    def _read_presets(self):
        prompt_dir = self._resolve_preset_root()
```

**(3c) `_preset_root_dir` 改用 `self._resolve_preset_root()`**

把 `_preset_root_dir`（第 217-222 行）：
```python
    def _preset_root_dir(self):
        prompt_dir = os.path.join(self._get_user_dir(), "prompt")
        os.makedirs(prompt_dir, exist_ok=True)
        for preset_type in self._DEFAULT_PRESET_TYPES:
            os.makedirs(os.path.join(prompt_dir, preset_type), exist_ok=True)
        return prompt_dir
```
改为：
```python
    def _preset_root_dir(self):
        prompt_dir = self._resolve_preset_root()
        os.makedirs(prompt_dir, exist_ok=True)
        for preset_type in self._DEFAULT_PRESET_TYPES:
            os.makedirs(os.path.join(prompt_dir, preset_type), exist_ok=True)
        return prompt_dir
```

并新增一个统一解析助手（放在 `_default_preset_root` 旁边即可，例如紧跟其后）：
```python
    def _resolve_preset_root(self):
        raw = str(self._get_preset_root() or "").strip()
        if not raw:
            raw = self._default_preset_root()
        return os.path.abspath(raw)
```

注：`_save_prompt_preset`（第 250-299 行）本身**不直接** join `prompt`——它通过 `_preset_file_path → _preset_type_dir → _preset_root_dir` 取根，已在 (3c) 收口，无需再改；同理 `_delete_prompt_preset` 也自动跟随。这就满足"`_read_presets/_preset_root_dir/_save_prompt_preset` 用它替代 `os.path.join(self._get_user_dir(),'prompt')`"。

**(3d) `server.py` —— 注入 `preset_root_getter` + 系统整表切到库**

Read 第 779-785 行后改：

before：
```python
LIBRARY_FILE_ROUTE_SERVICE = LibraryFileRouteService(
    user_dir_getter=lambda: USER_DIR,
    asset_thumbs_dir_getter=lambda: ASSET_THUMBS_DIR,
    workflow_thumbs_dir_getter=lambda: WORKFLOW_THUMBS_DIR,
    preset_definitions_path_getter=lambda: os.path.join(USER_DIR, "prompt-presets.json"),
    preset_definitions_seed_path_getter=lambda: RUNTIME_PATHS["seedPresetDefinitionsPath"],
)
```

after：
```python
LIBRARY_FILE_ROUTE_SERVICE = LibraryFileRouteService(
    user_dir_getter=lambda: USER_DIR,
    asset_thumbs_dir_getter=lambda: ASSET_THUMBS_DIR,
    workflow_thumbs_dir_getter=lambda: WORKFLOW_THUMBS_DIR,
    preset_definitions_path_getter=lambda: (
        derive_library_paths(LIBRARY_DIR)["presetDefinitionsPath"]
        if _library_enabled()
        else os.path.join(USER_DIR, "prompt-presets.json")
    ),
    preset_definitions_seed_path_getter=lambda: RUNTIME_PATHS["seedPresetDefinitionsPath"],
    preset_root_getter=lambda: (
        derive_library_paths(LIBRARY_DIR)["presetRootDir"]
        if _library_enabled()
        else os.path.join(USER_DIR, "prompt")
    ),
)
```

`derive_library_paths`、`_library_enabled`、`LIBRARY_DIR` 均由 **Task 0** 在 server.py 顶部 import / 模块全局定义，本任务直接使用，**不补兜底 import**。

- [ ] **Step 4: 跑测试确认通过**

Run（单测不依赖 server.py，可独立验证服务层）：
```
python -m unittest library_file_route_service_test -v
```
Expected: OK，全部用例通过（含 3 个新用例 + 原 9 个）。

如需顺带核 server.py 仍可 import（依赖 Task1/2/3 已落地），Run：
```
python -c "import server"
```
Expected: 无异常退出（exit 0）。若 Task1/2/3 尚未合入导致 `derive_library_paths`/`LIBRARY_DIR`/`_library_enabled` 未定义而报错，属预期的合并顺序问题，待依赖任务合入后复跑。

- [ ] **Step 5: 提交**

```
git add services/library_file_route_service.py library_file_route_service_test.py server.py
git commit -m "feat(library): custom + system presets follow shared library dir via preset_root_getter"
```

---

### Task 5: 多机共享 output 防撞号——输出文件名加机器前缀

把生成文件名从 `gen_{date}_{seq}.{ext}` 改为 `gen_{machine_id}_{date}_{seq}.{ext}`，让多台机器写同一个共享 `output/` 目录时序号不互相撞号。命名/解析纯逻辑抽进 `services/library_storage.py`（可单测），`server.py` 只做薄包装。扫描正则既能认带前缀的历史名、也能认旧的无前缀名（升级平滑），但**只把本机前缀的序号纳入"已用最大序号"**，避免别的机器把本机序号拉高。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\library_storage.py`（新增 `next_gen_filename` + `parse_gen_seq` 两个纯函数）
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`（`_scan_max_gen_seq_for_date` 与 `_next_gen_output_filename` 改用新 helper）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\library_storage_test.py`（追加 `NextGenFilenameTest` / `ParseGenSeqTest`）

> 说明：`services/library_storage.py` 与 `library_storage_test.py` 已由前序任务建立（含 derive_library_paths / validate_library_dir / library_status / machine_id / atomic_replace_with_retry，18 测全绿）。本任务**只追加**，不改既有内容。`server.py` 改动行号以函数名为准（会漂移）。

---

- [ ] **Step 1: 写失败测试**

在 `library_storage_test.py` 顶部 import 行里加上 `next_gen_filename, parse_gen_seq`，并在文件末尾 `if __name__ == "__main__":` 之前追加两个测试类。

先把 import 块改成（before/after，精确匹配现有 6~12 行）：

```python
# before
from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_status,
    machine_id,
    validate_library_dir,
)
```

```python
# after
from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_status,
    machine_id,
    next_gen_filename,
    parse_gen_seq,
    validate_library_dir,
)
```

然后在 `library_storage_test.py` 的 `if __name__ == "__main__":`（约第 216 行）之前插入下列两个测试类（完整真实代码）：

```python
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
```

- [ ] **Step 2: 跑测试确认失败**
  Run: `"D:\Aic\huanying-source-windows-20260430-122116\venv\Scripts\python.exe" -m unittest library_storage_test -v`
  Expected: **FAIL** — `ImportError: cannot import name 'next_gen_filename' from 'services.library_storage'`（函数尚未实现，import 阶段即报错，整个模块加载失败）。

- [ ] **Step 3: 最小实现**

**(3a) 在 `services/library_storage.py` 末尾**（`atomic_replace_with_retry` 之后，约第 166 行末尾）追加两个纯函数。当前文件最后一段是：

```python
    if last_exc is not None:
        raise last_exc
```

在该行之后追加（注意文件末尾保留一个换行）：

```python


def _normalize_ext(ext):
    """统一扩展名：去掉前导点、去空白、转小写。空则返回空串。"""
    raw = "" if ext is None else str(ext).strip()
    return raw[1:] if raw.startswith(".") else raw


def next_gen_filename(machine, date_str, seq, ext):
    """构造带机器前缀的生成文件名：gen_{machine}_{date}_{seq:04d}.{ext}。

    纯函数，不读全局、不落盘；machine 通常来自 machine_id()，date_str 形如
    '20260616'，seq 为正整数（按 4 位补零）。多机写同一 output 目录时，
    机器段保证文件名不互撞。
    """
    mid = str(machine or "host")
    seq_str = str(int(seq)).zfill(4)
    suffix = _normalize_ext(ext)
    base = f"gen_{mid}_{date_str}_{seq_str}"
    return f"{base}.{suffix}" if suffix else base


def parse_gen_seq(filename, machine, date_str):
    """从生成文件名里解析出本机该日期的序号；不属于本机/本日则返回 None。

    认两种历史命名：
      - 带机器前缀:  gen_{machine}_{date}_{seq}.{ext}（本机才认领）
      - 旧无前缀:    gen_{date}_{seq}.{ext}（升级前的历史文件，本机一并认领以防重号）
    别的机器的前缀(gen_{other}_{date}_..) 一律不认，避免跨机把本机序号拉高。
    machine/date 都按字面转义，machine 里的 '-' 不当元字符。
    """
    name = os.path.basename(str(filename or ""))
    mid = re.escape(str(machine or "host"))
    date = re.escape(str(date_str or ""))
    # 扩展名段限制 1~5 位字母数字，与 server 端 _scan 旧正则保持一致。
    prefixed = re.compile(r"^gen_" + mid + r"_" + date + r"_(\d+)\.[a-z0-9]{1,5}$")
    legacy = re.compile(r"^gen_" + date + r"_(\d+)\.[a-z0-9]{1,5}$")
    m = prefixed.match(name) or legacy.match(name)
    if not m:
        return None
    try:
        return int(m.group(1))
    except (TypeError, ValueError):
        return None
```

**(3b) 在 `server.py` 顶部确认 import**：`services.library_storage` 里的 `machine_id` 在本任务里要用到。先检查 server.py 是否已 import（前序任务可能已加）。若文件中已存在形如 `from services.library_storage import ...` 的行，就把 `machine_id, next_gen_filename, parse_gen_seq` 并入；若尚无，则在 server.py 其它 `from services.xxx import` 群组附近新增一行：

```python
from services.library_storage import machine_id, next_gen_filename, parse_gen_seq
```

> 实现者执行前请 `Grep -n "from services.library_storage" server.py` 确认当前状态，避免重复 import。

**(3c) 改 `server.py` 的 `_scan_max_gen_seq_for_date`**（约 1847~1864 行）。Before（精确现状）：

```python
def _scan_max_gen_seq_for_date(date_str):
    try:
        pat = re.compile(r"^gen_" + re.escape(date_str) + r"_(\d+)\.[a-z0-9]{1,5}$")
        max_n = 0
        for root, _, files in os.walk(OUTPUT_DIR):
            for fn in files:
                m = pat.match(fn)
                if not m:
                    continue
                try:
                    n = int(m.group(1))
                    if n > max_n:
                        max_n = n
                except Exception:
                    continue
        return max_n
    except Exception:
        return 0
```

After：

```python
def _scan_max_gen_seq_for_date(date_str):
    try:
        mid = machine_id()
        max_n = 0
        for root, _, files in os.walk(OUTPUT_DIR):
            for fn in files:
                # 只数本机前缀（含旧的无前缀历史名）；别机文件不纳入，避免跨机拉高序号。
                n = parse_gen_seq(fn, mid, date_str)
                if n is None:
                    continue
                if n > max_n:
                    max_n = n
        return max_n
    except Exception:
        return 0
```

**(3d) 改 `server.py` 的 `_next_gen_output_filename`**（约 1866~1886 行）。只需改最后两行的文件名构造，序号状态/锁逻辑保持不变。Before（末尾两行）：

```python
    seq = str(n).zfill(4)
    return f"gen_{date_str}_{seq}.{ext}"
```

After：

```python
    return next_gen_filename(machine_id(), date_str, n, ext)
```

> 说明：`next_gen_filename` 内部已做 `zfill(4)` 与 ext 归一，产出 `gen_{machine}_{date}_{seq:04d}.{ext}`（**ext 不含前导点**，调用方传 `"png"` 非 `".png"`；点号由 helper 在 `{seq}.{ext}` 处加，绝不出现 `{seq}{ext}` 缺点号写法）。原先的 `seq = str(n).zfill(4)` 一行删除即可。`GEN_SEQ_STATE_FILE`（按 `date_str` 键）与 `_gen_seq_lock` 维持本机递增计数；扫描(3c)负责跨机防撞，二者互补。

- [ ] **Step 4: 跑测试确认通过**
  Run（先单测新逻辑，再回归整套服务测试不破坏既有契约）：
  ```
  "D:\Aic\huanying-source-windows-20260430-122116\venv\Scripts\python.exe" -m unittest library_storage_test -v
  ```
  Expected: **OK** — `NextGenFilenameTest` 5 项 + `ParseGenSeqTest` 7 项全过；原有 18 项保持绿色，合计 `Ran 30 tests ... OK`。

  冒烟校验 server 仍能 import（不依赖 GUI/网络）：
  ```
  "D:\Aic\huanying-source-windows-20260430-122116\venv\Scripts\python.exe" -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read()); print('server.py syntax OK')"
  ```
  Expected: `server.py syntax OK`。

- [ ] **Step 5: 提交**
  ```
  git add services/library_storage.py library_storage_test.py server.py
  git commit -m "feat(library): 多机共享 output 防撞号——文件名加机器前缀

next_gen_filename/parse_gen_seq 纯函数抽进 services.library_storage；
server._scan_max_gen_seq_for_date 只数本机前缀(含旧无前缀历史名)，
_next_gen_output_filename 产出 gen_{machine}_{date}_{seq}.{ext}。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

**为什么这样切分（评审备注）**
- 命名/解析是纯字符串逻辑，抽到 `library_storage.py` 后用真值表测，符合"可测服务 + 薄 server"铁律；`server.py` 两处只剩薄包装。
- 扫描用 `parse_gen_seq(fn, machine_id(), date)` 替代原裸正则：本机前缀 + 旧无前缀都认领（升级当天不丢序号、不重号），别机前缀一律 None（核心防撞）。`machine` 与 `date` 都 `re.escape`，规避 machine_id 里 `-` 被当元字符。
- `.gen_seq_state.json` 仍按 date 键、走 `_gen_seq_lock`，是本机快路径；扫描是跨机兜底。即使 state 文件落在共享盘也只影响本机计数起点，最终文件名因机器段不会撞。

---

### Task 6: 出厂私有默认覆盖（private_defaults）对共享库预设安全 + marker 仍落本地 writable_root + user/ 旧预设残留清理

**背景与关键事实（先 Read 真实代码已确认）**

`services/runtime_paths.py` 现状（函数名为准，行号会漂移）：
- `_should_overwrite_private_default(rel_path)`（约 178-189）：只有 `rel_path`（相对 `writable_root` 的 posix 路径）**字面**命中 `user/config.json`、`user/prompt-presets.json`、`user/prompt/...`、`user/tools/...` 才返回 `True`（出厂强制覆盖）。
- `_copy_private_defaults(defaults_root, writable_root)`（约 192-225）：只走 `defaults_root` 树、只写 `writable_root`；非覆盖项遇 `os.path.exists(dst)` 跳过。**从不触碰 libraryDir**。
- `apply_private_defaults(...)`（约 228-273）：marker 路径写死 `marker_path = os.path.join(writable_root, marker_name)`；按 `manifestHash` 判 `already-applied`。

由本计划契约，预设迁到 `libraryDir/presets/prompt-presets.json` 与 `libraryDir/presets/prompt/*.txt`（见 `derive_library_paths`）。这些路径**不在** `writable_root/user/` 下，因此 `_should_overwrite_private_default` 字面条件天然不命中 → 库预设不会被出厂覆盖打回。**本任务不改 `_should_overwrite_private_default` 的判定逻辑**（改了反而引入风险），而是：
1. 写**回归锁定测试**固化"库风格预设路径不被强制覆盖"这一现状（守卫未来有人手贱把 `presets/` 加进覆盖名单）；
2. 写测试断言 marker **始终落 `writable_root`、绝不落 `libraryDir`**（多机各判各的 already-applied，避免 A 机写库 marker 害 B 机跳过出厂初始化）；
3. 新增纯函数 `cleanup_legacy_user_presets`，给出"迁移后旧 `user/prompt-presets.json` 与 `user/prompt/` 残留"的清理/忽略策略（默认 dry-run=忽略，只报告；显式调用才删），并配测试。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\runtime_paths.py`（新增 `cleanup_legacy_user_presets` 纯函数；不改既有覆盖判定）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\private_defaults_test.py`（在现有 `PrivateDefaultsTests` 后追加新用例 + 新增 `cleanup_legacy_user_presets` 导入）

> 全部纯函数 + 临时目录，不联网、不依赖 server.py、与现有 `*_test.py` 仓库根约定一致（`python -m unittest <module> -v`）。

---

- [ ] **Step 1: 写失败测试（扩展 private_defaults_test.py）**

在 `D:\Aic\huanying-source-windows-20260430-122116\private_defaults_test.py` 顶部 import 行（当前第 7 行）从：

```python
from services.runtime_paths import apply_private_defaults, summarize_model_registry_for_log
```

改为：

```python
from services.runtime_paths import (
    apply_private_defaults,
    cleanup_legacy_user_presets,
    summarize_model_registry_for_log,
)
```

并在 `PrivateDefaultsTests` 类内（`test_model_registry_log_summary_excludes_api_keys` 方法之后、类结束之前）追加以下 4 个测试方法（缩进 4 空格，与同类方法对齐）：

```python
    def test_library_style_preset_paths_are_never_force_overwritten(self):
        # 回归锁定:迁库后预设落 libraryDir/presets/...,不在 writable_root/user/ 下,
        # 出厂私有默认绝不能强制覆盖它。这里用 presets/ 与 library/presets/ 两种
        # "库风格"相对路径,断言 _should_overwrite_private_default 判定为 False,
        # 且 _copy_private_defaults 在目标已存在时跳过(不打回用户/团队改动)。
        from services.runtime_paths import (
            _copy_private_defaults,
            _should_overwrite_private_default,
        )

        for rel in (
            "presets/prompt-presets.json",
            "presets/prompt/my-style.txt",
            "library/presets/prompt-presets.json",
        ):
            self.assertFalse(
                _should_overwrite_private_default(rel),
                f"{rel} 不应被出厂强制覆盖",
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            (defaults_root / "presets" / "prompt").mkdir(parents=True)
            (writable_root / "presets" / "prompt").mkdir(parents=True)

            # 出厂带的"库风格"预设
            (defaults_root / "presets" / "prompt-presets.json").write_text(
                '{"presets":["bundled"]}', encoding="utf-8"
            )
            (defaults_root / "presets" / "prompt" / "my-style.txt").write_text(
                "bundled-style", encoding="utf-8"
            )
            # 目标已存在团队/用户改动
            target_json = writable_root / "presets" / "prompt-presets.json"
            target_txt = writable_root / "presets" / "prompt" / "my-style.txt"
            target_json.write_text('{"presets":["team-edited"]}', encoding="utf-8")
            target_txt.write_text("team-edited-style", encoding="utf-8")

            stats = _copy_private_defaults(defaults_root, writable_root)

            # 已存在 + 非覆盖 => 全部跳过,内容原封不动
            self.assertEqual(stats["overwritten"], 0)
            self.assertEqual(
                target_json.read_text(encoding="utf-8"), '{"presets":["team-edited"]}'
            )
            self.assertEqual(
                target_txt.read_text(encoding="utf-8"), "team-edited-style"
            )

    def test_marker_lands_in_writable_root_never_in_library_dir(self):
        # marker 必须写在本机 writable_root,绝不写进共享库目录,
        # 否则 A 机写库 marker 会让 B 机误判 already-applied、跳过出厂初始化。
        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            library_dir = Path(temp_dir) / "nas" / "team-lib"
            (defaults_root / "user").mkdir(parents=True)
            writable_root.mkdir(parents=True)
            library_dir.mkdir(parents=True)
            (defaults_root / "user" / "config.json").write_text(
                '{"modelRegistry":{}}', encoding="utf-8"
            )

            marker_name = ".private_defaults_applied.json"
            result = apply_private_defaults(
                defaults_root,
                writable_root,
                manifest={"buildId": "marker-loc"},
                marker_name=marker_name,
            )

            self.assertTrue(result["applied"])
            # marker 落本机
            self.assertTrue((writable_root / marker_name).exists())
            # marker 绝不落库
            self.assertFalse((library_dir / marker_name).exists())
            # 库目录完全没被这条出厂流程写入任何东西
            self.assertEqual(list(library_dir.iterdir()), [])

    def test_cleanup_legacy_user_presets_dry_run_reports_without_deleting(self):
        # 默认策略=忽略:dry_run=True 只报告残留、不删,出厂行为不惊扰用户。
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_root = Path(temp_dir) / "writable"
            (writable_root / "user" / "prompt").mkdir(parents=True)
            legacy_json = writable_root / "user" / "prompt-presets.json"
            legacy_txt = writable_root / "user" / "prompt" / "old-style.txt"
            legacy_json.write_text('{"presets":["legacy"]}', encoding="utf-8")
            legacy_txt.write_text("legacy-style", encoding="utf-8")

            report = cleanup_legacy_user_presets(writable_root)  # dry_run 默认 True

            self.assertFalse(report["removed"])
            self.assertTrue(report["dryRun"])
            found_posix = {p.replace("\\", "/") for p in report["found"]}
            self.assertIn("user/prompt-presets.json", found_posix)
            self.assertIn("user/prompt", found_posix)
            # 真没删
            self.assertTrue(legacy_json.exists())
            self.assertTrue(legacy_txt.exists())

    def test_cleanup_legacy_user_presets_removes_when_enabled(self):
        # 显式 dry_run=False 才真删旧 user/ 预设残留;缺失项安全降级、不报错。
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_root = Path(temp_dir) / "writable"
            (writable_root / "user" / "prompt").mkdir(parents=True)
            legacy_json = writable_root / "user" / "prompt-presets.json"
            legacy_txt = writable_root / "user" / "prompt" / "old-style.txt"
            legacy_json.write_text('{"presets":["legacy"]}', encoding="utf-8")
            legacy_txt.write_text("legacy-style", encoding="utf-8")
            # user/config.json 等其它文件不在清理范围,必须保留
            (writable_root / "user" / "config.json").write_text("{}", encoding="utf-8")

            report = cleanup_legacy_user_presets(writable_root, dry_run=False)

            self.assertFalse(report["dryRun"])
            removed_posix = {p.replace("\\", "/") for p in report["removed"]}
            self.assertIn("user/prompt-presets.json", removed_posix)
            self.assertIn("user/prompt", removed_posix)
            self.assertFalse(legacy_json.exists())
            self.assertFalse((writable_root / "user" / "prompt").exists())
            # 非预设文件不动
            self.assertTrue((writable_root / "user" / "config.json").exists())

            # 二次调用:残留已不存在,安全降级、报告为空、不抛
            again = cleanup_legacy_user_presets(writable_root, dry_run=False)
            self.assertEqual(again["found"], [])
            self.assertEqual(again["removed"], [])
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```
python -m unittest private_defaults_test -v
```
Expected: FAIL — 4 个新用例报 `ImportError: cannot import name 'cleanup_legacy_user_presets' from 'services.runtime_paths'`（import 行就崩，整模块加载失败）。`_should_overwrite_private_default` / `_copy_private_defaults` 的私有 import 本身会成功（它们已存在），失败点是 `cleanup_legacy_user_presets` 尚未定义。

- [ ] **Step 3: 最小实现（services/runtime_paths.py 新增纯函数）**

Read `D:\Aic\huanying-source-windows-20260430-122116\services\runtime_paths.py`，确认顶部已 `import os`、`import shutil`、`from pathlib import Path`（现状第 1、4、7 行均在，无需新增 import）。

在 `apply_private_defaults` 函数结束之后（当前约第 273 行 `return {"found": True, "applied": True, "reason": "applied", **stats}` 的下一空行）、`summarize_model_registry_for_log` 之前，插入以下新函数：

before（锚点片段，文件现有内容）：
```python
    return {"found": True, "applied": True, "reason": "applied", **stats}


def summarize_model_registry_for_log(config):
```

after（在两者之间插入新函数）：
```python
    return {"found": True, "applied": True, "reason": "applied", **stats}


# 迁库后(预设落 libraryDir/presets/...),本机 writable_root/user 下的旧预设残留
# 不再被读取。默认策略=忽略:只在显式 dry_run=False 时清理,避免惊扰用户。
_LEGACY_USER_PRESET_TARGETS = (
    "user/prompt-presets.json",  # 单文件
    "user/prompt",               # 逐 txt 预设目录(整目录)
)


def cleanup_legacy_user_presets(writable_root, *, dry_run=True):
    """报告/清理迁库后遗留在本机 user/ 下的旧预设残留。

    迁移后系统预设整表与逐 txt 预设改读 libraryDir/presets/*,
    writable_root/user/prompt-presets.json 与 writable_root/user/prompt/
    成为不再被读取的死副本。本函数:
      - 始终只作用于本机 writable_root(绝不触碰 libraryDir);
      - dry_run=True(默认)只报告 found、不删;
      - dry_run=False 才真删,缺失项安全降级、不抛。

    返回 {"writableRoot": str, "dryRun": bool, "found": [rel...], "removed": [rel...]}。
    found/removed 用 posix 相对路径(相对 writable_root)。
    """
    writable_root = os.path.abspath(os.fspath(writable_root))
    found = []
    removed = []
    for rel in _LEGACY_USER_PRESET_TARGETS:
        target = os.path.join(writable_root, *rel.split("/"))
        if not os.path.exists(target):
            continue
        found.append(rel)
        if dry_run:
            continue
        try:
            if os.path.isdir(target):
                shutil.rmtree(target)
            else:
                os.remove(target)
            removed.append(rel)
        except Exception:
            # 残留删不掉(占用/权限)不应阻断启动:报告 found、不计入 removed。
            pass
    return {
        "writableRoot": writable_root,
        "dryRun": bool(dry_run),
        "found": found,
        "removed": removed,
    }


def summarize_model_registry_for_log(config):
```

> 说明（无法给字面代码处不存在——本步全是真实可运行 Python）：
> - 本任务**刻意不修改** `_should_overwrite_private_default` / `_copy_private_defaults` / `apply_private_defaults` 三个既有函数。库预设安全（①）与 marker 留本地（②）都是这三者的**现状行为**，Step 1 的前两个测试是**回归锁定**而非驱动改动——这是 de-risk 守卫，防止后续有人把 `presets/` 错误加入覆盖名单或把 marker 改写到 libraryDir。
> - ③ 的清理策略落地为 `cleanup_legacy_user_presets`：默认 dry-run（=忽略，符合"出厂不惊扰"）。本任务只交付纯函数 + 测试；**真删调用点在 Task 10**（迁移完成后由 Task 10 显式 `dry_run=False` 调用，见 Task 10 Step 接线）。
> - **§8.6① seed 不写库的真机确认归 Task 12 §11.2 冒烟**（本任务①② 只用回归锁定测试守现状，端到端 seed 落点由 §11.2 真机验证）。

- [ ] **Step 4: 跑测试确认通过**

Run:
```
python -m unittest private_defaults_test -v
```
Expected: PASS — 8 个用例（原 4 + 新 4）全 ok，`OK`。同时回归全套不受影响：
```
python -m unittest library_storage_test private_defaults_test -v
```
Expected: 两模块全 ok。

- [ ] **Step 5: 提交**

```
git add services/runtime_paths.py private_defaults_test.py
git commit -m "feat(library): 锁定出厂私有默认对共享库预设安全 + marker 留本地 + 旧 user/ 预设残留清理纯函数"
```

---

### Task 7: 把易竞态的写改原子 + SMB 重试（预设/资产/工作流/项目写）

**背景（已 Read 真实文件确认）**

- `services/library_storage.py:145` 已有 `atomic_replace_with_retry(tmp_path, dst_path, attempts=5, base_delay=0.05)`（Task1 产出，仅 import stdlib，无循环依赖风险）。本任务只**接线 + 加服务级测试**，不重写它。
- `services/library_file_route_service.py:176-185` 的 `_write_preset_definitions` 现在是**裸 `open(path,"w")` 直写**——写半截会污染 NAS 上的整表预设文件，且 SMB 占用直接 `PermissionError`。
- `services/json_file_route_service.py:182-204` 的 `_save_asset`/`_save_workflow` 用静态 `_write_json_file`（裸 `open`，无 temp、无重试）；而 `_save_project`(line 161-180) 已经用注入的 `self._atomic_write_json`。三者对齐才一致。
- `server.py:1831-1845` 的 `_atomic_write_json` 已做 temp+fsync，但**收尾用裸 `os.replace`**（无 SMB 重试）。它经 `server.py:777` 的 lambda 注入 `JsonFileRouteService`。把这一处替换收口，`_save_project`/`_save_asset`/`_save_workflow` 全部继承 SMB 重试。

**Files:**

- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\library_file_route_service.py`（`_write_preset_definitions` 改 temp+`atomic_replace_with_retry`）
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\json_file_route_service.py`（`_save_asset`/`_save_workflow` 改用注入的 `self._atomic_write_json`）
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`（`_atomic_write_json` 收尾改调用 `library_storage.atomic_replace_with_retry`）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\library_file_route_service_test.py`（扩展：原子写 + 重试）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\json_file_route_service_test.py`（扩展：asset/workflow 走注入 writer）

---

- [ ] **Step 1: 写失败测试（library 预设整表写）**

  在 `library_file_route_service_test.py` 顶部把 import 补成：

  ```python
  import json
  import os
  import tempfile
  import unittest
  from unittest import mock

  from services.library_file_route_service import LibraryFileRouteService
  ```

  在 `class LibraryFileRouteServiceTests` 末尾（`if __name__` 之前）追加三个测试。注意 patch 目标是 **`services.library_file_route_service.atomic_replace_with_retry`**（因为实现会 `from services.library_storage import atomic_replace_with_retry`，名字绑定在调用方模块）：

  ```python
    def test_save_preset_definitions_writes_via_atomic_replace_no_partial(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            os.makedirs(os.path.dirname(definitions_path), exist_ok=True)
            # 先放一份完好旧内容，验证失败时不被写半截覆盖
            with open(definitions_path, "w", encoding="utf-8") as file:
                json.dump({"ai-image": [{"title": "OLD", "template": "old"}]}, file)
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )

            with mock.patch(
                "services.library_file_route_service.atomic_replace_with_retry",
                side_effect=OSError("boom"),
            ) as replace_mock:
                response = service.handle_post(
                    handler=None,
                    path="/api/v2/user/presets/definitions/save",
                    body=json.dumps(
                        {"definitions": {"ai-image": [{"title": "NEW", "template": "new"}]}}
                    ).encode("utf-8"),
                )

            # 走了原子替换路径
            self.assertTrue(replace_mock.called)
            tmp_arg, dst_arg = replace_mock.call_args.args[0], replace_mock.call_args.args[1]
            self.assertEqual(dst_arg, definitions_path)
            self.assertTrue(tmp_arg.endswith(".tmp"))
            # 失败被收口成 json_err，旧整表内容完好（没被写半截）
            self.assertEqual(response["kind"], "json_err")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-image"][0]["title"], "OLD")
            # 临时文件已清理
            self.assertFalse(os.path.exists(definitions_path + ".tmp"))

    def test_save_preset_definitions_retries_replace_then_succeeds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )

            calls = {"n": 0}
            real_replace = os.replace

            def flaky_replace(tmp_path, dst_path, attempts=5, base_delay=0.05):
                calls["n"] += 1
                if calls["n"] < 3:
                    raise PermissionError(13, "Sharing violation")
                real_replace(tmp_path, dst_path)

            with mock.patch(
                "services.library_file_route_service.atomic_replace_with_retry",
                side_effect=flaky_replace,
            ):
                response = service.handle_post(
                    handler=None,
                    path="/api/v2/user/presets/definitions/save",
                    body=json.dumps(
                        {"definitions": {"ai-video": [{"title": "pan", "template": "camera pan"}]}}
                    ).encode("utf-8"),
                )

            self.assertEqual(response["kind"], "json_ok")
            self.assertEqual(calls["n"], 3)
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-video"][0]["template"], "camera pan")
            self.assertFalse(os.path.exists(definitions_path + ".tmp"))

    def test_save_preset_definitions_uses_real_retry_helper_to_persist(self):
        # 不 patch helper，端到端验证真实 atomic_replace_with_retry 落盘
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )
            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/definitions/save",
                body=json.dumps(
                    {"definitions": {"ai-image": [{"title": "real", "template": "t"}]}}
                ).encode("utf-8"),
            )
            self.assertEqual(response["kind"], "json_ok")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-image"][0]["title"], "real")
  ```

- [ ] **Step 2: 写失败测试（json asset/workflow 走注入 writer）**

  在 `json_file_route_service_test.py` 把 `_build_service` 改成可注入 spy writer，并新增两个测试。顶部 import 补 `import os`、`from unittest import mock`：

  ```python
  import os
  import tempfile
  import unittest
  from unittest import mock

  from services.json_file_route_service import JsonFileRouteService
  ```

  把 `_build_service` 改为（加 `atomic_write_json` 可选参数，默认仍是 no-op，保持旧测试不变）：

  ```python
      def _build_service(self, temp_dir, *, atomic_write_json=None):
          return JsonFileRouteService(
              canvas_dir_getter=lambda: temp_dir,
              assets_dir_getter=lambda: temp_dir,
              workflows_dir_getter=lambda: temp_dir,
              user_dir_getter=lambda: temp_dir,
              read_user_settings=lambda: {},
              write_user_settings=lambda data: None,
              atomic_write_json=(atomic_write_json or (lambda path, data: None)),
          )
  ```

  在 `if __name__` 之前追加：

  ```python
      def test_save_asset_uses_injected_atomic_writer(self):
          with tempfile.TemporaryDirectory() as temp_dir:
              calls = []
              service = self._build_service(
                  temp_dir,
                  atomic_write_json=lambda path, data: calls.append((path, data)),
              )

              result = service.handle_post(
                  handler=None,
                  path="/api/v2/assets/save",
                  body=b'{"id": "asset-1", "name": "demo"}',
              )

              self.assertEqual(result["kind"], "json_ok")
              self.assertEqual(result["data"]["id"], "asset-1")
              self.assertEqual(len(calls), 1)
              written_path, written_data = calls[0]
              self.assertEqual(written_path, os.path.join(temp_dir, "asset-1.json"))
              self.assertEqual(written_data["id"], "asset-1")

      def test_save_workflow_uses_injected_atomic_writer_and_defaults_scope(self):
          with tempfile.TemporaryDirectory() as temp_dir:
              calls = []
              service = self._build_service(
                  temp_dir,
                  atomic_write_json=lambda path, data: calls.append((path, data)),
              )

              result = service.handle_post(
                  handler=None,
                  path="/api/v2/workflows/save",
                  body=b'{"id": "wf-1"}',
              )

              self.assertEqual(result["kind"], "json_ok")
              self.assertEqual(len(calls), 1)
              written_path, written_data = calls[0]
              self.assertEqual(written_path, os.path.join(temp_dir, "wf-1.json"))
              self.assertEqual(written_data["scope"], "private")
  ```

- [ ] **Step 3: 跑测试确认失败** Run:
  ```
  cd D:\Aic\huanying-source-windows-20260430-122116
  python -m unittest library_file_route_service_test json_file_route_service_test -v
  ```
  Expected: FAIL。`library_*` 三测因 `_write_preset_definitions` 没调用 `atomic_replace_with_retry` 而失败（`AttributeError: <module> does not have attribute 'atomic_replace_with_retry'` 或 mock 未被调用 / 写半截覆盖了 OLD）；`json_*` 两测因 `_save_asset`/`_save_workflow` 仍走 `_write_json_file`、spy `calls` 为空而 `assertEqual(len(calls), 1)` 失败。

- [ ] **Step 4: 最小实现 — library 预设整表改 temp + 重试**

  `services/library_file_route_service.py`。先在文件顶部 import 区追加（before/after）：

  before:
  ```python
  import base64
  import json
  import os
  import re
  from urllib.parse import unquote
  ```
  after:
  ```python
  import base64
  import json
  import os
  import re
  from urllib.parse import unquote

  from services.library_storage import atomic_replace_with_retry
  ```

  再把 `_write_preset_definitions`（约 176-185）整段替换。

  before:
  ```python
      def _write_preset_definitions(self, definitions):
          path = self._preset_definitions_path()
          if not path:
              raise ValueError("Preset definitions path is not configured")
          parent = os.path.dirname(path)
          if parent:
              os.makedirs(parent, exist_ok=True)
          with open(path, "w", encoding="utf-8") as file:
              json.dump(definitions, file, ensure_ascii=False, indent=2)
              file.write("\n")
  ```
  after:
  ```python
      def _write_preset_definitions(self, definitions):
          path = self._preset_definitions_path()
          if not path:
              raise ValueError("Preset definitions path is not configured")
          parent = os.path.dirname(path)
          if parent:
              os.makedirs(parent, exist_ok=True)
          tmp_path = path + ".tmp"
          try:
              with open(tmp_path, "w", encoding="utf-8") as file:
                  json.dump(definitions, file, ensure_ascii=False, indent=2)
                  file.write("\n")
                  file.flush()
                  os.fsync(file.fileno())
              atomic_replace_with_retry(tmp_path, path)
          except Exception:
              try:
                  if os.path.exists(tmp_path):
                      os.remove(tmp_path)
              except OSError:
                  pass
              raise
  ```

  说明：`_save_preset_definitions`（line 323-340）已 `try/except ValueError` 收口成 `_json_err(400, ...)`。但 SMB 失败抛的是 `OSError/PermissionError`，不会被现有 `except ValueError` 接住。为对齐 Step 1 测试（期望失败时返回 `json_err`、旧整表完好），把 `_save_preset_definitions` 的 except 放宽到也接住写盘异常。before/after：

  before:
  ```python
          raw_definitions = data.get("definitions", data)
          try:
              normalized = self._normalize_preset_definitions(raw_definitions)
              self._write_preset_definitions(normalized)
          except ValueError as exc:
              return self._json_err(400, str(exc))
  ```
  after:
  ```python
          raw_definitions = data.get("definitions", data)
          try:
              normalized = self._normalize_preset_definitions(raw_definitions)
          except ValueError as exc:
              return self._json_err(400, str(exc))
          try:
              self._write_preset_definitions(normalized)
          except (OSError, ValueError) as exc:
              return self._json_err(500, f"Failed to write preset definitions: {exc}")
  ```

- [ ] **Step 5: 最小实现 — json asset/workflow 改用注入 atomic writer**

  `services/json_file_route_service.py`。`_save_asset`（约 182-191）before/after：

  before:
  ```python
          filename = self._safe_name(asset_id) + ".json"
          self._write_json_file(os.path.join(self._get_assets_dir(), filename), data)
          return self._json_ok({"success": True, "id": asset_id})
  ```
  after:
  ```python
          filename = self._safe_name(asset_id) + ".json"
          self._atomic_write_json(os.path.join(self._get_assets_dir(), filename), data)
          return self._json_ok({"success": True, "id": asset_id})
  ```

  `_save_workflow`（约 193-204）before/after：

  before:
  ```python
          filename = self._safe_name(workflow_id) + ".json"
          if not data.get("scope"):
              data["scope"] = "private"
          self._write_json_file(os.path.join(self._get_workflows_dir(), filename), data)
          return self._json_ok({"success": True, "id": workflow_id})
  ```
  after:
  ```python
          filename = self._safe_name(workflow_id) + ".json"
          if not data.get("scope"):
              data["scope"] = "private"
          self._atomic_write_json(os.path.join(self._get_workflows_dir(), filename), data)
          return self._json_ok({"success": True, "id": workflow_id})
  ```

  说明：保留静态 `_write_json_file`（line 81-85）不动——它仍被 `_save_user_json`（line 224）使用，本任务不动 user 设置写盘（那条由专门的设置校验/迁移逻辑负责，不在本任务范围）。

- [ ] **Step 6: 最小实现 — server.py 收口 `_atomic_write_json` 走 SMB 重试**

  `server.py`。先确认 import 区已 import `library_storage`（Task1/其它任务可能已加）。Read `server.py` 第 95-99 行附近，若没有 `from services.library_storage import ...` 则在 `from services.json_file_route_service import JsonFileRouteService`（line 98）下一行追加：

  ```python
  from services import library_storage
  ```

  然后改 `_atomic_write_json`（约 1831-1845）的收尾 `os.replace` 为重试版。before/after：

  before:
  ```python
  def _atomic_write_json(p, data):
      tmp = p + ".tmp"
      try:
          with open(tmp, "w", encoding="utf-8") as f:
              json.dump(data, f, ensure_ascii=False, indent=2)
              f.flush()
              os.fsync(f.fileno())
          os.replace(tmp, p)
      except Exception:
          try:
              if os.path.exists(tmp):
                  os.remove(tmp)
          except Exception:
              pass
          raise
  ```
  after:
  ```python
  def _atomic_write_json(p, data):
      tmp = p + ".tmp"
      try:
          with open(tmp, "w", encoding="utf-8") as f:
              json.dump(data, f, ensure_ascii=False, indent=2)
              f.flush()
              os.fsync(f.fileno())
          library_storage.atomic_replace_with_retry(tmp, p)
      except Exception:
          try:
              if os.path.exists(tmp):
                  os.remove(tmp)
          except Exception:
              pass
          raise
  ```

  注入 lambda（`server.py:777` `atomic_write_json=lambda path, data: _atomic_write_json(path, data)`）不用改——`_save_project`/`_save_asset`/`_save_workflow` 经它继承 SMB 重试。

- [ ] **Step 7: 跑测试确认通过** Run:
  ```
  cd D:\Aic\huanying-source-windows-20260430-122116
  python -m unittest library_file_route_service_test json_file_route_service_test -v
  ```
  Expected: OK，全部通过（原 11 测 + 新 5 测 = 16 测）。再跑 Task1 的 storage 测确认没回归：
  ```
  python -m unittest library_storage_test -v
  ```
  Expected: OK（若 Task1 测文件名不同，按其实际名跑）。

- [ ] **Step 8: 冒烟 import server.py 不炸**（混淆前端不涉及；server.py 是后端）Run:
  ```
  cd D:\Aic\huanying-source-windows-20260430-122116
  python -c "import ast; ast.parse(open('server.py', encoding='utf-8').read()); print('server.py parse OK')"
  ```
  Expected: `server.py parse OK`（仅语法 + 顶层结构校验，避免 import 触发启动副作用；若需更强校验且环境干净可改 `python -c "import server"`）。

- [ ] **Step 9: 提交** Run:
  ```
  cd D:\Aic\huanying-source-windows-20260430-122116
  git add services/library_file_route_service.py services/json_file_route_service.py server.py library_file_route_service_test.py json_file_route_service_test.py
  git commit -m "fix(library): atomic+SMB-retry writes for preset/asset/workflow/project (NAS shared lib)"
  ```

---

### Task 8: 库不可达时明确报错、不静默回退本地（启动期"未连接"态 + 运行时保存抛错）

**目标（PRD §8.9 / §9 表）**：
1. 启动期当 `libraryDir` 配置存在但不可达时，**不**回退 `DEFAULT_*`，而是进入"库未连接"态——置一个模块标志（`LIBRARY_DISCONNECTED`），`LIBRARY_DIR` 仍记住配置值，功能降级 + 启动日志告警。
2. 运行时保存路径不可达时直接抛错（保留 `_apply_file_save_paths` 内 `os.makedirs` 的真实抛出），并被路由层 / `_write_user_settings` 调用方转成明确 JSON 错误而非静默吞。
3. 把"判定可达 / 构造状态"的**纯逻辑**放 `services/library_storage.py`，复用既有 `library_status`，新增纯函数 `library_connection_state(library_dir)`。验证靠服务单测 + 断网冒烟。

**依赖**：本任务依赖 **Task 0**（`LIBRARY_DIR` 模块全局、`_library_enabled()`、顶部 import 库纯函数）与 **Task 2**（`_refresh_storage_globals` 库覆盖）。Task 0 已定义这两个符号，本任务只消费、不补兜底。

**Files:**
- Modify: `services/library_storage.py`（新增纯函数 `library_connection_state`）
- Modify: `server.py`（启动期回退块 ~639-649 改为"未连接"态接线；模块新增 `LIBRARY_DISCONNECTED` 标志 + `_library_connection_status()` 薄包装；`_write_user_settings` 保存失败口径统一）
- Test: `library_storage_test.py`（新增 `library_connection_state` 用例；既有 `library_status` 不可达用例已覆盖 reachable=False，补一条断言锚定）

---

- [ ] **Step 1: 写失败测试（纯逻辑层，先红）**

在 `library_storage_test.py` 顶部 import 增加 `library_connection_state`：

```python
from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_connection_state,
    library_status,
    machine_id,
    validate_library_dir,
)
```

在 `LibraryStatusTest` 类**之后**、`MachineIdTest` 之前插入新测试类：

```python
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
```

同时在既有 `LibraryStatusTest.test_nonexistent_dir_degrades_safely` 末尾**追加一行**显式锚定（防回归——这正是"未连接"判定的依据）：

```python
        status = library_status(missing)
        self.assertFalse(status["reachable"])
        self.assertFalse(status["writable"])
        self.assertEqual(
            status["counts"], {"assets": 0, "workflows": 0, "presets": 0}
        )
        # 不可达即 reachable=False —— server.py 启动期据此判定"未连接、不回退"
        self.assertIs(status["reachable"], False)
```

- [ ] **Step 2: 跑测试确认失败**
  Run: `python -m unittest library_storage_test -v`
  Expected: FAIL —— `ImportError: cannot import name 'library_connection_state' from 'services.library_storage'`（import 阶段即崩，所有用例报 error）。

- [ ] **Step 3-A: 最小实现（纯函数，library_storage.py）**

Read `services/library_storage.py`，在 `library_status` 函数**之后**（约 137 行 `return result` 后、`_is_sharing_violation` 之前）插入新纯函数：

```python
def library_connection_state(library_dir):
    """判定共享库连接态（纯逻辑，复用 library_status）。

    供 server.py 启动期决策"是否回退本地"。语义：
    - 未配库（空/None） -> enabled=False，既不 connected 也不 disconnected。
    - 配了库且可达     -> enabled=True, connected=True。
    - 配了库但不可达   -> enabled=True, disconnected=True（绝不静默当成"没配库"回退本地）。

    libraryDir 回显规范化绝对路径（已配库时），便于上层"记住配置值"。
    """
    raw = "" if library_dir is None else str(library_dir).strip()
    status = library_status(raw)
    if not raw:
        return {
            "enabled": False,
            "connected": False,
            "disconnected": False,
            "libraryDir": "",
            "status": status,
        }

    normalized = os.path.abspath(os.path.expandvars(os.path.expanduser(raw)))
    reachable = bool(status.get("reachable"))
    return {
        "enabled": True,
        "connected": reachable,
        "disconnected": not reachable,
        "libraryDir": normalized,
        "status": status,
    }
```

（`os`/`library_status` 已在模块顶部存在，无需新 import。）

- [ ] **Step 3-B: 最小实现（server.py 启动接线 —— 后端契约 + 行为级，附真实 before/after）**

Read `server.py`，**(b1)** 在 Task 0 引入的 `LIBRARY_DIR`/`_library_enabled()` 同一处，增加"未连接"标志与薄包装（`LIBRARY_DIR`/`_library_enabled` 与库纯函数 import 均由 Task 0 提供，**本任务不补兜底、不 try/except NameError**）：

```python
# 启动期判定为"配了库但不可达"时置 True：功能降级、UI 报错、不回退 DEFAULT_*。
LIBRARY_DISCONNECTED = False


def _library_connection_status():
    """server.py 薄包装：把判定逻辑全推给 library_storage 纯函数。"""
    return library_storage.library_connection_state(LIBRARY_DIR)
```

> 注：`library_connection_state` 新增于本任务（见 Step 3-A）；其调用形态 `library_storage.library_connection_state(...)` 依赖 Task 0 顶部对 `library_storage` 的 import。若 Task 0 用具名 import，则把它并入那一行。

**(b2)** 改造启动期回退块。Read 当前 `server.py` ~639-649：

*before（真实当前代码）：*
```python
try:
    _apply_file_save_paths(_file_save_paths_from_settings(_startup_settings), migrate=False)
except Exception:
    _apply_file_save_paths(
        {
            "userDir": DEFAULT_USER_DIR,
            "outputDir": DEFAULT_OUTPUT_DIR,
            "tempDir": DEFAULT_UPLOADS_DIR,
        },
        migrate=False,
    )
```

*after：*
```python
try:
    _apply_file_save_paths(_file_save_paths_from_settings(_startup_settings), migrate=False)
except Exception as exc:
    # 库不可达不静默回退本地（PRD §8.9）：
    # 配了库 + 失败 -> 停在"未连接"态（记住配置值、功能降级、日志告警），不抹成 DEFAULT_*。
    if _library_enabled():
        _conn = _library_connection_status()
        if _conn.get("disconnected"):
            LIBRARY_DISCONNECTED = True
            _startup_log(
                "WARNING library unreachable, entering DISCONNECTED state "
                "(NOT falling back to local). "
                f"libraryDir={_conn.get('libraryDir')!r} reason={exc}"
            )
            # 不调用 _apply_file_save_paths 回退；存储全局保持库路径口径，由 UI 报错。
        else:
            # 配了库但失败不是"不可达"（如校验/权限其它原因）-> 仍按未连接处理，避免悄悄回退。
            LIBRARY_DISCONNECTED = True
            _startup_log(
                "WARNING library apply failed but reachable!=disconnected; "
                f"holding DISCONNECTED, not falling back. reason={exc}"
            )
    else:
        # 未配库（纯本地模式）：维持历史行为——回退本机默认，保证应用可用。
        _apply_file_save_paths(
            {
                "userDir": DEFAULT_USER_DIR,
                "outputDir": DEFAULT_OUTPUT_DIR,
                "tempDir": DEFAULT_UPLOADS_DIR,
            },
            migrate=False,
        )
```

注意：`LIBRARY_DISCONNECTED = True` 在模块顶层（非函数内）赋值，等号左侧即模块全局，无需 `global`。本 try/except 块本就在模块顶层执行。

**(b3)** 运行时保存口径统一。Read `_write_user_settings`（~728-744）。其内部 `_apply_file_save_paths(...)` 对不可达路径本就因 `os.makedirs` 抛错；本任务只需确保该异常**向上传播**到路由层转 JSON 错误，**不**在此吞掉。当前代码未吞异常（无 try/except），故行为已正确——**仅追加注释锚定意图**，避免后人误加静默回退：

*before：*
```python
def _write_user_settings(data):
    payload = dict(data) if isinstance(data, dict) else {}
    if isinstance(payload.get("fileSavePaths"), dict):
        applied_paths = _apply_file_save_paths(payload["fileSavePaths"], migrate=True)
```

*after：*
```python
def _write_user_settings(data):
    payload = dict(data) if isinstance(data, dict) else {}
    if isinstance(payload.get("fileSavePaths"), dict):
        # 路径不可达时 _apply_file_save_paths 内 os.makedirs 直接抛 —— 故意不在此捕获，
        # 让异常传到路由层转成明确 JSON 错误（PRD §8.9 / §9 表"运行时保存"口径：
        # 明确报错、不静默回退本地）。切勿在此加 except 回退默认路径。
        applied_paths = _apply_file_save_paths(payload["fileSavePaths"], migrate=True)
```

（路由层把 `_write_user_settings` 的异常转 JSON 是既有 dispatcher 行为；如本仓 JsonFileRouteService 的 `write_user_settings` 调用点已 try/except→error 响应，则无需改动，仅靠本注释固化"不吞"约定。验证见 Step-断网冒烟。）

- [ ] **Step 4: 跑测试确认通过**
  Run: `python -m unittest library_storage_test -v`
  Expected: PASS —— 原 18 测 + 新 `LibraryConnectionStateTest` 5 测全过（`Ran 23 tests ... OK`）。
  补充 server 侧静态校验（不联网，仅确认接线无语法/NameError）：
  Run: `python -c "import ast,sys; ast.parse(open('server.py',encoding='utf-8').read()); print('server.py parses OK')"`
  Expected: `server.py parses OK`

  **断网冒烟（行为级，手动，记录于 §11.2）**：
  1. 设 `libraryDir` 指向一个真实 NAS 路径后断开网络/拔挂载，重启 server；
     - 期望：`launcher.log` 出现 `WARNING library unreachable, entering DISCONNECTED state (NOT falling back to local)`；
     - 期望：存储全局**未**被改写成 `DEFAULT_*`（不出现"以为写 NAS、实写本机"的状态分裂）；
     - 期望：`GET /api/v2/library/status` 返回 `reachable:false`（由 `library_status` 提供）。
  2. server 运行中保存 `fileSavePaths` 指向不可达库路径（`POST /api/v2/user/settings.json`）：
     - 期望：响应是明确错误 JSON（非 200 静默成功），日志可见 `os.makedirs` 抛出的真实错误，本机磁盘未被悄悄落地。

- [ ] **Step 5: 提交**
  Run:
  ```
  git add services/library_storage.py library_storage_test.py server.py
  git commit -m "feat(library): unreachable lib enters disconnected state, no silent local fallback (PRD §8.9)"
  ```

---

### Task 9: 库状态/计数只读 API（GET /api/v2/library/status）接线 + 路由级测试

把库状态查询接到 HTTP 路由分发。逻辑全在 `services.library_storage.library_status`（Task 1 已实现并单测），本任务 = 接线 + 一个路由级测试。沿用 dispatcher 现有的「构造器注入 getter」模式（与 `runtime_paths_getter` 一致），让 `HttpRouteDispatcher` 保持纯净：不 import `server`、不 import `library_storage`、不引用 `LIBRARY_DIR` 全局。新增构造参数 `library_status_getter`，server 侧注入 `lambda: library_status(LIBRARY_DIR)`。

**Files:**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\http_route_dispatcher.py`
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\server.py`
- Test: `D:\Aic\huanying-source-windows-20260430-122116\http_route_dispatcher_test.py`（扩展现有文件）

---

- [ ] **Step 1: 写失败测试**

在 `http_route_dispatcher_test.py` 里做两处改动。

(1) 给测试夹具 `_build_dispatcher`（约第 43-93 行）新增一个可选入参 `library_status_getter` 并把它透传给构造器。把方法签名里的 `sent_errors=None,` 一行替换为：

```python
        sent_errors=None,
        library_status_getter=None,
```

并在 `return HttpRouteDispatcher(` 的参数列表末尾（紧跟 `vimax_route_service_getter=lambda: vimax_service or _StubRouteService(),` 之后、`)` 之前）插入一行：

```python
            library_status_getter=library_status_getter,
```

(2) 在 `class HttpRouteDispatcherTests` 内部、`test_runtime_info_includes_distribution_and_storage_fields` 这个方法之后，新增以下三个测试方法（缩进为类方法级 4 空格）：

```python
    def test_library_status_get_returns_status_payload_as_json_ok(self):
        captured = {}
        status_payload = {
            "reachable": True,
            "writable": True,
            "counts": {"assets": 3, "workflows": 2, "presets": 1},
        }

        def fake_status_getter():
            captured["called"] = captured.get("called", 0) + 1
            return status_payload

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=fake_status_getter,
        )

        result = dispatcher.handle_get(handler=None, path="/api/v2/library/status")

        self.assertTrue(result)
        self.assertEqual(captured.get("called"), 1)
        # _json_ok stub returns the payload it was handed, so we can assert on it
        self.assertEqual(
            dispatcher._library_status_payload(),
            status_payload,
        )

    def test_library_status_get_does_not_reach_json_file_route(self):
        json_service = _StubRouteService(
            get_response={"kind": "json_ok", "data": {"should": "not be used"}}
        )
        sent_responses = []
        dispatcher = self._build_dispatcher(
            json_service=json_service,
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=lambda: {
                "reachable": False,
                "writable": False,
                "counts": {"assets": 0, "workflows": 0, "presets": 0},
            },
            sent_responses=sent_responses,
        )

        handled = dispatcher.handle_get(handler=None, path="/api/v2/library/status")

        self.assertTrue(handled)
        # library/status is matched before the json-file route fallthrough
        self.assertEqual(json_service.get_calls, [])

    def test_library_status_payload_falls_back_to_empty_when_getter_unset(self):
        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=lambda _handler: b"",
            library_status_getter=None,
        )

        self.assertEqual(dispatcher._library_status_payload(), {})
```

> 注：现有测试里 `json_ok=lambda handler, payload: payload`（约第 80 行），即 `_json_ok` 直接回传 payload。本测试不依赖 `send_route_response`（只读端点走 `_json_ok`），用 `_library_status_payload()` 辅助方法直接断言 getter 的产物，以及 handle_get 返回 True 且没下沉到 json-file 路由。

---

- [ ] **Step 2: 跑测试确认失败**

Run:
```
python -m unittest http_route_dispatcher_test -v
```
Expected: FAIL。`_build_dispatcher` 传入未知关键字 `library_status_getter` 会让 `HttpRouteDispatcher.__init__` 抛 `TypeError: __init__() got an unexpected keyword argument 'library_status_getter'`，三个新测试报 error；并且 `handle_get(.../library/status)` 当前会下沉到 json-file 路由（`_library_status_payload` 也不存在，`AttributeError`）。

---

- [ ] **Step 3: 最小实现**

**3a. `services/http_route_dispatcher.py` —— 构造器新增 getter。**

Read 第 84-89 行，当前为：
```python
        send_route_response,
        read_body,
        runtime_paths_getter=None,
    ):
```
改为（在 `runtime_paths_getter=None,` 后加一行）：
```python
        send_route_response,
        read_body,
        runtime_paths_getter=None,
        library_status_getter=None,
    ):
```

Read 第 117-119 行，当前为：
```python
        self._send_route_response = send_route_response
        self._read_body = read_body
        self._get_runtime_paths = runtime_paths_getter or (lambda: {})
```
在其后追加一行：
```python
        self._send_route_response = send_route_response
        self._read_body = read_body
        self._get_runtime_paths = runtime_paths_getter or (lambda: {})
        self._get_library_status = library_status_getter or (lambda: {})
```

**3b. 新增 `_library_status_payload` 辅助方法。**

在 `_runtime_info_payload`（结束于第 221 行的 `}`）之后、`_handle_subscription_status`（第 223 行）之前，插入：
```python
    def _library_status_payload(self):
        status = self._get_library_status()
        if not isinstance(status, dict):
            return {}
        return status

```

**3c. 在 `handle_get` 里挂只读路由。**

Read 第 334-338 行，当前为：
```python
    def handle_get(self, handler, path):
        if path == "/api/v2/runtime/info":
            self._json_ok(handler, self._runtime_info_payload())
            return True

```
改为（紧跟 runtime/info 块、在 canvas-agent 前缀块之前插入 library/status 块）：
```python
    def handle_get(self, handler, path):
        if path == "/api/v2/runtime/info":
            self._json_ok(handler, self._runtime_info_payload())
            return True

        if path == "/api/v2/library/status":
            self._json_ok(handler, self._library_status_payload())
            return True

```
> 这是精确路径匹配，排在所有路由服务 fallthrough 之前，保证不会下沉到 json-file 路由。`library_status` 内部已对不可达做安全降级（`reachable=False` 其余兜底），dispatcher 这层不需要 try/except。

**3d. `server.py` —— 注入 getter。**

`library_status` 与 `LIBRARY_DIR` 均由 **Task 0** 在 server.py 顶部 import / 模块全局定义，本任务直接 `library_status(LIBRARY_DIR)` 调用，**不补兜底 import**。

然后 Read `server.py` 第 1340-1348 行，当前为：
```python
    runtime_paths_getter=lambda: {
        "distribution": RUNTIME_PATHS["distribution"],
        "resourceRoot": RESOURCE_ROOT,
        "writableRoot": WRITABLE_ROOT,
        "userDir": USER_DIR,
        "outputDir": OUTPUT_DIR,
        "uploadsDir": UPLOADS_DIR,
    },
)
```
改为（在 `runtime_paths_getter` 这个 lambda 后、闭合 `)` 前加一行注入）：
```python
    runtime_paths_getter=lambda: {
        "distribution": RUNTIME_PATHS["distribution"],
        "resourceRoot": RESOURCE_ROOT,
        "writableRoot": WRITABLE_ROOT,
        "userDir": USER_DIR,
        "outputDir": OUTPUT_DIR,
        "uploadsDir": UPLOADS_DIR,
    },
    library_status_getter=lambda: library_status(LIBRARY_DIR),
)
```
> `LIBRARY_DIR` 是 server 模块全局（启用库=校验后的库根；未启用=`""`，见共享契约）。`library_status("")` 由 `library_status` 自身安全降级为 `reachable=False`，无需 dispatcher 兜底。getter 在每次请求时即时求值，库根切换后立刻反映最新状态。

---

- [ ] **Step 4: 跑测试确认通过**

Run:
```
python -m unittest http_route_dispatcher_test -v
```
Expected: OK。新增 3 个测试全过，旧测试不回归（`library_status_getter` 默认 `None` → `lambda: {}`，未传该参数的旧测试不受影响）。

可选冒烟（确认 server 模块仍能 import、注入无语法错）：
```
python -c "import server; print('ok', '/api/v2/library/status routed')"
```
Expected: 打印 `ok ...`（若 server 顶层有副作用启动则改为 `python -m py_compile server.py services/http_route_dispatcher.py` 验证编译通过）。

---

- [ ] **Step 5: 提交**

```
git add services/http_route_dispatcher.py server.py http_route_dispatcher_test.py
git commit -m "feat(library): GET /api/v2/library/status 只读端点接线 + 路由级测试"
```

---

### Task 10: 首次设库 — 把本机已有库 copy-missing 复制进共享库（4.2-B 不改写任何 JSON 路径字段）

**背景 / 契约**
- 现成 `server.py:_apply_file_save_paths(..., migrate=True)`（约 492-495）只拷 `userDir/outputDir/tempDir`，**完全不含 `assets/ workflows/ presets`**。库迁入需要单独的纯函数。
- 复制语义复用仓库现有 copy-missing 风格（`services/runtime_paths.py:copy_missing_tree`，120-138；`server.py:_copy_missing_tree`，420-440）：逐文件 `shutil.copy2`，**目标已存在则跳过**（幂等、不覆盖）。
- 4.2-B 铁律：**只复制字节，不读不写不改写任何 JSON 的路径字段**。资产/工作流/预设里若有绝对路径残留，本任务一律原样照搬，不做 rewrite。
- 库子目录布局以 `derive_library_paths(library_dir)` 为准（已实现，library_storage.py:18-36）：`assetsDir=<lib>/assets`、`workflowsDir=<lib>/workflows`、`presetDefinitionsPath=<lib>/presets/prompt-presets.json`、`presetRootDir=<lib>/presets/prompt`、`outputDir=<lib>/output`、`uploadsDir=<lib>/uploads`。

**Files**
- Modify: `D:\Aic\huanying-source-windows-20260430-122116\services\library_storage.py`（在文件末尾追加 `migrate_into_library` + 两个内部 helper）
- Test: `D:\Aic\huanying-source-windows-20260430-122116\library_storage_test.py`（追加 `MigrateIntoLibraryTest` 类，不动现有 18 个用例）

**纯函数契约（名字固定）**
```
migrate_into_library(previous_paths, library_paths, *, progress=None, cancelled=None) -> dict
```
- `previous_paths`：本机当前路径 dict，认这些键（缺键安全跳过）：`userDir`、`outputDir`、`uploadsDir`、`assetsDir`、`workflowsDir`、`presetDefinitionsPath`(=user/prompt-presets.json)、`presetRootDir`(=user/prompt)。
- `library_paths`：通常即 `derive_library_paths(LIBRARY_DIR)` 的返回。
- `progress`：可选 `callable(event: dict)`，每完成一个迁移单元回显一次（`{"step": "<name>", "copied": int, "skipped": int}`），便于 UI 进度条。
- `cancelled`：可选 `callable() -> bool`，每个迁移单元开始前轮询，返回 True 即中断（已复制的保留，幂等可续跑）。
- 返回 `{"copied": int, "skipped": int, "cancelled": bool, "steps": [...]}` 汇总。

迁移单元（顺序固定，逐目录 copy-missing；presets 走「单文件 + 目录」两子单元）：
1. `assets`：`previous.assetsDir` → `library.assetsDir`
2. `workflows`：`previous.workflowsDir` → `library.workflowsDir`
3. `presets-file`：`previous.presetDefinitionsPath`(文件) → `library.presetDefinitionsPath`（不覆盖）
4. `presets-prompt`：`previous.presetRootDir`(目录) → `library.presetRootDir`
5. `output`：`previous.outputDir` → `library.outputDir`
6. `uploads`：`previous.uploadsDir` → `library.uploadsDir`

- [ ] **Step 1: 写失败测试**（追加到 `library_storage_test.py` 末尾，`if __name__` 之前）

```python
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
```

并把顶部 import 改为带上 `migrate_into_library`（现有 import 块在 `library_storage_test.py:6-12`）：

before
```python
from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_status,
    machine_id,
    validate_library_dir,
)
```
after
```python
from services.library_storage import (
    atomic_replace_with_retry,
    derive_library_paths,
    library_status,
    machine_id,
    migrate_into_library,
    validate_library_dir,
)
```

- [ ] **Step 2: 跑测试确认失败**
  Run: `python -m unittest library_storage_test -v`
  Expected: **FAIL** — `ImportError: cannot import name 'migrate_into_library' from 'services.library_storage'`（函数尚未实现，整文件无法导入，所有用例报错）。

- [ ] **Step 3: 最小实现**（在 `services/library_storage.py` 末尾、`atomic_replace_with_retry` 之后追加）

> 复制语义与 `runtime_paths.copy_missing_tree`/`server._copy_missing_tree` 完全一致：`os.walk` + `shutil.copy2`，目标已存在则 `skipped += 1` 跳过（幂等、不覆盖）。**不读 JSON、不解析、不 rewrite**，纯字节搬运。

```python
import shutil


def _copy_missing_tree_counting(src, dst):
    """逐文件 copy-missing：目标已存在则跳过。返回 (copied, skipped)。

    语义对齐 runtime_paths.copy_missing_tree / server._copy_missing_tree：
    纯字节复制，不读/不改写任何文件内容（4.2-B 不 rewrite JSON 路径字段）。
    """
    copied = 0
    skipped = 0
    src = os.path.abspath(os.fspath(src))
    dst = os.path.abspath(os.fspath(dst))
    if not os.path.isdir(src):
        return copied, skipped
    os.makedirs(dst, exist_ok=True)
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        target_root = dst if rel == "." else os.path.join(dst, rel)
        os.makedirs(target_root, exist_ok=True)
        for directory in dirs:
            os.makedirs(os.path.join(target_root, directory), exist_ok=True)
        for name in files:
            src_file = os.path.join(root, name)
            dst_file = os.path.join(target_root, name)
            if os.path.exists(dst_file):
                skipped += 1
                continue
            try:
                shutil.copy2(src_file, dst_file)
                copied += 1
            except Exception:
                skipped += 1
    return copied, skipped


def _copy_missing_file_counting(src_file, dst_file):
    """单文件 copy-missing：目标已存在则跳过。返回 (copied, skipped)。"""
    src_file = os.path.abspath(os.fspath(src_file))
    dst_file = os.path.abspath(os.fspath(dst_file))
    if not os.path.isfile(src_file):
        return 0, 0
    if os.path.exists(dst_file):
        return 0, 1
    try:
        os.makedirs(os.path.dirname(dst_file), exist_ok=True)
        shutil.copy2(src_file, dst_file)
        return 1, 0
    except Exception:
        return 0, 1


def migrate_into_library(previous_paths, library_paths, *, progress=None, cancelled=None):
    """首次设库：把本机已有库 copy-missing 复制进共享库（4.2-B，不改写任何 JSON 路径）。

    单元顺序固定：assets / workflows / presets-file / presets-prompt / output / uploads。
    幂等：目标已存在的文件一律跳过、绝不覆盖；二次调用 copied=0。
    progress(event)：每个单元完成回显 {"step","copied","skipped"} 供 UI 进度条。
    cancelled() -> bool：每个单元开始前轮询，返回 True 即中断（已复制的保留，可续跑）。
    """
    prev = previous_paths or {}
    lib = library_paths or {}

    def _is_cancelled():
        if cancelled is None:
            return False
        try:
            return bool(cancelled())
        except Exception:
            return False

    # (step_name, kind, src, dst)；kind: "tree" 走目录复制，"file" 走单文件复制。
    units = [
        ("assets", "tree", prev.get("assetsDir"), lib.get("assetsDir")),
        ("workflows", "tree", prev.get("workflowsDir"), lib.get("workflowsDir")),
        ("presets-file", "file",
         prev.get("presetDefinitionsPath"), lib.get("presetDefinitionsPath")),
        ("presets-prompt", "tree",
         prev.get("presetRootDir"), lib.get("presetRootDir")),
        ("output", "tree", prev.get("outputDir"), lib.get("outputDir")),
        ("uploads", "tree", prev.get("uploadsDir"), lib.get("uploadsDir")),
    ]

    total_copied = 0
    total_skipped = 0
    steps = []
    was_cancelled = False

    for step, kind, src, dst in units:
        if _is_cancelled():
            was_cancelled = True
            break
        if not src or not dst:
            continue
        if kind == "file":
            copied, skipped = _copy_missing_file_counting(src, dst)
        else:
            copied, skipped = _copy_missing_tree_counting(src, dst)
        total_copied += copied
        total_skipped += skipped
        event = {"step": step, "copied": copied, "skipped": skipped}
        steps.append(event)
        if progress is not None:
            try:
                progress(event)
            except Exception:
                pass

    return {
        "copied": total_copied,
        "skipped": total_skipped,
        "cancelled": was_cancelled,
        "steps": steps,
    }
```

> 注意：`import shutil` 放在新代码块顶部即可（现模块只 import 了 `os/re/socket/time`）。若 reviewer 偏好集中 import，可把 `import shutil` 上提到文件第 7-10 行的 import 区，等效。

- [ ] **Step 4: 跑测试确认通过**
  Run: `python -m unittest library_storage_test -v`
  Expected: **OK** — 原 18 个用例 + 新增 7 个 `MigrateIntoLibraryTest` 用例全绿（共 25），无 warning。

- [ ] **Step 5（§E 接线，Task 10 承担）：迁移完成后调用 `cleanup_legacy_user_presets(dry_run=False)`**
  在 server.py 首次设库的迁移收尾处（Task 11 的 `_apply_library_dir(value, migrate=True)` 调用 `migrate_into_library` 成功之后），调用 `runtime_paths.cleanup_legacy_user_presets(WRITABLE_ROOT, dry_run=False)` 真删本机 `user/prompt-presets.json` 与 `user/prompt/` 旧预设残留（Task 6 已交付该纯函数）。
  - 顺序铁律：**必须在 `migrate_into_library` 把旧预设 copy-missing 进库之后**才删本机残留，避免删早了丢数据。
  - 该调用挂在 Task 11 的 `_apply_library_dir(..., migrate=True)` 流程里（与迁移同事务路径），本步在 Task 10 登记其归属与顺序约定；具体接线代码随 Task 11 的迁移接线一并落地。

- [ ] **Step 6: 提交**
  ```
  git add services/library_storage.py library_storage_test.py
  git commit -m "feat(library): migrate_into_library — 首次设库 copy-missing 迁入 assets/workflows/presets/output/uploads(4.2-B 不改写 JSON 路径)"
  ```

**给 server.py 接线方的契约（本任务不实现，接线点在 Task 11）**
- 调用点：`_write_user_settings` 识别到 `libraryDir` 字段并校验通过、**且库为空/首次启用**时，在 `_refresh_storage_globals(derive_library_paths(LIBRARY_DIR))` **之前**调用：
  `migrate_into_library(previous_paths, derive_library_paths(LIBRARY_DIR), progress=..., cancelled=...)`。
- 触发时机与冲突策略：**首次设库（库为空/缺内容）时由 Task 11 的 `_apply_library_dir(value, migrate=True)` 触发** copy-missing 迁移，冲突策略=**目标存在即跳过**（本任务已实现，幂等可续跑）。
- `previous_paths` 由 server 侧用迁移前的本机全局组装（键名见上）：
  `{"userDir": USER_DIR, "outputDir": OUTPUT_DIR, "uploadsDir": UPLOADS_DIR, "assetsDir": ASSETS_DIR, "workflowsDir": WORKFLOWS_DIR, "presetDefinitionsPath": os.path.join(USER_DIR, "prompt-presets.json"), "presetRootDir": os.path.join(USER_DIR, "prompt")}`。
  （`UPLOADS_DIR` 现实即 `RUNTIME_PATHS["uploadsDir"]`=`data/uploads`；`ASSETS_DIR/WORKFLOWS_DIR` 见 server.py:231-234。）
- 与现成 `_apply_file_save_paths(migrate=True)` 的区别：那条只搬 user/output/temp（server.py:492-495），库迁入额外搬 assets/workflows/presets，且**绝不改写 JSON 路径字段**——两条互补，不要让库迁入复用 fileSavePaths 那套 userDir 整目录复制（会把 user/prompt-presets.json 落到错位置）。

---

### Task 11: 设置面板"团队共享库目录"输入 + 状态行（后端 `_write_user_settings` 识别 `libraryDir` + 前端接线）

> **§8.1 `_refresh_storage_globals` 库覆盖归 Task 2，本任务不重写它。** 本任务建立在 **Task 0**（`LIBRARY_DIR` 全局、`_library_enabled()`、顶部 import 库纯函数）与 **Task 2**（`_refresh_storage_globals` 库覆盖扩展含 `ASSETS_DIR` 四件套）、**Task 9**（`GET /api/v2/library/status` 路由）之上，全部当**已存在**消费——**不补兜底 import、不防御式重写 `_refresh_storage_globals`**。诚实声明：前端 `modules/settings/fileSaveSettings.js` 与 `api/userSettingsApi.js` 是**单行混淆产物**，无法给字面 JS——故只给"新增的非混淆 API 出口（真实代码）+ 前后端 API 契约 + 混淆面板的行为级步骤"。

**Files:**
- Modify: `server.py`（`_write_user_settings` / `_read_user_settings` + 新增 `_apply_library_dir` / `_persist_system_library_dir`；`LIBRARY_DIR` 全局 + import 由 Task 0 提供，本任务不补）
- Create: `D:\Aic\huanying-source-windows-20260430-122116\server_library_settings_test.py`（服务级 server 测试，断言带 `libraryDir` 的 settings 保存会调用 `validate_library_dir` 并落 system settings + 刷新 globals）
- Modify（前端，非混淆新增出口）: `D:\Aic\huanying-source-windows-20260430-122116\api\userSettingsApi.js`（追加 `fetchLibraryStatusFromServer` 真实导出）
- Modify（前端，再导出）: `D:\Aic\huanying-source-windows-20260430-122116\api\index.js`（把 `fetchLibraryStatusFromServer` 加进 `./userSettingsApi.js` 的 re-export）
- Modify（前端，**混淆面板，仅行为级步骤**）: `D:\Aic\huanying-source-windows-20260430-122116\modules\settings\fileSaveSettings.js`、`D:\Aic\huanying-source-windows-20260430-122116\index.html`

---

- [ ] **Step 1: 写失败测试**

新建 `D:\Aic\huanying-source-windows-20260430-122116\server_library_settings_test.py`。该测试 `import server`（已验证可干净导入），把 `SETTINGS_FILE`/`SYSTEM_SETTINGS_FILE`/`USER_DIR` 指到临时目录，spy 住 `server.validate_library_dir`，断言保存带 `libraryDir` 的 settings 会：① 调 `validate_library_dir`；② 把规范化后的 `libraryDir` 落进 system settings JSON；③ 设 `server.LIBRARY_DIR`；④ 覆盖 `ASSETS_DIR`/`OUTPUT_DIR` 等 globals；⑤ 空串 → 关闭并从 system settings 删键。

```python
import json
import os
import tempfile
import unittest
from unittest import mock

import server
from services.library_storage import derive_library_paths, validate_library_dir


class ServerLibrarySettingsTest(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        root = self._td.name
        self.settings_file = os.path.join(root, "user", "settings.json")
        self.system_file = os.path.join(root, "sys", "system-settings.json")
        self.user_dir = os.path.join(root, "user")
        self.lib_dir = os.path.join(root, "nas-lib")
        os.makedirs(self.lib_dir, exist_ok=True)
        # 保存被测全局的原值，tearDown 还原，避免污染其它 server 测试。
        self._saved = {
            name: getattr(server, name)
            for name in (
                "SETTINGS_FILE", "SYSTEM_SETTINGS_FILE", "USER_DIR",
                "ASSETS_DIR", "ASSET_THUMBS_DIR", "WORKFLOWS_DIR",
                "WORKFLOW_THUMBS_DIR", "OUTPUT_DIR", "UPLOADS_DIR",
            )
            if hasattr(server, name)
        }
        self._saved_lib = getattr(server, "LIBRARY_DIR", "")
        server.SETTINGS_FILE = self.settings_file
        server.SYSTEM_SETTINGS_FILE = self.system_file
        server.USER_DIR = self.user_dir

    def tearDown(self):
        for name, value in self._saved.items():
            setattr(server, name, value)
        server.LIBRARY_DIR = self._saved_lib
        self._td.cleanup()

    def _read_json(self, path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_save_settings_with_library_dir_validates_and_persists_to_system_settings(self):
        with mock.patch.object(
            server, "validate_library_dir", wraps=validate_library_dir
        ) as spy:
            server._write_user_settings({"libraryDir": self.lib_dir, "foo": "bar"})

        # ① 走了校验
        self.assertTrue(spy.called, "保存 libraryDir 时未调用 validate_library_dir")

        normalized = os.path.abspath(self.lib_dir)
        # ② 落进 system settings（每机各自 LOCALAPPDATA 的 system-settings.json）
        sysdata = self._read_json(self.system_file)
        self.assertEqual(sysdata.get("libraryDir"), normalized)
        # 同时写进 local settings，供 _read_user_settings 回显
        localdata = self._read_json(self.settings_file)
        self.assertEqual(localdata.get("libraryDir"), normalized)
        # ③ LIBRARY_DIR 生效
        self.assertEqual(server.LIBRARY_DIR, normalized)
        # ④ 启用库时 derive 出来的子目录覆盖 globals
        paths = derive_library_paths(normalized)
        self.assertEqual(server.ASSETS_DIR, paths["assetsDir"])
        self.assertEqual(server.WORKFLOWS_DIR, paths["workflowsDir"])
        self.assertEqual(server.OUTPUT_DIR, paths["outputDir"])
        self.assertEqual(server.UPLOADS_DIR, paths["uploadsDir"])
        # 子目录被建出来
        self.assertTrue(os.path.isdir(paths["assetsDir"]))

    def test_empty_library_dir_disables_and_removes_system_key(self):
        # 先启用
        server._write_user_settings({"libraryDir": self.lib_dir})
        self.assertTrue(server.LIBRARY_DIR)
        # 再清空 -> 关闭
        server._write_user_settings({"libraryDir": ""})
        self.assertEqual(server.LIBRARY_DIR, "")
        sysdata = self._read_json(self.system_file)
        self.assertNotIn("libraryDir", sysdata)

    def test_save_settings_without_library_dir_key_is_untouched(self):
        # payload 不带 libraryDir 时，绝不应触碰库逻辑（向后兼容旧三框保存）
        with mock.patch.object(
            server, "validate_library_dir", wraps=validate_library_dir
        ) as spy:
            server._write_user_settings({"installId": "abc123"})
        self.assertFalse(spy.called)
        self.assertEqual(server.LIBRARY_DIR, self._saved_lib)

    def test_invalid_library_dir_raises_and_does_not_persist(self):
        # 库目录嵌套在 user_dir 内 -> validate_library_dir 抛 ValueError，应冒泡且不落盘
        nested = os.path.join(self.user_dir, "lib")
        os.makedirs(nested, exist_ok=True)
        with self.assertRaises(ValueError):
            server._write_user_settings({"libraryDir": nested})
        self.assertFalse(os.path.exists(self.system_file))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m unittest server_library_settings_test -v`

Expected: **FAIL**。在前置任务未引入 `LIBRARY_DIR`/`validate_library_dir` 时报 `AttributeError: module 'server' has no attribute 'validate_library_dir'`（或 `LIBRARY_DIR`）；在前置已引入但本块未改 `_write_user_settings` 时，`test_save_settings_with_library_dir_validates_and_persists_to_system_settings` 因 `validate_library_dir` 未被调用 / `LIBRARY_DIR` 未变而 `AssertionError`。

- [ ] **Step 3a: import 与 `LIBRARY_DIR` 全局已由 Task 0 提供** —— 本任务**不补**。`from services.library_storage import derive_library_paths, validate_library_dir, library_status, ...` 与 `LIBRARY_DIR = ""`、`def _library_enabled(): return bool(LIBRARY_DIR)` 均在 Task 0 Step 5 落地，直接使用。

- [ ] **Step 3b: 新增 `_apply_library_dir` / `_persist_system_library_dir`（最小实现）**

在 `server.py` 的 `_persist_system_file_save_paths`（当前 server.py:501-507）之后**新增**两个函数（已对照 `_refresh_storage_globals`/`_current_file_save_paths` 真实签名本地跑通）：

```python
def _persist_system_library_dir(library_dir):
    """把 libraryDir 写进 system settings（独立键，不并入 fileSavePaths）。"""
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    if library_dir:
        next_system_settings["libraryDir"] = library_dir
    else:
        next_system_settings.pop("libraryDir", None)
    if system_settings.get("installId"):
        next_system_settings["installId"] = system_settings.get("installId")
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)


def _apply_library_dir(library_dir, migrate=False):
    """校验库目录 -> 设 LIBRARY_DIR -> 用 derive_library_paths 覆盖存储 globals。

    返回规范化绝对路径；空串表示关闭共享库，恢复到本机 fileSavePaths 推导的目录。
    migrate=True（首次设库）：在覆盖 globals 之前，先把本机已有库 copy-missing
    迁入共享库（Task 10 的 migrate_into_library，目标存在即跳过），迁完再调用
    cleanup_legacy_user_presets 删本机旧预设残留（§E/§F 接线点）。
    """
    global LIBRARY_DIR
    global ASSETS_DIR, ASSET_THUMBS_DIR, WORKFLOWS_DIR, WORKFLOW_THUMBS_DIR
    global OUTPUT_DIR, UPLOADS_DIR

    raw = str(library_dir or "").strip()
    if not raw:
        LIBRARY_DIR = ""
        # 关闭库：按本机 fileSavePaths 重新推导（_refresh_storage_globals 在
        # _library_enabled()==False 时把 ASSETS/WORKFLOWS/OUTPUT/UPLOADS 复位本机默认）。
        _refresh_storage_globals(_current_file_save_paths())
        return ""

    normalized = validate_library_dir(raw, USER_DIR)
    library_paths = derive_library_paths(normalized)

    # §F 首次设库 copy-missing 迁移：必须在切换 LIBRARY_DIR 之前用"迁移前的本机全局"
    # 组装 previous_paths，把本机 assets/workflows/presets/output/uploads 补缺式迁入库。
    if migrate:
        previous_paths = {
            "userDir": USER_DIR,
            "outputDir": OUTPUT_DIR,
            "uploadsDir": UPLOADS_DIR,
            "assetsDir": ASSETS_DIR,
            "workflowsDir": WORKFLOWS_DIR,
            "presetDefinitionsPath": os.path.join(USER_DIR, "prompt-presets.json"),
            "presetRootDir": os.path.join(USER_DIR, "prompt"),
        }
        migrate_into_library(previous_paths, library_paths)  # 目标存在即跳过
        # §E 迁移完成后真删本机旧预设残留（Task 6 纯函数）。
        runtime_paths.cleanup_legacy_user_presets(WRITABLE_ROOT, dry_run=False)

    LIBRARY_DIR = normalized
    for key in (
        "assetsDir", "assetThumbsDir", "workflowsDir", "workflowThumbsDir",
        "outputDir", "uploadsDir", "presetRootDir",
    ):
        os.makedirs(library_paths[key], exist_ok=True)
    # 先按本机 fileSavePaths 刷新 USER_DIR 等基础 globals（用户目录始终留在本机），
    # 再用库路径覆盖共享态四件套 + 输出/上传。_refresh_storage_globals 的库覆盖逻辑
    # 由 Task 2 实现；本函数在其后再显式覆盖一遍同名 globals 以保证本块可测，语义一致。
    _refresh_storage_globals(_current_file_save_paths())
    ASSETS_DIR = library_paths["assetsDir"]
    ASSET_THUMBS_DIR = library_paths["assetThumbsDir"]
    WORKFLOWS_DIR = library_paths["workflowsDir"]
    WORKFLOW_THUMBS_DIR = library_paths["workflowThumbsDir"]
    OUTPUT_DIR = library_paths["outputDir"]
    UPLOADS_DIR = library_paths["uploadsDir"]
    return normalized
```

> 接线依赖：`migrate_into_library` 来自 Task 10、`cleanup_legacy_user_presets` 来自 Task 6（经 `runtime_paths` 调用），二者由 Task 0 的顶部 import 或本处具名 import 引入（与 Task 0 落地一致）。`_refresh_storage_globals` 的 `ASSETS_DIR` 四件套库覆盖归 **Task 2**，本函数只在其后显式再覆盖一遍以保证可测。

- [ ] **Step 3c: 让 `_write_user_settings` 识别 `libraryDir`**

Read `server.py:728-744`。把当前函数体（before）替换为 before/after：

**before**（server.py:728-744 原文）：
```python
def _write_user_settings(data):
    payload = dict(data) if isinstance(data, dict) else {}
    if isinstance(payload.get("fileSavePaths"), dict):
        applied_paths = _apply_file_save_paths(payload["fileSavePaths"], migrate=True)
        payload["fileSavePaths"] = applied_paths
        _persist_system_file_save_paths(applied_paths)
    elif "fileSavePaths" not in payload:
        payload["fileSavePaths"] = _current_file_save_paths()
    _write_json_file(SETTINGS_FILE, payload)

    install_id = str(payload.get("installId") or "").strip()
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    if install_id:
        next_system_settings["installId"] = install_id
    next_system_settings["fileSavePaths"] = dict(payload.get("fileSavePaths") or _current_file_save_paths())
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)
```

**after**（在写盘前插入 libraryDir 识别段；其余保持不变）：
```python
def _write_user_settings(data):
    payload = dict(data) if isinstance(data, dict) else {}
    # 共享库目录：独立键，先于 fileSavePaths 处理。仅当 payload 显式带 libraryDir 才动，
    # 避免普通三框保存误触库逻辑。校验失败（ValueError）原样冒泡给路由层返回 4xx。
    # migrate=True：首次设库触发 copy-missing 迁移（Task 10 的 migrate_into_library，
    # 目标存在即跳过；幂等，非首次设库时迁移为空操作）。
    if "libraryDir" in payload:
        applied_library_dir = _apply_library_dir(payload.get("libraryDir"), migrate=True)
        payload["libraryDir"] = applied_library_dir
        _persist_system_library_dir(applied_library_dir)
    if isinstance(payload.get("fileSavePaths"), dict):
        applied_paths = _apply_file_save_paths(payload["fileSavePaths"], migrate=True)
        payload["fileSavePaths"] = applied_paths
        _persist_system_file_save_paths(applied_paths)
    elif "fileSavePaths" not in payload:
        payload["fileSavePaths"] = _current_file_save_paths()
    _write_json_file(SETTINGS_FILE, payload)

    install_id = str(payload.get("installId") or "").strip()
    system_settings = _read_json_file(SYSTEM_SETTINGS_FILE, {})
    next_system_settings = dict(system_settings)
    if install_id:
        next_system_settings["installId"] = install_id
    next_system_settings["fileSavePaths"] = dict(payload.get("fileSavePaths") or _current_file_save_paths())
    _write_json_file(SYSTEM_SETTINGS_FILE, next_system_settings)
```

- [ ] **Step 3d: 让 `_read_user_settings` 回显 system settings 里的 `libraryDir`**

Read `server.py:694-725`。在 `merged = dict(local_settings)` 段（server.py:716-724）里，仿照 `fileSavePaths` 的 system 覆盖，补一段 libraryDir 覆盖：

**before**（server.py:716-725）：
```python
    merged = dict(local_settings)
    if system_install_id:
        merged["installId"] = system_install_id
    if system_file_save_paths:
        merged["fileSavePaths"] = _file_save_paths_from_settings(
            {"fileSavePaths": system_file_save_paths}
        )
    else:
        merged["fileSavePaths"] = _current_file_save_paths()
    return merged
```

**after**：
```python
    merged = dict(local_settings)
    if system_install_id:
        merged["installId"] = system_install_id
    if system_file_save_paths:
        merged["fileSavePaths"] = _file_save_paths_from_settings(
            {"fileSavePaths": system_file_save_paths}
        )
    else:
        merged["fileSavePaths"] = _current_file_save_paths()
    # 共享库目录以 system settings（每机各自）为准回显，未启用则回空串。
    system_library_dir = str(system_settings.get("libraryDir") or "").strip()
    merged["libraryDir"] = system_library_dir or str(LIBRARY_DIR or "")
    return merged
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m unittest server_library_settings_test -v`
Expected: **OK** — `Ran 4 tests ... OK`（4 个用例全过：校验被调用 + 落 system settings + globals 覆盖 + 空串关闭删键 + 无 libraryDir 键不触碰 + 非法路径抛 ValueError 不落盘）。

回归：`python -m unittest library_storage_test server_runtime_paths_test json_file_route_service_test -v` Expected: **OK**（确认未打断既有存储/路由测试）。

- [ ] **Step 5a: 前端——新增非混淆 API 出口 `fetchLibraryStatusFromServer`（真实代码）**

`api/userSettingsApi.js` 是单行混淆产物，但它**已 `import { get, post } from './requester.js'`**（混淆名 `a57_0xec8750=get`）。无法改混淆体，但可在文件**末尾追加一段全新的、非混淆的导出**（新代码我们自己写，不混淆）。`requester.js` 的 `get(url, options)` 真实签名见 `api/requester.js:451`。Append 到 `api/userSettingsApi.js` 末尾：

```javascript

// === 团队共享库状态（NAS 共享库 方案乙/4.2-B，新增非混淆出口）===
import { get as getLibraryStatusRequest } from "./requester.js";

/**
 * GET /api/v2/library/status -> { reachable, writable, counts:{assets,workflows,presets} }
 * 后端端点由 server 侧 library_status(LIBRARY_DIR) 提供（兄弟任务注册路由）。
 * 失败时返回安全降级对象，调用方据此渲染"未配置/不可达"。
 */
export async function fetchLibraryStatusFromServer() {
  try {
    const status = await getLibraryStatusRequest("/api/v2/library/status", {
      provider: "local",
    });
    return status || { reachable: false, writable: false, counts: {} };
  } catch (err) {
    return { reachable: false, writable: false, counts: {}, error: err };
  }
}
```

> 注：`requester.js` 的 `get` 是具名导出，重复 import 取别名 `getLibraryStatusRequest` 不与混淆体内的 `a57_0xec8750` 冲突（ESM 允许同一模块多次具名导入）。

- [ ] **Step 5b: 前端——在 `api/index.js` 再导出**

Read `api/index.js:134-137`。把 re-export 扩为：

**before**（api/index.js:134-137）：
```javascript
export {
  fetchUserSettingsFromServer,
  saveUserSettingsToServer,
} from "./userSettingsApi.js";
```

**after**：
```javascript
export {
  fetchUserSettingsFromServer,
  saveUserSettingsToServer,
  fetchLibraryStatusFromServer,
} from "./userSettingsApi.js";
```

- [ ] **Step 5c: 前端——混淆面板 `fileSaveSettings.js` + `index.html`（行为级步骤，诚实声明无法给字面 JS）**

`modules/settings/fileSaveSettings.js` 是单行混淆体（变量名如 `a188_0x1a4b59`、字符串走 `a188_0x26b6()` 查表），**无法手写字面 JS 补丁**。其当前行为已读清：用 `FIELD_IDS={userDir,outputDir,tempDir}` ↔ DOM id `fileSaveUserDir/fileSaveOutputDir/fileSaveTempDir`，保存按钮 `btnFileSavePathsSave`，保存时 `saveUserSettingsToServer({...existing, fileSavePaths})`。给出**前后端契约 + 行为级步骤**（实现者可选择：A 重写该非混淆模块的等价明文版替换混淆体；B 不动混淆体，新建一个独立的小模块 `modules/settings/librarySettings.js` 单独管库目录输入，二者并行——**推荐 B**，零风险、不碰混淆产物）：

**HTML（`index.html`，已定位到 `settings-file-save-card`，见 `fileSaveTempDir` 行后、`settings-pane-footer` 前）**：在三框那张 `settings-file-save-card` 之后新增一张卡，含一个文本输入和一行状态：
- 库目录输入：`<input type="text" id="libraryDirInput" class="settings-input settings-path-input" placeholder="例如 \\\\NAS\\team\\huanying-library 或 H:\\share\\library">`
- 保存按钮：`<button type="button" class="settings-save-btn" id="btnLibraryDirSave">保存</button>`
- 状态行容器：`<div id="libraryStatusLine" class="settings-desc"></div>`
- 文案：标题"团队共享库目录（NAS）"，描述"填写后素材/工作流/输出/预设统一存到该共享目录，留空=各机本地。每台机各自配置。"

**前后端 API 契约（实现者照此接线）**：
- **保存**：复用 `POST /api/v2/user/settings.json`。请求体在现有 settings 对象上**多带一个独立顶层字段 `libraryDir`（字符串，留空=关闭）**，即 `saveUserSettingsToServer({ ...existingSettings, libraryDir })`。**不要**塞进 `fileSavePaths`（后端 `_validate_file_save_paths` 只认 userDir/outputDir/tempDir，多余键会被丢弃）。后端 `_write_user_settings` 已识别该键（Step 3c）。校验失败时后端抛 `ValueError`→路由返回非 2xx，前端 `catch` 用 `showError(err.message)`（沿用 `services/toastService.js` 的 `showError/showSuccess`，与现有 `fileSaveSettings.js` 同款）。
- **回显**：`fetchUserSettingsFromServer()` 返回体现在含顶层 `libraryDir`（Step 3d），初始化时把它写进 `#libraryDirInput.value`。
- **状态行**：调新增的 `fetchLibraryStatusFromServer()`（Step 5a），按返回渲染 `#libraryStatusLine`：
  - 未配置（输入为空）："未启用共享库（各机本地保存）"。
  - `reachable===false`："共享库不可达：检查网络/挂载"（红）。
  - `reachable && !writable`："可读不可写：检查共享权限"（黄）。
  - `reachable && writable`："已连接 · 素材 {counts.assets} · 工作流 {counts.workflows} · 预设 {counts.presets}"（绿）。
  - 时机：面板初始化后、以及"保存"成功后各拉一次。

**行为级实现步骤（推荐方案 B：新建非混淆 `modules/settings/librarySettings.js`，导出 `initLibrarySettings()`，由现有设置面板初始化处一并调用）**：
1. `import { fetchUserSettingsFromServer, saveUserSettingsToServer, fetchLibraryStatusFromServer } from '../../api/index.js';` + `import { showError, showSuccess } from '../../services/toastService.js';`
2. `initLibrarySettings()`：取 `#libraryDirInput`/`#btnLibraryDirSave`/`#libraryStatusLine`；任一缺失则 return。
3. 启动时 `fetchUserSettingsFromServer()` → `input.value = settings?.libraryDir || ''`，随后 `refreshStatus()`。
4. `refreshStatus()`：`const s = await fetchLibraryStatusFromServer();` 按上面四态写 `statusLine.textContent` + class。输入为空直接显示"未启用"。
5. 点保存：读 `input.value.trim()`；`const cur = await fetchUserSettingsFromServer().catch(()=>({}));`；`await saveUserSettingsToServer({ ...cur, libraryDir })`；成功 `showSuccess('共享库目录已更新')` 并 `refreshStatus()`；失败 `showError('保存共享库目录失败：'+(err?.message||'未知错误'))`。按钮 disabled 防抖，与 `fileSaveSettings.js` 的 `setSaving` 同模式。
6. 把 `initLibrarySettings()` 接到设置面板已有的初始化调用点（与 `initFileSaveSettings()` 同处调用）。

> 兄弟任务负责：`GET /api/v2/library/status` 路由注册（在 server.py 路由分发 + `/api/v2/...` 前缀白名单 server.py:1035 一带）调用 `library_status(LIBRARY_DIR)`。本块前端只消费该端点。

- [ ] **Step 6: 提交**

```
git add server.py server_library_settings_test.py api/userSettingsApi.js api/index.js modules/settings/librarySettings.js index.html
git commit -m "feat(library): settings 面板共享库目录输入 + 状态行；_write_user_settings 识别 libraryDir(校验/刷新 globals/落 system settings)"
```
（如采用方案 A 改写混淆面板而非新建 `librarySettings.js`，相应调整 `git add` 路径。）

---

### Task 12: 真机 NAS 冒烟验收清单（手动，§11.2 七条门禁）

> 性质：**手动真机测试**，无自动化测试 step、无代码改动。代码假设本地 NTFS，这 7 条必须在真实 SMB/NAS 上跑过才算阶段 2 验收通过。其中 **#5（SMB `os.replace` 行为）是阶段 2 交付门禁**——它的真机结论直接决定 `atomic_replace_with_retry(attempts, base_delay)` 的取值是否够用。
>
> 前置依赖：阶段 1 + 阶段 2 全部代码任务已完成并合入（`services/library_storage.py` 五个纯函数 + `server.py` 薄包装：`LIBRARY_DIR`/`_library_enabled`/`_refresh_storage_globals` 扩 4 个 thumbs 全局/`machine_id` 前缀文件名/`GET /api/v2/library/status`/`POST /api/v2/user/settings.json` 带 `libraryDir`）。
> 本任务**不通过 `python -m unittest` 运行**；每条用人工"操作 / 预期 / 通过判据"照做，全部勾选即门禁通过。

**Files:**
- Create: `docs/ui-upgrade/23-nas-smoke-checklist.md`（把下面整张清单落盘为可勾选手册，交付时随阶段 3《部署+备份手册》一并归档）
- Test（手动环境，非文件）：
  - NAS 共享 `\\NAS\share\huanying-lib`（管理员账号可读写；另备一个**成员只读**账号给 #7）
  - 两台 Windows 机 **机器 A / 机器 B**，各自跑 `启动项目.bat`，server 绑 `127.0.0.1`（A=`http://127.0.0.1:<portA>`、B=`http://127.0.0.1:<portB>`）
  - 两机系统设置里 `libraryDir` 均指到**同一个** `\\NAS\share\huanying-lib`（经 `POST /api/v2/user/settings.json` 保存、走校验+迁移+刷新）
  - 一个能在 NAS 端"同毫秒并发写同一文件"的最小脚本（两进程各 `os.replace(tmp, dst)` 写同一 `presets/prompt-presets.json`，给 #5 用）
- 不涉及：账户/跨进程锁/云（契约约束）。

---

#### 环境就绪自检（开测前一次性）

- [ ] **Step 0a: 两机都已启用库且看见同一根**
  操作：A、B 两机各自浏览器开 `http://127.0.0.1:<port>`，进设置 → 团队共享库分区，确认"库目录"显示同一 UNC，状态行为 `● 已连接 · 可读写`。
  命令（任一机终端，验证后端真识别库）：
  `curl http://127.0.0.1:<portA>/api/v2/library/status`
  Expected：返回 JSON `{"reachable":true,"writable":true,"counts":{"assets":<int>,"workflows":<int>,"presets":<int>}}`（即契约 `library_status(LIBRARY_DIR)` 的形状）。
  通过判据：两机 `reachable=true && writable=true`，且两机 `counts.assets` 相等（同一份库）。若任一机 `reachable=false`，先解决 NAS 可达再继续——否则后续全部无效。

- [ ] **Step 0b: 确认机器前缀已生效（#3/#5 的撞号前提）**
  操作：A 机生成或保存一张图，到 `\\NAS\share\huanying-lib\output\` 看新文件名。
  Expected：文件名形如 `gen_<machineId>_YYYYMMDD_NNNN.png`（契约 `_next_gen_output_filename` 产出 `f"gen_{machine_id()}_{date}_{seq}.{ext}"`，**ext 不含前导点、点号在 `{seq}.{ext}` 处显式加**），`<machineId>` 为 `[a-z0-9-]`、约 ≤12 字符、A/B 两机不同。
  通过判据：A、B 各生成一张，两个文件名的 `<machineId>` 段**不相同**；且产出名**确含扩展名分隔点**（断言文件名匹配 `^gen_[a-z0-9-]+_\d{8}_\d{4}\.[a-z0-9]+$`，即 `{seq}` 与 `{ext}` 之间有 `.`，绝不出现 `..._0001png` 缺点号）；若 `<machineId>` 相同（如都回退成 `host`），#3/#5 的跨机撞号防护失效，需先查 `machine_id()`。

---

#### #1 两机互见（自动获取的基本盘）

- [ ] **Step 1: 各建不同资产 → 双方刷新后互见**
  操作：
  1. A 机新建/保存一个资产，记其标题/id（记为 `assetA`）。
  2. B 机新建/保存另一个不同资产（`assetB`）。
  3. A 机在资产库面板手动刷新（切面板或刷新按钮，参照 §7.3 非实时推送语义）；B 机同样刷新。
  预期：A 机刷新后看到 `assetA`+`assetB` 两条；B 机刷新后同样两条。两文件落在 `\\NAS\share\huanying-lib\assets\` 下不同 `<id>.json`。
  通过判据：两机刷新后资产列表均含**对方新建的那条**；NAS `assets\` 目录里两个 `<id>.json` 并存、互不覆盖。直接对照 `library_status` 的 `counts.assets` 在两机一致且较测前 +2。

---

#### #2 媒体不裂图（output 与 uploads 两类来源都要验，§4.2 核心）

- [ ] **Step 2a: output 来源不裂图**
  操作：A 机**生成**一张图并存为资产（媒体走 `/output/gen_...png`）；B 机刷新后打开这条资产。
  预期：B 机资产卡/详情正常显示该图与缩略图，无破图占位符。
  通过判据：B 机肉眼看到图；浏览器 DevTools Network 里 `/output/gen_<machineId>_...png` 与其派生缩略图（`/api/v2/images/derivatives/ensure`）均 HTTP 200、非 404/403。

- [ ] **Step 2b: uploads 来源不裂图（最容易漏的一类）**
  操作：A 机**上传一张参考图**并存为资产（媒体走 `localPath:data/uploads/upload_...jpg`，实测有资产 100% 来自 uploads）；B 机刷新后打开。
  预期：B 机正常显示上传图来源的资产，无破图。
  通过判据：B 机肉眼看到图；Network 里 `/data/uploads/upload_...` 与其派生图均 200。
  红线：**只验 output 不验 uploads 不算通过**——附录 A 第 1 条裂图正是漏 uploads 造成；两类来源都绿才算 #2 过。

---

#### #3 同 id 并发写：后写赢、文件完好（非半截/损坏）

- [ ] **Step 3: 两机同时改同一条 id**
  操作：
  1. 先在任一机建一条资产 `assetX`，等两机都刷新可见（确保是**同一个 `<id>.json`**）。
  2. A、B 两人**同时**编辑 `assetX` 并保存（A 改标题为 `T-A`、B 改标题为 `T-B`，尽量同一刻点保存）。
  3. 用 `curl http://127.0.0.1:<port>/api/v2/assets` 在两机各拉一次完整列表。
  预期：`assetX` 仍是**一条合法 JSON**，标题是 `T-A` 或 `T-B` 之一（后写者赢，§7.4 接受语义）；**不得**出现半截 JSON、双份、或该条从列表消失。
  通过判据：直接打开 NAS 上 `assets\<id>.json` 能被 `json.load` 解析成功（可在终端 `python -c "import json;json.load(open(r'\\NAS\share\huanying-lib\assets\<id>.json',encoding='utf-8-sig'))"`，无异常即合法）；标题为 `T-A`/`T-B` 其一；两机列表里 `assetX` 各恰好出现一次。
  说明：这条**接受**"先写者内容丢失"为已知取舍，只验**文件不损坏**；丢的那版靠备份兜底，不在本条门禁内。

---

#### #4 并发读撞他机写句柄：暂时消失 + 自愈（统计频率与恢复时延）

- [ ] **Step 4: A 持续写、B 反复拉列表，统计该条消失/恢复**
  背景：B 拉列表时若 open 撞上 A 的写句柄，`JsonFileRouteService._load_json_file` 的 `except Exception: return default`（services/json_file_route_service.py:78-79）会静默吞掉 PermissionError，该条**当场从列表消失**，写完释放后下次扫描恢复。这是 §2.6/§9 承认的体验降级，本条量化它、确认是**暂时**非永久。
  操作：
  1. A 机用脚本对同一个 `assetY` 的 `<id>.json` **持续覆盖写** ~60 秒（循环 save，制造高频写句柄占用）。
  2. 同时 B 机用脚本每 ~500ms `curl http://127.0.0.1:<portB>/api/v2/assets`，记录每次响应里 `assetY` 是否存在，跑满这 60 秒。
  3. A 停写后，B 再拉 3~5 次。
  预期：写期间 `assetY` 会**间歇性消失**（统计：消失次数 / 总拉取次数 = 消失频率；每次从"消失"到"再次出现"的间隔 = 恢复时延）；**A 停写后 B 的后续每一次拉取都稳定含 `assetY`**。
  通过判据：① 全程 `assetY` 的 `<id>.json` 在 NAS 上始终是合法 JSON（未损坏）；② A 停写后连续 ≥3 次拉取 `assetY` 100% 在列（证明是**暂时消失非永久丢失**）。记录下"消失频率 + 最大恢复时延"两个数，作为该已知降级在本 NAS 上的真实画像，写进交付报告（不设硬阈值，但要有数）。

---

#### #5 SMB `os.replace` 行为 —— 阶段 2 交付门禁，决定 `atomic_replace_with_retry` 参数

- [ ] **Step 5a: 两进程同毫秒写同一文件，观测是否抛 ERROR_SHARING_VIOLATION / 产坏文件**
  背景：契约 `atomic_replace_with_retry(tmp_path, dst_path, attempts=5, base_delay=0.05)` 的存在前提，就是 SMB 上 `os.replace` 可能抛 `PermissionError`/`OSError`（SMB `ERROR_SHARING_VIOLATION`）。本条用真机确认它**会不会抛、抛得多频、默认 attempts/base_delay 够不够**。
  操作（裸 `os.replace`，**不经** retry 包装，直接观测原始行为）：在两台机（或一机两进程）各跑一个脚本，循环 N=200 次：写一个临时文件 → `os.replace(tmp, r'\\NAS\share\huanying-lib\presets\prompt-presets.json')`，两进程尽量同刻启动，捕获并计数每次 `os.replace` 抛出的异常类型与 winerror。
  示例（最小，可照抄到两机分别运行；目标文件用一个一次性测试文件而非真预设表，避免污染库）：
  ```powershell
  # 在 A、B 两机同时运行；TARGET 指同一 NAS 文件
  python -c "import os,time,json,tempfile,sys; T=r'\\NAS\share\huanying-lib\presets\_replace_probe.json'; os.makedirs(os.path.dirname(T),exist_ok=True); errs={};
  [ ( lambda f=tempfile.mkstemp(dir=os.path.dirname(T))[1]: ( open(f,'w',encoding='utf-8').write(json.dumps({'i':i,'pid':os.getpid()})), os.replace(f,T) ) )() for i in range(200) ] if False else None;
  import sys
  for i in range(200):
      fd,tmp=tempfile.mkstemp(dir=os.path.dirname(T)); os.close(fd)
      open(tmp,'w',encoding='utf-8').write(json.dumps({'i':i,'pid':os.getpid()}))
      try: os.replace(tmp,T)
      except OSError as e: errs[(type(e).__name__,getattr(e,'winerror',None))]=errs.get((type(e).__name__,getattr(e,'winerror',None)),0)+1; os.path.exists(tmp) and os.remove(tmp)
      time.sleep(0.001)
  print('errors:',errs)"
  ```
  预期：打印 `errors: {...}`。若出现 `('PermissionError', 32)`（winerror 32 = `ERROR_SHARING_VIOLATION`）或 `('OSError', ...)`，说明 SMB 下 `os.replace` 确实会被占用打断——证明 retry 必要。
  通过判据（门禁）：
  - ① 跑完后 NAS 上 `_replace_probe.json` 仍是**合法 JSON**（`json.load` 不抛），**绝不能**出现 0 字节/半截文件 → 证明 `os.replace` 在本 NAS 上即便竞争也保持"整文件替换"原子性；若出现坏文件，则 `os.replace` 方案在此 NAS 不成立，需上报阻断阶段 2。
  - ② 统计 `errors` 里 `ERROR_SHARING_VIOLATION` 的**最长连续失败次数**：用它反推契约默认 `attempts=5`、退避 `base_delay=0.05`（首轮 0.05s、指数退避累计 ~0.05+0.1+0.2+0.4 ≈ 0.75s 覆盖窗口）是否够。若实测最长连击 ≥5 次或单次占用窗口 > ~0.75s，**必须把实测值反馈给实现任务上调 `attempts`/`base_delay`**——这正是本条"决定参数"的产出。
- [ ] **Step 5b: 把结论写回**
  操作：在交付报告记三件事：(a) `os.replace` 是否抛 `ERROR_SHARING_VIOLATION`（是/否 + winerror）；(b) 是否产生过坏/空文件（决定 `os.replace` 方案成立与否）；(c) 实测最长连续失败次数 vs 契约 `attempts=5/base_delay=0.05`，给"够用 / 需上调到 X"结论。
  通过判据：上述 (a)(b)(c) 三项均有真实数据与明确结论；门禁 = (b) 为"否（无坏文件）"且 (c) 给出参数够用或已上调。**本条不过则阶段 2 不予交付。**

---

#### #6 断 NAS：明确报错、不静默回退本地（§8.9）

- [ ] **Step 6: 运行中拔网/断 NAS**
  操作：A 机正常使用中，**拔网线 / 断开 NAS 映射 / 关 NAS 共享**，使 `\\NAS\share\huanying-lib` 不可达；然后 (a) 看设置状态行，(b) 拉一次资产列表，(c) 尝试新建一个资产。
  预期：
  - 状态行变 ⚠️（`无法访问该路径` 一类），`GET /api/v2/library/status` 返回 `reachable=false`（其余字段安全降级，契约 `library_status` 不可达时不崩）。
  - 资产列表显示"库不可达"而非空库，**不**自动把读写切回本机 `data/`（避免"以为写 NAS、实写本机"的状态分裂）。
  - 新建/保存动作**明确报错**，不静默落到本地默认目录。
  通过判据：① `curl .../api/v2/library/status` 返回 `{"reachable":false, ...}` 且进程不崩；② 断网期间到本机 `writable_root/data/assets/` 检查，**没有**新出现刚才尝试新建的那条（证明未静默回退本地写）；③ 恢复 NAS 后状态行回 `● 已连接`、列表恢复。
  红线：只要断网后本机 `data/` 里冒出了本该写 NAS 的新文件，即判**不通过**（违反 §8.9 不回退）。

---

#### #7 库设成员只读：新增友好失败、不崩（§6.2 写探针 / §10.2）

- [ ] **Step 7: 用只读成员账号接入**
  操作：在 NAS 把库目录对**成员账号**设为只读；该成员机用此账号挂载 `\\NAS\share\huanying-lib`，在设置里保存 `libraryDir`，然后 (a) 看状态行，(b) 尝试新建/保存一个资产。
  预期：
  - 保存设置时的写探针（库写 `.huanying_probe` 临时文件再删，契约 `library_status` 的 writable 探针同源逻辑）探到不可写，状态行标 `🔒 只读，新增将失败`（`reachable=true && writable=false`）。
  - 读路径正常：能列出并**只读浏览**团队已有资产/工作流/预设（含图，复用 #2 的解析）。
  - 新增/保存动作**友好失败**（明确提示"库只读，无法写入"），**进程不崩**、不抛未捕获异常、不静默假成功。
  通过判据：① `curl .../api/v2/library/status` 返回 `reachable=true, writable=false`；② 该成员能看到团队资产且不裂图（读通）；③ 触发保存后：server 进程仍存活、前端有可读的失败提示、NAS 库目录里**没有**新增该条（写确实被拒而非假装成功）。

---

#### 收尾

- [ ] **Step 8: 汇总门禁结论 + 落盘清单**
  操作：把 #1–#7 的勾选结果、#4 的"消失频率/恢复时延"两数、#5 的 `os.replace` 三项结论（是否抛 SHARING_VIOLATION / 有无坏文件 / 参数够用与否）整理进 `docs/ui-upgrade/23-nas-smoke-checklist.md`，作为阶段 2 验收证据。
  通过判据：7 条全勾，其中 **#5 明确给出 `atomic_replace_with_retry` 参数结论**（门禁），#2 含 output+uploads 两类来源、#6 证实未回退本地。
- [ ] **Step 9: 提交清单文档**（仅文档，无源码改动）
  Run: `git add docs/ui-upgrade/23-nas-smoke-checklist.md`
  Run: `git commit -m "docs(nas-library): add §11.2 manual NAS smoke checklist (7-item stage-2 gate)"`
  Expected：单文件提交成功；不动任何 `.py`/前端文件。

---

**判据速查（门禁 = 全绿）**

| # | 一句话通过判据 |
|---|---|
| 1 | 两机刷新后互见对方新建资产，NAS `assets\` 两 `<id>.json` 并存 |
| 2 | output **和** uploads 两类来源在对端均显示、派生图 200，无破图 |
| 3 | 并发写后 `<id>.json` 仍合法 JSON、标题为后写者、列表恰一条 |
| 4 | 写期间间歇消失但停写后稳定恢复、文件始终合法（暂时非永久，记下频率/时延） |
| 5 | **(门禁)** `os.replace` 无坏文件 + 抛 SHARING_VIOLATION 数据已采、`attempts/base_delay` 给够用或上调结论 |
| 6 | 断 NAS 后 `reachable=false` 不崩、不回退本地写、恢复后自愈 |
| 7 | 只读成员 `writable=false`、读通、写友好失败不崩、库无新增 |
