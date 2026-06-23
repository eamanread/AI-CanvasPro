# 画布空间坐标系统(Canvas Spatial System)功能设计文档

- 版本:v1.1(设计定稿,经四维实码审查修订,未实施)
- 日期:2026-06-12
- 范围:Huanying 画布(L3 编译层 / L5 执行治理 / L6 画布真相)+ PI agent 上下文(L1/L4)
- 关联契约文档:`modules/directorBrain/CONTRACTS.md`

> **v1.1 实码审查要点**(详见 §13):① `placement` 字段会被服务端动作白名单
> (`services/claw_action_schema.py#_sanitize_action`)静默剥除,实施必须先登记——这是
> 唯一的硬阻塞点;② 现状 contextBuilder **正在把原始 x/y 发给 LLM**(陷阱 1 已在发生),
> S3 必须先止血;③ 现有 storyboard 网格方向为"行=镜头、列=生产阶段",本设计 v1.1 已
> 改为沿用该方向(原 v1 的转置方向作废)。

---

## 1. 背景与问题

通过 PI agent 生成的节点目前存在四个未决问题:

1. **不知道放哪**:执行器 `fallbackCreatePosition` 按创建顺序撒点,与内容结构无关;
2. **不知道怎么排整齐**:除分镜节点的一次性 `storyboard_grid` 外,没有任何整理能力;
3. **agent 看不见画布**:PI 不知道画布上有什么、在什么位置,无法响应"放在 XX 旁边"类请求;
4. **没有"美观且符合逻辑"的定义**:美观靠运气,逻辑靠巧合。

## 2. 目标与非目标

**目标**
- PI agent 能感知画布空间状态(有什么、在哪、哪里空着);
- 新节点的位置由确定性规则决定,默认无需任何人(包括 LLM)操心;
- 用户可用自然语言表达空间意图("放右边"/"新开一条泳道"),agent 能翻译执行;
- 一键整理,结果幂等、美观可测试;
- 用户手动布局拥有绝对主权。

**非目标**
- 不做自由画布的通用图布局算法(力导向等)——本系统面向生产工作流画布;
- 不让 LLM 阅读或产出像素坐标(见 §3 三陷阱);
- 不为空间状态建立独立存储(画布即真相)。

## 3. 第一性原理

**双表示 + 感知-指令同词汇。** 像素坐标只属于渲染器;agent 活在离散语义空间(区/泳道/格/关系)里,感知用这套词汇,下指令也用同一套词汇,中间由确定性代码翻译。

**必须避开的三个陷阱**(本文档全部设计都由此推出):

| 陷阱 | 后果 | 本方案的对策 |
|---|---|---|
| 把原始 x/y 喂给 LLM | token 爆炸、LLM 算术不可靠、坐标无语义 | 感知是语义摘要,按需注入(§6) |
| 让 LLM 输出 x/y | 叠放、越界、幻觉坐标 | 解析器忽略一切 LLM 像素输出(§7 铁律1) |
| 空间状态另存一份 | 与 graphStore 漂移 | 投影纯函数,从 graphStore 现算(§5) |

这与本项目已两次验证的家训同族:"骨架持有血统,LLM 只写创作字段"(导演管线)、"判决持有安全"(连续性闸门)。本系统是第三次应用:**空间由代码持有,LLM 只表达意图。**

## 4. 空间本体(Ontology)

### 4.1 格(cell)
- 连续坐标量子化:格子尺寸 = `DEFAULT_NODE_SIZE`(实测 **320×220**,executor 第 5 行)+ 统一 gutter(实测 fallback gap = **96**)→ 格基准 **416×316**,实施时常量化;注意现有 `applyStoryboardGridLayout` 用的是 rowGap=280 / columnGap=380,实施时统一到一组常量;
- 每个节点归属一个 `(row, col)`,对 agent 的表示为 `"r1c3"`;
- 节点像素中心吸附格子中心(tidy 时执行,自由拖动不强制);
- 全部节点类型共用 DEFAULT_NODE_SIZE(实码确认无 per-type 尺寸),`action.size` 可覆盖——格子算法须按实际 width/height 计算跨格。

### 4.2 区(zone)
| zone id | 内容 | 磁性节点类型 |
|---|---|---|
| `dock-left` | 知识坞:导演知识卡、风格圣经、资产卡 | comment(knowledge_card)、source-* 参考类 |
| `production` | 生产主区,内部分泳道 | storyboard-script、ai-image、ai-video、ai-text |
| `results` | 成片/审片区 | 已完成生成的结果节点、对比组 |
| `staging` | 暂存区:无法解析的放置请求的降级落点 | 任何(孤儿) |

**类型磁性**:每种 nodeType 有默认归属区;未带 placement 的节点按磁性落区。

### 4.3 泳道(lane)

**v1.1 修订:沿用现有网格方向(行=镜头,列=生产阶段)。** 实码审查发现
`applyStoryboardGridLayout` 已在生产中采用:行 = `shotIndex`(每镜头一行),列 = 工作流
阶段(shot_script→列1,shot_keyframe→列2,shot_video→列3)。v1 设计的转置方向
(镜头为列)作废,避免破坏既有用户习惯。

- `production` 区内**每镜头一条横向泳道(lane = 镜头行)**,按 `shotNumber` 升序自上而下;
- 行内从左到右是该镜头的**生产流水线**:剧本/分镜 → 关键帧图 → 视频(`feeds-into` 边即流向);
- 场(scene)表现为镜头行的分组带(组间更大行距 + 分组标签),而非独立轴;
- **阅读顺序 = 生产顺序**:纵向是叙事序(镜头 1→N),横向是工艺序(文字→图→片)——与全画布
  总流向(左素材 → 中生产 → 右结果)同构。这是"美观且符合逻辑"的本体定义:美是结构的可读投影,不是装饰。

### 4.4 簇与关系
- 簇:边连通分量 + 邻近度聚类,给 agent 摘要用("分镜链 4 节点,锚点 shot-001");
- 关系词汇(感知与指令共用,全集仅七个):
  `in-zone / left-of / right-of / above / below / near / feeds-into`

## 5. 读侧契约:`canvas-spatial/v1`(感知)

**纯函数投影**:`projectCanvasSpatial(graphStore) → 摘要`。无副本、无缓存态、幂等;graphStore 是唯一事实源。

```json
{
  "schemaVersion": "canvas-spatial/v1",
  "viewport": { "rows": 4, "cols": 8 },
  "zones": [{
    "id": "production",
    "lanes": [{
      "id": "lane-1", "topic": "场1",
      "cells": [
        { "cell": "r1c1", "node": "qmai-shot-shot-001", "type": "storyboard-script" },
        { "cell": "r1c4", "free": true }
      ]
    }]
  }],
  "clusters": [{ "members": 4, "anchor": "qmai-shot-shot-001", "label": "分镜链" }],
  "freeCursor": { "production": "r1c4", "staging": "r3c1" },
  "pinned": ["node-user-moved-1"],
  "stats": { "nodes": 12, "overlaps": 0, "orphans": 1 }
}
```

**Token 纪律**:
- 摘要硬上限 ~800 tokens;
- 节点 > ~30 时降级:区级统计 + 每泳道首尾节点 + 空闲游标 + 与当前对话相关的 top-K 节点(相关性来自 mention/选中态,复用 `assistantMentionContext`);
- 永不输出全量坐标表。**感知是摘要,不是 dump。**

**v1.1 实码对接**:
- contextBuilder 已有同思想的机制 `canvas.semanticCompression`(>80 节点或 >120 边时降级为
  selectedNodes + boundaryNodes + highSignalNodes + workflowSummaries)——空间投影**对接并扩展**这条
  既有降级管线,不另起炉灶;`buildCanvasLayoutHints` 已有 `asset_lane`/`problem_lane`/`storyboard_grid`
  等策略名(有名无实),词汇表与其对齐复用。
- **止血项(实施第一刀)**:现状 `buildAssistantCanvasContext` 把完整节点对象(含原始 x/y,上限 80 个)
  经 `redactValue` 直接发给 agent——**陷阱 1 正在发生**。S3 必须在投影上线的同时从上下文剥除原始
  x/y/position 字段。

## 6. 分级决策协议(信息何时给 agent)

> 核心答案:位置**默认不传**也不需要 LLM 决策;按需分四级。

| 级 | 占比 | 场景 | agent 得到什么 | 成本 |
|---|---|---|---|---|
| L0 | ~90% | 普通生成请求,无空间语言 | **什么都不给**;action 不带 placement,解析器按磁性+关系兜底 | 0 |
| L1 | ~9% | 用户话中有空间意图("放右边") | 常驻**词汇表**(system prompt ~15 行);agent 只做意图→词汇的**翻译**,不需要画布现状 | 一次 ~100 tok |
| L2 | ~1% | 真空间推理("哪里有空?"/"整理一下") | 按需注入完整 `canvas-spatial/v1` 摘要;**关键词透镜触发**(位置/放/挪/对齐/整理/旁边/空位/排…) | 偶发 ~800 tok |
| L3 | 0% | — | **像素坐标,永不**(不进上下文、不出 action) | — |

**两个常驻的便宜信息**(每轮都给):
1. **环境一行**(~40 tok):`画布: 12 节点 | 泳道2(场1满,场2有空) | 暂存1孤儿` ——基本方位感,支持 agent 主动提议;
2. **身份寻址**:引用已有节点靠名字/ID/选中态(已有 `assistantMentionContext`),绝不靠坐标;另增 `rememberPlacementReference`(复用队列控制的 recent-reference 模式)支持"放它旁边"的跨轮指代。

## 7. 写侧契约:placement 语义指令

v2 `create_node` / `move_nodes` 增加可选 `placement` 字段(向后兼容):

```json
{ "placement": { "strategy": "below",       "anchor": "qmai-shot-shot-002" } }
{ "placement": { "strategy": "in-zone",     "zone": "results" } }
{ "placement": { "strategy": "new-lane",    "topic": "场3" } }
{ "placement": { "strategy": "append-lane", "lane": "lane-1" } }
{ "placement": { "strategy": "near",        "anchor": "node-x" } }
```

**放置解析器**(执行器内,替换 `fallbackCreatePosition`)三条铁律:

1. **忽略 LLM 给的一切 x/y**(与 matchedSkills 服务端强校验同族);
2. **解析失败永不叠放**:anchor 不存在/目标格满 → 降级落 `staging` + 结果 warnings 记录原因;画布任何时刻重叠数为 0;
3. **放置必有血统**:`data.placementReason = "below qmai-shot-shot-002 (lane-1, r2c2)"`,使"为什么在这"可回答,与 flowId 血统在回放工作台汇合。

**结果回流闭环**:解析器的降级/调整必须写回 v2 响应 warnings,agent 下一句话如实陈述("已放入暂存区,因为目标格被占")。禁止"嘴上放好了,画布在别处"的说做漂移。

**v1.1 关键发现——字段必经的四个咽喉点**(不登记则 placement 静默消失):

| 咽喉点 | 现状行为 | 实施动作 |
|---|---|---|
| `services/claw_action_schema.py#_sanitize_action` | **~60 字段硬白名单,placement 会被静默剥除**(唯一硬阻塞) | 白名单登记 `placement`(嵌套对象,参照 metadata 处理);`tidy_canvas` 动作类型同样需登记 |
| `assistantProtocol.js#normalizeAssistantActions` | 纯透传(只过滤非对象),不剥字段 | 无需改动,加契约测试钉住 |
| `assistantActionExecutor.js` create_node | 不剥字段但**静默忽略** placement(组装 node 时只取固定字段) | 插入放置解析器于 create_node 之前 |
| 执行器动作分发 | **未知 action 类型静默丢弃**(无警告) | `tidy_canvas` 需显式注册;并给未知类型加 warning(顺手修的工程卫生) |

## 8. 整理引擎:`tidy_canvas`

四个确定性 pass,顺序执行,**幂等**(重跑收敛同一布局):

1. **归区**:按类型磁性 + 关系判定 zone/lane(prep 跟随其 feeds-into 的镜头);
2. **排序**:泳道内按 shotNumber/创建序;泳道间按场次;
3. **装格**:吸附格心,消灭重叠与半格错位;
4. **对齐规整**:同列左对齐、同行顶对齐、gutter 统一、泳道间距统一。

幂等性带来两个免费产品:UI 的**"一键整理"按钮**与 agent 可用的 **`tidy_canvas {scope}` action**(scope = 全画布/某泳道/某簇)。

**美观可测试(布局 lint)**:重叠数=0、同列 x 方差=0、gutter 方差=0、孤儿必在 staging。美不是评审意见,是 CI 红绿。

## 9. 决策权矩阵与不变量

| 决策 | 归属 |
|---|---|
| "放哪个区、挨着谁"(语义意图) | PI agent(仅在用户表达空间意图时翻译) |
| 具体像素坐标 | 放置解析器(确定性) |
| 最终位置 | **用户,绝对主权** |

**用户主权机制**:用户手动拖动过的节点打 `pinned` 标记;tidy 默认绕开 pinned;agent 永远不能移动 pinned 节点(测试钉住);仅用户显式"全部重排"可解除。

**新增不变量(实施时登记 CONTRACTS.md)**:
1. 空间真相唯一:`canvas-spatial/v1` 永远从 graphStore 投影,无副本;
2. 像素坐标永不经过 LLM;
3. 放置必有血统(placementReason);
4. 解析失败降级 staging,永不叠放、永不丢弃;
5. pinned 节点对 agent 与 tidy 不可移动。

## 10. 实施切片(TDD,均为纯函数优先)

| 切片 | 内容 | 验收 |
|---|---|---|
| **S0 ✅ 已完成(commit 438a5380)** | 咽喉点登记:`claw_action_schema.py` 白名单加 `placement`(`tidy_canvas` 改为与 S4 实现同 PR 登记);执行器未知动作加 warning;contextBuilder 剥除原始 x/y(止血陷阱 1) | ✅ 契约测试:placement 穿越 validate 存活(20/20);上下文无 x/y(17/17);未知动作警告(31/31)。开发文档见 `2026-06-12-canvas-spatial-development.md` |
| S1 | `canvasSpatialProjection.js` 投影纯函数(对接 semanticCompression 管线) | golden 快照:对真实执行器铺出的画布投影,zone/lane/cell 断言正确;幂等断言 |
| S2 | 放置解析器接进 `assistantActionExecutor` create_node 之前,替换 fallback | 语义指令→正确格;anchor 缺失→staging+warning;布局 lint 重叠=0 |
| S3 | 环境一行 + 关键词透镜(contextBuilder)+ 词汇表(`huanyingTools.js#buildCanvasAgentSystemPrompt`,实码定位的注入点) | 上下文含摘要且 ≤800 tok;无空间词时 0 注入 |
| S4 | `tidy_canvas` 四 pass + pinned 主权 + lint。**前置任务**:定位/建立节点拖动写回 graphStore 的钩子(实码确认现无 move 事件,DragController 混淆需先逆向其 drag-end 写回路径),pinned 标记挂上去 | 幂等(跑两次结果相同);lint 全绿;pinned 不动 |
| S5 | `directorCanvasActions` 改用 placement(导演道吃狗粮) | 既有 directorBrain 测试改造后全绿;分镜泳道布局 golden |

建议顺序:**S0(半天,不做则后面全部白做)**→ S1+S2(立刻治乱撒点)→ S3(agent 第一次"看见"画布)→ S4 → S5。
`data.placementReason` / `data.pinned` 的持久化已实码确认可行(node.data 任意字段可存取);单画布模型已确认(无多画布冲突)。

## 11. 哇塞路线(实施后解锁)

1. **空间问答对称性**:感知与指令同词汇,"画布右边还有地方吗?"→"results 区 r1c2 起有 6 个空格"免费获得;
2. **tidy 预览波**:整理前虚影+箭头预览,确认后动画归位;
3. **"为什么在这"**:右键节点显示 placementReason + 血统链,空间血统与 flowId 血统在回放工作台汇合;
4. **布局即语言**:"第三场单独一条泳道,成片靠右"——整段排版可以被"说"出来;
5. **与导演规格单合流**:Final_Video_Spec 的画幅变更触发泳道重排传播(横屏→竖屏改版波)。

## 12. 附:与现有代码的锚点

| 现有物(实码核对值) | 本系统中的角色 |
|---|---|
| `assistantActionExecutor.fallbackCreatePosition`(连续偏移:锚=选区/画布 bounds,gap=96,非网格) | 被放置解析器替换 |
| `applyStoryboardGridLayout`(rowGap=280/columnGap=380;行=shotIndex,列=阶段 script/keyframe/video) | 泳道方向的既成事实(§4.3 v1.1 沿用);并入 tidy pass 3/4 |
| `DEFAULT_NODE_SIZE` = 320×220(全类型共用,action.size 可覆盖) | 格子尺寸推导基准(416×316) |
| `assistantContextBuilder`(LIMITS.nodes=80;`semanticCompression` 既有降级管线;**现状泄漏原始 x/y**) | 环境一行 + 透镜注入点;S0 止血点 |
| `huanyingTools.js#buildCanvasAgentSystemPrompt`(integrations/pi_canvas_agent,222-278 行) | 词汇表常驻注入点(与 contextBuilder 是分离的两条路) |
| `buildCanvasLayoutHints`(已有 asset_lane/problem_lane/storyboard_grid 策略名,无实现) | 词汇表与策略名对齐复用 |
| `services/claw_action_schema.py#_sanitize_action`(~60 字段硬白名单) | **placement/tidy_canvas 必须在此登记(S0,硬阻塞)** |
| `assistantProtocol.js#normalizeAssistantActions`(纯透传) | 无需改;契约测试钉住 |
| `assistantMentionContext` / 选中态(id/label/selection 已流向 agent) | 身份寻址来源 |
| 队列控制 `rememberQueueControlReference` 模式 | `rememberPlacementReference` 同款实现 |
| `graphSelectionBounds` / `graphCanvasBounds`(min/max 矩形) | 投影函数的视口推导 |
| 节点几何(x/y/width/height 直接在 node 上;node.data 任意字段可持久化) | placementReason/pinned 落点已确认可行 |
| v2 契约(intent/plan/actionsByStep) | placement 字段的宿主,向后兼容 |
| CONTRACTS.md | 实施时登记 canvas-spatial/v1 与五条新不变量 |

## 13. v1.1 实码审查记录(2026-06-12)

四维并行审查(执行器与动作 / 协议净化链 / 上下文与提示词 / graphStore 几何),22 项判定:
12 verified、8 correction、2 blocker。已全部回写本文档。三个改变设计的发现:

1. **服务端动作白名单是唯一硬阻塞**:`_sanitize_action` 静默剥除未登记字段——v1 设计的
   placement 若直接实施会"发了等于没发"且无任何报错。新增 S0 切片。
2. **陷阱 1 正在发生**:contextBuilder 现状把含原始 x/y 的完整节点对象发给 agent(≤80 个)。
   设计原则与现状相反,S0/S3 止血。
3. **网格方向既成事实**:现有 storyboard 网格为"行=镜头,列=生产阶段",v1 的转置方向作废,
   v1.1 沿用现有方向并重新诠释"阅读顺序=生产顺序"(纵向叙事序 × 横向工艺序)。

次要确认:未知 action 静默丢弃(tidy_canvas 需注册+加 warning);无 pinned 机制、无节点移动
事件钩子(S4 前置任务,DragController 混淆需逆向 drag-end 路径);semanticCompression /
layoutHints 可复用;node.data 任意字段持久化可行;单画布模型无冲突。

---

一句话:**给 agent 一双看语义的眼睛和一套说语义的嘴,把像素永远留给代码。** 沉默时规则补位,开口时词汇翻译,问路时才掏地图,像素永远不出机房。
