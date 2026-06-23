## Windows Onefile Release

This project can be distributed as a single Windows exe built by PyInstaller.

### Local Build

Prerequisites:
- Windows
- Python 3.12
- `pip install -r requirements.txt`
- `pip install pyinstaller`

Build:

```powershell
python tools\build_windows_onefile.py
```

Outputs:
- `release/windows/huanying-workbench-<version>-windows-x64-onefile.exe`
- `release/windows/huanying-workbench-<version>-windows-x64-onefile.exe.sha256`
- `release/windows/huanying-workbench-<version>-windows-x64-onefile.manifest.json`

Smoke test:

```powershell
powershell -ExecutionPolicy Bypass -File tools\smoke_windows_onefile.ps1
```

### GitHub Actions

Workflow:
- `.github/workflows/build-windows-onefile.yml`

Manual build:
- Open the workflow in GitHub Actions.
- Run `workflow_dispatch`.
- Download the `huanying-workbench-windows-onefile` artifact.

Release build:
- Push a tag matching `v*`, for example `v0.2.11`.
- The workflow builds and smokes the exe.
- The exe, sha256 file, and manifest are uploaded to the GitHub Release.

### Runtime Storage

Onefile mode keeps bundled files read-only and writes persistent data to:

```text
%LOCALAPPDATA%\AI-CanvasPro
```

Writable runtime paths:
- `user/`
- `user/Canvas Project/`
- `user/prompt/`
- `user/prompt-presets.json`
- `output/`
- `data/uploads/`
- `data/assets/`
- `data/workflows/`

Bundled seed resources:
- `index.html`
- `main.js`
- `style.css`
- frontend module directories
- `config/prompt-presets.json`
- `dev/preset-manager.html`

### API Compatibility

Existing request and response payloads remain unchanged for:
- config and settings
- projects
- prompt presets
- uploads and outputs
- assets and workflows
- generation payloads

`/api/v2/runtime/info` keeps the original fields and adds:
- `distribution`
- `isPackaged`
- `isOnefile`
- `storage`

### Operational Notes

- The exe starts a local server at `http://127.0.0.1:8777/`.
- Set `AICANVAS_PORT=<port>` to override the port.
- Set `AIC_OPEN_BROWSER=0` for headless smoke tests.
- Set `AIC_RESOURCE_ROOT=<path>` to override the read-only bundled resource root for diagnostics.
- Set `AIC_WRITABLE_ROOT=<path>` to override the writable storage root for portable or test runs.
- Existing onedir zip builds are not removed by this workflow.
