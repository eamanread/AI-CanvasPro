# LLM Wiki 接入 Claw Code 助手方案

更新时间：2026-05-23

参考资料：

- <https://github.com/nashsu/llm_wiki/blob/main/README_CN.md>

## 1. 结论

LLM Wiki 应接入 **Claw Code 助手能力层**，不直接放进幻映画布 API。

推荐定位：

```text
LLM Wiki = 项目知识源 / 研究引擎
Claw Code = 推理、调度、把知识变成画布意图
幻映后端 = 受控桥接、鉴权、脱敏、限流、安全边界
幻映画布 action = 唯一的画布执行层
```

第一期只做只读桥接：状态检查、项目列表、知识搜索、读取页面/文件摘要、读取图谱摘要。暂不写入 LLM Wiki，暂不把对话自动保存到 LLM Wiki，暂不触发付费生成，暂不改变现有画布 API 行为。

## 2. 为什么不放进画布 API

画布 API 的职责应该保持窄而稳定：创建节点、更新节点、连线、聚焦、移动、布局、写注释、撤销等。

LLM Wiki 的职责是知识检索、来源追溯、图谱、资料维护、Deep Research、知识空白发现。它不是画布动作本身，而是 Claw 做判断时可调用的知识工具。

如果把 LLM Wiki 直接塞进画布 API，会导致三类问题：

| 问题 | 影响 |
|---|---|
| 职责混乱 | 画布层既要管节点，又要管知识库搜索和资料摄入 |
| 安全边界变脏 | Claw 可能绕过幻映动作校验直接影响画布或知识库 |
| 后续难维护 | LLM Wiki API 变化会污染画布核心代码 |

正确边界是：Claw 查询知识，幻映校验并执行画布动作。

## 3. LLM Wiki 可用能力摘要

基于 README_CN.md，LLM Wiki 提供：

| 能力 | 对幻映的价值 |
|---|---|
| 多格式文档摄入 | 品牌手册、产品资料、剧本、课程资料可变成项目知识 |
| 自动 Wiki 生成 | 把杂乱资料变成结构化知识页面 |
| 来源引用 | 生成 prompt/分镜/建议时可以带出处 |
| 混合检索 | Claw 可以按语义和关键词查询项目资料 |
| 知识图谱 | 可导入为概念节点和关系连线 |
| 知识空白检测 | 可生成研究任务、待补资料节点 |
| Deep Research | 可作为研究节点的后台资料来源 |
| 本地 HTTP API | 幻映后端可以作为受控代理接入 |

README 里记录的本地 API 形态：

| API | 用途 |
|---|---|
| `GET /api/v1/health` | 健康检查 |
| `GET /api/v1/projects` | 项目列表 |
| `GET /api/v1/projects/{id}/files` | 项目文件列表 |
| `GET /api/v1/projects/{id}/files/content` | 文件内容 |
| `POST /api/v1/projects/{id}/search` | 混合搜索 |
| `GET /api/v1/projects/{id}/graph` | 知识图谱 |
| `POST /api/v1/projects/{id}/sources/rescan` | 重新扫描源资料 |

README 中的 API 服务默认是本地访问、Token 鉴权，示例地址为 `http://127.0.0.1:19828`。

## 4. 产品使用方式

用户不需要直接理解 LLM Wiki API。接入后的使用方式仍然是打开 Claw Code 助手，用自然语言发起任务。

示例：

| 用户说法 | Claw 背后动作 | 画布结果 |
|---|---|---|
| “根据当前知识库生成 5 个广告 prompt” | 搜索品牌/产品资料 | 创建 5 个 prompt 节点 |
| “用品牌规范检查当前画布” | 搜索品牌规范，结合当前 canvas context | 聚焦问题节点，创建 comment |
| “把知识库核心概念导入画布” | 读取 graph 或搜索概念 | 创建概念节点和关系连线 |
| “这个方案缺哪些资料？” | 调用知识空白/搜索结果判断 | 创建研究任务节点 |
| “把这组分镜保存到知识库” | 二期写入能力，必须确认 | 写入 LLM Wiki 项目 |

## 5. 对话上下文边界

普通 Claw 助手对话不自动写入 LLM Wiki。

边界规则：

| 数据 | 默认位置 | 是否进入 LLM Wiki |
|---|---|---|
| 用户和 Claw 的普通聊天 | Claw/幻映会话上下文 | 否 |
| 当前画布摘要 | 请求时临时传给 Claw | 否 |
| LLM Wiki 搜索结果 | 请求时临时返回给 Claw | 否 |
| 用户明确归档的结论 | LLM Wiki 项目 | 是，必须确认 |
| 画布选中内容保存为资料 | LLM Wiki 项目 | 是，必须确认 |

一句话原则：对话是过程，知识库是沉淀结果。

## 6. 子资料库来源和维护

建议把 LLM Wiki project 映射为幻映里的“子资料库”。

```text
幻映项目 / 客户 / 品牌
  绑定
LLM Wiki project / 子资料库
```

资料来源：

| 来源 | 维护方式 |
|---|---|
| PDF、DOCX、PPTX、Excel、Markdown 等文档 | 用户或团队导入 LLM Wiki |
| 本地资料文件夹 | LLM Wiki 扫描和增量更新 |
| 网页剪藏 | LLM Wiki Chrome 扩展保存 |
| Deep Research | LLM Wiki 自动研究并生成资料 |
| 幻映画布沉淀 | 二期能力，用户确认后写回 |

幻映只负责绑定、展示状态、让 Claw 查询和把结果落画布。资料摄入、索引、Wiki 生成、图谱维护仍由 LLM Wiki 自己负责。

## 7. 总体架构

推荐架构：

```text
前端 Claw 助手面板
  -> /api/v2/assistant/chat
    -> ClawBridgeService
      -> LLM Wiki 工具协议说明
      -> Claw Code runtime
        -> 幻映后端受控知识桥接
          -> LLM Wiki 本地 API
      -> 返回 reply/actions/wikiCitations
  -> 幻映 action validate
  -> graphStore executor 落画布
```

第一期不让 Claw runtime 直接裸连 `127.0.0.1:19828`。推荐由幻映后端提供受控代理：

```text
/api/v2/assistant/wiki/status
/api/v2/assistant/wiki/projects
/api/v2/assistant/wiki/search
/api/v2/assistant/wiki/file-content
/api/v2/assistant/wiki/graph
```

这样可以统一处理：

- LLM Wiki API token 不暴露给 Claw。
- 只允许访问本机白名单地址。
- 请求/响应脱敏。
- 限制返回长度。
- 统一错误格式。
- 未来写入能力可加确认和审计。

## 8. 配置模型

建议新增独立配置，不混入模型 provider：

```json
{
  "integrations": {
    "llm_wiki": {
      "enabled": true,
      "apiBaseUrl": "http://127.0.0.1:19828",
      "apiToken": "local-token",
      "defaultProjectId": "",
      "requestTimeoutSec": 20,
      "maxSearchResults": 8,
      "maxContentChars": 6000
    }
  }
}
```

安全要求：

- `apiToken` 只在幻映后端保存。
- 前端状态接口只返回 `apiTokenPresent=true/false`。
- 默认只允许 loopback 地址：`127.0.0.1`、`localhost`。
- 第一阶段不允许写入接口。

## 9. 第一阶段：只读桥接

目标：让 Claw 能安全查询 LLM Wiki，但不改变画布行为。

范围：

| 模块 | 工作 |
|---|---|
| 后端 service | 新增 `LlmWikiBridgeService` |
| 后端 route | 新增 `/api/v2/assistant/wiki/*` |
| config | 新增 LLM Wiki 配置读写和脱敏状态 |
| Claw prompt | 告诉 Claw 当前有只读知识工具 |
| tests | 后端 service/route/config 单测 |
| docs | 更新实现 handoff |

不做：

- 不写入 LLM Wiki。
- 不把聊天记录保存到 LLM Wiki。
- 不自动导入本地文件。
- 不新增画布 action。
- 不触发 Deep Research。
- 不启动或重启 LLM Wiki 服务。

验收标准：

- 状态接口能返回 LLM Wiki 是否配置、是否可用。
- 搜索接口能把请求转给 LLM Wiki 并返回脱敏、限长结果。
- 读取文件内容接口能限长、脱敏。
- Claw prompt 中能看到“可用知识工具”的能力说明。
- 没配置 LLM Wiki 时，Claw 助手正常工作，不报错。

## 10. 第二阶段：知识结果落画布

目标：把搜索结果、引用、概念转成低风险画布节点。

依赖：

- `create_comment` 或 `annotate_node`
- 更完善的 action 执行结果日志
- 最好有 undo/history

可做能力：

| 能力 | 需要 action |
|---|---|
| 搜索结果变 comment | `create_comment` |
| 资料摘要变 source-text | `create_node` |
| 知识引用附到 prompt 节点 | `update_node_data` 或 comment |
| 知识图谱变概念节点 | `create_node` + `connect_nodes` |
| 知识空白变研究任务 | `create_node` |

验收标准：

- 用户说“把知识库里和这个主题相关的资料放到画布上”，画布出现资料摘要节点。
- 节点内容包含来源标题/项目/文件 id，不包含敏感 token 和本地路径。
- 低风险动作仍走后端 action validate。

## 11. 第三阶段：写回和团队知识沉淀

目标：让画布成果可被用户确认后写回 LLM Wiki。

必须强确认的操作：

- 保存当前分镜方案到知识库。
- 保存客户反馈总结到知识库。
- 保存 prompt 模板到知识库。
- 触发资料重新扫描。
- 触发 Deep Research。

写回原则：

- 默认不写。
- 写入前显示预览。
- 团队共享资料库需要记录来源、作者、时间。
- 不保存完整聊天记录，只保存用户确认的沉淀内容。

## 12. 和现有 Claw Wow Roadmap 的关系

LLM Wiki 接入不替代 `CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`，而是给它增加知识底座。

优先结合点：

| Wow Roadmap 能力 | LLM Wiki 加成 |
|---|---|
| Prompt 手术台 | 用品牌资料和历史方案优化 prompt |
| 画布医生 | 从结构诊断升级为知识/规范诊断 |
| 一句话生成工作流 | 用资料生成更贴近项目的节点默认值 |
| 分镜导演 | 从剧本/产品资料生成有来源的分镜 |
| 变体宇宙 | 基于知识库卖点生成创意分支 |
| 工作流炼金术 | 把优秀画布成果沉淀为团队知识 |

建议并行策略：

1. LLM Wiki 第一阶段只读桥接可独立做，不阻塞画布 action 扩展。
2. 画布医生开始做 `create_comment` 后，再接 LLM Wiki 结果落画布。
3. undo/history 完成后，再做大批量知识图谱导入。

## 13. 风险和防线

| 风险 | 防线 |
|---|---|
| LLM Wiki 未启动 | 状态接口返回 unavailable，Claw 正常降级 |
| API token 暴露 | 只保存在后端，前端只显示是否已配置 |
| 返回内容过长 | 后端统一截断并提示 |
| 本地路径泄露 | 后端脱敏 Windows/macOS/Linux 绝对路径 |
| 聊天误入知识库 | 默认禁止写入，写入必须确认 |
| Claw 幻觉引用 | 搜索结果和引用 id 由后端返回，Claw 不伪造 |
| 大量导入污染画布 | 第一阶段不落画布，第二阶段限制数量并要求 undo |
| 和现有开发互相影响 | 独立 service/route/config/doc，避免改画布核心 API |

## 14. 推荐首个开发切片

名称：LLM Wiki Claw Assistant Readonly Bridge Slice

目标：

- 新增 LLM Wiki 只读受控桥接。
- 让 Claw 助手知道当前是否有知识库，以及如何请求知识。
- 不改变画布执行行为。

最小交付：

1. `services/llm_wiki_bridge_service.py`
2. `llm_wiki_bridge_service_test.py`
3. `services/claw_assistant_route_service.py` 增加 `/wiki/status`、`/wiki/search` 分发
4. `claw_assistant_route_service_test.py` 增加 wiki route 覆盖
5. `services/claw_bridge_service.py` prompt protocol 增加只读知识工具说明
6. `docs/LLM_WIKI_CLAW_ASSISTANT_IMPLEMENTATION_HANDOFF.md` 追加实现记录

建议验收口径：

- 没配置 LLM Wiki 时，状态为 `disabled` 或 `unconfigured`。
- 配置后，后端可以构造正确 Authorization 请求。
- 搜索结果被统一成 `{title, snippet, source, score, fileId}` 这类安全摘要。
- 返回不会包含 token、绝对路径、data/blob URL。
- 现有 assistant 测试继续通过。
