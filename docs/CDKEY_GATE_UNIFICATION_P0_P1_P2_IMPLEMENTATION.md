# 新 CDKEY 门禁统一实施文档（P0 / P1 / P2）

## 1. 文档目标

本文档用于指导当前仓库把“旧 VIP 模型门禁语义”彻底收口到“新 CDKEY 激活门禁语义”。

本次实施只解决一件事：

- 让“是否允许提交生成”只由**新的 CDKEY 授权体系**决定。

本次实施不解决这些问题：

- 多种 CDKEY 类型设计
- 远端授权服务重构
- 商业级防破解
- 更细粒度的套餐/模型/额度系统

本文档基于当前仓库 **2026-04-29** 的代码状态编写。

---

## 2. 当前基线结论

### 2.1 已经具备的能力

当前仓库已经具备一套可复用的本地授权主链路：

- 本地授权来源：
  - `services/local_subscription_client.py`
- 订阅状态接口：
  - `GET /api/v2/subscription/status`
- CDKEY 激活接口：
  - `POST /api/v2/subscription/activate`
- 后端统一生成门禁主入口：
  - `services/subscription_gate_service.py`
  - `SubscriptionGateService.check_generation_access(...)`
- 已接入统一生成门禁的主要生成路由：
  - `server.py`
  - `services/remote_proxy_route_service.py`
  - `services/dreamina_route_service.py`
- 本地固定 CDKEY + MAC 绑定：
  - 固定 CDKEY：`fcyh0012`
  - 授权文件：`SYSTEM_STATE_DIR/license.json`

### 2.2 当前没有统一干净的部分

真正没有统一干净的不是后端主门禁，而是以下残留：

- 前端订阅状态仍按“VIP 模型授权”思路在预判：
  - `modules/subscriptionAccess.js`
- 前端错误与弹窗仍以 `requiredModelId` / VIP 模型为中心组织语义：
  - `api/requester.js`
  - `api/errors/ApiError.js`
  - `modules/app/appPanels.js`
- 后端仍保留旧 VIP 常量、旧 helper、旧 cache 命名：
  - `server.py`
  - `services/subscription_gate_service.py`
- 相关测试仍锁定 `dreamina/video_vip`、`runninghub/...` 这样的历史门禁语义：
  - `modules/subscriptionAccess.test.js`

### 2.3 当前最重要的架构判断

当前仓库的真实行为已经接近：

1. 前端为本地 `/api/*` 请求追加 `X-AIC-Install-Id`
2. 本地后端统一检查是否允许生成
3. 若不允许，则返回 `SUBSCRIPTION_REQUIRED`
4. 前端统一弹出激活/授权提示

但前端和文案层还没有从“视频 VIP 门禁”完全切换到“通用 CDKEY 门禁”。

---

## 3. 最终目标状态

统一完成后，项目应满足以下规则：

### 3.1 单一门禁真相源

“是否允许提交生成”只认：

- `SubscriptionGateService.check_generation_access(...)`

任何页面、本地 helper、模型映射、UI 预判，都不能再拥有独立的真实门禁逻辑。

### 3.2 前端只认“授权态”，不再认“VIP 模型态”

前端的主语义从：

- 某模型是不是 VIP
- 当前订阅有没有某模型 entitlement

切换为：

- 当前安装实例是否已激活
- 激活来源是不是 `cdkey`
- 当前授权范围是否允许该次生成

### 3.3 所有内部控制字段只在本地链路存在

以下字段可以在前端与本地服务之间流转，但**绝不能继续透传给第三方上游**：

- `installId`
- `activationSource`
- `activation_source`
- `generationScope`
- `generation_scope`
- `entitledNodeTypes`
- `entitled_node_types`
- `entitledProviders`
- `entitled_providers`
- `entitledModelIds`
- `entitled_model_ids`
- `entitledModelKeys`
- `entitled_model_keys`
- `requireCdkeySource`
- `require_cdkey_source`
- `rhInstanceType`
- 内部用途的 `provider`

### 3.4 `requiredModelId` 降级为上下文字段

`requiredModelId` 后续仍可回传给前端，但它的角色只能是：

- 告知这次请求来自哪个模型或工作流
- 帮助 UI 展示上下文
- 帮助日志定位

它不再是“前端是否允许提交生成”的判断核心。

---

## 4. 字段合同重定义

### 4.1 生成拒绝响应字段

统一后的本地拒绝响应以这些字段为主：

| 字段 | 是否保留 | 角色 |
| --- | --- | --- |
| `code` / `errorCode` | 保留 | 前后端统一错误码，固定为 `SUBSCRIPTION_REQUIRED` |
| `message` | 保留 | 用户可见错误说明 |
| `subscriptionStatus` | 保留 | 当前授权状态，如 `none` / `active` / `expired` |
| `activationSource` | 保留 | 当前激活来源，如 `cdkey` |
| `generationScope` | 保留 | 当前授权范围，如 `all` |
| `provider` | 保留 | 本次请求所属能力来源，如 `dreamina` / `runninghubwf` / `text` |
| `nodeType` | 保留 | 本次请求所属节点类型，如 `text` / `image` / `video` |
| `contactText` | 保留 | 联系管理员说明 |
| `contactUrl` | 保留 | 联系管理员链接 |
| `requiredModelId` | 保留但降级 | 仅作上下文展示和日志定位 |

### 4.2 订阅状态字段

前端状态模型后续应以这些字段为主：

| 字段 | 角色 | 备注 |
| --- | --- | --- |
| `status` | 主状态 | `none` / `active` / `expired` |
| `expiresAt` | 兼容保留 | 当前本地固定 CDKEY 模式可为空 |
| `activationSource` | 主字段 | 后续前端要直接展示并参与授权态判断 |
| `generationScope` | 主字段 | 后续可支持 `all` / `none` / 更细范围 |
| `entitledNodeTypes` | 预留字段 | P0 不作为主门禁依据，P2 可扩展 |
| `entitledProviders` | 预留字段 | P0 不作为主门禁依据，P2 可扩展 |
| `entitledModelIds` | 兼容保留 | 不再作为统一门禁主判断 |
| `entitledModelKeys` | 兼容保留 | 不再作为统一门禁主判断 |

### 4.3 需要退场的旧语义

以下概念后续不应继续作为统一门禁中心：

- `VIP_MODEL_*`
- `isVipModel()`
- `resolveVipGateModelId()`
- “某视频模型 entitlement 决定是否允许生成”

---

## 5. 受影响模块总表

| 模块 | 当前问题 | 目标动作 | 优先级 |
| --- | --- | --- | --- |
| `services/subscription_gate_service.py` | 统一门禁已存在，但仍混有 VIP 历史语义 | 保持 `check_generation_access()` 为唯一有效提交门禁 | P0 |
| `server.py` | 仍保留旧 VIP 常量和旧 helper | 继续仅使用统一生成门禁；旧 helper 不再扩散 | P0 |
| `services/remote_proxy_route_service.py` | RunningHub 路由已接门禁，但字段清单与主服务重复维护 | 确保内部字段剥离和统一门禁不回退 | P0 |
| `services/dreamina_route_service.py` | 已接门禁，但仍带视频 VIP 历史模型语义 | 保持门禁统一，语义改为 CDKEY 授权上下文 | P0 |
| `services/http_route_dispatcher.py` | 激活后仍清理的是 VIP cache 命名 | 保持接口兼容，后续清理旧命名 | P1 |
| `api/requester.js` | 统一错误拦截已做，但仍把 `modelId` 作为核心上下文传给 UI | 改为通用授权错误触发器，`requiredModelId` 降级为辅助信息 | P0 |
| `api/errors/ApiError.js` | 订阅错误对象仍以模型字段为中心 | 改为通用生成授权错误对象 | P0 |
| `modules/subscriptionAccess.js` | 仍是 VIP 模型判定器 | 改为“授权态读取与判断中心” | P0 |
| `modules/app/appPanels.js` | 仍使用 VIP 文案和旧预判语义 | 先改触发逻辑，再改文案展示 | P0 / P1 |
| `main.js` | 仍导入 VIP 相关 helper | 收口到新的授权态 helper | P1 |
| 测试文件 | 大量测试仍锁定旧 VIP 模型语义 | 改为验证 CDKEY 激活态和统一拒绝响应 | P0 / P1 |

---

## 6. P0 必改实施项

P0 的定义是：**不做就会继续出现真实行为错误、门禁不一致、字段错传、或前后端语义冲突。**

### 6.1 后端：确立唯一有效门禁

#### 目标

确保所有“提交生成”类接口只认：

- `SubscriptionGateService.check_generation_access(...)`

#### 必做项

1. 检查所有生成提交入口，不再新增任何绕开该方法的门禁分支。
2. `server.py` 中所有提交到第三方的通用代理入口继续只走 `_enforce_generation_subscription_gate(...)`。
3. `services/remote_proxy_route_service.py` 的 RunningHub run 路由继续只走统一门禁。
4. `services/dreamina_route_service.py` 的图片/视频提交入口继续只走统一门禁。
5. 不得在新的提交链路里重新引入“先判断是不是 VIP 模型，再决定是否门禁”的逻辑。

#### 相关文件

- `services/subscription_gate_service.py`
- `server.py`
- `services/remote_proxy_route_service.py`
- `services/dreamina_route_service.py`

#### 验收标准

- 文本、图片、视频、Dreamina、RunningHub workflow 的提交入口全部统一走同一套判权。
- 未激活时，所有提交型生成入口都返回 `SUBSCRIPTION_REQUIRED`。

### 6.2 后端：内部控制字段剥离不能回退

#### 目标

确保所有本地控制字段只在“前端 -> 本地服务”之间存在，不再透传到第三方上游。

#### 必做项

1. 复核 `server.py` 中 `INTERNAL_PROXY_CONTROL_FIELDS` 的字段清单。
2. 复核 `services/remote_proxy_route_service.py` 中 `_INTERNAL_CONTROL_FIELDS` 的字段清单。
3. 保证 `/api/v2/proxy/completions`、`/api/v2/proxy/image`、`/api/v2/runninghubwf/run` 在转发前都剥离内部字段。
4. Dreamina 提交链路继续只把业务字段交给 CLI/service，不回传本地内部控制字段。
5. 后续新增任何本地提交路由时，必须先判断是否需要加入剥离清单。

#### 相关文件

- `server.py`
- `services/remote_proxy_route_service.py`
- `services/dreamina_route_service.py`

#### 验收标准

- 第三方上游请求体中不再出现 `installId`、`activationSource`、`generationScope`、`entitled*`、`requireCdkeySource` 等字段。
- 相关回归测试覆盖剥离行为。

### 6.3 前端：从“VIP 模型判定器”切到“授权态中心”

#### 目标

把 `modules/subscriptionAccess.js` 从历史上的 VIP 模型权限工具，改成统一的授权状态工具。

#### 必做项

1. 保留 `normalizeSubscriptionPayload()`、`createDefaultSubscriptionState()` 作为状态归一化入口。
2. 新的主判断逻辑改为：
   - 当前 `status`
   - 当前 `activationSource`
   - 当前 `generationScope`
   - 需要时的 `provider` / `nodeType`
3. `isModelAllowed()` 不能再承担统一生成门禁的真实判断职责。
4. 如果为了兼容现有调用暂时保留 `isModelAllowed()`，也只能把它降级为兼容包装，不得继续作为核心门禁函数。
5. `resolveVipGateModelId()`、`isVipModel()` 后续不再作为主流程依赖。

#### 相关文件

- `modules/subscriptionAccess.js`
- `main.js`
- `modules/app/appPanels.js`

#### 验收标准

- 前端本地状态模型不再以 VIP 模型 entitlement 作为统一门禁核心。
- 新增代码中不再依赖 `dreamina/video_vip` 或 `runninghub/...` 这样的 VIP 映射做主判断。

### 6.4 前端：统一错误触发逻辑改成“授权错误驱动”

#### 目标

让前端统一响应“后端拒绝生成”这件事，而不是围绕某个 VIP 模型写定制逻辑。

#### 必做项

1. `api/requester.js` 继续作为 `SUBSCRIPTION_REQUIRED` 的统一识别入口。
2. `triggerSubscriptionRequired(...)` 向 UI 层传递的主语义改为：
   - 当前请求被授权门禁拦截
   - 当前 provider / nodeType / status / activationSource 等上下文
3. `requiredModelId` 仍可继续透传，但只能作附加信息。
4. `ApiError.subscriptionRequired(...)` 保留现有字段兼容，但文档与代码注释都应明确：
   - 该错误表示“生成授权不足”
   - 不表示“某 VIP 模型专属 entitlement 缺失”

#### 相关文件

- `api/requester.js`
- `api/errors/ApiError.js`
- `modules/app/appPanels.js`

#### 验收标准

- 任一生成入口收到 `SUBSCRIPTION_REQUIRED` 时，前端都走同一套激活提示链路。
- UI 不再依赖某个 VIP 模型映射才能弹出门禁提示。

### 6.5 测试：用新门禁语义替换旧 VIP 主断言

#### 目标

把测试从“视频 VIP entitlement”收口为“统一 CDKEY 激活门禁”。

#### 必做项

1. 保留并扩展以下测试方向：
   - `subscription_gate_service_test.py`
   - `local_subscription_client_test.py`
   - `requester.subscription.test.js`
   - `modules/subscriptionAccess.fields.test.js`
2. 重写或降级以下旧测试假设：
   - `modules/subscriptionAccess.test.js`
3. 新测试应优先断言：
   - `SUBSCRIPTION_REQUIRED`
   - `activationSource`
   - `generationScope`
   - `provider`
   - `nodeType`
4. 对 `dreamina/video_vip`、`runninghub/...` 的断言如果还保留，只能作为兼容测试，不能作为主验收测试。

#### 验收标准

- 测试名称、断言和失败信息都体现“CDKEY / 统一授权态”语义。
- 不再把“即梦视频 VIP gate model”作为主测试中心。

---

## 7. P1 应改实施项

P1 的定义是：**不改不会马上出错，但会持续制造语义错位、维护负担和新功能误接入风险。**

### 7.1 UI 与文案去 VIP 化

#### 目标

让用户看到的系统说明与真实授权机制一致。

#### 必做项

1. 把弹窗、设置页、提示语中的“VIP 授权”统一改成：
   - 授权激活
   - CDKEY 激活
   - 生成权限
2. “联系管理员获取授权码”可保留，但不再搭配“VIP”措辞。
3. 当后端返回 `activationSource`、`generationScope` 时，设置页可展示：
   - 激活来源
   - 授权范围

#### 相关文件

- `modules/app/appPanels.js`
- `index.html`
- 其他订阅中心相关 UI 文件

### 7.2 收口旧命名和日志语义

#### 目标

降低后续维护者对“当前系统到底是 VIP 还是 CDKEY 门禁”的误判。

#### 必做项

1. 后端日志里的 `vip_gate` 命名改成更中性的 `generation_gate` 或 `subscription_gate`。
2. `server.py` 中旧 VIP 常量如果仍需保留兼容，应加清晰注释说明“仅历史兼容，不再作为统一门禁中心”。
3. `main.js` 中不再继续导入不使用的 VIP helper。

#### 相关文件

- `server.py`
- `main.js`
- `services/subscription_gate_service.py`

### 7.3 降低前端新增路由漏接风险

#### 目标

避免后续新增生成接口时，后端能拦但前端不弹窗。

#### 必做项

1. 统一管理 `api/requester.js` 中的生成路由识别清单。
2. 新增生成路由时，把“是否属于生成提交路由”纳入开发 checklist。
3. 如有条件，可把生成路由识别抽为可复用常量或集中注册。

#### 相关文件

- `api/requester.js`
- 对应各生成 API 文件

---

## 8. P2 可延后实施项

P2 的定义是：**不影响当前统一门禁成立，但属于应该逐步还掉的历史包袱。**

### 8.1 删除零调用旧 helper

#### 目标

清理已经不再参与真实行为的历史逻辑。

#### 候选项

- `server.py` 中 `_enforce_vip_subscription_gate()`
- `services/subscription_gate_service.py` 中旧 VIP allow cache 相关逻辑
- `V54_VIP_MODEL_ID`
- `DREAMINA_VIDEO_VIP_MODEL_ID`
- `VIDEO_VIP_MODEL_IDS`
- `VIDEO_VIP_WORKFLOW_IDS`

说明：

- 只有在确认零调用、零行为依赖、零回归风险后，才进入删除。
- P2 清理不能反过来影响当前固定 CDKEY 门禁的可用性。

### 8.2 合并重复字段清单

#### 目标

避免 `server.py` 与 `services/remote_proxy_route_service.py` 的内部字段清单长期分叉。

#### 候选做法

1. 提炼共享常量模块
2. 统一从单一来源导入
3. 给字段清单增加专门测试

### 8.3 启用更细粒度授权范围

#### 目标

在统一 CDKEY 门禁已经稳定后，再考虑基于 `generationScope`、`entitledNodeTypes`、`entitledProviders` 做更细粒度能力控制。

说明：

- 这不是当前版本上线前置条件。
- 当前最简本地试用版可继续保持 `generationScope = all`。

---

## 9. 推荐开发顺序

1. 先做 P0 的后端门禁和字段合同收口。
2. 再做 P0 的前端状态与错误触发逻辑收口。
3. 立刻补 P0 测试，确认统一门禁不会回退成旧 VIP 逻辑。
4. 再做 P1 的 UI 文案与命名清理。
5. 最后评估 P2 的历史代码删除和结构整理。

---

## 10. Phase 验收清单

### 10.1 P0 验收

- 文本、图片、视频、Dreamina、RunningHub workflow 的提交入口全部走统一门禁。
- 未激活时，所有生成提交统一返回 `SUBSCRIPTION_REQUIRED`。
- `requiredModelId` 不再作为前端是否门禁的主判断。
- 前端订阅状态模型改为围绕 `status`、`activationSource`、`generationScope` 组织。
- 第三方上游请求不再收到内部控制字段。
- 相关测试通过。

### 10.2 P1 验收

- 所有用户可见文案不再把统一门禁描述为“VIP 模型授权”。
- 日志和命名不再误导维护者。
- 新生成路由接入时有统一 checklist 或注册点。

### 10.3 P2 验收

- 零调用旧 helper 被安全删除。
- 内部字段清单不再多处重复维护。
- 更细粒度授权范围如要启用，有独立测试和明确字段合同。

---

## 11. 本次实施的硬性约束

1. 不得回退当前本地固定 CDKEY + MAC 绑定链路。
2. 不得把 `installId` 或其他内部控制字段继续透传给第三方。
3. 不得让前端再次拥有独立于后端的“真实门禁”。
4. 不得把新的统一门禁重新实现成“视频 VIP 门禁换皮”。
5. 任何兼容层保留都必须明确标注为“历史兼容，不是主流程真相源”。

---

## 12. 结论

当前仓库已经具备“新 CDKEY 门禁统一化”的后端基础，真正需要实施的是：

- 把前端从“VIP 模型判定器”改成“通用授权态中心”
- 把错误透传和 UI 语义从“某模型 VIP 被锁”改成“当前生成权限不足”
- 把旧 VIP 常量、旧 helper、旧测试从主流程中降级或清退

如果严格按本文档推进，建议开发顺序就是：

1. **P0：统一真实行为**
2. **P1：统一语义与维护方式**
3. **P2：清理历史包袱**
