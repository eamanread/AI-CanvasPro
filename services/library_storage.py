"""Pure helpers for the NAS shared team library (方案乙/4.2-B).

新逻辑放进这个可单测的纯函数模块，server.py 只做薄包装调用。
这些函数不联网、不读取全局状态，所有输入都通过参数传入，便于依赖注入测试。
"""

import os
import re
import shutil
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


def resolve_startup_library_dir(system_settings, user_dir):
    """启动期从 system settings 解析库目录（纯函数，供 server.py 薄包装调用）。

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


def _normalize_ext(ext):
    """统一扩展名：去掉前导点、去空白、转小写。空则返回空串。"""
    raw = "" if ext is None else str(ext).strip()
    stripped = raw[1:] if raw.startswith(".") else raw
    return stripped.lower()


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
