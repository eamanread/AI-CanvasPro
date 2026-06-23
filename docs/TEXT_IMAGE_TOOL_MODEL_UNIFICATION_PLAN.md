## Text/Image Tool Model Unification Plan

### Scope

This plan covers:
- AI text node tool/model behavior
- AI image node tool/model behavior
- shared prompt preset slash entrypoint
- how tool actions inherit node-selected model and global configuration

This plan does not cover:
- video node generation model redesign
- audio node workflow redesign
- server-side provider migration outside text/image scope

### Findings

#### 1. Main text/image generation path is already partly unified

Registry-aware path exists here:
- `components/aigenText/modelRegistryRuntime.js`
- `components/aigenText/taskOrchestrationModule.js`
- `components/aigenImage/modelRegistryRuntime.js`
- `components/aigenImage/taskOrchestrationModule.js`

These files already support:
- `selectedModelId`
- `selectedModelNameSnapshot`
- `modelDeleted`
- registry-backed payload building with `registry-openai`

#### 2. Slash preset UI regressed because shared menu rendering diverged

Root cause:
- `modules/slashMenu.js` rendered `preset-slash-*` class names
- node-local injected CSS in text/image node UI still styles `v2-slash-*`
- trigger detection also depended on a fragile "caret must be inside one text node and slash must be the last char of that exact node" assumption

Impact:
- preset menu could be logically built but visually/behaviorally inconsistent
- prompt structures involving contenteditable fragments are more fragile than necessary

#### 3. Image tools still bypass registry/global config

Highest-risk bypass:
- `modules/ImageFreeAngleController.js`

Why it is inconsistent:
- infers provider from legacy model string prefixes
- reads credentials from legacy `getProviderConfig(provider)`
- calls `buildGenerateImageRequest` / `generateImage` directly
- does not resolve from `selectedModelId`
- cannot treat registry-selected models as first-class tool inputs

This means image tool actions such as:
- camera angle / free-angle generation
- derived image generation from tool overlays

can diverge from the model a user selected on the node itself.

#### 4. Legacy text/image UI still contains hardcoded provider/model menus

Evidence:
- `components/aigenText/uiModule.js`
- `components/AIGenerateNode.js`
- `components/aigenImage/uiModule.impl.js`

Current situation:
- runtime wrappers can overwrite visible model menu state with registry data
- but legacy hardcoded provider/model branches still exist in large UI/controller code
- this increases risk that special tools or secondary entrypoints drift away from registry mode

#### 5. Text tool behavior is more unified than image tools, but still not clean

Text node generation itself goes through:
- `components/aigenText/taskOrchestrationModule.js`

But risk remains in:
- hardcoded text model menu UI
- local custom-model storage legacy path (`v2-custom-text-models`)
- slash/custom preset UX still attached to node-local legacy UI conventions

### Target Contract

All text/image tool actions should follow the same contract:

1. Resolve node runtime model state from `selectedModelId`
2. If registry-backed model exists and is configured, use it
3. If model is missing or deleted, fail with one consistent node-level error
4. Only fall back to legacy provider-specific path for explicitly unsupported tool chains
5. UI should expose one model selection concept per node, not separate hidden tool-only model state

### Repair Phases

#### Phase 1: Stabilize slash preset entry

Files:
- `modules/slashMenu.js`

Actions:
- keep one shared slash menu implementation
- align emitted class names with node-injected styles
- make slash trigger range detection work across contenteditable text nodes
- keep submenu and keyboard navigation behavior consistent

Verification:
- typing `/` in AI text node shows visible preset menu
- typing `/` in AI image node shows visible preset menu
- preset selection closes menu and triggers generation path

#### Phase 2: Introduce shared tool model resolver

Add:
- `modules/toolModelResolutionService.js`

Responsibilities:
- resolve effective model from node data
- prefer registry-backed `selectedModelId`
- return normalized shape:
  - `provider`
  - `model`
  - `apiKey`
  - `baseUrl`
  - `adapterType`
  - `source` (`registry` or `legacy`)
  - `state` (`ready`, `deleted`, `unconfigured`)

Consumers:
- image tool controllers
- text tool controllers
- any future secondary generation entrypoints

#### Phase 3: Make image tool actions consume the shared resolver

Primary file:
- `modules/ImageFreeAngleController.js`

Required changes:
- stop inferring provider only from string prefixes
- stop assuming legacy provider config is the only credential source
- resolve effective runtime model through shared resolver
- if `source === registry`, build payload from registry-backed resolved config
- if `source === legacy`, keep current path as compatibility fallback

Verification:
- free-angle/camera-angle tool uses the same model as the node selector
- registry-selected image model works from tool entrypoint
- missing/deleted registry model blocks tool action consistently

#### Phase 4: Remove duplicated text model entry assumptions

Files:
- `components/aigenText/uiModule.js`
- `components/AIGenTextNode.js`
- `components/aigenText/modelRegistryRuntime.js`

Actions:
- keep visible model list sourced from registry only
- retire legacy custom-text-model menu branches from active runtime path
- preserve migration only for loading old nodes, not for new tool selection

Verification:
- text node normal generate path and tool-generated path show the same model label
- no local-only model menu can override node runtime state invisibly

#### Phase 5: Make image node special menus registry-aware by design

Files:
- `components/AIGenerateNode.js`
- `components/aigenImage/uiModule.impl.js`
- `components/aigenImage/modelRegistryRuntime.js`

Actions:
- separate "tool mode" from "model source"
- keep provider-specific capability panels only when capability truly depends on adapter family
- derive capability panel visibility from resolved runtime model metadata, not raw string prefix tests where possible

Verification:
- selecting a registry image model updates:
  - main generate button path
  - tool entrypoint path
  - capability panel visibility

### Migration Notes

Old nodes may still contain:
- `model`
- `provider`
- legacy provider-specific flags

Migration rule:
- if `selectedModelId` resolves, it wins
- else preserve legacy path until user reselects model
- after reselection, tool actions must use registry path

### Test Strategy

#### Mandatory focused verification

- slash preset UI smoke:
  - AI text node
  - AI image node
- registry generation unit tests:
  - `components/aigenText/taskOrchestrationModule.test.js`
  - `components/aigenImage/taskOrchestrationModule.registry.test.js`
- image tool integration:
  - uploaded image node + free-angle tool with registry-selected model

#### Recommended new tests

- `modules/slashMenu.test.js`
  - cross-text-node slash trigger detection
  - class/state visibility regression
- `modules/toolModelResolutionService.test.js`
  - registry/legacy precedence
  - deleted/unconfigured state handling
- `modules/ImageFreeAngleController.test.js`
  - registry-backed tool payload resolution

### Ship Order

1. Ship slash fix first
2. Land shared tool model resolver
3. Migrate image tools to resolver
4. Clean legacy text/image model menus
5. Remove now-dead compatibility branches only after verification
