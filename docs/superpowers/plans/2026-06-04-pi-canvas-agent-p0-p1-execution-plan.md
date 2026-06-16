# Pi Canvas Agent P0/P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 Pi Canvas Agent 从“UI/API/安全壳 + echo runner”推进到对齐 Claw Code 最终目标的 P0/P1 可用闭环：真实 Pi 模型内核、真实流式、Huanying-owned action proposal/validate/apply、可解释预览、强确认、历史、附件、生成生命周期、画布医生和自动整理。

**Architecture:** Pi sidecar 只做意图理解、流式文本和结构化 action proposal；Huanying Python 后端负责配置、runtime preflight、上下文脱敏、schema fail-closed、流式转发、会话持久化和统一错误；Huanying 前端负责创作驾驶舱、最终 actions 预览、强确认、二次校验、执行、回执、生成生命周期和回归证据。实施必须继承 Claw 历史坑点：final actions only、视频双保险、真实模型别名容错、source preflight、fixture 回归、Windows runtime/env/argument 限制、renderer mount timing。

**Tech Stack:** Python `unittest`；native ES modules + `D:\Aic\node.exe --test`；Node 22+ ESM sidecar；TypeScript source with checked-in compiled JS fallback；Pi SDK packages under `integrations/pi_canvas_agent`; JSONL/NDJSON streaming; existing `graphStore` / renderer bridge / canvas action schema.

---

## 0. 当前事实基线

### 0.1 已有能力

当前项目路径：

```text
D:\Aic\huanying-source-windows-20260430-122116
```

当前已存在并可复用的 P0/P1 底座：

- `integrations/pi_canvas_agent/src/runner.ts` / `runner.js`：JSONL 主循环存在，但 `handleChat()` 仍返回 `Pi canvas agent received: <message>`，这是 P0 最大阻塞。
- `integrations/pi_canvas_agent/src/huanyingTools.ts`：已有 Huanying-only tool 白名单和危险 action 名称过滤，但未接入真实 Pi tool call。
- `services/pi_runtime_service.py`：可选择 `dist/runner.js` 或 `src/runner.js`，可构建安全 env，但未校验 Node 版本、lockfile/license/source 完整性。
- `services/pi_bridge_service.py`：同步 JSONL 调用、超时、stderr 脱敏、schema fail-closed 已有，但不支持真实 event streaming。
- `services/canvas_agent_route_service.py`：`/status`、`/chat`、`/chat/stream`、`/actions/validate`、`/context/preview`、`/conversations*` 已有；`/chat/stream` 目前把同步 reply 包装成 NDJSON，不是真流式。
- `api/canvasAgentApi.js`：前端 API 和 stream fallback 已有；payload 会去掉敏感 key。
- `modules/assistant/assistantProtocol.js`：已定义 `message.start/delta/done/action.proposed/warning/tool.status/error/receipt`，并明确 `action.proposed` 只是 advisory。
- `modules/assistant/assistantStreamingClient.js`：可消费 NDJSON/SSE/async iterable，但现在仍会保留 `action.proposed` 里的 actions；P0 要收紧为 final-only 或只作为调试影子。
- `modules/app/appAssistantPanel.js`：面板、流式状态、历史、上传 chip、模型选择、预览、apply、强确认底座已有，但 UI 仍偏文本和工程感，需要 P1 产品化。
- `modules/assistant/assistantActionPreviewModel.js`：已有分组预览和强确认初版，但文案、逐条选择、风险原因、视频授权态还不足。
- `modules/assistant/assistantGenerationTaskStore.js`：本地 generation task store 已有，但后端路由、执行器/历史联动、失败恢复还不足。
- `docs/PI_CANVAS_AGENT_CLAW_PARITY_FULL_PRODUCT_SPEC.md`：本计划的产品规格来源。

### 0.2 P0/P1 实施总判断

P0 不是“再画 UI”，而是建立一个可以被测试证明的真实智能闭环：

```text
frontend request
  -> safe context
  -> Python route
  -> Pi bridge stream
  -> Pi sidecar real model/tool proposal
  -> backend normalize/schema fail-closed
  -> final message.done actions only
  -> frontend preview/confirm/revalidate/apply
  -> receipt/history/regression artifact
```

P1 不是“增加按钮”，而是让创作者能够放心使用：

```text
看得懂上下文 -> 引用得准 -> 预览得清楚 -> 风险拦得住
-> 错误能恢复 -> 生成有生命周期 -> 历史能接着做
-> 医生/整理能高频低风险使用
```

### 0.3 开发协作硬规则

- 不启动、不重启、不停止、不状态检查、不探测 `http://127.0.0.1:8777`，除非用户明确要求。
- 不把真实 API key、Bearer token、Windows 绝对路径、blob/data URL、完整项目 JSON 交给 Pi。
- 不启用 Pi 默认 filesystem/shell/browser/package/MCP 类能力。
- 不允许 streaming delta 或 `action.proposed` 触发 canvas mutation。
- 不允许模型通过 `requiresConfirmation:false` 降低本地风险判断。
- 视频生成需要前端强确认和后端 `videoAuthorized=true` 双保险。
- 每个 live 坑先落成本地 fixture/test，再继续修。

---

## 1. 文件边界与责任

### 1.1 P0 文件责任

| 文件 | 责任 | P0 变更 |
|---|---|---|
| `integrations/pi_canvas_agent/package.json` | sidecar 包和依赖 | 固定 Pi 依赖版本；补 lockfile；补 smoke scripts |
| `integrations/pi_canvas_agent/src/protocol.ts` | Python/Node JSONL/stream 协议 | 扩展 model、trace、stream frame、tool proposal 类型 |
| `integrations/pi_canvas_agent/src/huanyingTools.ts` | Huanying-only tool 和 prompt | 实现 `huanying_canvas_propose_actions` schema、final contract、危险 tool 拒绝 |
| `integrations/pi_canvas_agent/src/piClient.ts` | Pi SDK 适配层 | 新建；封装真实 Pi 会话、模型、流式和工具调用 |
| `integrations/pi_canvas_agent/src/runner.ts` | sidecar JSONL/stream 入口 | 替换 echo；输出真实 `message.delta/tool.status/message.done` |
| `services/pi_runtime_service.py` | runner 路径、env、preflight | Node 版本、source/lock/license 检查；状态原因 |
| `services/pi_bridge_service.py` | Python 调 sidecar | 增加 `chat_stream()`；逐帧解析、脱敏、final schema 校验 |
| `services/canvas_agent_route_service.py` | HTTP route | `/chat/stream` 改真流式；status 暴露 model/runtime 可用性但不泄密 |
| `services/canvas_agent_action_schema.py` | schema wrapper | 锁 final action contract、别名修复、危险动作 fail-closed |
| `tools/check_pi_canvas_agent_source_tree.py` | 发布前源树检查 | 检查 source/dist/package-lock/license/tests |

### 1.2 P1 文件责任

| 文件 | 责任 | P1 变更 |
|---|---|---|
| `modules/app/appAssistantPanel.js` | 面板交互 | 信息架构、状态条、预览卡、强确认、历史抽屉、错误恢复 |
| `modules/app/appAssistantPanel.autoload.js` | 注入真实 graph/workspace/config/uploader | 补 @ resolver 数据源、model registry、generation store |
| `modules/assistant/assistantContextBuilder.js` | 上下文构建 | @ references、attachments usages、layout/doctor hints、project preferences |
| `modules/assistant/assistantActionPreviewModel.js` | 预览模型 | 分组、逐条选择、风险原因、视频授权态、生成任务摘要 |
| `modules/assistant/assistantActionExecutor.js` | 前端执行 | 逐条 apply、生成生命周期联动、renderer mount pending |
| `modules/assistant/assistantAttachmentStore.js` | 附件 | usage 选择、上传失败态、安全 context 输出 |
| `modules/assistant/assistantConversationStore.js` | 本地历史 | pending 恢复、receipt/generation task 关联、搜索/导出 |
| `modules/assistant/assistantGenerationTaskStore.js` | 生成任务 | 和 executor/receipt/history 对齐 |
| `api/canvasAgentApi.js` | 前端 API | 补 generation tasks/template API 客户端；stream abort/trace |
| `services/canvas_agent_conversation_service.py` | 后端历史 | 保存 context/action/receipt/generation；导出脱敏 |
| `services/canvas_agent_route_service.py` | 后端 P1 API | 增加 generation tasks routes；可选 template routes |

---

## 2. P0 任务拆解

### Task P0-01: 冻结回归基线和 source preflight

**目标：** 在接入真实 Pi 前锁住当前行为，防止“跑起来但发布缺文件/测试缺洞”。

**Files:**

- Modify: `tools/check_pi_canvas_agent_source_tree.py`
- Create: `docs/PI_CANVAS_AGENT_P0_P1_EXECUTION_LOG.md`
- Test: `assistant_offline_regression_runner_test.py`

- [ ] **Step 1: 写 source preflight 红灯**

在 `tools/check_pi_canvas_agent_source_tree.py` 中确保检查清单至少包含：

```python
REQUIRED_PATHS = [
    "integrations/pi_canvas_agent/package.json",
    "integrations/pi_canvas_agent/package-lock.json",
    "integrations/pi_canvas_agent/src/protocol.ts",
    "integrations/pi_canvas_agent/src/huanyingTools.ts",
    "integrations/pi_canvas_agent/src/runner.ts",
    "integrations/pi_canvas_agent/src/protocol.js",
    "integrations/pi_canvas_agent/src/huanyingTools.js",
    "integrations/pi_canvas_agent/src/runner.js",
    "integrations/pi_canvas_agent/src/runner.test.ts",
    "services/pi_runtime_service.py",
    "services/pi_bridge_service.py",
    "services/canvas_agent_route_service.py",
]
```

如果 `package-lock.json` 还不存在，当前预期是失败；这是正确红灯。

- [ ] **Step 2: 运行 preflight 红灯**

Run:

```powershell
python tools\check_pi_canvas_agent_source_tree.py
```

Expected before lockfile landing:

```text
BLOCKED
missing: integrations/pi_canvas_agent/package-lock.json
```

- [ ] **Step 3: 固定依赖版本并生成 lockfile**

实施者需要在有网络或已有 npm cache 的环境执行。不要在无授权网络环境里下载依赖。

Run:

```powershell
cd integrations\pi_canvas_agent
npm install --package-lock-only
```

Expected:

```text
package-lock.json created
```

如果网络受限，记录到 `docs/PI_CANVAS_AGENT_P0_P1_EXECUTION_LOG.md`：

```markdown
## P0-01 Lockfile Blocker

- Command: `npm install --package-lock-only`
- Result: blocked by network or npm availability
- Decision needed: run with approved network, vendor lockfile from CI, or pin local tarballs
```

- [ ] **Step 4: preflight 绿灯**

Run:

```powershell
python tools\check_pi_canvas_agent_source_tree.py
```

Expected:

```text
OK
```

- [ ] **Step 5: 记录执行日志**

Append to `docs/PI_CANVAS_AGENT_P0_P1_EXECUTION_LOG.md`：

```markdown
## P0-01 Source Preflight

- Source preflight checks Pi package/source/compiled JS/runtime services/routes.
- `package-lock.json` is required before release.
- Verification: `python tools\check_pi_canvas_agent_source_tree.py`
```

### Task P0-02: 扩展 sidecar 协议，支持真实流式事件和 final-only actions

**目标：** Node sidecar 和 Python bridge 对齐同一套 event contract，actions 只能在 final `message.done` 出现。

**Files:**

- Modify: `integrations/pi_canvas_agent/src/protocol.ts`
- Modify: `integrations/pi_canvas_agent/src/protocol.js`
- Modify: `integrations/pi_canvas_agent/src/protocol.test.ts`
- Modify: `modules/assistant/assistantProtocol.js`
- Modify: `modules/assistant/assistantProtocol.test.js`

- [ ] **Step 1: 在 TypeScript protocol 中增加 stream frame 类型**

`integrations/pi_canvas_agent/src/protocol.ts` 增加：

```ts
export type BridgeStreamFrameType =
  | "message.start"
  | "message.delta"
  | "tool.status"
  | "warning"
  | "message.done"
  | "error";

export interface BridgeStreamFrame {
  id: string;
  type: BridgeStreamFrameType;
  conversationId?: string;
  messageId?: string;
  traceId?: string;
  delta?: string;
  message?: string;
  reply?: string;
  actions?: unknown[];
  warnings?: string[];
  requiresConfirmation?: boolean;
  errorCode?: string;
}
```

- [ ] **Step 2: 增加 final-only normalization 测试**

`integrations/pi_canvas_agent/src/protocol.test.ts` 增加：

```ts
test("protocol: message.delta never carries executable actions", () => {
  const frame = safeStreamFrame("req-1", {
    type: "message.delta",
    delta: "thinking",
    actions: [{ type: "create_node" }]
  });

  assert.deepEqual(frame.actions, []);
  assert.equal(frame.type, "message.delta");
});

test("protocol: message.done preserves final actions", () => {
  const frame = safeStreamFrame("req-1", {
    type: "message.done",
    reply: "done",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
    warnings: ["safe"],
    requiresConfirmation: false
  });

  assert.deepEqual(frame.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
  assert.equal(frame.reply, "done");
});
```

- [ ] **Step 3: 实现 `safeStreamFrame()`**

`integrations/pi_canvas_agent/src/protocol.ts` 增加：

```ts
export function safeStreamFrame(
  id: string,
  data: Partial<BridgeStreamFrame> = {}
): BridgeStreamFrame {
  const type = data.type || "error";
  const base = {
    id,
    type,
    conversationId: typeof data.conversationId === "string" ? data.conversationId : undefined,
    messageId: typeof data.messageId === "string" ? data.messageId : undefined,
    traceId: typeof data.traceId === "string" ? data.traceId : undefined,
  };

  if (type === "message.delta") {
    return { ...base, type, delta: typeof data.delta === "string" ? data.delta : "", actions: [] };
  }
  if (type === "message.done") {
    return {
      ...base,
      type,
      reply: typeof data.reply === "string" ? data.reply : "",
      actions: Array.isArray(data.actions) ? data.actions.filter(isRecord) : [],
      warnings: Array.isArray(data.warnings)
        ? data.warnings.filter((warning): warning is string => typeof warning === "string")
        : [],
      requiresConfirmation: Boolean(data.requiresConfirmation)
    };
  }
  if (type === "warning") {
    return { ...base, type, message: typeof data.message === "string" ? data.message : "" };
  }
  if (type === "tool.status") {
    return { ...base, type, message: typeof data.message === "string" ? data.message : "" };
  }
  return {
    ...base,
    type: "error",
    message: typeof data.message === "string" ? data.message : "Pi canvas agent stream failed.",
    errorCode: typeof data.errorCode === "string" ? data.errorCode : "pi_stream_error"
  };
}
```

- [ ] **Step 4: 前端 protocol 收紧 `action.proposed`**

`modules/assistant/assistantProtocol.js` 保持 `action.proposed` 返回空 actions，并在测试中锁定：

```js
test("assistantProtocol: action.proposed is advisory and not executable", () => {
  const frame = normalizeAssistantStreamFrame({
    type: "action.proposed",
    actions: [{ type: "create_node" }],
  });

  assert.equal(frame.type, "action.proposed");
  assert.deepEqual(frame.actions, []);
  assert.match(frame.message, /advisory/);
});
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js
D:\Aic\node.exe --test integrations\pi_canvas_agent\src\protocol.test.ts
```

Expected:

```text
pass
```

如果 `node --test` 不能直接跑 `.ts`，先运行：

```powershell
cd integrations\pi_canvas_agent
npm run build
D:\Aic\node.exe --test dist\protocol.test.js
```

### Task P0-03: 接入真实 Pi SDK Runner，替换 echo

**目标：** `runner.ts` 不再 echo；通过 Pi SDK 或受控模型适配层拿到真实模型输出，并只暴露 Huanying proposal tool。

**Files:**

- Create: `integrations/pi_canvas_agent/src/piClient.ts`
- Create: `integrations/pi_canvas_agent/src/piClient.test.ts`
- Modify: `integrations/pi_canvas_agent/src/huanyingTools.ts`
- Modify: `integrations/pi_canvas_agent/src/runner.ts`
- Modify: `integrations/pi_canvas_agent/src/runner.test.ts`

**Tacit knowledge:** 不要把 Pi coding-agent 默认工具直接接进来。真实产品里，AI 创作工具最容易失控的不是“模型答错”，而是“工具面太宽”。Runner 的第一版宁可笨，也要只会调用 `huanying_canvas_propose_actions`。

- [ ] **Step 1: 定义 runner 适配接口**

Create `integrations/pi_canvas_agent/src/piClient.ts`：

```ts
import {
  buildCanvasAgentSystemPrompt,
  HUANYING_CANVAS_TOOL_NAME,
  normalizeProposedActions
} from "./huanyingTools.js";
import type { BridgeRequest, BridgeResponse } from "./protocol.js";
import { safeResponse } from "./protocol.js";

export interface PiClientOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface PiModelClient {
  complete(request: BridgeRequest, options?: PiClientOptions): Promise<BridgeResponse>;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

export function responseFromModelText(request: BridgeRequest, text: string): BridgeResponse {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return safeResponse(request.id, {
      reply: text,
      actions: [],
      warnings: ["Model returned plain text without action JSON."],
      requiresConfirmation: false
    });
  }
  return safeResponse(request.id, {
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    actions: normalizeProposedActions(parsed.actions),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    requiresConfirmation: Boolean(parsed.requiresConfirmation)
  });
}

export function createPiModelClient(): PiModelClient {
  return {
    async complete(request, options = {}) {
      const systemPrompt = buildCanvasAgentSystemPrompt(request.mode === "actions" ? "actions" : "replyOnly");
      const model = options.model || process.env.PI_MODEL || "default";

      const { runPiCompletion } = await import("./piSdkAdapter.js");
      const text = await runPiCompletion({
        model,
        systemPrompt,
        message: request.message,
        context: request.context || {},
        toolName: HUANYING_CANVAS_TOOL_NAME,
        baseUrl: options.baseUrl || process.env.OPENAI_BASE_URL || "",
        apiKey: options.apiKey || process.env.OPENAI_API_KEY || ""
      });
      return responseFromModelText(request, text);
    }
  };
}
```

- [ ] **Step 2: 增加 Pi SDK adapter 隔离文件**

Create `integrations/pi_canvas_agent/src/piSdkAdapter.ts`：

```ts
export interface PiCompletionInput {
  model: string;
  systemPrompt: string;
  message: string;
  context: unknown;
  toolName: string;
  baseUrl: string;
  apiKey: string;
}

export async function runPiCompletion(input: PiCompletionInput): Promise<string> {
  if (!input.apiKey || !input.baseUrl) {
    throw new Error("Pi model provider is not configured.");
  }

  const mod = await import("@earendil-works/pi-ai");
  const createClient = (mod as Record<string, unknown>).createOpenAICompatibleClient;
  if (typeof createClient !== "function") {
    throw new Error("Pi SDK adapter is unavailable: createOpenAICompatibleClient missing.");
  }

  const client = createClient({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model
  });

  const response = await client.complete({
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          message: input.message,
          context: input.context,
          responseContract: {
            reply: "string",
            actions: [],
            warnings: [],
            requiresConfirmation: false
          },
          onlyToolName: input.toolName
        })
      }
    ]
  });

  return typeof response === "string" ? response : String(response?.text || response?.content || "");
}
```

如果实际 Pi SDK 的 API 名称不同，只允许在 `piSdkAdapter.ts` 内适配，不要污染 `runner.ts` 和后端协议。这个文件就是未来版本差异的隔离层。

- [ ] **Step 3: 为纯文本、JSON、危险工具写测试**

Create `integrations/pi_canvas_agent/src/piClient.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { responseFromModelText } from "./piClient.js";

const request = {
  id: "req-1",
  type: "chat" as const,
  mode: "actions",
  message: "focus",
  context: {}
};

test("piClient: parses model JSON contract", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "I will focus it.",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
    warnings: [],
    requiresConfirmation: false
  }));

  assert.equal(response.reply, "I will focus it.");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});

test("piClient: drops forbidden shell-like actions", () => {
  const response = responseFromModelText(request, JSON.stringify({
    reply: "bad",
    actions: [{ type: "run_shell", command: "dir" }, { type: "focus_nodes", nodeIds: ["n1"] }],
    warnings: []
  }));

  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});

test("piClient: plain text stays reply-only", () => {
  const response = responseFromModelText(request, "Plain answer.");

  assert.equal(response.reply, "Plain answer.");
  assert.deepEqual(response.actions, []);
  assert.match(response.warnings.join(" "), /plain text/);
});
```

- [ ] **Step 4: runner 注入 client，保留测试 mock 能力**

Modify `integrations/pi_canvas_agent/src/runner.ts`：

```ts
import { createPiModelClient, type PiModelClient } from "./piClient.js";

let activeClient: PiModelClient = createPiModelClient();

export function setPiModelClientForTests(client: PiModelClient): void {
  activeClient = client;
}

export async function handleChat(request: BridgeRequest): Promise<BridgeResponse> {
  try {
    return await activeClient.complete(request, {
      model: typeof request.model === "object" && request.model
        ? String((request.model as { modelId?: unknown; model?: unknown }).modelId || (request.model as { model?: unknown }).model || "")
        : process.env.PI_MODEL || ""
    });
  } catch (error) {
    return safeResponse(request.id, {
      success: false,
      errorCode: "pi_agent_failed",
      reply: "Pi canvas agent failed before producing a response.",
      warnings: [warningFromError(error)],
      actions: [],
      requiresConfirmation: false
    });
  }
}
```

- [ ] **Step 5: 修改 runner 测试，不再期望 echo**

`integrations/pi_canvas_agent/src/runner.test.ts`：

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { handleLine, setPiModelClientForTests } from "./runner.js";

test("runner: delegates chat to injected Pi model client", async () => {
  setPiModelClientForTests({
    async complete(request) {
      return {
        id: request.id,
        type: "response",
        success: true,
        reply: "Real model response",
        actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
        warnings: [],
        requiresConfirmation: false
      };
    }
  });

  const responseLine = await handleLine(JSON.stringify({
    id: "offline-1",
    type: "chat",
    mode: "actions",
    message: "focus",
    context: { canvas: { nodes: [{ id: "n1" }] } }
  }));
  const response = JSON.parse(responseLine || "");

  assert.equal(response.reply, "Real model response");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});
```

- [ ] **Step 6: 验证**

Run:

```powershell
cd integrations\pi_canvas_agent
npm run build
D:\Aic\node.exe --test dist\runner.test.js dist\piClient.test.js dist\huanyingTools.test.js dist\protocol.test.js
```

Expected:

```text
pass
```

### Task P0-04: Python bridge 支持真实 streaming，不再同步包装

**目标：** `/api/v2/canvas-agent/chat/stream` 逐帧转发 sidecar 输出，后端只在 `message.done` 校验 final actions。

**Files:**

- Modify: `services/pi_bridge_service.py`
- Modify: `services/canvas_agent_route_service.py`
- Modify: `pi_bridge_service_test.py`
- Modify: `canvas_agent_route_service_test.py`

- [ ] **Step 1: 写 bridge stream 测试**

`pi_bridge_service_test.py` 增加：

```python
def test_chat_stream_yields_delta_and_validates_final_actions_only(self):
    captured = {}

    def runner(command, **kwargs):
        captured["input"] = kwargs["input"]
        class Completed:
            returncode = 0
            stderr = ""
            stdout = "\n".join([
                '{"id":"req","type":"message.start","messageId":"m1"}',
                '{"id":"req","type":"message.delta","delta":"hello","actions":[{"type":"run_shell"}]}',
                '{"id":"req","type":"message.done","reply":"hello","actions":[{"type":"focus_nodes","nodeIds":["n1"]}],"warnings":[],"requiresConfirmation":false}',
            ])
        return Completed()

    runtime = _Runtime()
    schema = _Schema(valid=True)
    service = PiBridgeService(runtime, command_runner=runner, action_schema=schema)

    frames = list(service.chat_stream("focus", context={"canvas": {"nodes": [{"id": "n1"}]}}))

    self.assertEqual([frame["type"] for frame in frames], ["message.start", "message.delta", "message.done"])
    self.assertNotIn("actions", frames[1])
    self.assertEqual(schema.calls[0]["actions"], [{"type": "focus_nodes", "nodeIds": ["n1"]}])
```

- [ ] **Step 2: 实现 `chat_stream()`**

`services/pi_bridge_service.py` 增加：

```python
def chat_stream(self, message, context=None, conversation_id=None, mode="actions", model=None):
    request = self._build_request(
        message=message,
        context=context,
        conversation_id=conversation_id,
        mode=mode,
        model=model,
    )
    completed = self._run_sidecar(request)
    if isinstance(completed, dict) and completed.get("success") is False:
        yield {
            "type": "error",
            "message": completed.get("reply") or "Pi canvas agent failed.",
            "errorCode": completed.get("errorCode") or "pi_bridge_failed",
        }
        return

    final_seen = False
    for raw in str(getattr(completed, "stdout", "") or "").splitlines():
        frame = self._parse_stream_frame(raw, request)
        if not frame:
            continue
        if frame.get("type") == "message.delta":
            frame.pop("actions", None)
        if frame.get("type") == "message.done":
            final_seen = True
            response = self._validate_response_actions(
                {
                    "success": True,
                    "reply": frame.get("reply") or "",
                    "actions": frame.get("actions") if isinstance(frame.get("actions"), list) else [],
                    "warnings": frame.get("warnings") if isinstance(frame.get("warnings"), list) else [],
                    "requiresConfirmation": bool(frame.get("requiresConfirmation")),
                },
                context=request["context"],
            )
            frame["reply"] = response.get("reply") or ""
            frame["actions"] = response.get("actions") or []
            frame["warnings"] = response.get("warnings") or []
            frame["requiresConfirmation"] = bool(response.get("requiresConfirmation"))
            if response.get("success") is False:
                frame["type"] = "error"
                frame["message"] = response.get("reply") or "Pi canvas agent returned invalid actions."
                frame["errorCode"] = response.get("errorCode") or "invalid_actions"
                frame.pop("actions", None)
        yield frame

    if not final_seen:
        yield {
            "type": "error",
            "message": "Pi canvas agent stream ended before message.done.",
            "errorCode": "pi_stream_incomplete",
        }
```

同时把原 `chat()` 内部启动 sidecar 的逻辑抽成 `_run_sidecar(request)`，避免重复。

- [ ] **Step 3: route 直接消费 bridge stream**

`services/canvas_agent_route_service.py` 修改 `_handle_chat_stream()`：

```python
frames = list(self._bridge_service.chat_stream(**chat_kwargs))
body_bytes = "\n".join(json.dumps(frame, ensure_ascii=False) for frame in frames).encode("utf-8")
return {
    "kind": "binary",
    "status": 200,
    "contentType": "application/x-ndjson; charset=utf-8",
    "body": body_bytes,
}
```

- [ ] **Step 4: route 测试锁住非包装行为**

`canvas_agent_route_service_test.py` 增加：

```python
def test_chat_stream_delegates_to_bridge_stream_frames(self):
    class Bridge:
        def chat_stream(self, **kwargs):
            yield {"type": "message.start", "messageId": "m1"}
            yield {"type": "message.delta", "delta": "A"}
            yield {"type": "message.delta", "delta": "B"}
            yield {"type": "message.done", "reply": "AB", "actions": []}

    service = CanvasAgentRouteService(bridge_service=Bridge())
    response = service.handle_post(None, "/api/v2/canvas-agent/chat/stream", b'{"message":"hi"}')
    lines = response["body"].decode("utf-8").splitlines()

    self.assertEqual(len(lines), 4)
    self.assertIn('"delta": "A"', lines[1])
    self.assertIn('"delta": "B"', lines[2])
```

- [ ] **Step 5: 验证**

Run:

```powershell
python -m unittest pi_bridge_service_test canvas_agent_route_service_test
```

Expected:

```text
OK
```

### Task P0-05: 后端 schema fail-closed 加固和模型输出别名回归

**目标：** 把 Claw 历史中真实模型常见输出形状全部作为 Pi 的 schema 回归，避免 P0 上线后被同类坑反复打断。

**Files:**

- Modify: `canvas_agent_action_schema_test.py`
- Modify: `services/canvas_agent_action_schema.py`
- Modify: `pi_bridge_service_test.py`

- [ ] **Step 1: 增加真实模型别名样本测试**

`canvas_agent_action_schema_test.py` 增加：

```python
def test_pi_schema_repairs_real_model_aliases(self):
    schema = CanvasAgentActionSchema()
    result = schema.validate_actions(
        [
            {"action": "create_node", "id": "script_1", "data": {"type": "ai-text", "prompt": "write a script"}},
            {"operation": "create_node", "id": "image_1", "data": {"nodeType": "ai-image", "prompt": "key frame"}},
            {"actionType": "connect_nodes", "data": {"sourceId": "script_1", "targetId": "image_1"}},
        ],
        context={"canvas": {"nodes": []}},
    )

    self.assertTrue(result["valid"], result.get("errors"))
    self.assertEqual(result["actions"][0]["type"], "create_node")
    self.assertEqual(result["actions"][0]["nodeType"], "ai-text")
    self.assertEqual(result["actions"][2]["from"], "script_1")
    self.assertEqual(result["actions"][2]["to"], "image_1")
```

- [ ] **Step 2: 增加危险动作 fail-closed 测试**

```python
def test_pi_schema_rejects_forbidden_tool_shapes(self):
    schema = CanvasAgentActionSchema()
    for action in [
        {"type": "run_shell", "command": "dir"},
        {"tool": "write_file", "path": "D:\\secret.txt"},
        {"operation": "browser.open", "url": "http://example.com"},
        {"actionType": "mcp.call", "server": "filesystem"},
    ]:
        result = schema.validate_actions([action], context={"canvas": {"nodes": []}})
        self.assertFalse(result["valid"])
```

- [ ] **Step 3: 增加视频双保险测试**

```python
def test_pi_schema_blocks_video_generation_without_authorization_even_when_node_type_is_inferred(self):
    schema = CanvasAgentActionSchema()
    result = schema.validate_actions(
        [{"type": "queue_generation_task", "nodeId": "video-1"}],
        context={"canvas": {"nodes": [{"id": "video-1", "type": "ai-video"}]}},
        video_authorized=False,
    )

    self.assertFalse(result["valid"])
    self.assertIn("video generation requires confirmation", " ".join(result["errors"]))
```

- [ ] **Step 4: 实现 wrapper 层拒绝危险 tool 名称**

如果 `CanvasAgentActionSchema` 只是继承/包装 `ClawActionSchema`，在调用前加一层禁止词检查：

```python
FORBIDDEN_ACTION_TERMS = ("shell", "bash", "powershell", "file", "browser", "mcp", "package")

def _contains_forbidden_action_name(action):
    if not isinstance(action, dict):
        return True
    candidates = [
        action.get("type"),
        action.get("action"),
        action.get("actionType"),
        action.get("operation"),
        action.get("tool"),
        action.get("toolName"),
    ]
    for candidate in candidates:
        text = str(candidate or "").lower()
        if any(term in text for term in FORBIDDEN_ACTION_TERMS):
            return True
    return False
```

`validate_actions()` 在进入底层 schema 前：

```python
if any(_contains_forbidden_action_name(action) for action in actions):
    return {
        "valid": False,
        "actions": [],
        "errors": ["forbidden action requested by canvas agent"],
        "warnings": [],
    }
```

- [ ] **Step 5: 验证**

Run:

```powershell
python -m unittest canvas_agent_action_schema_test pi_bridge_service_test
```

Expected:

```text
OK
```

### Task P0-06: 模型配置闭环和 status 可解释

**目标：** 用户知道为什么不可用；开发者知道 runtime/provider/source 哪一层坏了；API 不泄密。

**Files:**

- Modify: `services/pi_runtime_service.py`
- Modify: `services/canvas_agent_route_service.py`
- Modify: `pi_runtime_service_test.py`
- Modify: `canvas_agent_route_service_test.py`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: runtime status 增加 Node 和 source 诊断**

`services/pi_runtime_service.py` 中 `status()` 返回：

```python
{
    "success": True,
    "configured": configured,
    "running": False,
    "status": "ready" if configured else "missing_runner",
    "runnerPath": runner if configured else "",
    "source": "project_sidecar",
    "nodeCommand": self._node_command,
    "requirements": {
        "node": ">=22.19.0",
        "lockfile": os.path.exists(os.path.join(self._project_root, "integrations", "pi_canvas_agent", "package-lock.json")),
        "license": os.path.exists(os.path.join(self._project_root, "integrations", "pi_canvas_agent", "LICENSE")) or os.path.exists(os.path.join(self._project_root, "integrations", "pi_canvas_agent", "LICENSE.pi.txt")),
    }
}
```

- [ ] **Step 2: status route 不泄密**

`canvas_agent_route_service_test.py` 增加：

```python
def test_status_explains_missing_provider_without_leaking_secret_fields(self):
    service = CanvasAgentRouteService(
        runtime_service=_Runtime(status={"configured": True, "status": "ready"}),
        config_getter=lambda: {"providers": {"canvas_agent": {"apiUrl": "https://x/v1", "apiKey": "sk-secret", "model": ""}}},
    )
    response = service.handle_get(None, "/api/v2/canvas-agent/status")

    provider = response["data"]["provider"]
    self.assertNotIn("apiKey", provider)
    self.assertTrue(provider["apiKeyPresent"])
    self.assertFalse(response["data"]["available"])
```

- [ ] **Step 3: 面板模型配置 guard**

`modules/app/appAssistantPanel.js` 已有 `MODEL_CONFIG_REQUIRED_MESSAGE`，补 UI 明确入口：

```js
if (guardReason) {
  state.messages.push({
    role: "assistant",
    content: `${MODEL_CONFIG_REQUIRED_MESSAGE}\n${guardReason}`,
    kind: "model_config_required",
  });
  notifyUpdate();
  return normalizeAssistantResponse({
    reply: MODEL_CONFIG_REQUIRED_MESSAGE,
    warnings: [guardReason],
  });
}
```

- [ ] **Step 4: 验证**

Run:

```powershell
python -m unittest pi_runtime_service_test canvas_agent_route_service_test
D:\Aic\node.exe --test modules\app\appAssistantPanel.p1Ui.test.js
```

Expected:

```text
OK / pass
```

### Task P0-07: fixture 离线回归闭环

**目标：** 不依赖真实 Pi 模型也能跑完“流式 -> final actions -> preview -> validate -> apply -> receipt”。

**Files:**

- Create: `docs/pi_canvas_agent_fixtures/focus_nodes_stream.ndjson`
- Create: `docs/pi_canvas_agent_fixtures/create_text_image_workflow_stream.ndjson`
- Create: `tools/run_pi_canvas_agent_offline_regression.py`
- Test: `assistant_offline_regression_runner_test.py`

- [ ] **Step 1: 创建 fixture**

`docs/pi_canvas_agent_fixtures/focus_nodes_stream.ndjson`：

```jsonl
{"type":"message.start","conversationId":"fixture","messageId":"m1","traceId":"t1"}
{"type":"message.delta","delta":"我会聚焦当前问题节点。"}
{"type":"message.done","reply":"我会聚焦当前问题节点。","actions":[{"type":"focus_nodes","nodeIds":["node-1"]}],"warnings":[],"requiresConfirmation":false}
```

`docs/pi_canvas_agent_fixtures/create_text_image_workflow_stream.ndjson`：

```jsonl
{"type":"message.start","conversationId":"fixture","messageId":"m2","traceId":"t2"}
{"type":"message.delta","delta":"我会创建脚本和图片节点，并连接它们。"}
{"type":"tool.status","message":"Proposing Huanying canvas actions"}
{"type":"message.done","reply":"已准备脚本和图片生成结构。","actions":[{"type":"create_node","id":"script_1","nodeType":"ai-text","name":"短片脚本","data":{"prompt":"写一个15秒短片脚本","workflowKind":"story_to_video","workflowStep":"story_outline"}},{"type":"create_node","id":"image_1","nodeType":"ai-image","name":"关键帧","data":{"prompt":"根据脚本生成关键帧","workflowKind":"story_to_video","workflowStep":"shot_keyframe"}},{"type":"connect_nodes","from":"script_1","to":"image_1"},{"type":"layout_nodes","nodeIds":["script_1","image_1"],"layout":"single_chain"}],"warnings":[],"requiresConfirmation":true}
```

- [ ] **Step 2: 创建 regression runner**

`tools/run_pi_canvas_agent_offline_regression.py`：

```python
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "docs" / "pi_canvas_agent_fixtures"


def load_frames(path):
    frames = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            frames.append(json.loads(line))
    return frames


def check_fixture(path):
    frames = load_frames(path)
    assert frames[0]["type"] == "message.start", path
    assert frames[-1]["type"] == "message.done", path
    for frame in frames[:-1]:
        assert "actions" not in frame or frame.get("type") != "message.delta", path
    assert isinstance(frames[-1].get("actions"), list), path
    return {"fixture": str(path.relative_to(ROOT)), "frames": len(frames), "actions": len(frames[-1]["actions"])}


def main():
    results = [check_fixture(path) for path in sorted(FIXTURES.glob("*.ndjson"))]
    print(json.dumps({"success": True, "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: 测试 runner 被离线回归清单引用**

`assistant_offline_regression_runner_test.py` 增加断言：离线回归必须包含 `tools/run_pi_canvas_agent_offline_regression.py` 和 `tools/check_pi_canvas_agent_source_tree.py`。

- [ ] **Step 4: 验证**

Run:

```powershell
python tools\run_pi_canvas_agent_offline_regression.py
python -m unittest assistant_offline_regression_runner_test
```

Expected:

```text
"success": true
OK
```

---

## 3. P1 任务拆解

### Task P1-01: Action Preview 从文本块升级为分组卡 + 逐条选择

**目标：** 用户能看懂“会发生什么”，能跳过单条 action，再执行剩余动作。

**Files:**

- Modify: `modules/assistant/assistantActionPreviewModel.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/assistant/assistantActionPreviewModel.test.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: preview model 增加 selectable items**

`buildAssistantActionPreviewModel()` 返回：

```js
{
  actionCount,
  sections: [
    {
      id: "create_nodes",
      title: "Create 2 nodes",
      risk: "medium",
      actions: [
        {
          index: 0,
          actionId: "act_1",
          type: "create_node",
          title: "短片脚本",
          subtitle: "ai-text · story_outline",
          selected: true,
          disabledReason: ""
        }
      ]
    }
  ],
  selectedIndexes: [0, 1],
  requiresConfirmation,
  requiresStrongConfirmation
}
```

- [ ] **Step 2: 测试取消单条 action 后 apply 子集**

`modules/app/appAssistantPanel.p1Ui.test.js` 增加：

```js
test("appAssistantPanel: can skip one pending action before apply", async () => {
  const applied = [];
  const panel = createAppAssistantPanel({
    documentRef,
    api: fakeApiWithValidActions(),
    executeActions: async ({ actions }) => {
      applied.push(actions);
      return { success: true, appliedCount: actions.length };
    },
  });

  panel.state.setPendingActions([
    { type: "focus_nodes", nodeIds: ["n1"] },
    { type: "layout_nodes", nodeIds: ["n1"], layout: "single_chain" },
  ]);
  panel.state.setActionSelected(1, false);
  await panel.state.applyPendingActions();

  assert.deepEqual(applied[0], [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});
```

- [ ] **Step 3: UI 渲染分组卡**

`appAssistantPanel.js` 的 render preview 区域使用结构化 DOM：

```js
function renderActionPreviewCard(model) {
  const card = createElement(documentRef, "section", "hy-canvas-agent-preview-card");
  for (const section of model.sections || []) {
    const group = createElement(documentRef, "div", `hy-canvas-agent-preview-group risk-${section.risk || "medium"}`);
    group.append(createElement(documentRef, "h4", "", section.title));
    for (const item of section.actions || []) {
      const row = createElement(documentRef, "label", "hy-canvas-agent-preview-row");
      const checkbox = documentRef.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.selected !== false;
      checkbox.disabled = Boolean(item.disabledReason);
      checkbox.addEventListener("change", () => state.setActionSelected(item.index, checkbox.checked));
      row.append(checkbox, createElement(documentRef, "span", "", item.title || item.type));
      group.append(row);
    }
    card.append(group);
  }
  return card;
}
```

- [ ] **Step 4: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected:

```text
pass
```

### Task P1-02: 强确认 UX 与视频授权双保险

**目标：** 视频、模板、批量覆盖、删除、恢复必须强确认；前端确认后后端仍需 `videoAuthorized=true`。

**Files:**

- Modify: `modules/assistant/assistantConfirmationPolicy.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantConfirmationPolicy.test.js`
- Modify: `modules/assistant/assistantActionExecutor.test.js`
- Modify: `canvas_agent_route_service_test.py`

- [ ] **Step 1: 强确认文案和输入短语**

强确认 modal 必须显示：

```text
本次操作包含视频生成或高风险动作。
输入 APPLY 确认执行；视频生成可能消耗额度，且会写入生成任务历史。
```

- [ ] **Step 2: 前端 validate 带 videoAuthorized**

`applyPendingActionsOnce()` 中：

```js
const previewModel = buildAssistantActionPreviewModel(actions);
const videoAuthorized = previewModel.requiresStrongConfirmation && state.strongConfirmationAccepted === true;
const validation = await api.validateActions({
  actions: actionsForValidation,
  context: buildContext({ graphStore }),
  videoAuthorized,
});
```

如果强确认未完成：

```js
if (previewModel.requiresStrongConfirmation && state.strongConfirmationAccepted !== true) {
  state.lastWarnings = ["本次操作需要强确认后才能执行。"];
  notifyUpdate();
  return { success: false, reason: "strong_confirmation_required" };
}
```

- [ ] **Step 3: executor 最后一道视频保险**

`assistantActionExecutor.js` 在启动 generation 前：

```js
if (resolvedNodeType === "ai-video" && options.videoAuthorized !== true) {
  return {
    success: false,
    error: "Video generation requires explicit confirmation.",
    blocked: true,
  };
}
```

- [ ] **Step 4: 后端测试锁住 videoAuthorized 透传**

`canvas_agent_route_service_test.py`：

```python
def test_actions_validate_requires_explicit_video_authorized_flag(self):
    schema = _ActionSchema()
    service = CanvasAgentRouteService(action_schema=schema)
    service.handle_post(
        None,
        "/api/v2/canvas-agent/actions/validate",
        b'{"actions":[{"type":"queue_generation_task","nodeId":"v1","nodeType":"ai-video"}],"videoAuthorized":true}',
    )
    self.assertTrue(schema.calls[0]["video_authorized"])
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.p1Ui.test.js
python -m unittest canvas_agent_route_service_test canvas_agent_action_schema_test
```

Expected:

```text
pass / OK
```

### Task P1-03: @ 引用 resolver 与 attachment usage

**目标：** 用户可以精确引用节点、素材、附件、历史产物；参考图用途进入 context，而不是只显示 chip。

**Files:**

- Modify: `modules/assistant/assistantContextBuilder.js`
- Modify: `modules/assistant/assistantAttachmentStore.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Modify: `modules/assistant/assistantContextBuilder.test.js`
- Modify: `modules/assistant/assistantAttachmentStore.test.js`
- Modify: `modules/app/appAssistantPanel.context.test.js`

- [ ] **Step 1: attachment usage 枚举**

`assistantAttachmentStore.js` 支持：

```js
export const AssistantAttachmentUsage = Object.freeze({
  Style: "style",
  Character: "character",
  Composition: "composition",
  Product: "product",
  FirstFrame: "firstFrame",
  Mask: "mask",
  General: "general",
});
```

`toContext()` 输出：

```js
{
  id,
  name,
  mime,
  kind,
  usage,
  assetId,
  dimensions,
  thumbnailHint
}
```

不得输出：

```text
localPath
path
file
blob:
data:
```

- [ ] **Step 2: @ references 数据结构**

`assistantContextBuilder.js` 输出：

```js
references: {
  items: [
    {
      id: "node:n1",
      kind: "node",
      targetId: "n1",
      label: "短片脚本",
      nodeType: "ai-text",
      usage: "target"
    }
  ]
}
```

- [ ] **Step 3: resolver UI 行为**

`appAssistantPanel.js` composer 中：

- 输入 `@` 打开 resolver。
- 支持搜索 node/asset/attachment/history。
- hover 显示类型、缩略图 hint、最近更新时间。
- 选择后插入 token，如 `@短片脚本`，同时 state 保存 reference object。

Token state：

```js
state.references = [
  { id: "node:n1", kind: "node", targetId: "n1", label: "短片脚本", usage: "target" }
];
```

- [ ] **Step 4: context 测试**

`assistantContextBuilder.test.js`：

```js
test("assistantContextBuilder: includes references and redacts local attachment paths", () => {
  const context = buildAssistantCanvasContext({
    references: [{ id: "node:n1", kind: "node", targetId: "n1", label: "脚本" }],
    attachments: [{
      id: "att1",
      name: "ref.png",
      usage: "style",
      localPath: "D:\\secret\\ref.png",
      url: "blob:http://local",
    }],
  });

  assert.equal(context.references.items[0].targetId, "n1");
  assert.equal(context.attachments.items[0].usage, "style");
  assert.equal(JSON.stringify(context).includes("D:\\secret"), false);
  assert.equal(JSON.stringify(context).includes("blob:"), false);
});
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantAttachmentStore.test.js modules\app\appAssistantPanel.context.test.js
```

Expected:

```text
pass
```

### Task P1-04: 历史抽屉升级为可恢复创作状态

**目标：** 历史不是聊天记录列表，而是能恢复 pending actions、receipt、context snapshot、generation tasks 的创作时间线。

**Files:**

- Modify: `modules/assistant/assistantConversationStore.js`
- Modify: `services/canvas_agent_conversation_service.py`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/assistant/assistantConversationStore.test.js`
- Modify: `canvas_agent_conversation_service_test.py`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: conversation schema 对齐**

每个 conversation 保存：

```json
{
  "id": "conv_x",
  "title": "短片分镜",
  "messages": [],
  "contextSnapshots": [],
  "transactions": [
    {
      "id": "tx_1",
      "messageId": "m1",
      "actions": [],
      "selectedActionIndexes": [],
      "validation": {},
      "receipt": {},
      "status": "pending|applied|failed|skipped"
    }
  ],
  "receipts": [],
  "generationTasks": []
}
```

- [ ] **Step 2: 恢复 pending actions**

`latestPendingActionsFromConversation()` 已存在，补测试：

```js
test("assistantConversationStore: restores latest pending transaction", () => {
  const store = createAssistantConversationStore({ storage: memoryStorage() });
  const conv = store.create({ title: "workflow" });
  store.appendTransaction(conv.id, {
    id: "tx1",
    status: "pending",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
  });

  const restored = store.get(conv.id);
  assert.deepEqual(latestPendingActionsFromConversation(restored), [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});
```

- [ ] **Step 3: UI 历史抽屉行为**

历史抽屉必须有：

- 搜索框。
- rename。
- delete。
- export。
- restore 按钮。
- 每行显示：title、message count、last receipt status、generation task running count。

打开历史恢复时：

```js
state.messages = conversation.messages || [];
state.pendingActions = latestPendingActionsFromConversation(conversation);
state.lastReceipt = latestReceiptFromConversation(conversation);
state.generationTasks = conversation.generationTasks || [];
state.conversationId = conversation.id;
```

- [ ] **Step 4: 后端导出脱敏**

`canvas_agent_conversation_service.py` export 不得包含 `apiKey/token/path/blob/data:`。测试：

```python
def test_export_redacts_generation_task_secrets(self):
    conversation = service.create_conversation({"title": "x"})
    service.append_generation_task(conversation["id"], {
        "nodeId": "n1",
        "prompt": "use blob:http://local and D:\\secret\\a.png",
        "apiKey": "sk-secret",
    })
    exported = json.dumps(service.export_conversation(conversation["id"]), ensure_ascii=False)
    self.assertNotIn("sk-secret", exported)
    self.assertNotIn("D:\\secret", exported)
    self.assertNotIn("blob:", exported)
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantConversationStore.test.js modules\app\appAssistantPanel.p1Ui.test.js
python -m unittest canvas_agent_conversation_service_test
```

Expected:

```text
pass / OK
```

### Task P1-05: 文本/图片生成生命周期闭环

**目标：** 文本/图片可以自动执行并在面板显示 queued/running/succeeded/failed；视频只准备不自动跑。

**Files:**

- Modify: `modules/assistant/assistantGenerationTaskStore.js`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `api/canvasAgentApi.js`
- Modify: `services/canvas_agent_route_service.py`
- Modify: `modules/assistant/assistantGenerationTaskStore.test.js`
- Modify: `modules/assistant/assistantActionExecutor.test.js`
- Modify: `canvas_agent_route_service_test.py`

- [ ] **Step 1: 定义 generation task 状态机**

状态只能是：

```text
queued -> running -> completed
queued -> running -> failed
queued -> cancelled
failed -> queued (retry creates new task)
```

- [ ] **Step 2: executor 联动 store**

在执行 `queue_generation_task` 或 `run_prompt_preset_generation` 时：

```js
const task = generationTaskStore.queueOnce({
  idempotencyKey: `${transactionId}:${nodeId}:${action.type}`,
  transactionId,
  conversationId,
  messageId,
  traceId,
  nodeId,
  nodeType,
  provider,
  model,
  prompt,
  references,
});
generationTaskStore.start(task.id);
```

文本/图片调用现有 renderer bridge；成功：

```js
generationTaskStore.complete(task.id, { assetIds, outputText, nodeId });
```

失败：

```js
generationTaskStore.fail(task.id, error.message || "Generation failed.");
```

视频：

```js
if (nodeType === "ai-video" && videoAuthorized !== true) {
  generationTaskStore.queueOnce({ ...taskData, status: "queued" });
  return { skippedVideoGeneration: true };
}
```

- [ ] **Step 3: 后端 generation task routes**

`services/canvas_agent_route_service.py` 增加：

```text
GET /api/v2/canvas-agent/generation-tasks
POST /api/v2/canvas-agent/generation-tasks
PATCH /api/v2/canvas-agent/generation-tasks/{id}
```

第一版可以委托 conversation service 或轻量 JSON store；若无后端 store，返回 501 明确说明，不要静默成功。

- [ ] **Step 4: 面板 receipt 显示生成生命周期**

Receipt 中显示：

```text
已创建 2 个节点
已启动 1 个图片生成任务
1 个视频任务等待确认
```

失败显示：

```text
图片生成失败：renderer 未挂载。节点已保留为 queued，可稍后重试。
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.p1Ui.test.js
python -m unittest canvas_agent_route_service_test canvas_agent_conversation_service_test
```

Expected:

```text
pass / OK
```

### Task P1-06: 错误恢复和 trace 复制

**目标：** 非技术用户看到友好错误，开发者能复制 trace；失败不留下半截 pending actions。

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `api/canvasAgentApi.js`
- Modify: `services/pi_bridge_service.py`
- Modify: `modules/app/appAssistantPanel.streaming.test.js`
- Modify: `api/canvasAgentApi.streaming.test.js`
- Modify: `pi_bridge_service_test.py`

- [ ] **Step 1: 统一错误 envelope**

前端错误对象字段：

```js
{
  friendlyMessage: "Pi runner 未配置，请先配置 Agent 模型。",
  errorCode: "missing_runner",
  traceId: "trace_x",
  diagnostics: [],
  retryable: true
}
```

- [ ] **Step 2: stream 中断清空半截 action**

`sendMessage()` stream catch：

```js
state.streaming = false;
state.status = "failed";
state.pendingActions = [];
state.lastWarnings = [friendlyMessageFromError(error)];
state.lastError = buildAssistantError(error);
conversationStore.appendMessage(state.conversationId, {
  role: "assistant",
  kind: "error",
  content: state.lastError.friendlyMessage,
  errorCode: state.lastError.errorCode,
  traceId: state.lastError.traceId,
});
```

- [ ] **Step 3: copy trace**

面板错误区按钮：

```js
copy(JSON.stringify({
  errorCode: state.lastError.errorCode,
  traceId: state.lastError.traceId,
  diagnostics: state.lastError.diagnostics,
  lastWarnings: state.lastWarnings,
}, null, 2));
```

- [ ] **Step 4: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.streaming.test.js api\canvasAgentApi.streaming.test.js
python -m unittest pi_bridge_service_test
```

Expected:

```text
pass / OK
```

### Task P1-07: 画布医生 MVP

**目标：** 用低风险方式诊断画布：输出 3-8 条问题，可创建注释、聚焦严重节点，但不改 prompt/model、不触发生成。

**Files:**

- Modify: `modules/assistant/assistantContextBuilder.js`
- Modify: `integrations/pi_canvas_agent/src/huanyingTools.ts`
- Modify: `modules/assistant/assistantActionPreviewModel.js`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantContextBuilder.test.js`
- Modify: `integrations/pi_canvas_agent/src/huanyingTools.test.ts`
- Modify: `modules/assistant/assistantActionPreviewModel.test.js`

- [ ] **Step 1: context 增加 diagnostics hints**

`assistantContextBuilder.js`：

```js
canvas: {
  nodeCount,
  edgeCount,
  diagnostics: {
    failedNodeIds,
    missingPromptNodeIds,
    danglingEdgeIds,
    isolatedNodeIds,
    duplicateNameGroups,
    recommendedFocusNodeIds
  }
}
```

- [ ] **Step 2: prompt 增加 doctor 规则**

`huanyingTools.ts` 中 doctor intent：

```ts
"Canvas doctor mode: return 3-8 concise diagnostics. You may propose focus_nodes and create_node comment annotations. Do not edit prompts, models, assets, or generation tasks."
```

- [ ] **Step 3: schema/preview 元数据**

诊断 action metadata：

```json
{
  "diagnosticKind": "missing_prompt",
  "diagnosticSeverity": "high",
  "diagnosticNodeIds": ["n1"],
  "diagnosticSuggestion": "补充图片生成提示词"
}
```

预览显示：

```text
画布诊断：3 条问题
高风险：1 个视频节点缺少首帧
可操作：聚焦 n1，添加 1 条注释
```

- [ ] **Step 4: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreviewModel.test.js integrations\pi_canvas_agent\src\huanyingTools.test.ts
```

Expected:

```text
pass
```

### Task P1-08: 自动整理 MVP

**目标：** 整理画布只能移动、布局、分组、重命名、聚焦；不能改内容或触发生成。

**Files:**

- Modify: `modules/assistant/assistantContextBuilder.js`
- Modify: `integrations/pi_canvas_agent/src/huanyingTools.ts`
- Modify: `services/canvas_agent_action_schema.py`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantContextBuilder.test.js`
- Modify: `canvas_agent_action_schema_test.py`
- Modify: `modules/assistant/assistantActionExecutor.test.js`

- [ ] **Step 1: context 提供 layout hints**

`assistantContextBuilder.js`：

```js
layoutHints: {
  coordinateSystem: "absolute_xy_top_left",
  targetNodeIds,
  bounds,
  suggestedOrigin,
  defaultGap: 96,
  strategies: ["single_chain", "branch_flow", "storyboard_grid", "asset_lane", "problem_lane"],
  forbiddenEdits: ["prompt", "model", "assets", "generation", "delete"]
}
```

- [ ] **Step 2: prompt 锁定整理规则**

`huanyingTools.ts`：

```ts
"Auto layout mode: only propose layout_nodes, move_nodes, create_group, rename_node, focus_nodes, set_viewport. Never change prompt/model/assets. Never delete. Never queue or run generation."
```

- [ ] **Step 3: schema 根据 assistantIntent 收紧**

当 `context.assistantIntent.id === "auto_layout"` 时，`CanvasAgentActionSchema` 拒绝：

```text
create_node
update_node_data
queue_generation_task
run_prompt_preset_generation
delete*
```

测试：

```python
def test_auto_layout_intent_rejects_generation_and_prompt_edits(self):
    schema = CanvasAgentActionSchema()
    result = schema.validate_actions(
        [{"type": "queue_generation_task", "nodeId": "n1", "nodeType": "ai-image"}],
        context={"assistantIntent": {"id": "auto_layout"}, "canvas": {"nodes": [{"id": "n1", "type": "ai-image"}]}},
    )
    self.assertFalse(result["valid"])
```

- [ ] **Step 4: executor 非重叠 fallback**

如果模型未给坐标，executor 使用本地 layout 算法，不能把节点堆到同一点：

```js
const nextPosition = computeNonOverlappingPosition({
  index,
  anchor: selectionBounds || canvasBounds || { x: 120, y: 120 },
  gap: 96,
});
```

- [ ] **Step 5: 验证**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionExecutor.test.js
python -m unittest canvas_agent_action_schema_test
```

Expected:

```text
pass / OK
```

---

## 4. P0/P1 集成验收顺序

### 4.1 每个任务最小验收

每个任务必须完成：

```text
RED test -> implementation -> focused test green -> related regression green -> execution log update
```

### 4.2 P0 完整验收命令

Run:

```powershell
python -m unittest canvas_agent_action_schema_test canvas_agent_context_service_test canvas_agent_conversation_service_test canvas_agent_route_service_test pi_runtime_service_test pi_bridge_service_test http_route_dispatcher_test
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js api\canvasAgentApi.test.js api\canvasAgentApi.streaming.test.js
python tools\check_pi_canvas_agent_source_tree.py
python tools\run_pi_canvas_agent_offline_regression.py
```

Expected:

```text
Python unittest OK
Node tests pass
source preflight OK
offline regression success=true
```

### 4.3 P1 完整验收命令

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js
python -m unittest canvas_agent_conversation_service_test canvas_agent_route_service_test canvas_agent_action_schema_test
```

Expected:

```text
pass / OK
```

### 4.4 真实页面验收

只有用户明确表示 `8777` 已就绪并允许检查时才运行：

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```text
success=true
screenshotPath=output\regression\assistant-panel-live-*.png
```

不要在未授权情况下执行这个命令。

---

## 5. 踩坑合集与实施策略

### 5.1 Runner / SDK 坑

- **Pi SDK API 可能变化。** 只在 `piSdkAdapter.ts` 中适配 SDK，`runner.ts` 不直接依赖具体函数名。
- **不要恢复 Claw 的超长 CLI prompt 参数路线。** JSONL/stdin 是为了规避 Windows argument limit。
- **Node 版本是产品问题。** `package.json` 要求 `>=22.19.0`，status/preflight 必须给出缺失原因；发布时考虑 bundled Node。
- **lockfile 是发布门槛。** 没有 `package-lock.json` 不允许声称可发布。

### 5.2 Action schema 坑

- **真实模型会输出别名。** 必须接受 `action/actionType/operation`、`data.type/data.nodeType/node_type`、`sourceId/targetId`、`targetNodeId`。
- **真实模型会输出空占位动作。** 只能在有明确上下文和已有有效动作时忽略，不能让 standalone broken action 通过。
- **模型会发明未来 node id。** 同 batch create action id 要保留，并由 executor resolve。
- **危险 action 不靠 prompt 防。** 后端 fail-closed 是最终边界。

### 5.3 Streaming 坑

- **delta 只是 UI。** 不允许 delta/action.proposed 被执行。
- **final 缺失要失败。** stream ended before `message.done` 必须 error，并清空 pending actions。
- **warning 不要被 final 空 frame 覆盖。** 前端 stream client 已有相关保护，新增测试不要破坏。

### 5.4 生成坑

- **视频双保险。** 前端强确认 + 后端 `videoAuthorized=true` + executor 最后检查。
- **renderer mount 延迟不是失败。** 任务保留 queued/running，可重试。
- **文本/图片可以自动，但必须可追踪。** 每次生成都需要 task id、transaction id、receipt 和 history。

### 5.5 UI 坑

- **预览文案是安全功能。** 用户看不懂就会误点；每组 action 必须解释影响范围。
- **不要把聊天泡泡当助手产品。** P1 的核心是状态、上下文、引用、风险、receipt、history。
- **强确认不能只是按钮。** 高风险需要输入 `APPLY` 或等价显式动作，避免误触。

---

## 6. 里程碑和交付物

### P0 交付物

- 真实 Pi runner 替换 echo。
- JSONL/NDJSON 真流式。
- final-only action contract。
- 后端 schema fail-closed。
- status/config/preflight 可解释。
- fixture offline regression 可跑通。
- `docs/PI_CANVAS_AGENT_P0_P1_EXECUTION_LOG.md` 持续记录验证证据。

### P1 交付物

- 分组 action preview card。
- 逐条选择/跳过。
- 强确认和视频授权双保险。
- @ reference resolver。
- attachment usage。
- 历史恢复 pending/receipt/generation。
- 文本/图片 generation lifecycle。
- 错误恢复和 trace copy。
- 画布医生 MVP。
- 自动整理 MVP。

---

## 7. 执行建议

推荐执行顺序：

1. `P0-01 -> P0-02 -> P0-03 -> P0-04`：先让真实 Pi + 真流式跑起来。
2. `P0-05 -> P0-06 -> P0-07`：再把安全、配置、回归门槛锁住。
3. `P1-01 -> P1-02`：先补预览和强确认，因为它们直接保护 apply。
4. `P1-03 -> P1-04`：补引用和历史，让上下文质量稳定。
5. `P1-05 -> P1-06`：补生成生命周期和错误恢复。
6. `P1-07 -> P1-08`：最后交付高频创作技能：医生和整理。

每完成一个任务，追加记录：

```markdown
## YYYY-MM-DD Task P0-xx / P1-xx

- Files changed:
- Tests run:
- Result:
- Known risks:
- 8777 touched: no
```

---

## 8. Plan Self-Review

Spec coverage:

- P0-01 覆盖 source/runtime preflight 与发布缺文件风险。
- P0-02 覆盖 final action contract 和 stream 协议。
- P0-03 覆盖真实 Pi SDK runner 与 Huanying tool proposal。
- P0-04 覆盖真实 streaming。
- P0-05 覆盖 schema fail-closed、真实模型别名、视频后端保险。
- P0-06 覆盖模型配置闭环和 status。
- P0-07 覆盖 fixture regression。
- P1-01/P1-02 覆盖分组预览、逐条选择、强确认。
- P1-03 覆盖 @ references 和附件用途。
- P1-04 覆盖高级历史和恢复。
- P1-05 覆盖文本/图片生成生命周期。
- P1-06 覆盖错误恢复。
- P1-07/P1-08 覆盖画布医生和自动整理。

未完成标记扫描目标:

```text
No unfinished-work markers.
```

Type consistency:

- 前端 action 类型沿用 `type`，兼容 `action/actionType/operation` 仅在 normalize/schema 层。
- 后端视频授权字段统一为 `videoAuthorized` HTTP payload 和 `video_authorized` Python 参数。
- Stream final action frame 统一为 `message.done`。
- Conversation transaction 状态统一为 `pending/applied/failed/skipped`。

---

Plan complete and saved to `docs/superpowers/plans/2026-06-04-pi-canvas-agent-p0-p1-execution-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh worker per task, review after each P0/P1 slice.
2. **Inline Execution** - execute in this session with checkpoints after each task group.
