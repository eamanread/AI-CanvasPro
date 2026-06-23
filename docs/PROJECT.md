## Project

Name: `huanying-editor`

Goal:
- Provide a local-first infinite-canvas AI workbench for text, image, video, and audio generation nodes.
- Keep node creation, prompt authoring, preset reuse, local media processing, and workflow reuse in a single browser-based workspace backed by a Python local server.

Current focus:
- Restore slash-triggered prompt preset insertion for text/image generation nodes.
- Audit and unify how image/text tool features inherit node model selection and global model configuration.
- Restore special-provider API cards for RunningHUB and other non-standard providers below Dreamina settings.
- Migrate image tool runtime resolution so free-angle generation follows registry-selected node models.

Runtime:
- Frontend: native HTML/CSS/ES modules.
- Backend: Python `http.server`-based local API and static server.
- Default local app URL: `http://127.0.0.1:8777/` with overridable port.
