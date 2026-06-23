# 需求③ 详细方案：导演台底部输入框 + 剧本/参考图 → 自动摆台

> 需求 100% 锁定后的实现方案(2026-06-15)。承接 doc23(总方案) + doc22(剧情→3D 管线设计)。本文只覆盖 ③,实现导向、可 review。req1/req2 已开发+review+修复(127 测试绿)。

## 0. 锁定口径(回顾)
- 底部输入框**照搬"生成文本节点"**(带模型选择器)+ 支持参考图。
- 输入**剧本**→当前导演台**就地摆台**;多场默认只第一场;**清空重摆**;摆**角色+立方体+自动布机位**;**不自动截图**。
- 输入**参考图**→自动判类型(照片/草图/构图);**图文同给:有图优先按图还原,文字补细节**。
- 精度**混合**:默认枚举档位,剧本给了"12m/楔形/领先半身位"就还原真坐标。
- 产物=导演台里摆好的 3D 场景;用户直接在台上审/调(天然人审,无额外闸)。

## 1. 关键接缝(已勘明,全在可编辑层)
- **输入框** = 复用 `components/sharedPromptPanel.js` 的 `buildSharedPromptPanel(self, opts)`:已自带 提示词 textarea + **模型选择器**(provider/model 下拉,grsai/volcengine/apimart/…,含自定义模型) + 生成按钮 + **参考图 ref-bar**(连入的图片节点显示为 ref 缩略图)+ `self._onGenerate` 回调 + `self._data/nodeId/promptEl`。→ req3 不自造输入框,直接挂这个 panel。
- **参考图** = 复用 ref-bar 的"连图片边"机制(连一个图片节点 → ref 缩略图);`self.refBarEl`/edges 即参考图来源。
- **AI 调用** = `api/aiTextApi.js` 的 `buildGenerateTextRequest` + provider 客户端(grsai 多模态可读图);沿用 brain 同款 `client.chat + extract_json` 模式。
- **摆台写入** = req1/req2 已验证的那套(我真机跑通过):`buildMannequinPosePatch`+`updatePanoramaSceneObjectTransform({objectType})`(人偶/立方体)、`addPanoramaSceneCube`、`addPanoramaSceneCamera`+`writeDirectorExt`(机位 lookAt/focal)、`appStore.updateNodeData` 清空旧 mannequins/cubes/cameras。
- **真值层** = `directorExt.blocking`(doc22 模型;无下游/无截图 → 纯本地,供再生成/微调)。

## 2. 数据流（无截图、就地、清空重摆、单场）
```
底部 buildSharedPromptPanel(self,{placeholder:'输入剧本/连参考图 → 自动摆台', btnTitle:'生成站位',
                                  modelMenu:{provider, models:[文本+多模态], allowCustomModels:true, onSelect}})
self._onGenerate = async () => {
  A. 收集输入:promptText = self.promptEl.innerText;refImages = 从 self 连入边的图片(ref-bar)
  B. 路由:有图 → 图优先(视觉还原站位,文字补细节);无图 → 纯文本
  C. 抽取(LLM/视觉,新模块 directorAutoStage.js):
     · 选中的 model(多模态当有图)经 buildGenerateTextRequest 调 provider,system prompt 要求只出结构化 blocking JSON
     · blocking(混合精度):每角色 {name?, gender, stage:L/CL/C/CR/R, depth:FG/MG/BG, facing:0-7, pose:stand|sit
                             | 或精确 {x,z,yaw}}；每道具 {name, kind:'cube', x?,z?,scale?}；每机位 {shotSize:WS/MS/CU, angle, lookAt}
     · 多场景 → 只取第 1 场;图片先判类型(photo/sketch/composition)走不同 prompt 分支
  D. 确定性编译(纯函数 directorBlockingCompiler.js,可单测):
     stage 档→网格 x/z(查表)| 有精确坐标直用 | facing→rotation.y | gender→male/female 素体
     | shotSize→focalLength | 机位 cameraOrbitFromLookAt(pos,lookAt=站位质心,focal)
  E. 清空重摆落 store(就地):清当前 mannequins/cubes/cameras → 写新的(人偶/立方体走完整 pose 补丁;
     立方体命名走 cubeNamePatch;机位走 directorExt.cameras)+ 落 directorExt.blocking
  → 用户在 3D 台上审/拖/调(终点,无自动截图)
}
```

## 3. 落地顺序(每步可单发 + 可单测；全在可编辑层)
- **③a 输入框壳**:在 director chrome 底部挂 `buildSharedPromptPanel`(modelMenu + 参考图 ref-bar),`_onGenerate` 先接一个"用手喂的 blocking fixture 摆台"(不接 LLM)。先把 UI + 摆台主干跑通。
- **③b 确定性摆台引擎**:`directorBlockingCompiler.js`(blocking→坐标,纯函数,**单测**)+ `directorAutoStage.js` 的"清空重摆"执行器(复用 req1/req2 验证过的写入 API,**单测**)。喂 fixture 即可端到端验证(对齐我真机跑过的 scene2 摆法)。
- **③c 剧本→blocking 抽取(LLM)**:`directorAutoStage.js` 接文本 LLM(选中 model),system prompt 出枚举/精确混合 blocking;多场取第一场。
- **③d 参考图→blocking(视觉)**:判图类型 + 图优先;多模态 model 读 ref 图。最难,放最后。

## 4. 诚实约束(首版验收口径)
1. 人偶仅 male/female(站位准·外形近似);gender 文本/视觉判,命不中默认 male;群戏近似。
2. 姿势校准债:仅 naturalArmPose;pose=sit/lying 先存不渲染、站立近似+标注。
3. 抽取错(文本/视觉→站位)不可自动消除 → 靠用户在 3D 台看+改(已是终点,代价小);**照片类参考图最难**,草图/构图较稳。
4. 真值放 directorExt(混淆产物改不动);**完整 pose 铁律**(发部分 pose 会归零字段)。
5. 立方体只能等比方块(scale 单标量)。
6. 模型调用走前端既有 provider 通道;视觉需多模态 model(有图时模型下拉应可切到多模态)。

## 5. 与 req1/req2 的协同
- 摆台产物里的立方体(剧本"残墙/桌子/掩体"→cube)直接复用 req2 的命名/名牌/树/检查器。
- 机位用 req1/req2 同款 directorExt.cameras + 已修的 FOV 水平换算。

## 6. 设计决策(已定稿,2026-06-15 用户拍板)
- ① **参考输入 = 上传 + 连边都支持,且文本/图片都能连**。shared panel 的 ref-bar 已处理连边;**直接上传需额外加**(本地 objectURL/文件选择 → 作为 ref 附件)。
- ② **模型 = 文本节点模型**(API 配置「文本节点模型」列表,默认第一个 = gemini-3.1),交互照搬生成文本节点的模型下拉;**不是图像模型**。有参考图时仍用该文本模型(若所选模型支持多模态则读图;grsai/gemini 走多模态)。
- ③ **删除图像生成特有控件**(常用提示词 / 自适应·分辨率 / 批量 ×N)——这些是图像节点的,本输入框不要。
- ④ **输入框禁用 @ 和 / 触发**(挂 buildSharedPromptPanel 时关掉 checkSlashTrigger/_checkAtTrigger,或不绑这两个监听)。
- ⑤ **清空重摆 = 全清**(不保留锁定对象)。
- ⑥ **多场剧本只取第 1 场**(暂不给选场入口)。
- ⑦ blocking schema 的"枚举↔精确"混合:同一份里 stage 档位 与 {x,z,yaw} 精确坐标二选一并存,编译器**有精确用精确、否则枚举查表**。
- ⑧ 纯函数边界:`compileBlockingToScene`(blocking→坐标)+ 触发/路由可单测;LLM/视觉抽取那段 mock provider 调用测协议(出 JSON 解析)。
