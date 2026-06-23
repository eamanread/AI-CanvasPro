# RH Reference Assistant Backend Requirements

Date: 2026-06-02

This document records the backend/product requirements exposed after restoring the RH reference assistant UI. The frontend now renders the reference-style assistant shell and marks unsupported controls with `data-requires-backend` so regressions can detect missing integrations without pretending they work.

## Restored Frontend Surface

- Reuse existing `#fabBtn` / `.fab-btn` as the assistant launcher instead of adding a second bottom-right button.
- Launcher visual is changed to the green glowing RH avatar used by the reference.
- Right-side panel is restored as the reference shell: header, avatar, session label, greeting, skill list, bottom composer, toolbar, preview, and receipt.
- Skill entries are present as intent presets: `电商套图`, `海报设计`, `品牌设计`, `室内设计`, `社交媒体`, `剧情短片`, `营销视频`, `智能漫剧`, `爆款实验室`.
- Existing CanvasAction preview/apply/receipt flow remains available and is styled into the new assistant shell.

## Backend Requirement Matrix

| UI affordance | Frontend marker | Required backend/product capability | Current safe behavior |
| --- | --- | --- | --- |
| Session copy control | `conversation-copy` | Stable conversation id and copyable metadata | Visual button only |
| History clock | `conversation-history` | List/search/load prior assistant conversations | Visual button only |
| New chat | `conversation-create` | Create/reset conversation and persist title/session state | Visual button only |
| Upload `+` | `assistant-attachments` | Upload reference images/videos, return attachment ids, include them in assistant context | Visual button only |
| `@` mention | `mention-resolver` | Resolve canvas nodes, assets, files, and uploaded references into context mentions | Visual button only |
| Document icon | `assistant-documents` | Attach/read workspace docs or generated briefs | Visual button only |
| `Ask` dropdown | `assistant-mode-routing` | Route `replyOnly`, `ask`, `actions`, and future modes through a typed protocol | Visual button only |
| `AUTO` toggle | `assistant-auto-policy` | Return and enforce auto-run policy for low-risk text/image actions vs strong-confirm video actions | Visual badge only |
| `爆款实验室` | `viral-lab-workflow` | Dedicated viral-lab workflow/template backend and reference-video analysis | Visual button only |

## Contract Notes

- Pi / Canvas Agent must keep returning `{ reply, actions, warnings, requiresConfirmation }` only.
- File, shell, and direct execution tools must stay disabled in Pi; only non-executing proposal tools such as `huanying_canvas_propose_actions` are allowed.
- `requiresConfirmation` should be true for video generation and workflow templates that enqueue video actions.
- Text and image generation can be auto-runnable only when schema validation and action risk scoring agree.
- Every unsupported UI control should remain visually present but must not silently fake success.

## Regression Expectations

- `#fabBtn` exists and receives `hy-canvas-agent-fab-bound` after autoload installation.
- Opening the launcher shows `RH 智能体`, `Hi user_vgx5kfkl!`, `今天一起创作点什么？`, the nine skill rows, and the composer placeholder `先上传参考图，再用 @ 引用，输入你的想法。`.
- Pure text assistant replies must not show empty action previews or apply buttons.
- Proposed actions must still validate before execution.
