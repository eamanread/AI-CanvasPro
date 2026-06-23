# 画布空间坐标系统 开发文档(Development Doc)

- 版本:v1.0(S0 已落地,S1-S5 施工图)
- 日期:2026-06-12
- 上游设计:`2026-06-12-canvas-spatial-system-design.md`(v1.1,经实码审查)
- 性质:**实施级文档**——文件级改动清单、函数签名、测试文件、验收门,可直接派工

---

## 0. 当前基线(S0 已完成,commit `438a5380`)

| 修复 | 文件 | 证据 |
|---|---|---|
| `placement` 字段登记进服务端动作白名单(策略枚举 + anchor/zone/lane/topic 安全子字段,未知策略/坐标 fail-closed 丢弃) | `services/claw_action_schema.py#_safe_placement` | `claw_action_schema_test.py` 20/20(存活 + 丢弃两用例钉住) |
| 执行器未知动作类型可见警告(不再静默吞) | `modules/assistant/assistantActionExecutor.js` 分发链末尾 | executor 套件 31/31 |
| 上下文剥除节点原始 x/y/position(止血"陷阱 1",在脱敏副本上删除以保留循环引用语义) | `modules/assistant/assistantContextBuilder.js#takeSanitizedNodes` | contextBuilder 17/17 |

**S0 之后的事实**:placement 可以从 PI 后端安全抵达执行器(执行器当前忽略它——S2 接管);agent 已收不到任何原始坐标(aggregate 的 layoutHints.bounds 保留,属摘要级)。

**遗留决定**:`tidy_canvas` 动作类型**未**预登记进 schema——与其实现(S4)同 PR 登记,避免"已验证但被执行器丢弃"的窗口期;窗口期内误发将触发 S0 的未知动作警告,可观测。

## 1. 总架构(回顾,细节见设计文档)

```
graphStore(像素真相)
   │ 投影(纯函数,S1)
   ▼
canvas-spatial/v1 摘要 ──▶ PI 上下文(环境一行常驻 / 全量按关键词透镜,S3)
                              │ 语义 placement 指令(词汇表常驻 system prompt,S3)
                              ▼
                  放置解析器(S2,executor 内)──▶ 像素写回 graphStore
                              ▲
                  tidy_canvas 四 pass(S4)
```

不变量(实施完成后登记 CONTRACTS.md):空间真相唯一(投影无副本)/像素永不经过

LLM(双向)/放置必有血统/解析失败降级 staging 永不叠放/pinned 节点不可被 agent 与 tidy 移动。

## 2. S1 — 空间投影 `canvasSpatialProjection.js`

**新文件**:`modules/assistant/canvasSpatialProjection.js`(+ `.test.js`)

```js
export const CANVAS_SPATIAL_SCHEMA_VERSION = "canvas-spatial/v1";
export const GRID = Object.freeze({ cellWidth: 416, cellHeight: 316, gap: 96, originX: 120, originY: 120 });
// cellWidth/Height = DEFAULT_NODE_SIZE(320×220) + gap(96)

export function projectCanvasSpatial(graphStore, options = {}) -> CanvasSpatialV1
export function cellOf(node) -> { row, col, key }            // 像素 -> 格,按节点实际 width/height 计算跨格
export function zoneOf(node, projection) -> string            // 类型磁性 + 区域带判定
export function buildAmbientDigest(projection) -> string      // 环境一行(≤40 tok)
```

**实现要点**
- 区域带:按画布占用包络分带——`dock-left`(最左列带)、`production`(中部)、`results`(最右带)、`staging`(底部带);空画布时用 GRID.origin 起始的默认带;
- 泳道:`production` 内 行=镜头(沿用 `applyStoryboardGridLayout` 既成方向:行=shotIndex,列=阶段 script→keyframe→video);非分镜节点按边连通簇归带;
- 复用 `boundsForNodes/graphSelectionBounds/graphCanvasBounds`(executor 已有,提取到共享模块或复制为纯函数);
- 降级:节点 >30 时输出区级统计 + 泳道首尾 + freeCursor + 选中/提及 top-K(与 `semanticCompression` 同管线对接,不另起炉灶);
- 幂等与零副本:函数不写任何状态。

**测试**(golden + 性质):
- golden:用真实 `executeAssistantActions` 铺一张导演画布(复用 directorBrain golden 信封),投影断言 zones/lanes/cells/freeCursor;
- 性质:幂等(两次投影 deepEqual);任何输入不抛(空画布/无边/巨幅);序列化无 x/y 泄漏;≤800 token 估算断言(JSON 长度阈值)。

**验收门**:golden + 性质全绿;投影对 80+ 节点画布 <5ms(性能断言可选)。

## 3. S2 — 放置解析器(executor 内)

**改动文件**:`modules/assistant/assistantActionExecutor.js`

```js
function resolvePlacement(action, graphStore, projection, createdIndex) -> { x, y, reason, warning? }
```

- 入口:`create_node` 分支内,在 `action.position || fallbackCreatePosition(...)` 之前:
  1. `action.placement` 存在 → 解析器(忽略 `action.position` 与一切像素输入);
  2. 无 placement → 类型磁性默认(知识卡→dock-left 追加;有 `feeds-into` 目标(connect_nodes 同批可推导)→ 锚点下方;其余→该 zone freeCursor);
  3. 全部失败 → staging freeCursor + warning(`placement degraded to staging: <reason>`);
- 策略实现:`below/above/left-of/right-of/near`(锚点格相邻,占用则螺旋找最近空格)、`in-zone`(zone freeCursor)、`new-lane/append-lane`(泳道末行/行尾);
- 写血统:`node.data.placementReason = reason`(如 `"below qmai-shot-shot-002 (lane-1, r2c2)"`);
- `move_nodes` 同步支持 `placement`(语义移动),并在移动后给节点打 `data.pinned` 仅当来源是用户(S4 处理,此处不打);
- **碰撞规则**:目标格已有节点中心 → 视为占用;解析结果绝不与既有节点重叠(lint 断言)。

**测试**(executor 套件扩展):五种策略各一用例;anchor 缺失降级 staging+warning;无 placement 的磁性默认;placementReason 写入;重叠=0 性质断言(铺 20 节点混合策略后全画布两两不相交)。

**验收门**:executor 全套件绿;`fallbackCreatePosition` 仅剩 staging 兜底调用或删除。

## 4. S3 — 感知注入与词汇表

**改动文件**
1. `modules/assistant/assistantContextBuilder.js`:
   - `canvas.spatialDigest = buildAmbientDigest(projection)`(常驻,~40 tok);
   - `canvas.spatial = projectCanvasSpatial(...)`(**仅当** `options.includeSpatial === true`);
2. 透镜(调用侧):`modules/app/appAssistantPanel.js` 发送消息处——空间关键词正则(`位置|放|挪|移|对齐|整理|排|旁边|空位|区|泳道|布局`)命中 → buildContext 时传 `includeSpatial: true`;
3. `integrations/pi_canvas_agent/src/huanyingTools.js#buildCanvasAgentSystemPrompt`(222-278 行):追加 ~15 行放置词汇表段(八种策略 + zone/lane/cell 概念 + "你永远不输出像素坐标;不确定时省略 placement,由系统按规则放置")。

**测试**:contextBuilder——默认无 `canvas.spatial` 但有 `spatialDigest`;`includeSpatial` 时含完整投影且无 x/y;panel——含空间关键词的消息触发 includeSpatial(捕获 buildContext 参数);huanyingTools——system prompt 含词汇表(快照断言关键句)。

**验收门**:无空间词的对话上下文增量 ≤ 60 tok(digest);全量注入仅在命中时发生。

## 5. S4 — `tidy_canvas` 与 pinned 主权

**前置任务(必须先做)**:定位用户拖动写回 graphStore 的路径。`DragController.js` 为混淆代码——两条路线:(a) 逆向其 drag-end 对 `node.x/y` 的赋值点并包一层钩子;(b) 若不可行,在 graphStore 层加 `markUserMoved(nodeId)`(由渲染层 pointerup 调用),写 `data.pinned = true`。路线 (b) 优先(不碰混淆代码)。

**实现**
- schema:`claw_action_schema.py` 登记动作类型 `tidy_canvas`(字段:`scope`,枚举 `all|zone:<id>|lane:<id>|cluster:<nodeId>`)——与实现同 PR;
- executor:`tidy_canvas` 分支 → 四 pass(归区→排序→装格→对齐规整),只动 scope 内且非 pinned 节点;返回 `movedNodeIds`/`skippedPinnedIds`;
- 布局 lint 工具函数 `assertCanvasTidy(graphStore)`(重叠=0/同列 x 方差=0/gutter 统一)进测试公库。

**测试**:幂等(连跑两次 movedNodeIds 第二次为空);pinned 不动;scope 限界;lint 全绿;含用户手拖节点的混合画布场景。

**验收门**:executor + schema 套件绿;UI"一键整理"按钮(执行抽屉)接同一 action。

## 6. S5 — 导演道吃狗粮

**改动文件**:`modules/directorBrain/directorCanvasActions.js`
- `mapStoryboardToCanvasActions`:shot 节点 `placement: { strategy: "append-lane", lane: "lane-shot-<n>" }`(或显式 new-lane);prep 节点 `placement: { strategy: "right-of", anchor: "qmai-shot-<id>" }`(沿用既成方向:行=镜头,列=阶段);知识卡 `in-zone dock-left`;
- 移除对 `layout_nodes storyboard_grid` 的依赖(或保留为 tidy 等价物);
- golden 更新:真实执行器铺出的导演画布过 `assertCanvasTidy`。

**验收门**:directorBrain 全套件(55+)改造后绿;`directorBrainService.real.test.js` 全真链下 lint 绿。

## 7. 实施顺序与工作量

| 切片 | 依赖 | 估量 |
|---|---|---|
| ~~S0~~ | — | ✅ 已完成(438a5380) |
| S1 投影 | S0 | 1 天 |
| S2 解析器 | S1 | 1 天 |
| S3 感知+词汇 | S1 | 0.5 天 |
| S4 tidy+pinned | S1,前置钩子探查 | 1-1.5 天(钩子探查风险项) |
| S5 导演道 | S2 | 0.5 天 |

完成 S1-S3 即可发布第一阶段(agent 能感知、能语义放置);S4/S5 为第二阶段。

## 8. 风险与回滚

- **DragController 混淆**(S4 唯一高风险):**实施结论(2026-06-12)**——实查 `src/core/stores/graphStore.js` 与 DragController 均为混淆单行文件,按预案采用降级路线:pinned 通过既有 `update_node_data` 动作设置 `data.pinned=true`(用户菜单/agent 皆可钉住),执行器的语义移动与 tidy 全量尊重 pinned(测试钉住);自动“拖动即钉住”留待源码可得时补;
- **回滚**:placement 为可选字段、spatial 注入有开关、tidy 是新增动作——每个切片独立可关,S0 的三处修复无行为依赖方,安全;
- **性能**:投影按需计算(digest 每轮、全量仅透镜命中),80 节点以内毫秒级;
- **契约纪律**:S1 完成后在 `modules/directorBrain/CONTRACTS.md` 登记 `canvas-spatial/v1` 行与五条不变量;golden 规矩同既有(由真实执行器产物生成,禁止手写)。
