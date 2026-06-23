## Architecture

Frontend layers:
- `main.js`: app bootstrap, node registration, global event wiring.
- `src/core/`: canvas renderer, interaction engine, math, viewport, store.
- `components/`: node UI and node behavior.
- `components/aigenText`, `components/aigenImage`, `components/video-node`: split business logic for AI nodes.
- `modules/`: shared business modules such as presets, slash menu, media controllers, workflows, settings.
- `api/` and `services/*.js`: local API wrappers, upload helpers, persistence helpers.

Backend layers:
- `server.py`: local HTTP entrypoint.
- `services/*.py`: route dispatch, config, media, and local processing.
- `services/runtime_paths.py`: source/onedir/onefile runtime root resolution.

Windows distribution:
- `packaging/windows_onefile_launcher.py` is the PyInstaller `--onefile` entrypoint. It marks the process as `AIC_DISTRIBUTION=onefile`, starts the local server module, and opens the browser unless `AIC_OPEN_BROWSER=0`.
- `tools/build_windows_onefile.py` builds `release/windows/*onefile.exe`, writes matching `.sha256` and `.manifest.json` files, and bundles only read-only static/config resources.
- Onefile builds read bundled resources from PyInstaller's extraction directory and write persistent data under `%LOCALAPPDATA%\AI-CanvasPro`.
- Source and existing onedir builds keep their legacy repository/executable-directory writable behavior.
- `/api/v2/runtime/info` keeps existing fields and adds distribution/storage diagnostics for packaged runtime checks.

Relevant problem areas:
- Prompt preset slash entrypoint: `modules/slashMenu.js`
- Preset sources and manager sync: `modules/promptPresets.js`
- Text node prompt UI/state: `components/aigenText/*`
- Image node prompt UI/state/task building: `components/aigenImage/*`
- Image tool execution path: `modules/ImageFreeAngleController.js`
- Shared tool model resolution: `modules/toolModelResolutionService.js`
- Shared tool model UI state: `modules/toolModelUiStateService.js`
- Model registry runtime overlays:
  - `components/aigenText/modelRegistryRuntime.js`
  - `components/aigenImage/modelRegistryRuntime.js`

Known architecture tension:
- Node model selection is moving toward registry-based configuration.
- Several image/text tool flows still infer provider/model from legacy string conventions or hardcoded menus.
- Image tool runtime patching currently happens by mutating the exported `ImageFreeAngleController` singleton from `modules/ImageFreeAngleController.registry.js`, because the original controller file is still bundled into a compressed single-line module.
- Free-angle tool UI patching uses `modules/toolModelUiStateService.js` from the registry wrapper so legacy model menus can be locked/hidden without editing the compressed controller directly.
- Slash menu rendering logic is shared, but node-local CSS for slash items diverged from the current menu class names.
