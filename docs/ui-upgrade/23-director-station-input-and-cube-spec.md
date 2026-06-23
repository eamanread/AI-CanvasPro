# 3D 导演台 · 名牌修复 + 立方体恢复 + 剧本/参考图→自动摆台 · 优化方案

> 需求经两轮澄清 100% 锁定(2026-06-15)。本方案只覆盖这三条,实现导向。承接 [[21-storyboard-script-architecture-and-decoupling]] / [[22-plot-to-3d-blocking-pipeline-design]] 的内核与可行性结论。

## 0. 锁定的需求(确认口径)
1. **名牌去透明度**:名牌底牌做成**不透明** + **近者遮远者**;不做过近自动避让/隐藏。
2. **恢复立方体**:恢复生成(入口=底部"素体库"弹窗加「立方体」项);进左侧场景树(带 👁/🔒 + 右键,与人偶树行一致);**可命名 + 头顶名牌**,交互/UI/逻辑**完全照搬人偶命名规则**。
3. **底部输入框 + 自动摆台**:输入框照搬"生成文本节点"(**带模型选择器**)+ 支持参考图;
   - 输入**剧本**→当前导演台**就地摆台**(多场默认只第一场);**清空重摆**;摆**角色+立方体站位 + 自动布机位(相机/焦距/注视)**;**不自动截图**;
   - 输入**参考图**→自动判断图类型(照片/草图/构图)摆台;**图文同给:有图优先按图还原,文字补细节**;
   - **精度=混合**:默认枚举档位,剧本给了"12m/楔形/领先半身位"就尽量还原真坐标。

> 关键简化:**去掉自动截图** → 绕开 CDP 冻屏整块麻烦,产物就是导演台里摆好的 3D 场景,用户直接在台上审/调(天然的人审,不需额外闸)。

---

## 1. 需求1 · 名牌不透明(最小、最先做)
**接缝**:`modules/panoramaSceneNode/panoramaEnvironmentRuntime.js` 的 `syncMannequinLabelsWith`(名牌 sprite,纹理缓存 `visual.__hyLabelTex`)。
**改法**:① 画名牌 CanvasTexture 时底牌圆角矩形 `globalAlpha=1`、填不透明色(去掉半透明);② sprite material `depthTest=true, depthWrite=true`(当前疑似关了 depthWrite 导致重叠时糊在一起)→ 近的名牌像素挡住远的,消除"错乱"。
**验证**:单测覆盖纹理绘制参数;真机看两个近距名牌不再糊。**风险**:sprite 永远朝相机,完全重合(同屏同位)仍会叠——但用户只要求去透明度修错乱,不做避让。

## 2. 需求2 · 立方体恢复 + 场景树 + 命名(照搬人偶)
**2.1 恢复生成**:`addPanoramaSceneCube({nodeId,storeInstance})` 已存在(导出可用)。在 autoload `buildCharacterPopup`(底部"角色/素体库"弹窗)加一项「立方体」,点击调 `addPanoramaSceneCube`。
**2.2 进场景树**:`DirectorChrome.js:deriveSceneTree(scene,directorExt)` 现产 机位+角色两类 → 加第三类 **道具/立方体**(读 `scene.cubes`)。autoload `renderTree` 渲该类;👁/🔒 复用 `directorExt.visibility/locked` 数组(按 objectId,立方体 id 直接加入);右键菜单复用 `buildTreeContextMenuItems`,删除走选中后 `deleteSelectedPanoramaSceneObject`。
**2.3 命名(照搬人偶)**:把人偶那套**泛化到对象**——
- 数据:`directorExt.cubes[id].name`(镜像 `directorExt.mannequins[id].name`);派生 `objectDisplayName(directorExt,kind,id,idx)`(把现 `mannequinDisplayName` 泛化,人偶/立方体共用)。
- 头顶名牌:`syncMannequinLabelsWith` 泛化为 `syncObjectLabelsWith`,对 `_mannequinMap` + `_cubeMap` 都挂顶层 `__hyLabelLayer` sprite(立方体名牌 y 取 cube 顶 = position.y + 0.5·scale)。
- 交互:树名双击内联改(`beginInlineRename` 已通用化即可)+ 属性面板"名称"框(选中立方体时检查器显示,镜像角色名称框)。
**注**:立方体 `scale` 是单标量(非等比不支持),命名/选中/可见性/锁定全走与人偶一致的 directorExt 旁路。**全部落在可编辑层**(DirectorChrome/autoload/runtime),不碰混淆产物。

## 3. 需求3 · 底部输入框 + 剧本/参考图→自动摆台
### 3.1 输入框(照搬"生成文本节点")
- **接缝**:先读"生成文本节点"(ai-text)的输入框组件(疑似 `components/sharedPromptPanel.js` / ai-text 节点)对齐:**提示词 textarea + 模型选择器下拉 + 生成按钮**,额外加**参考图附件**(本地选图→objectURL/base64,可多模态喂)。
- 放在导演台**底部**(chrome 底栏上方一条),`directorExt.scriptInput` 存当前文本/选中模型/附图引用。
- **模型选择器**:照搬文本节点的模型列表;当**挂了参考图**→只允许/默认切到**多模态(视觉)模型**(参考图要"看图")。

### 3.2 摆台流水线(无截图、就地、清空重摆、单场)
```
输入(剧本文字 ± 参考图)
  → A. 路由:有图→图优先(视觉还原站位,文字补细节);无图→纯文本抽取
  → B. 抽取(LLM/视觉,新模块):产结构化 blocking(混合精度)
       · 默认枚举:stage(L/CL/C/CR/R)·depth(FG/MG/BG)·facing(8向)·pose(stand/sit)·shotSize(WS/MS/CU)
       · 精确覆盖:文中出现"12m/楔形/领先半身位"→直接产 x/z/yaw 真坐标(覆盖枚举)
       · 多场景剧本 → 只取第 1 场
       · 图片先判类型(照片/草图/构图)走不同视觉 prompt
  → C. 人审(天然):不自动出图,产物就是 blocking;可选先给文字站位表(按需)
  → D. 确定性编译(纯函数,复用已验证原语):
       枚举→网格 x/z(查表) | 精确坐标直用 | facing→rotation.y | gender→male/female素体
       | shotSize→focalLength | 机位 cameraOrbitFromLookAt(pos,lookAt=站位质心,focal)
  → E. 清空重摆落 store(复用已验证写法,即我已真机跑通的那套):
       清当前 mannequins/cubes/cameras → 写新的
       · 人偶:buildMannequinPosePatch + updatePanoramaSceneObjectTransform({objectType:'mannequin',pose完整})
       · 立方体:addPanoramaSceneCube + 位置/scale/命名(走 2.3)
       · 机位:addPanoramaSceneCamera + writeDirectorExt(cameraLookAtTargetPatch/cameraFovPatch)
       · 真值:directorExt.blocking(供再生成/微调;无下游,纯本地)
  → 用户在 3D 台上审/拖/调(终点)
```
- **精度=混合**正面用上你给的 ASCII 那种精确描述:抽取层允许产真坐标,编译层"有精确用精确、没有用枚举查表"。
- **模型/调用**:抽取走前端已有的 AI 调用通道(grsai/gemini 多模态);具体接哪个客户端在落地时核(brain 用 grsai;前端生成链也有调用基建)。

### 3.3 与需求2的协同
立方体也是摆台产物之一(剧本里"残墙/桌子/掩体"→cube + 命名),复用 2.3 的命名/名牌/树,blocking 里 cube 与 mannequin 同级。

---

## 4. 诚实约束(首版验收口径必须写明)
1. **人偶只有 male/female 素体**——gender 靠文本/视觉判,命不中默认 male;无儿童/老人/群众/非人;群戏外形近似。验收口径=**站位准、外形近似**。
2. **姿势校准债**:仅 `naturalArmPose`,`pose=sit/lying` 先存不渲染、站立近似 + 标"姿态待人工"。
3. **抽取错不可自动消除**:文本/视觉→站位的判断错只能靠用户在 3D 台上看+改(已是天然终点,比"出一堆错图"代价小)。**照片类参考图最难**(视觉还原相对位置),草图/构图较稳。
4. **真值放 directorExt**:混淆产物(sceneNode.js 等)改不动,真值层只挂 directorExt(命名、blocking 均如此)。
5. **完整 pose 铁律**:`buildMannequinPosePatch` 发部分 pose 会把缺失字段归零 → 摆台每次输出完整 `{position,rotation,scale}`。
6. **立方体非等比缩放不支持**(scale 单标量),只能等比方块。

---

## 5. 落地顺序(每步可单独发布 + 单测;全在可编辑层)
1. **需求1 名牌不透明**(最小、隔离,先拿下,quick win)。
2. **需求2 立方体**(生成入口 → 场景树 → 命名/名牌,逐子项;纯逻辑进 DirectorChrome 可单测)。
3. **需求3a 输入框 UI**(照搬文本节点 + 模型选择器 + 参考图附件,先把壳搭起来,不接生成)。
4. **需求3b 剧本→摆台**(确定性编译器 + 清空重摆,复用我已真机跑通的摆台 API;先规则版抽取或手喂 blocking 验证主干,再接 LLM)。
5. **需求3c 参考图→摆台**(视觉判类型 + 图优先还原;最难,放最后)。

> 验证:纯逻辑(树/命名/编译器)走 `node --test` 单测(沿用 panoramaDirectorChrome.test.js 范式);3D 观感在能连上的窗口真机看(注意 [[storyboard-spatial-staging-feasibility]] 的窗口陷阱:动手前核对扩展连的 tab == 你在看的窗口)。
