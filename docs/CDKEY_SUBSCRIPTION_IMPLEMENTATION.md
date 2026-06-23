# CDKEY / 订阅中心全生成门禁实施开发说明

## 1. 文档目标

本文档用于把当前仓库里已经存在的“订阅中心 / CDKEY 激活 / 视频 VIP 门禁”能力，扩展成一套可落地的“全生成门禁”方案。

本次 review 重点只聚焦三件事：

1. `installId` 在各生成链路中的透传现状与改造方式。
2. 订阅状态、CDKEY 来源、模型权限等关联字段应该如何兼容扩展。
3. 哪些本地代理路由要改、哪些字段不能继续透传给第三方上游。

结论先说：

- 当前项目**可以复用现有订阅中心 UI 和本地授权链路**，不需要推翻重做。
- 当前项目还不是“全生成门禁”，而是“**以视频 VIP 为中心的局部门禁**”。
- 直接把 `installId` 塞进所有 body 不是正确方案，因为当前很多本地代理会把 body 原样继续发给第三方。
- 专业做法是：**前端统一用 header 把 `installId` 传给本地服务，本地服务统一做门禁，再把内部控制字段剥离后转发给第三方**。

---

## 2. 当前实现审查结论

### 2.1 已有可复用基础

仓库里已经具备以下基础设施：

- 前端 `installId` 生成、持久化、订阅状态拉取、CDKEY 激活入口。
- 本地后端订阅接口：
  - `GET /api/v2/subscription/status`
  - `POST /api/v2/subscription/activate`
- 本地后端远端授权客户端：
  - `services/subscription_client.py`
- 本地后端 VIP 门禁服务：
  - `services/subscription_gate_service.py`
- 现成的订阅弹窗 / CDKEY 激活弹窗 / 订阅状态 UI。

### 2.2 当前门禁范围并不完整

当前门禁是“视频优先”的，主要覆盖：

- `server.py` 中 `/api/v2/proxy/image` 的部分视频工作流。
- `services/remote_proxy_route_service.py` 中 `/api/v2/runninghubwf/run`。
- `services/dreamina_route_service.py` 中 Dreamina 视频提交链路。

未形成统一门禁的链路包括：

- 文本生成：`/api/v2/proxy/completions`
- 大部分图片生成
- 音频生成
- Dreamina 图片生成

### 2.3 当前 `requester` 不会全局注入 `installId`

`api/requester.js` 目前只是一个通用 fetch 包装器：

- 不会自动加 `X-AIC-Install-Id`
- 也不会自动从 `window.__aicInstallId` 读值

这意味着：

- 哪个生成 API 没有自己加 `installId`，哪个链路就没有透传。
- 现在只有局部链路是完整的，不能假设“所有请求都天然带了 installId”。

### 2.4 当前前端订阅状态模型较窄

`modules/subscriptionAccess.js` 当前已经能兼容这些字段：

- `status` / `subscriptionStatus` / `state`
- `expiresAt` 及多种时间别名
- `entitledModelIds` / `entitled_model_ids` / `modelIds`
- `entitledModelKeys` / `entitled_model_keys` / `modelKeys`
- `contactText` / `contact_text`
- `contactUrl` / `contact_url`

但当前**还不理解**这些未来很关键的字段：

- `activationSource`
- `generationScope`
- `entitledNodeTypes`
- `entitledProviders`
- 任何“仅 CDKEY 激活才允许生成”的来源字段

---

## 3. 关键代码落点

### 3.1 前端订阅中心与状态

- `api/subscriptionApi.js`
- `modules/subscriptionAccess.js`
- `modules/app/appPanels.js`

职责：

- 生成和持久化 `installId`
- 拉取订阅状态
- 提交 CDKEY
- 弹出订阅激活弹窗

### 3.2 前端生成链路

- 文本：`api/aiTextApi.js`
- 图片：`api/aiImageApi.js`
- 音频：`api/aiAudioApi.js`
- 视频：`api/aiVideoApi.js`
- 即梦：`api/dreaminaGenApi.js`
- RunningHub 工作流：`api/runninghubWorkflowApi.js`
- RunningHub 任务取消：`api/runninghubTaskApi.js`
- 公共请求器：`api/requester.js`

### 3.3 后端授权与门禁

- 路由分发：`services/http_route_dispatcher.py`
- 远端授权客户端：`services/subscription_client.py`
- 门禁服务：`services/subscription_gate_service.py`
- RunningHub 路由服务：`services/remote_proxy_route_service.py`
- Dreamina 路由服务：`services/dreamina_route_service.py`
- 通用代理与部分历史路由：`server.py`

---

## 4. 透传链路审查矩阵

| 链路 | 前端入口 | 本地接口 | 当前 `installId` 透传 | 当前门禁 | 主要问题 |
| --- | --- | --- | --- | --- | --- |
| 文本生成 | `api/aiTextApi.js` | `/api/v2/proxy/completions` | 未发现 header/body/query 透传 | 无 | 无法按用户鉴权；若直接把 `installId` 放 body，会继续透传到上游 LLM 接口 |
| 图片生成（代理类） | `api/aiImageApi.js` | `/api/v2/proxy/image` | 未发现统一透传 | 仅当 `apiUrl` 命中视频 VIP workflow 时拦截 | 路由本身可做统一门禁，但现在只做视频；body 内部字段会继续发给第三方 |
| 图片生成（Dreamina） | `api/aiImageApi.js` / `api/dreaminaGenApi.js` | `/api/v2/dreamina/text2image`、`/image2image` | 未发现 `installId` | 无 | 图片链路未接入订阅控制 |
| 音频生成 | `api/aiAudioApi.js` | `/api/v2/proxy/image` | 未发现统一透传 | 无 | 音频走代理但没有订阅透传和错误联动 |
| 视频生成（通用） | `api/aiVideoApi.js` | 多个本地代理接口 | 已明确通过 `X-AIC-Install-Id` 透传 | 有 | 当前是最完整链路，但只覆盖视频相关调用 |
| 视频生成（Dreamina） | `api/dreaminaGenApi.js` | `/api/v2/dreamina/*video*` | 当前通过 body 传 `installId` | 有 | 本地可用，但未形成全局规范 |
| RunningHub 工作流 | `api/runninghubWorkflowApi.js` | `/api/v2/runninghubwf/run` | 未发现统一透传 | 仅 run 路由含视频 VIP 判断 | 内部字段未剥离；query/cancel 没必要门禁，但也应清理内部字段 |

补充说明：

- `api/requester.js` 不做全局 `installId` 注入。
- `api/aiTextApi.js`、`api/aiImageApi.js`、`api/aiAudioApi.js`、`api/runninghubWorkflowApi.js` 中均未发现统一订阅透传或 `SUBSCRIPTION_REQUIRED` 专项处理。
- `api/aiVideoApi.js` 明确会给本地接口增加 `X-AIC-Install-Id`。
- `api/dreaminaGenApi.js` 的视频提交体会带 `installId`，但 Dreamina 图片提交未见同样处理。

---

## 5. 这次方案最需要修掉的 6 个问题

### 5.1 `installId` 透传方式不统一

当前项目同时存在三种形式：

- header：`X-AIC-Install-Id`
- body：`installId`
- query：`installId`

问题不在于“形式多”，而在于“**哪些链路是发给本地服务，哪些链路最终会继续转发给第三方**”。

如果不区分这两类路由，直接在所有 body 里加 `installId`，会产生两个风险：

1. 上游第三方接口收到未知字段，导致参数校验失败。
2. 本应只在本地使用的授权上下文，被原样泄漏给第三方服务。

### 5.2 本地代理路由没有剥离内部控制字段

这是当前最关键的技术风险。

典型问题如下：

- `server.py` 的 `/api/v2/proxy/image` 只 `pop("apiUrl")`、`pop("apiKey")`，不会移除 `installId`。
- `server.py` 的 `/api/v2/proxy/completions` 也没有内部字段剥离逻辑。
- `services/remote_proxy_route_service.py` 的 `/api/v2/runninghubwf/run` 会把 payload 直接转发给 RunningHub。

所以：

- **以后任何新增的本地控制字段，都不能默认放在“会透传给第三方”的 body 里。**

### 5.3 门禁点分散，且仍偏“视频 VIP”

现在的门禁入口分布在：

- `server.py`
- `services/remote_proxy_route_service.py`
- `services/dreamina_route_service.py`

但这些门禁逻辑没有统一成“所有生成先授权，再转发”的形态。

结果是：

- 有些链路会被拦
- 有些链路完全绕过
- 同一个 `installId` 在不同能力上的鉴权行为不一致

### 5.4 订阅状态字段的可见性不足

当前 `modules/subscriptionAccess.js` 会把订阅 payload 归一化成一个偏简化的前端状态对象。

问题是：

- `activationSource`
- `generationScope`
- `entitledNodeTypes`
- `entitledProviders`

这些字段如果不进入前端状态层，后续 UI 无法展示，开发期也难排查。

### 5.5 错误码契约不统一

当前仓库里至少有两套命名：

- 生成门禁拒绝：`code`
- 订阅接口参数错误：`errorCode`

现状会导致：

- 前端不同模块要写不同兼容逻辑
- 文本 / 图片 / 音频链路即便后端返回了订阅错误，也可能只会当成普通失败 toast

### 5.6 现有 `isModelAllowed()` 不能直接拿来做“全生成门禁”

`modules/subscriptionAccess.js` 中现有 `isModelAllowed()` 本质上还是围绕视频 VIP 模型做判断。

它适合：

- 前端按钮态提示
- 前端二次校验

它不适合：

- 作为“所有生成请求的最终授权判定”

最终判定必须仍然在后端做。

---

## 6. 推荐的目标方案

### 6.1 总原则

1. `installId` 对本地后端的标准透传方式统一为 `X-AIC-Install-Id`。
2. 只有本地订阅中心接口允许继续使用 query/body 的 `installId`。
3. 所有生成请求都先到本地后端做授权，再决定是否转发给第三方。
4. 一切内部控制字段在转发给第三方前必须剥离。
5. 前端只负责“展示和引导”，后端才是唯一授权真相源。

### 6.2 两阶段实施

#### 阶段 A：先做“全生成门禁”

判定规则：

- `status == active`
- 如果业务要求“必须 CDKEY 激活才能生成”，再额外要求 `activationSource == cdkey`

阶段 A 不追求细粒度模型权限，只先把“谁有资格发起生成”收口。

#### 阶段 B：再做“能力范围门禁”

在阶段 A 稳定后，再逐步引入：

- `generationScope`
- `entitledModelIds`
- `entitledNodeTypes`
- `entitledProviders`

这样做的好处是：

- 第一版足够快落地
- 第二版不会推翻第一版

---

## 7. 建议采用的字段契约

## 7.1 本地请求透传

### 标准 header

```http
X-AIC-Install-Id: aic-xxxxx
```

适用范围：

- 所有发往本地 `/api/*` 的生成提交请求

### 仅保留兼容的 body/query

- `GET /api/v2/subscription/status?installId=...`
- `POST /api/v2/subscription/activate`

不建议继续把 `installId` 当作通用生成 body 字段长期使用。

## 7.2 远端授权状态响应

建议远端授权服务统一返回如下字段：

```json
{
  "success": true,
  "status": "active",
  "expiresAt": 1760000000,
  "activationSource": "cdkey",
  "generationScope": "all",
  "entitledModelIds": [
    "runninghub/2041741496667348994",
    "dreamina/video_vip"
  ],
  "entitledModelKeys": [
    "video_edit_v54"
  ],
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

迁移期兼容要求：

- 后端和前端同时接受 camelCase 与 snake_case。
- `modelIds` / `modelKeys` 作为旧字段继续兼容。

## 7.3 生成门禁拒绝响应

建议本地后端统一返回：

```json
{
  "success": false,
  "code": "SUBSCRIPTION_REQUIRED",
  "errorCode": "SUBSCRIPTION_REQUIRED",
  "message": "当前账号未开通生成权限",
  "subscriptionStatus": "none",
  "installId": "aic-xxxxx",
  "requiredModelId": "runninghub/2041741496667348994",
  "reasonCode": "NOT_ACTIVE",
  "activationSource": "",
  "generationScope": "none",
  "contactText": "联系管理员获取授权码",
  "contactUrl": ""
}
```

要求：

- `code` 保留给现有视频链路兼容。
- `errorCode` 同步返回，减少新链路分支判断。
- `requiredModelId` 在需要模型级限制时返回；做全生成门禁时可为空。

## 7.4 推荐新增 `reasonCode`

建议至少规范这些：

- `MISSING_INSTALL_ID`
- `SERVICE_UNAVAILABLE`
- `NOT_ACTIVE`
- `SUBSCRIPTION_EXPIRED`
- `ACTIVATION_SOURCE_INVALID`
- `GENERATION_SCOPE_DENIED`
- `SUBSCRIPTION_MODEL_NOT_ENTITLED`

---

## 8. 具体改造方案

## 8.1 前端：先统一 `installId` 传给本地后端

### 目标

让所有“发往本地 `/api/*` 的生成提交请求”都能带上 `X-AIC-Install-Id`。

### 推荐做法

1. 在生成提交前，统一先确保 `installId` 已存在。
2. `requester.js` 对本地 `/api/*` 请求自动附加 `X-AIC-Install-Id`。
3. 对首次提交前尚未有 `window.__aicInstallId` 的情况，在上层先 `await ensureInstallId()`。

### 推荐改动点

- `api/requester.js`
  - 增加“仅对本地 `/api/*` 请求自动附加 `X-AIC-Install-Id`”逻辑。
  - 只读取本地上下文，不要对绝对第三方 URL 注入 header。
- `api/aiTextApi.js`
  - 生成前确保已有 `installId`。
- `api/aiImageApi.js`
  - 生成前确保已有 `installId`。
- `api/aiAudioApi.js`
  - 生成前确保已有 `installId`。
- `api/aiVideoApi.js`
  - 保留现有视频链路逻辑，但逐步收敛为“本地接口统一走 header”。
- `api/runninghubWorkflowApi.js`
  - 调用 run 前确保已有 `installId`。

### 不建议的做法

- 不建议继续把 `installId` 直接塞入会被第三方消费的 JSON body。

## 8.2 后端：所有转发型路由先剥离内部字段

这是必须先做的一步。

### 必须新增的内部字段剥离逻辑

建议增加统一 helper，例如：

- `_strip_internal_control_fields(payload)`

第一版至少剥离：

- `installId`
- `requiredModelId`
- `subscriptionStatus`
- `reasonCode`
- `contactText`
- `contactUrl`

如果后面引入 `_aic` 或 `subscriptionContext`，也要一并剥离。

### 必改文件

- `server.py`
  - `/api/v2/proxy/completions`
  - `/api/v2/proxy/image`
- `services/remote_proxy_route_service.py`
  - `/api/v2/runninghubwf/run`
  - `/api/v2/runninghubwf/query`
  - `/api/v2/runninghubwf/cancel`

### 重点说明

- `query` / `cancel` 不需要再做提交门禁，但也应该剥离内部字段，避免脏数据继续转发给 RunningHub。

## 8.3 后端：把“视频门禁”扩展成“全生成门禁”

### 推荐方式

保留 `check_vip_subscription_gate()` 兼容旧逻辑，同时新增更通用的：

```python
check_generation_access(
    handler,
    payload=None,
    required_model_id="",
    provider="",
    node_type="",
    require_cdkey_source=False,
)
```

### 第一版判定逻辑

```text
allowed =
  subscription.status == active
  and (not require_cdkey_source or activationSource == "cdkey")
```

### 第二版再加

```text
and generationScope allows this node/provider
and required_model_id in entitledModelIds
```

### 推荐门禁落点

需要拦截：

- `server.py` 的 `/api/v2/proxy/completions`
- `server.py` 的 `/api/v2/proxy/image`
  - 仅在“提交生成任务”时拦截
  - 不在 query/result 类请求时拦截
- `services/remote_proxy_route_service.py` 的 `/api/v2/runninghubwf/run`
- `services/dreamina_route_service.py` 的：
  - `/api/v2/dreamina/text2image`
  - `/api/v2/dreamina/image2image`
  - `/api/v2/dreamina/text2video`
  - `/api/v2/dreamina/image2video`
  - `/api/v2/dreamina/frames2video`
  - `/api/v2/dreamina/multiframe2video`
  - `/api/v2/dreamina/multimodal2video`

不要拦截：

- `/api/v2/subscription/*`
- `/api/v2/proxy/upload`
- `/api/v2/proxy/task`
- `/api/v2/runninghubwf/query`
- `/api/v2/runninghubwf/cancel`
- `/api/v2/dreamina/query_result`
- 各种本地保存、下载、状态查询接口

## 8.4 前端：统一处理 `SUBSCRIPTION_REQUIRED`

当前视频链路已经有较完整的错误联动，但文本 / 图片 / 音频链路没有。

### 建议改法

优先做“中心化处理”，不要在每个 API 文件里重复造轮子。

推荐顺序：

1. 在通用错误解析层识别：
   - `code === "SUBSCRIPTION_REQUIRED"`
   - 或 `errorCode === "SUBSCRIPTION_REQUIRED"`
2. 组装出带这些字段的 Error：
   - `code`
   - `requiredModelId`
   - `reasonCode`
   - `contactText`
   - `contactUrl`
   - `message`
3. 在节点触发层统一调用 `window.handleSubscriptionRequired(...)`

### 最小可落地方案

如果暂时不改统一错误层，至少要补这些入口：

- `api/aiTextApi.js`
- `api/aiImageApi.js`
- `api/aiAudioApi.js`
- `api/runninghubWorkflowApi.js`

否则后端即使开始拦截，这几类节点也只会显示通用失败，不会打开订阅弹窗。

## 8.5 前端：扩展订阅状态字段，但不要把前端当成授权真相

### 必须补到前端状态里的字段

- `activationSource`
- `generationScope`
- `entitledModelIds`
- `entitledModelKeys`
- `contactText`
- `contactUrl`

### 文件落点

- `modules/subscriptionAccess.js`
  - 扩展 `createDefaultSubscriptionState()`
  - 扩展 `normalizeSubscriptionPayload()`

### 重要约束

- 前端这些字段只用于显示、按钮态和提示。
- 真正放行与否仍然由后端决定。

## 8.6 远端授权 / CDKEY 服务建议的数据模型

如果要支持“只有 CDKEY 激活用户可以生成”，远端服务至少要有这些概念：

- `installations`
  - `install_id`
  - `device_fingerprint`（可选）
  - `first_seen_at`
  - `last_seen_at`
- `cdkeys`
  - `code`
  - `plan_code`
  - `status`
  - `expires_at`
  - `max_activations`
  - `used_count`
- `subscription_bindings`
  - `install_id`
  - `status`
  - `activation_source`
  - `generation_scope`
  - `entitled_model_ids`
  - `entitled_node_types`
  - `expires_at`
- `activation_logs`
  - `install_id`
  - `cdkey`
  - `result`
  - `created_at`

### 推荐 `activationSource` 枚举

- `cdkey`
- `manual`
- `trial`
- `admin`

你要做“必须 CDKEY 才可生成”时，后端门禁只认：

```text
activationSource == "cdkey"
```

---

## 9. 文件级实施清单

| 文件 | 改造内容 | 优先级 |
| --- | --- | --- |
| `api/requester.js` | 仅对本地 `/api/*` 请求自动追加 `X-AIC-Install-Id` | P0 |
| `api/aiTextApi.js` | 生成前确保 `installId`；识别订阅拒绝错误 | P0 |
| `api/aiImageApi.js` | 生成前确保 `installId`；识别订阅拒绝错误 | P0 |
| `api/aiAudioApi.js` | 生成前确保 `installId`；识别订阅拒绝错误 | P0 |
| `api/runninghubWorkflowApi.js` | run 前确保 `installId`；识别订阅拒绝错误 | P0 |
| `api/aiVideoApi.js` | 收敛视频链路到统一透传规范 | P1 |
| `modules/subscriptionAccess.js` | 订阅字段归一化扩展：`activationSource`、`generationScope` 等 | P0 |
| `modules/app/appPanels.js` | 继续复用现有订阅弹窗；必要时展示更多状态信息 | P1 |
| `services/subscription_client.py` | 扩展远端状态字段读取与通用鉴权辅助 | P0 |
| `services/subscription_gate_service.py` | 新增通用 `check_generation_access()` | P0 |
| `server.py` | `/api/v2/proxy/completions`、`/api/v2/proxy/image` 加统一门禁与字段剥离 | P0 |
| `services/remote_proxy_route_service.py` | run/query/cancel 字段剥离；run 路由接统一门禁 | P0 |
| `services/dreamina_route_service.py` | 图片/视频提交统一接入生成门禁 | P0 |
| `services/http_route_dispatcher.py` | 保持订阅中心接口兼容；必要时补 `errorCode` 对齐 | P1 |

---

## 10. 推荐实施顺序

### 第 1 步：先做后端内部字段剥离

先改：

- `server.py`
- `services/remote_proxy_route_service.py`

原因：

- 这是最基础的安全/兼容底座。
- 不先做这一步，后面一旦把 `installId` 扩到全链路，第三方接口可能直接报参数错。

### 第 2 步：再补前端统一透传

改：

- `requester.js`
- 生成 API 入口

验收标准：

- 所有本地生成提交接口都能收到 `X-AIC-Install-Id`

### 第 3 步：把门禁从“视频 VIP”扩到“全生成”

改：

- `subscription_gate_service.py`
- `server.py`
- `remote_proxy_route_service.py`
- `dreamina_route_service.py`

建议先加开关：

- `AIC_ENFORCE_GENERATION_SUBSCRIPTION=1`
- `AIC_REQUIRE_CDKEY_SOURCE=1`

### 第 4 步：补文本 / 图片 / 音频的前端错误联动

验收标准：

- 未授权时，文本 / 图片 / 音频节点也能拉起与视频一致的订阅弹窗

### 第 5 步：最后再做字段展示增强

例如：

- 设置页显示“当前激活来源：CDKEY / 手动”
- 显示“生成权限范围”

这一步不是门禁成立的前置条件。

---

## 11. 验收清单

### 11.1 透传验收

- 文本生成请求到达本地服务时，能读到 `X-AIC-Install-Id`
- 图片生成请求到达本地服务时，能读到 `X-AIC-Install-Id`
- 音频生成请求到达本地服务时，能读到 `X-AIC-Install-Id`
- 视频生成请求到达本地服务时，能读到 `X-AIC-Install-Id`

### 11.2 字段剥离验收

- `/api/v2/proxy/completions` 转发给第三方时，请求体中不再包含 `installId`
- `/api/v2/proxy/image` 转发给第三方时，请求体中不再包含 `installId`
- `/api/v2/runninghubwf/run` 转发给 RunningHub 时，请求体中不再包含内部控制字段

### 11.3 门禁验收

- 未激活用户提交文本节点时被本地后端拦截
- 未激活用户提交图片节点时被本地后端拦截
- 未激活用户提交音频节点时被本地后端拦截
- 未激活用户提交视频节点时被本地后端拦截
- 已激活且 `activationSource == cdkey` 的用户可正常提交
- 已激活但 `activationSource != cdkey` 的用户，在启用 CDKEY 限制时被拦截

### 11.4 前端联动验收

- 文本 / 图片 / 音频 / 视频被拒绝时，都能展示统一订阅弹窗
- 弹窗里能继续复用当前 `contactText` / `contactUrl`
- 激活成功后，前端会刷新订阅状态并允许再次提交

### 11.5 兼容性验收

- 旧订阅状态 payload 只返回 `modelIds` / `contact_text` 时，前端仍能正常显示
- 旧视频链路不因为新字段扩展而退化
- `query` / `cancel` / `save_output` 类接口不被错误拦截

---

## 12. 这套方案里最重要的架构决策

### 决策 1：`installId` 的标准透传介质是 header，不是 body

原因：

- header 不会污染第三方 JSON 协议
- 现有服务端已经支持从 header 提取
- 便于统一中间层处理

### 决策 2：所有生成授权都以本地后端为准

原因：

- 前端可被绕过
- 当前已有本地代理层，正适合做统一门禁

### 决策 3：先做“全生成是否允许”，后做“细粒度模型权限”

原因：

- 第一版更快落地
- 第二版能复用第一版字段和门禁骨架

### 决策 4：前端保留兼容归一化，后端维持权威判定

原因：

- 便于平滑接入新的远端授权服务
- 避免一次性改动过多 UI 和状态层

---

## 13. 最终建议

如果按专业团队的做法落地，这个需求不应该从“把订阅 UI 改复杂”开始，而应该按下面顺序推进：

1. 统一 `installId` 透传规范。
2. 清理本地代理对内部字段的透传污染。
3. 在本地后端建立统一生成门禁。
4. 扩展远端授权字段，但保持前后端兼容。
5. 最后再补显示层。

一句话概括：

- **先把授权链路做成后端统一真相源，再让前端去展示这个真相。**

