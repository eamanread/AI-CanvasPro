# 文本/图片节点模型注册表重构开发文档

## 1. 文档目的

本文档用于指导 `AI-CanvasPro` 首期模型体系重构的完整落地开发。目标不是继续在现有 `provider/channel` 菜单逻辑上打补丁，而是为 **文本节点** 与 **图片节点** 建立一套新的、按节点类型管理的全局模型注册表，并通过统一适配层完成请求构建、可用性测试、节点引用和失效处理。

本文档只覆盖本次明确纳入范围的内容：

- 文本节点
- 图片节点
- 全局模型注册表
- 设置页模型管理
- 模型测试与状态持久化
- 旧文本/图片节点失效处理

本文档明确不覆盖本次首期范围外的链路：

- `seedance`
- `runninghub`
- `dreamina`
- 工作流模型
- 视频/音频节点的生成链路
- 其他定制节点的旧逻辑改造

这些链路保留在“其他/定制节点”体系中，不参与本次重构。

---

## 2. 已确认需求

### 2.1 产品目标

系统从“按渠道/provider 组织模型”的方式，重构为“按节点类型维护模型列表”的方式。

用户在前台不再感知 `provider/channel`，只感知“模型”。

### 2.2 模型配置方式

每个模型条目，前台只暴露四要素：

- `modelName`
- `modelID`
- `apiKey`
- `baseUrl`

说明：

- UI 层仅允许用户编辑这四个字段。
- 系统内部允许存在隐藏字段，不展示给用户。

### 2.3 节点类型划分

模型按节点类型分组管理：

- 文本
- 图片
- 视频
- 音频
- 其他/定制

本次首期主要优化：

- 文本节点
- 图片节点

### 2.4 默认模型

初始化时提供默认模型条目：

- 文本：`gemini-3.1`
- 图片：`NanoBanana-2`
- 视频：`seedance-2.0`
- 音频：`minimax`

默认条目要求：

- 至少存在 `modelName`
- 带推荐模板提示
- 不保证真实可用
- 推荐模板采用“提示型模板”，不是直接写入完整生产配置

### 2.5 模型显示与生成规则

模型列表显示规则：

- 只要有 `modelName`，就在对应节点下拉中显示
- 节点下拉中只显示 `modelName`
- 不显示状态标签

生成规则：

- 若模型缺少必要配置，不允许生成
- 生成前统一拦截
- 拦截方式仅为 `toast`：`该模型未配置`

### 2.6 模型测试规则

设置页允许测试模型可用性。

测试要求：

- 必须发送“最小真实请求”
- 不能只做静态校验
- 测试结果需要持久化

状态分层：

- `unconfigured`
- `unverified`
- `available`
- `failed`
- `deleted`

### 2.7 节点默认选择规则

新建节点时默认选中该节点类型模型列表中的 **第一个模型**。

### 2.8 唯一性规则

同一节点类型下：

- `modelName` 必须唯一

不同节点类型之间：

- 允许同名

### 2.9 旧项目兼容策略

旧配置处理：

- 原有 provider 配置在文本/图片场景下直接废弃

旧项目节点处理：

- 旧文本节点与旧图片节点：全部视为失效，要求重新选模型
- 旧视频/音频/其他节点：本次不调整，维持原有行为

### 2.10 其他节点处理

文本/图片/视频/音频之外的模型，统一归入：

- `其他/定制节点`

这些节点允许继续走必要的定制化适配逻辑。

---

## 3. 当前代码现状与问题

### 3.1 当前配置结构

当前配置通过 `/api/config` 持久化，后端入口在：

- `services/config_route_service.py`

前端配置访问在：

- `api/configApi.js`

当前主结构是：

- `providers`

它本质上是按渠道管理，而不是按节点类型管理。

### 3.2 当前文本/图片请求构建方式

文本请求构建在：

- `api/aiTextApi.js`

图片请求构建在：

- `api/aiImageApi.js`

这两条链路当前的核心特点：

- 先通过 `provider` 判定路由
- 再进入不同 adapter 分支
- 节点菜单与配置结构强耦合

### 3.3 当前节点菜单方式

文本与图片节点菜单目前仍是静态 provider 菜单，典型位置：

- `components/aigenText/uiModule.js`
- `components/aigenImage/uiModule.impl.js`

当前问题：

- UI 层强绑定 provider
- 模型可见性和配置可用性没有统一抽象
- 想做“只显示模型、不显示渠道”时，会牵一发动全身

### 3.4 当前已有的可复用雏形

文本节点里已经存在一套“自定义文本模型”的历史逻辑，但它是文本专用的局部方案，不适合作为统一架构继续扩张。

因此：

- 可以借鉴交互思路
- 不应继续沿用其存储和业务结构

---

## 4. 目标架构

## 4.1 总体原则

本次重构遵循以下原则：

1. 前台去 provider 化，后台保留适配器分层
2. 模型配置中心化，不在节点菜单里拼接业务规则
3. 节点只引用模型，不直接引用渠道
4. 文本/图片首期先走通用 OpenAI-compatible 轨道
5. 特殊链路继续保留在“其他/定制节点”体系

### 4.2 架构分层

建议拆成 5 层：

1. 配置持久化层
2. 模型注册表服务层
3. 适配器解析层
4. 模型测试与状态层
5. 节点/设置页表现层

### 4.3 关键链路

新的运行路径应为：

1. 节点保存 `selectedModelId`
2. 运行时通过 `ModelRegistryService` 取模型定义
3. 通过 `AdapterResolver` 选中适配器
4. 由对应 adapter 生成请求
5. 统一执行与错误处理

而不是：

1. 节点存 `provider + model`
2. 再到 API 层猜路由

---

## 5. 数据结构设计

## 5.1 新的配置主结构

建议在现有配置文件中新增：

```json
{
  "modelRegistry": {
    "text": [],
    "image": [],
    "video": [],
    "audio": [],
    "other": []
  }
}
```

### 5.2 单条模型记录结构

```json
{
  "id": "mdl_text_0001",
  "nodeType": "text",
  "modelName": "gemini-3.1",
  "modelId": "",
  "apiKey": "",
  "baseUrl": "",
  "adapterType": "openai_compatible",
  "status": "unconfigured",
  "lastTestedAt": null,
  "lastError": "",
  "lastTestResult": null,
  "templateHints": {
    "modelId": "gemini-3.1",
    "baseUrl": "https://example.com/v1/chat/completions"
  }
}
```

### 5.3 字段说明

前台可编辑字段：

- `modelName`
- `modelId`
- `apiKey`
- `baseUrl`

内部隐藏字段：

- `id`
- `nodeType`
- `adapterType`
- `status`
- `lastTestedAt`
- `lastError`
- `lastTestResult`
- `templateHints`

### 5.4 baseUrl 定义

首期必须强制约定：

- `baseUrl` 表示完整请求入口 URL

例如：

- 文本模型：完整 `/chat/completions` 地址
- 图片模型：完整图片生成接口地址

不建议首期把 `baseUrl` 定义成“厂商根域名”。

原因：

- 当前图片链路差异很大
- 只靠根域名无法稳定推导最终接口
- 会把四要素方案重新变回 provider 推断方案

### 5.5 默认模型生成策略

首次初始化时注入默认模型：

```json
{
  "text": [
    {
      "modelName": "gemini-3.1",
      "modelId": "",
      "apiKey": "",
      "baseUrl": "",
      "templateHints": {
        "modelId": "gemini-3.1",
        "baseUrl": "https://example.com/v1/chat/completions"
      }
    }
  ]
}
```

要求：

- `templateHints` 只做推荐
- 不自动视为可用配置
- 只有真实四要素补齐后，状态才允许转入 `unverified`

---

## 6. 节点数据结构设计

## 6.1 新节点字段

文本/图片节点新增：

```json
{
  "selectedModelId": "mdl_text_0001",
  "selectedModelNameSnapshot": "gemini-3.1",
  "modelDeleted": false
}
```

### 6.2 字段职责

- `selectedModelId`
  节点真实引用键

- `selectedModelNameSnapshot`
  用于模型被删后展示历史名称

- `modelDeleted`
  打开旧项目或模型被删除后，用于触发失效态

### 6.3 旧字段策略

首期建议保留旧字段作为兼容影子字段：

- `provider`
- `model`

但要求：

- 新链路不再以它们为权威来源
- 只在过渡期用于降风险

### 6.4 失效态规则

如果节点的 `selectedModelId` 无法在 registry 中解析：

- 节点显示：`模型已删除，请重新选择`
- 不自动回退
- 不自动迁移到第一个模型

---

## 7. 适配器设计

## 7.1 首期适配器范围

首期新增两类通用适配器：

- `GenericTextModelAdapter`
- `GenericImageModelAdapter`

要求：

- 仅处理 OpenAI-compatible 通用模型
- 仅服务文本/图片节点

### 7.2 adapterType 规则

首期默认内部使用：

- `openai_compatible`

未来可扩展：

- `gemini_native`
- `runninghub_custom`
- `dreamina_web`
- `workflow_custom`

但本次不暴露给用户。

### 7.3 AdapterResolver 规则

解析顺序建议如下：

1. 根据 `selectedModelId` 找到模型记录
2. 读取 `adapterType`
3. 选择 adapter
4. 若无匹配 adapter，则返回“模型不支持”

### 7.4 与旧链路的关系

首期要求：

- 文本/图片节点优先走 registry + adapter
- 视频/音频/其他节点保持旧 provider 逻辑

即：

- 新体系增量接入
- 不一次性全量切断旧体系

---

## 8. 模型测试与状态设计

## 8.1 状态定义

- `unconfigured`
  四要素未补齐

- `unverified`
  四要素已补齐，但未测试

- `available`
  最小真实请求测试成功

- `failed`
  最小真实请求测试失败

- `deleted`
  模型已被删除，仅旧节点会引用到此状态

## 8.2 状态切换规则

### 创建模型

- 只有 `modelName`
- 状态为 `unconfigured`

### 补齐四要素

- 若 `modelName / modelId / apiKey / baseUrl` 全有值
- 自动转为 `unverified`

### 测试通过

- 状态转为 `available`
- 记录 `lastTestedAt`
- 清空 `lastError`

### 测试失败

- 状态转为 `failed`
- 记录 `lastTestedAt`
- 写入 `lastError`

### 删除模型

- 从 registry 删除
- 历史节点在运行时表现为 `modelDeleted`

## 8.3 测试策略

### 文本模型

发送最小真实请求：

- 小提示词
- 极低返回规模
- 验证接口真实可用

### 图片模型

发送最小成本、最小尺寸、固定提示词的真实生成请求。

说明：

- 必须明确提示“可能消耗额度”
- 测试按钮不应自动批量触发

## 8.4 状态展示位置

状态只在设置页显示，不在节点下拉中显示。

设置页建议展示：

- 当前状态
- 最近测试时间
- 最近错误原因

节点下拉要求保持简洁：

- 仅显示 `modelName`

---

## 9. 设置页设计

## 9.1 页面分组

设置页改为 5 组：

- 文本模型
- 图片模型
- 视频模型
- 音频模型
- 其他/定制模型

### 9.2 模型列表项交互

每个模型条目支持：

- 编辑四要素
- 测试
- 上移
- 下移
- 删除

### 9.3 新增模型

新增时要求：

- 必填 `modelName`
- 同 nodeType 下名称唯一
- 初始状态为 `unconfigured`

### 9.4 推荐模板展示

推荐模板不要自动写入真实字段，可采用以下方式之一：

- placeholder
- helper text
- 一键填入推荐模板按钮

首期建议：

- 使用 placeholder + “填入推荐模板”按钮

### 9.5 文本/图片节点的默认模型顺序

节点新建时默认选列表第一个模型，因此设置页中的排序就是默认优先级。

---

## 10. 节点行为设计

## 10.1 文本/图片节点

模型下拉只显示模型名称。

生成前执行统一校验：

1. 未找到模型
   - 节点显示“模型已删除，请重新选择”
   - 阻断生成

2. 模型未配置
   - 只弹 `toast: 该模型未配置`
   - 阻断生成

3. 模型存在且四要素齐全
   - 允许发起请求

### 10.2 节点默认值

新建节点时：

- 自动选中该 nodeType 下第一个模型

### 10.3 不做的事

本次明确不做：

- 节点下拉显示状态标签
- 节点内直接编辑模型配置
- 自动回退到其他模型

---

## 11. 旧数据处理策略

## 11.1 旧配置

旧 `providers` 配置不再作为文本/图片的运行时来源。

但为降低回滚成本，建议在配置文件内自动备份：

```json
{
  "deprecatedProvidersBackup": {
    "...": "..."
  }
}
```

说明：

- 仅备份
- 运行时不再使用

## 11.2 旧文本/图片节点

旧项目打开时：

- 若节点没有 `selectedModelId`
- 或旧 `provider/model` 无法映射到新模型

则统一标记：

- `modelDeleted = true`

并展示：

- `模型已删除，请重新选择`

## 11.3 旧视频/音频/其他节点

本次不改，保持原逻辑。

---

## 12. 四个批次实施方案

## 批次 1：配置结构与模型注册表落地

### 12.1 目标

建立新的 `modelRegistry` 配置结构、默认模型注入逻辑和统一的注册表访问服务。

### 12.2 涉及文件

- `services/config_route_service.py`
- `api/configApi.js`
- 新增 `modules/modelRegistryService.js`

### 12.3 主要改动

1. 后端配置读写支持 `modelRegistry`
2. 首次配置缺失时自动注入 4 个默认模型
3. 增加旧 `providers` 备份逻辑
4. 前端新增 registry 访问 API：
   - `getModelRegistry`
   - `saveModelRegistry`
   - `findModelById`
   - `getModelsByNodeType`
   - `createDefaultRegistry`
   - `normalizeRegistry`

### 12.4 验收标准

- 新配置结构可读写
- 刷新后数据不丢失
- 默认模型只初始化一次
- 同 nodeType 下模型名唯一校验有效

### 12.5 风险

- 直接覆盖旧配置可能导致回滚困难

### 12.6 风险控制

- 保存前自动备份旧 `providers`
- registry 规范化函数必须幂等

---

## 批次 2：设置页模型管理与测试状态持久化

### 12.7 目标

完成设置页的按节点类型模型管理，以及测试按钮、状态持久化。

### 12.8 涉及文件

- `index.html`
- `modules/app/appTopbarAndConfig.js`
- 新增 `modules/modelValidationService.js`
- 新增通用 UI 组件或辅助模块

### 12.9 主要改动

1. 将原 provider 卡片替换为节点类型分组面板
2. 每条模型支持：
   - 新增
   - 编辑
   - 删除
   - 排序
   - 测试
3. 测试结果回写到 registry
4. 设置页展示状态、最近测试时间、最近错误

### 12.10 测试设计

文本最小测试：

- 最小提示词
- 最小 token

图片最小测试：

- 最低分辨率
- 最短 prompt
- 明确额度提醒

### 12.11 验收标准

- 设置页可管理模型列表
- 测试后状态刷新正确
- 关闭页面后状态不丢失
- 缺少四要素时不允许执行测试

### 12.12 风险

- 图片真实测试可能有费用
- baseUrl 填错时错误信息不稳定

### 12.13 风险控制

- 测试按钮前给出明确提示
- 保留最近错误原文

---

## 批次 3：文本节点接入新模型体系

### 12.14 目标

文本节点彻底改为按 `selectedModelId` 运行，不再面向用户展示 provider。

### 12.15 涉及文件

- `components/aigenText/uiModule.js`
- `components/aigenText/taskOrchestrationModule.js`
- `api/aiTextApi.js`
- 新增 `api/adapters/GenericTextModelAdapter.js`
- 新增 `modules/adapterResolver.js`

### 12.16 主要改动

1. 文本下拉只显示 `modelName`
2. 新建节点默认选中第一个文本模型
3. 节点保存 `selectedModelId`
4. 生成前统一校验：
   - 找不到模型 -> 节点失效态
   - 未配置 -> toast
5. 文本请求改为通过 adapter 生成

### 12.17 兼容策略

文本节点首期保留旧 `provider/model` 影子字段，但只用于过渡，不作为真实来源。

### 12.18 验收标准

- 文本节点不再显示 provider
- 默认模型选择正确
- 未配置时只弹 toast
- 删除模型后旧节点显示“模型已删除，请重新选择”

### 12.19 风险

- 当前文本节点含旧自定义模型逻辑，容易造成双轨并存

### 12.20 风险控制

- 旧自定义文本模型逻辑统一并入 registry
- 不允许新旧两套来源同时写入

---

## 批次 4：图片节点接入新模型体系

### 12.21 目标

图片节点改为按 `selectedModelId` 运行，并移除面向用户的 provider 概念。

### 12.22 涉及文件

- `components/aigenImage/uiModule.impl.js`
- `api/aiImageApi.js`
- 新增 `api/adapters/GenericImageModelAdapter.js`
- 复用 `modules/adapterResolver.js`

### 12.23 主要改动

1. 图片节点下拉只显示 `modelName`
2. 默认选中第一个图片模型
3. 生成前统一校验
4. 图片请求通过 `GenericImageModelAdapter` 构建
5. 图片旧节点统一转为失效态

### 12.24 重要限制

本批次不改：

- `seedance`
- `runninghub`
- `dreamina`
- workflow 模型

这些继续走旧链路或归类到其他/定制。

### 12.25 验收标准

- 图片节点 UI 去 provider 化
- 未配置只弹 toast
- 旧图片节点显示“模型已删除，请重新选择”
- 首期通用中转站模型可通过四要素跑通

### 12.26 风险

- 现有图片节点 UI 是大段静态菜单，强耦合严重

### 12.27 风险控制

- 先抽共享模型选择数据源
- 不继续在静态 provider submenu 上打补丁

---

## 13. 文件级改造清单

### 13.1 必改文件

- `services/config_route_service.py`
- `api/configApi.js`
- `index.html`
- `modules/app/appTopbarAndConfig.js`
- `api/aiTextApi.js`
- `api/aiImageApi.js`
- `components/aigenText/uiModule.js`
- `components/aigenText/taskOrchestrationModule.js`
- `components/aigenImage/uiModule.impl.js`

### 13.2 建议新增文件

- `modules/modelRegistryService.js`
- `modules/modelValidationService.js`
- `modules/adapterResolver.js`
- `api/adapters/GenericTextModelAdapter.js`
- `api/adapters/GenericImageModelAdapter.js`

### 13.3 明确不动文件

- `api/adapters/RunningHubAdapter.js`
- `api/dreamina*`
- 视频节点相关模块
- 音频节点相关模块

---

## 14. 测试与验收矩阵

## 14.1 配置层

- 新安装/空配置时自动生成默认模型
- 新增模型后刷新仍存在
- 删除模型后刷新仍删除
- 同 nodeType 下重名被拦截

## 14.2 设置页

- 可新增/编辑/删除/排序模型
- 文本测试通过后状态变为 `available`
- 图片测试失败后状态变为 `failed`
- 状态与最近测试时间可持久化

## 14.3 文本节点

- 新建节点默认选中第一个文本模型
- 下拉仅显示 `modelName`
- 未配置模型点击生成只弹 toast
- 删除模型后旧节点提示重选

## 14.4 图片节点

- 新建节点默认选中第一个图片模型
- 下拉仅显示 `modelName`
- 未配置模型点击生成只弹 toast
- 删除模型后旧节点提示重选

## 14.5 非本次范围回归

- 视频节点原逻辑不受影响
- 音频节点原逻辑不受影响
- runninghub/seedance 旧链路不受影响

---

## 15. 风险总表

### 风险 1：baseUrl 定义不清

后果：

- 文本/图片请求构造混乱
- 会重新滑回 provider 推断模式

控制：

- 首期强制 `baseUrl = 完整请求入口`

### 风险 2：旧配置覆盖不可回滚

后果：

- 调整失败后难以恢复

控制：

- 自动生成 `deprecatedProvidersBackup`

### 风险 3：节点引用不稳定

后果：

- 重命名或排序后节点失联

控制：

- 节点必须引用隐藏主键 `id`

### 风险 4：文本自定义模型旧逻辑与新 registry 冲突

后果：

- 出现双写、双源

控制：

- 统一并入 `modelRegistry`

### 风险 5：图片真实测试有费用

后果：

- 用户误触造成成本

控制：

- 测试前提示
- 使用最低成本请求

---

## 16. 建议实施顺序

建议严格按以下顺序推进：

1. 批次 1：配置结构与 registry
2. 批次 2：设置页与测试持久化
3. 批次 3：文本节点切换
4. 批次 4：图片节点切换

不建议顺序：

- 先改图片节点菜单
- 再补配置层

原因：

- 当前问题根因在配置与适配层，不在菜单外观

---

## 17. 结论

本次重构的本质不是“把 provider 隐藏掉”，而是：

- 用全局模型注册表替代文本/图片场景下的 provider 配置
- 用 `selectedModelId` 替代节点级 `provider + model`
- 用通用 adapter 替代首期可抽象的文本/图片 provider 分支

首期只做文本与图片，保持范围稳定，才能在不破坏 `seedance/runninghub/dreamina` 旧链路的前提下，真正完成“前台去 provider 化、后台保留适配器”的架构升级。
