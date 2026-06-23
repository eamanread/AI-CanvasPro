# Windows Onefile EXE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows single-file `exe` for this project, add a double-click packaging entrypoint, and add a beginner-friendly usage guide.

**Architecture:** Reuse the existing PyInstaller onefile pipeline in `tools/build_windows_onefile.py` and the launcher in `packaging/windows_onefile_launcher.py`. Add a thin Windows batch wrapper for local packaging, then generate the actual release artifact and document how end users run and close it.

**Tech Stack:** Python 3, PyInstaller, Windows batch scripts, existing local server runtime

---

### Task 1: Add a Windows-friendly packaging entrypoint

**Files:**
- Create: `打包EXE.bat`
- Modify: none
- Test: manual command invocation in project root

- [ ] **Step 1: Write the batch script**

```bat
@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [error] 未找到 Python，请先安装 Python 3.12 并加入 PATH。
  pause
  exit /b 1
)

echo [info] 正在开始构建单文件 EXE...
python tools\build_windows_onefile.py
if errorlevel 1 (
  echo.
  echo [error] 构建失败，请检查上面的输出。
  pause
  exit /b 1
)

echo.
echo [ok] 构建完成，产物目录：release\windows
pause
```

- [ ] **Step 2: Run it manually to verify the script starts**

Run: `cmd /c 打包EXE.bat`
Expected: script launches the Python build flow or reports a clear Python/build error without closing immediately

- [ ] **Step 3: Commit**

```bash
git add 打包EXE.bat
git commit -m "feat: add windows onefile packaging entrypoint"
```

### Task 2: Add the beginner-friendly user guide

**Files:**
- Create: `小白使用说明-EXE版.md`
- Modify: none
- Test: manual content review

- [ ] **Step 1: Write the usage guide**

```md
# 幻映工作台 EXE 使用说明

## 1. 怎么启动

1. 找到 `huanying-workbench-...-onefile.exe`
2. 直接双击
3. 稍等几秒，浏览器会自动打开工作台

## 2. 第一次启动为什么会慢一点

单文件 EXE 第一次启动时会先解压运行所需内容，再启动本地服务，这是正常现象。

## 3. 怎么关闭

关闭浏览器页面后，如果程序还在运行，直接关闭对应的命令窗口即可。

## 4. 数据保存在哪里

默认保存在：

`%LOCALAPPDATA%\AI-CanvasPro`

## 5. 如果双击后没打开页面怎么办

1. 先等 5 到 15 秒
2. 手动打开浏览器访问 `http://127.0.0.1:8777/`
3. 如果还是不行，重新双击 EXE 再试一次

## 6. 常见提醒

- 不要把 EXE 放在杀毒软件频繁拦截的目录
- 第一次运行如果系统弹出防护提示，选择允许本地运行
- 建议放在一个固定文件夹内使用，不要每次换位置
```

- [ ] **Step 2: Review the guide for non-technical wording**

Run: manual file review
Expected: guide contains only user-facing steps, no developer jargon, and covers start/close/data/troubleshooting

- [ ] **Step 3: Commit**

```bash
git add 小白使用说明-EXE版.md
git commit -m "docs: add beginner exe usage guide"
```

### Task 3: Build the actual onefile exe

**Files:**
- Modify: none expected unless the build fails and exposes a packaging bug
- Test: `tools/build_windows_onefile.py`

- [ ] **Step 1: Run the onefile build**

Run: `python tools\build_windows_onefile.py`
Expected: PyInstaller completes and writes a versioned `exe` into `release/windows/`

- [ ] **Step 2: Verify the expected output files exist**

Run: `Get-ChildItem release\windows`
Expected: versioned `.exe`, `.sha256`, and `.manifest.json` files are present

- [ ] **Step 3: If build fails, capture the failure and patch the minimum packaging issue**

```text
Only touch packaging-related files if the current build exposes a concrete error.
Do not refactor unrelated runtime code.
```

- [ ] **Step 4: Re-run the build after any packaging fix**

Run: `python tools\build_windows_onefile.py`
Expected: successful exit with a generated onefile artifact

- [ ] **Step 5: Commit**

```bash
git add release/windows
git commit -m "build: generate windows onefile release artifact"
```

### Task 4: Final verification and handoff

**Files:**
- Modify: none unless a final wording tweak is needed
- Test: build output and file presence

- [ ] **Step 1: Verify the batch entrypoint, guide, and release artifact all exist**

Run: `Get-ChildItem 打包EXE.bat, 小白使用说明-EXE版.md, release\windows`
Expected: all expected files are listed

- [ ] **Step 2: Re-read the spec and compare against deliverables**

```text
Check:
- single-file exe built
- double-click packaging entrypoint added
- beginner guide added
- output path is explicit
```

- [ ] **Step 3: Prepare handoff summary**

```text
Include:
- exact exe path
- exact beginner guide path
- how the user should distribute the exe
```

- [ ] **Step 4: Commit**

```bash
git add 打包EXE.bat 小白使用说明-EXE版.md docs/superpowers/specs/2026-05-09-windows-onefile-exe-design.md docs/superpowers/plans/2026-05-09-windows-onefile-exe.md
git commit -m "docs: capture windows onefile packaging plan"
```
