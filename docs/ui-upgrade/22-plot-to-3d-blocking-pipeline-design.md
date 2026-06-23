# 剧情 → 3D 导演台 → 位置变化自动截全景站位图 · 系统设计

> 多智能体工作流(4 探针摸现状 + 3 架构师出方案 + 1 评审,真源码核实)综合而成,2026-06-15。本文是"如果团队有背景很厉害的人,他会怎么设计"的落地答案。

---

## 0. 一句话方案
在**文本管线**(剧情→分镜)与 **3D 导演台**之间插一层**空间真值层 (STL)**,守一条铁律:**LLM 只产语义枚举(谁站左/前景/朝哪/什么景别),绝不产浮点坐标;坐标交给确定性编译器(纯函数,复用已验证几何原语)算;位置变化用结构化指纹哈希判定;截图走 app 内原生链路逐机位串行。** 准确性靠"枚举→确定性编译"可单测/可回滚保证,自动化只发生在已验证的确定性环节,语义→坐标之间留一道人审闸。

评审定论:**用"完整准确版"的数据模型与边界纪律,按"MVP版"的范围与交付节奏落地**——两者不是对手,是同一条路的远期版与近期版。

---

## 1. 现状(真源码核实,决定方案怎么接)

**现有剧情管线**(全在 `integrations/vimax/brain/`,5 段):
`develop_story(idea)` → `write_script`(按"同时间+同地点=一场"LLM 分场) → `extract_characters`(全篇共享角色表) → `plan_scene`=`design_storyboard`(出 shot brief)+`decompose_visual_description`(拆 ff/lf/motion + 可见角色 idx) → `assemble_shotplan` 出 `vimax-shotplan/v1`。

- **零侵入挂接点**:`planner.py:278` 已 `emit('scene',{sceneIdx,script,shots})` —— 故事侧不用改一行,挂这个钩子即可。
- **最大空白**:**全程没有任何量化空间信息**。shot 只有 `camIdx`(机位复用 id)+ 自然语言 `ffDesc/visualDesc/motionDesc`;**没有** 角色坐标、朝向、姿态、景别枚举(WS/MS/CU)、角色↔站位绑定。`characters[]` 有 idx 但 shot 级无角色位置绑定。
- **截图链已验证可用**(关键利好):`captureWithAspectToCanvas`(autoload:843,就是底栏"截图"按钮的现役 handler)→ `captureCameraDataUrl`(791,WebGL `toDataURL` 读像素)→ `cropDataUrlToAspect`(825,按比例裁)→ `sendCaptureToCanvas`(813)→ `capturePanoramaSceneViewport`(sceneNodeActions,存盘+建 source-image 节点+避让落位)。**全在 app 内 RAF 循环跑,绝不能走外部 CDP(截 3D WebGL 会冻)**。
- **确定性几何原语已存在且是纯函数、已被单测 import**:`cameraOrbitFromLookAt`、`resolveCameraLookAtPoint`、`buildGridSnapPose`、`buildMannequinPosePatch`、`cameraFovPatch`、`cameraLookAtTargetPatch`(全在未混淆的 `DirectorChrome.js`)。
- **真实写入路径**(评审纠错):人偶 = `buildMannequinPosePatch(...)` + `updatePanoramaSceneObjectTransform({objectType:'mannequin',pose})`(**不是** `updateMannequinPose`,该函数不存在);机位 = `writeDirectorExt` + `mergeDirectorExt`(深合并)。

---

## 2. 目标管线(剧情 → 站位图,7 段)

| 段 | 做什么 | 复用/新增 | 关键 |
|---|---|---|---|
| **S0 剧情规划** | 现有 5 段链,出 shotplan/v1 | 复用,零改 | 挂 `on_step('scene')` 钩子 |
| **S1 语义站位抽取(LLM)** | 每镜每个在场角色抽 `{stationLabel:L/CL/C/CR/R, depth:FG/MG/BG, facing:8向, pose:stand/sit}`;每机位 `{shotSize:WS/MS/CU, angle}`;带 `sourceSpan` 可回溯 | **新模块**,接现有 LLM client | **只产枚举,严禁浮点坐标** |
| **S2 人审闸门 A** | 结构化站位表给人核对/改 `stationLabel/facing/pose`,`reviewed=true` 才放行 | 复用现有 角色定妆 PAUSE 闸 | **专治 LLM 抽取错(唯一不可消除的风险)** |
| **S3 确定性编译** | `stationLabel→网格 x/z`(查表)、`facing→rotation.y`、`gender→male/female`、`shotSize→focalLength`、机位 `cameraOrbitFromLookAt(pos,lookAt,focal)` | **新纯函数** + 复用几何原语 | **100% 可单测/可对账/可回滚** |
| **S4 摆台落 store** | 人偶 `buildMannequinPosePatch+updatePanoramaSceneObjectTransform`(发**完整** pose);机位 `writeDirectorExt`;真值存 `directorExt.blocking` | 复用补丁层 | 真值放 `directorExt` 不放封闭/混淆的 sceneNode;`charIdx↔mannequinId` 补上剧情↔人偶映射断点 |
| **S5 位置变化触发器** | `stationFingerprint=hash(量化 x/z/yaw/pose/depth)`,相邻镜 diff | **新纯函数** | 见 §3 |
| **S6 逐机位自动截图** | 对 dirty 机位串行:切机位→清 gizmo→等两帧→读像素→裁切→落 source-image 节点 | 复用原生 capture + **新编排循环** | app 内原生,0 行 CDP,0 行新像素逻辑;失败兜底 `clickNativeAction('capture')` |

---

## 3. "位置变化"怎么判定(纯函数,可单测)
不解析自由文本,对**结构化指纹**做相邻镜 diff:
- `stationFingerprint(sceneIdx, charIdx) = hash( round(x,0.1m) | round(z,0.1m) | round(yaw, 15°桶) | pose | depth )`
- **判定三层**:① `sceneIdx` 变(换场)→ 全量重摆 + 全机位重截;② 在场角色集合(`ff_vis_char_idxs`)变(有人进/出画)→ 重摆 + 重截;③ 任一角色指纹变 → 重摆 + 重截;④ **仅 `camIdx` 变**(人没动、只换机位看同一台)→ **只重截不重摆**(把"摆台变化"与"机位变化"拆成两个正交触发器)。
- **量化是关键**:只比枚举档/量化坐标,所以 LLM 措辞同义改写、细微数值抖动**不会误触发**——只有真站位变了才重摆重截,避免刷屏。
- 输出 `dirty = {needRestage:bool, needRecaptureCams:[camIdx]}`,纯函数,给两份快照即可断言结果。

---

## 4. 空间真值层数据模型(放 directorExt,不动封闭 sceneNode)
```jsonc
// directorExt.blocking —— 语义档位是权威真值;x/y/z 是 S3 确定性派生量(落 sceneNode.mannequins 标准字段)
{
  "sceneIdx": 0, "stationHash": "…", "source": "auto|edited",
  "mannequins": { "<mannequinId>": {
    "charIdx": 2,                       // ← 补上"剧情↔人偶"映射断点
    "stage": "CL", "depth": "MG", "facing": 6, "pose": "stand"
  }},
  "cameras": { "<cameraId>": {
    "camIdx": 1, "shotSize": "MS", "angle": "3q", "focalLength": 50
  }}
}
```
- 档位层 = 可被 LLM 重生成 + 人审;派生层(真实坐标)= 可被用户手拖覆盖(覆盖后 `source=edited`,反推回档位刷新 hash)。
- **为什么放 directorExt**:`sceneNode.js` 等是混淆构建产物,改不动其 `normalizePanoramaSceneState`;而 `directorExt` 任意嵌套字段能存活。也顺带绕开 claw 白名单剥字段的通道(走节点本地态 + `on_step` 实时钩子,不指望 shotplan 携带坐标过桥)。

---

## 5. 为什么可行(评审用真源码坐实)
- **两件最难的事都已存在且验证过**:① 确定性几何(`cameraOrbitFromLookAt` 等纯函数,已被 `panoramaDirectorChrome.test.js` import);② 原生截图落画布(`captureWithAspectToCanvas` 是底栏现役 handler)。
- **真正的新代码很薄**:3 个小纯模块(抽取 prompt、编译器、触发器)+ 1 个逐机位编排循环 + 1 个按钮。截图那一环"新代码"只是 `for` 循环,0 行新像素、0 行 CDP。
- **最脆的 LLM 抽取步被人审闸兜住**,且 LLM 被压到"只产枚举",坐标由确定性编译保证。

---

## 6. 诚实的硬约束(kill risks,首版验收口径必须写明)
1. **人偶只有 male/female 真实素体**——无儿童/老人/群众/非人;gender 靠文本关键词命中、命不中默认 male 会判错;群戏 >6 无占位类型。首版验收口径=**"站位准、外形近似"**(否则"小孩用成年男素体"会被当 bug)。
2. **LLM 语义→档位抽取错误不可消除**,只能"可见可改"(枚举+sourceSpan+人审)。**任何"全自动无人审"的设计首版必翻车**——人审闸不能省(编译器确定性 ≠ 整链确定性,错在 LLM 抽档那步)。
3. **claw 白名单剥字段**:新增 position/pose/station 字段过 canvas-dailies 中转未进白名单会被静默剥。→ 真值走 `directorExt` 本地态 + `on_step` 钩子绕开,不走 shotplan 过桥。
4. **混淆构建产物不可改源码**:`sceneNode.js/sceneNodeActions.js/characterModelRegistry.js` 单行混淆。capture/transform 类函数虽在其中但**已 export,可调不可改其内部**。真值层因此必须放 directorExt。
5. **无并发截图**:逐机位必串行(切→等两帧→读像素),≥6 机位单场耗时线性累加;`findSceneCanvas` 取最大画布在多 canvas 环境可能误选,真机 readback 成功率需逐环境验证。首版**机位数卡死 ≤4**。
6. **完整 pose 铁律**:`buildMannequinPosePatch` 发部分 pose 会把缺失字段归零(只发 scale 会清掉 position)→ 摆台每次必输出完整 `{position,rotation,scale}`。
7. **姿势校准债**:只有 `naturalArmPose`,无 sit/lie/走姿;`pose=sit` 先存不渲染、站立近似 + 标"姿态待人工"。
8. **指纹"未越档不触发"双刃**:用户手拖的细微位移没跨档则不自动重截,需 UI 明示"已改动未跨档,如需更新请手动出图"。

---

## 7. 落地路线(绞杀者,每刀独立可发布 + 可单测)
- **第 1 刀(2–3 天,演示级;不接 LLM/触发器/on_step)**:写死单场 + 3 角色 + 2 机位(正面 WS + 3/4 MS)+ 全 stand + 首帧站位。纯函数 `stationLabelToMannequins(fixture)`:手写一份 blocking JSON → 确定性编译成坐标 → `buildMannequinPosePatch+updatePanoramaSceneObjectTransform`(人偶)+ `writeDirectorExt`(机位)落台 → `captureAllCamerasToCanvas(shell,nodeId)` 逐机位复用现役 capture 链出图,失败兜 `clickNativeAction`。底栏加一个"按 fixture 摆台并逐机位出图"按钮。**验收**:点按钮 → 3 素体按 FL/FC/FR 摆好、2 机位布好 → 自动吐 2 张全景站位图落画布。**这一刀把全部 LLM 不确定性排除在外,只验证"确定性编译 + 原生 capture 编排"这条已被源码证明的主干。**
- **第 2 刀**:接 S1 grounding LLM(产 stationLabel)+ S2 人审闸。
- **第 3 刀**:接 S5 fingerprint 触发器 + `on_step('scene')` → 全自动(剧情站位一变即自动重摆重截)。

> 验收一句话:**"加一种剧情、改一处站位、换一个机位,都只改'数据或纯函数',不碰渲染与截图主干;站位是可单测、可回滚、可追溯到原文的几何真值,而非 LLM 随手画的图。"**

附:[[21-storyboard-script-architecture-and-decoupling]](SDM 内核解耦,空间字段可挂进 SDM 三层共享)。
