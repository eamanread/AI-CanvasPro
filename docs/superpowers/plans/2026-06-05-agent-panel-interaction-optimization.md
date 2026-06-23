# Agent Panel Interaction Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the Agent panel behave like a practical chat assistant: clean text-model selection, transient notices, global `plan/act` mode, usable `@` references, reliable send input, streaming/typewriter replies, and same-conversation memory.

**Architecture:** Keep `modules/app/appAssistantPanel.js` as the UI shell, but move reusable logic into focused assistant modules. The panel state builds one safe request context from canvas state, attachments, mentions, and recent same-conversation history; action application keeps schema validation as the final boundary. UI-only behavior stays in the panel controller so the existing fake-DOM tests can verify it.

**Tech Stack:** Browser JavaScript ES modules, Node.js built-in test runner (`node --test`), existing assistant protocol/action/context modules, `localStorage` for global mode preference.

---

## File Structure

- Modify `modules/app/appAssistantPanel.js`: panel state, model filtering integration, mode selection, send/input behavior, mention menu UI, typewriter fallback, and conversation-memory request context.
- Modify `modules/assistant/assistantModelRegistry.js`: export configured text model filter helpers and use them for default model selection.
- Create `modules/assistant/assistantMentionResolver.js`: build ordered mention menu candidates from current attachments, canvas nodes, and asset-library data.
- Create `modules/assistant/assistantMentionContext.js`: turn selected mention bindings into safe request context with secret/path redaction.
- Create `modules/assistant/assistantTypingEffect.js`: deterministic cancellable typewriter helper for non-streaming replies.
- Modify `modules/app/appAssistantPanel.test.js`: state and panel behavior tests for send, mode, memory, and action authorization.
- Modify `modules/app/appAssistantPanel.p1Ui.test.js`: UI tests for model selector, send button, Enter behavior, mode selector, and mention menu.
- Modify `modules/app/appAssistantPanel.streaming.test.js`: streaming remains real streaming; non-streaming gets typewriter fallback.
- Modify `modules/assistant/assistantModelRegistry.test.js`: configured-text-only default and filtering tests.
- Create `modules/assistant/assistantMentionResolver.test.js`: ordered candidate tests.
- Create `modules/assistant/assistantMentionContext.test.js`: mention context binding and redaction tests.
- Create `modules/assistant/assistantTypingEffect.test.js`: typewriter helper tests.

## Tasks

### Task 1: Configured Text Model Filtering

**Files:**
- Modify: `modules/assistant/assistantModelRegistry.js`
- Modify: `modules/assistant/assistantModelRegistry.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [x] **Step 1: Write failing registry tests**

Add tests that prove only configured text registry models are selectable by the panel and the first configured text model is the default:

```js
test("assistantModelRegistry: configuredTextModels returns only active registry text models", () => {
  const registry = buildAssistantModelRegistry({
    modelRegistry: {
      text: [
        { id: "text-a", modelName: "Alpha", modelId: "alpha", apiKey: "k", baseUrl: "https://api.example.com" },
        { id: "text-b", modelName: "Beta", modelId: "beta", apiKey: "k", baseUrl: "https://api.example.com", status: "failed" },
        { id: "text-c", modelName: "Gamma", modelId: "gamma", apiKey: "k", baseUrl: "https://api.example.com", status: "deleted" },
      ],
    },
    providers: { canvas_agent: { apiKey: "agent", apiUrl: "https://agent.example.com", model: "agent" } },
  });
  assert.deepEqual(registry.configuredTextModels().map((model) => model.displayName), ["Alpha"]);
  assert.equal(registry.defaultModel.displayName, "Alpha");
});
```

- [x] **Step 2: Run red test**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantModelRegistry.test.js
```

Expected: FAIL because `configuredTextModels` is not exported/available yet or failed models still appear.

- [x] **Step 3: Implement filter helpers**

Add exported helpers:

```js
export function isConfiguredTextModelOption(model = {}) {
  return Boolean(
    model &&
      typeof model === "object" &&
      model.provider === REGISTRY_TEXT_PROVIDER &&
      model.configured === true &&
      model.supportsText === true &&
      model.supportsImageGeneration !== true &&
      model.supportsVideoGeneration !== true &&
      model.supportsTools !== true &&
      !["failed", "deleted"].includes(String(model.status || "").toLowerCase())
  );
}

export function filterConfiguredTextModelOptions(options = []) {
  return Array.isArray(options) ? options.filter(isConfiguredTextModelOption) : [];
}
```

Use `filterConfiguredTextModelOptions(options)[0] || null` for `defaultModel`, and expose `configuredTextModels()` on the registry object.

- [x] **Step 4: Update panel tests for model UI**

Replace legacy model cycling expectations with a test that supplies text, agent, image, video, failed, and deleted options; assert the button/menu show only `modelName`/`displayName` for configured text models.

- [x] **Step 5: Implement panel filtering**

Import `filterConfiguredTextModelOptions` in `appAssistantPanel.js`. Use it in `createAssistantPanelState` initialization, `setModelRegistry`, `fallbackSelectedModel`, `cycleModel`, `renderModelMenu`, and `modelConfigGuardReason`.

- [x] **Step 6: Run green tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantModelRegistry.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS.

### Task 2: Global Plan/Act Mode and Video Authorization

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [x] **Step 1: Write failing state tests**

Add tests:

```js
test("createAssistantPanelState: defaults to plan mode and act mode authorizes video through schema", async () => {
  const validations = [];
  const executions = [];
  const state = createAssistantPanelState({
    agentMode: "act",
    api: { async validateActions(payload) { validations.push(payload); return { success: true, valid: true, actions: payload.actions }; } },
    executeActions: async (payload) => { executions.push(payload); return { appliedCount: payload.actions.length }; },
  });
  state.setPendingActions([{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }]);
  await state.applyPendingActions();
  assert.equal(validations[0].videoAuthorized, true);
  assert.equal(executions[0].videoAuthorized, true);
});
```

Add UI test using fake storage to prove selecting `act` persists under key `huanying.canvasAgent.agentMode.v1` and a fresh panel reads it.

- [x] **Step 2: Run red tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because `agentMode` is not implemented.

- [x] **Step 3: Implement mode state**

Add constants:

```js
const AGENT_MODE_STORAGE_KEY = "huanying.canvasAgent.agentMode.v1";
const AGENT_MODES = new Set(["plan", "act"]);
```

Add `normalizeAgentMode`, `loadAgentModePreference(storage)`, and `saveAgentModePreference(storage, mode)`. State defaults to loaded storage value or `plan`; `setAgentMode(mode)` saves globally.

- [x] **Step 4: Implement action authorization**

Change `videoAuthorized` in `applyPendingActionsOnce` to:

```js
const videoAuthorized = state.agentMode === "act" || (state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true);
```

Keep `api.validateActions` mandatory and keep validation failure behavior unchanged.

- [x] **Step 5: Implement UI selector**

Replace the green `Ask` affordance with a mode button/menu showing `Plan` or `Act`. Clicking toggles/open-selects mode. In plan mode, video confirmation remains visible; in act mode, the strong confirmation button is hidden for video-only confirmation and the UI receipt says act mode can execute after validation.

- [x] **Step 6: Run green tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS and the old test “strong confirmation does not grant explicit video authorization” remains PASS.

### Task 3: Input Send UX and Transient Notices

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [x] **Step 1: Write failing tests**

Add tests that assert: empty input disables send; non-empty enables send; successful send clears immediately; failed send restores draft; Enter sends; Shift+Enter does not; IME composition Enter does not.

- [x] **Step 2: Run red tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because send state and Enter behavior are incomplete.

- [x] **Step 3: Implement send draft handling**

`handleSend()` flow:

```js
const draftText = String(text ?? inputEl?.value ?? "");
const message = draftText.trim();
if (!message) return null;
if (inputEl) inputEl.value = "";
render();
try { return await state.sendMessage(message, { onUpdate: render }); }
catch (error) { if (inputEl) inputEl.value = draftText; state.lastReceipt = error?.message || "Assistant request failed."; return null; }
```

- [x] **Step 4: Implement keyboard and button states**

Track `isComposing`; on `input`, re-render. `keydown Enter` sends when not composing and not Shift. Shift+Enter preserves newline. Send button disabled when streaming, guard reason exists, or textarea trim is empty.

- [x] **Step 5: Implement transient notice**

Add `showTransientNotice(text, { durationMs = 3000 })`, timer cleanup, `.is-fading` class, and hide/remove after fade. Only routine informational notices use it; errors/action receipts stay persistent.

- [x] **Step 6: Run green tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS.

### Task 4: Mention Resolver and Safe Mention Context

**Files:**
- Create: `modules/assistant/assistantMentionResolver.js`
- Create: `modules/assistant/assistantMentionResolver.test.js`
- Create: `modules/assistant/assistantMentionContext.js`
- Create: `modules/assistant/assistantMentionContext.test.js`

- [x] **Step 1: Write failing resolver tests**

Test output order: current conversation attachments first, then canvas nodes group, then my assets group. Test nodes are limited to 30 and searchable. Test empty asset categories appear disabled with text `暂无资产`.

- [x] **Step 2: Write failing context tests**

Test selected bindings output `mentions.items` with IDs, labels, types, and sanitized `data`; assert no `apiKey`, `token`, `C:\...`, `D:\...`, `blob:`, or `data:` values leak.

- [x] **Step 3: Run red tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantMentionResolver.test.js modules\assistant\assistantMentionContext.test.js
```

Expected: FAIL because modules do not exist.

- [x] **Step 4: Implement resolver**

Export `ASSET_CATEGORIES` and `buildAssistantMentionMenu({ attachments, nodes, assets, query })`. The return shape is:

```js
{
  references: [{ id, type: "reference", label, displayToken, source: "attachment", raw }],
  canvasNodes: { label: "画布节点", children: [...] },
  assets: { label: "我的资产", categories: [{ key, label, disabled, emptyText, children }] },
}
```

Display tokens must be `@参考图-名称`, `@节点-名称`, and `@资产-分类-名称`.

- [x] **Step 5: Implement context builder**

Export `buildAssistantMentionContext(bindings)`. Deep-clone safe objects, drop sensitive keys, redact sensitive string values, and return `{ mentions: { items } }` only when at least one binding is valid.

- [x] **Step 6: Run green tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantMentionResolver.test.js modules\assistant\assistantMentionContext.test.js
```

Expected: PASS.

### Task 5: Mention UI Integration

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [x] **Step 1: Write failing UI tests**

Add test that clicks `@`, asserts textarea receives `@`, menu opens with references, canvas nodes, and asset categories; selecting one inserts a readable token and send context includes the selected mention.

- [x] **Step 2: Run red test**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because mention UI is only a placeholder.

- [x] **Step 3: Implement UI state and menu rendering**

Add `mentionMenuEl`, `mentionMenuVisible`, `mentionQuery`, `mentionBindings`, and hovered submenu state. Use `buildAssistantMentionMenu` with `state.attachments()`, `graphStore.nodes`, and assets from `buildContext({ graphStore })` or injected asset source.

- [x] **Step 4: Implement selection binding**

On selection, replace the just-inserted `@` with `displayToken`, push a binding `{ token, id, type, label, source, raw }`, close menu, and keep focus in textarea.

- [x] **Step 5: Merge mention context into requests**

Before `buildAssistantRequest`, merge `buildAssistantMentionContext(state.mentionBindings)` into the existing context. Clear current-turn bindings after successful send; keep them when send fails.

- [x] **Step 6: Run green test**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS.

### Task 6: Typewriter Fallback and Conversation Memory

**Files:**
- Create: `modules/assistant/assistantTypingEffect.js`
- Create: `modules/assistant/assistantTypingEffect.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.streaming.test.js`
- Modify: `modules/app/appAssistantPanel.test.js`

- [x] **Step 1: Write failing typewriter tests**

Add deterministic tests that a non-streaming reply appends chunks in order, calls `onUpdate`, and can be cancelled.

- [x] **Step 2: Write failing memory tests**

Test the second request in the same `conversationId` includes recent user/assistant messages and previous mention/pending-action summary; a new conversation does not include messages from another conversation.

- [x] **Step 3: Run red tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantTypingEffect.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.test.js
```

Expected: FAIL because typewriter module and memory context are missing.

- [x] **Step 4: Implement typewriter helper**

Export `appendAssistantTypingMessage({ messages, text, onUpdate, signal, chunkSize = 1, delayMs = 12, scheduler })`. It creates an assistant message with empty content, appends chunks, and stops when cancelled.

- [x] **Step 5: Integrate non-streaming fallback**

For `api.chat`, insert an empty assistant message and call the typing helper with `response.reply`. For tests, support `typingDelayMs` option so zero-delay deterministic runs are possible. Do not typewriter `api.chatStream` output.

- [x] **Step 6: Implement conversation memory**

Add `buildConversationMemory(state, conversationStore)` that takes recent messages from the active state/conversation only, latest context snapshot, current references, mention bindings, and pending action summary. Merge under `context.conversationMemory` before `buildAssistantRequest`.

- [x] **Step 7: Run green tests**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantTypingEffect.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.test.js
```

Expected: PASS.

### Task 7: Final Verification

**Files:**
- All files above.

- [x] **Step 1: Run focused regression suite**

Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantMentionResolver.test.js modules\assistant\assistantMentionContext.test.js modules\assistant\assistantTypingEffect.test.js modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.streaming.test.js
```

Expected: all tests PASS with zero failing tests.

- [x] **Step 2: Verify requirement coverage**

Check each requirement in `docs/superpowers/specs/2026-06-05-agent-panel-interaction-optimization-design.md` against tests and code paths. Record any incomplete item in the final response.

- [x] **Step 3: Report final state**

Explain completed features, remaining risks, and exact verification command output. Mention that this directory is not a git repository, so no commit was created.

---

## Implementation Status - 2026-06-05

All checklist items above have been implemented for the Agent panel optimization scope.

Verification evidence:

```powershell
$assistantTests = Get-ChildItem -LiteralPath 'modules\assistant' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { $_.FullName }
$appTests = Get-ChildItem -LiteralPath 'modules\app' -Filter 'appAssistantPanel*.test.js' | Sort-Object Name | ForEach-Object { $_.FullName }
& 'D:\Aic\node.exe' --test --test-concurrency=1 @assistantTests @appTests
```

Result: 211 tests passed, 0 failed.

```powershell
D:\Aic\node.exe --check modules\assistant\assistantModelRegistry.js
D:\Aic\node.exe --check modules\assistant\assistantMentionResolver.js
D:\Aic\node.exe --check modules\assistant\assistantMentionContext.js
D:\Aic\node.exe --check modules\assistant\assistantTypingEffect.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.autoload.js
```

Result: syntax check passed for 6 files.
