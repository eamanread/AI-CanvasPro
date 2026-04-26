# PROJECT_ARCHITECTURE

## 1. 文档目的

这份文档是 `AI-CanvasPro` 的全局架构说明，目标是让新的 AI 会话或新加入的开发者在最短时间内理解项目的运行形态、目录边界、扩展方式和开发约束。

适用场景：

- 新 AI 会话开始前的上下文注入
- 新功能开发前的快速架构定位
- 排查问题时快速判断应该去前端、后端还是运行数据目录查看

---

## 2. 项目一句话概括

`AI-CanvasPro` 是一个基于无限画布的 AI 多模态节点编辑器，采用“原生前端单页应用 + Python 本地服务”的架构：

- 前端使用原生 `HTML / CSS / JavaScript ES Modules`
- 后端使用 Python `http.server + ThreadingTCPServer`
- 前端负责画布渲染、节点交互、状态管理和业务编排
- 后端负责本地文件管理、媒体处理、代理外部模型服务、配置持久化和本地 API 提供

重要判断：

- 这不是 React / Vue / Next 项目
- 这不是传统多页面网站
- 这也不是前后端完全分离的云端 Web App
- 它更接近“桌面化的本地 Web 工具”

---

## 3. 技术栈概览

### 3.1 前端

- 语言：JavaScript
- 模块方式：ES Modules
- 页面入口：`index.html`
- 样式：手写 CSS，按功能拆分在 `styles/`
- UI 方式：原生 DOM + SVG，自定义画布节点渲染
- 3D/全景：本地 vendored `three.js`
- 状态管理：项目自研 store，不使用 Redux / Pinia / Zustand
- 路由：无前端 SPA 路由，页面组织依赖单页中的面板、弹层、画布 tab

### 3.2 后端

- 语言：Python
- HTTP 服务：`http.server.SimpleHTTPRequestHandler`
- Server：`socketserver.ThreadingTCPServer`
- 路由分发：`services/http_route_dispatcher.py`
- 文件持久化：JSON 文件 + 本地目录
- 图像处理：`pillow`
- 视频/场景处理：`opencv-python`、`scenedetect`、`ffmpeg/ffprobe`（运行环境依赖）
- 分割/模型相关：`onnxruntime`、`transformers`、`tokenizers`
- 网络请求：`requests`

### 3.3 工程化

- 包管理：`npm`
- Node 类型：`"type": "module"`
- 单测：`node --test`
- E2E：`@playwright/test`
- Git hooks：`husky`

### 3.4 运行方式

- 本地启动命令：`python server.py`
- 默认地址：`http://127.0.0.1:8777/`
- 默认端口来源：`AICANVAS_PORT`，默认 `8777`

---

## 4. 架构总览

### 4.1 总体分层

项目可以按五层理解：

1. 页面壳层
   - `index.html`
   - 承载所有主界面 DOM 结构、面板容器、设置弹层、按钮入口

2. 前端核心引擎层
   - `src/core/`
   - 负责画布渲染、交互、数学计算、视口控制、状态容器

3. 前端业务模块层
   - `components/`
   - `modules/`
   - 负责节点组件、项目生命周期、顶部栏、面板、资源管理、工作流、各类控制器

4. 前端 API 与 service 层
   - `api/`
   - `services/*.js`
   - 负责调用本地 API、远端模型接口封装、文件上传、toast、快捷键、项目保存等

5. Python 本地服务层
   - `server.py`
   - `services/*.py`
   - 负责本地 HTTP 路由、配置存储、项目 JSON、输出文件、媒体处理、远端代理

### 4.2 启动链路

浏览器启动链路：

`index.html`
-> `modules/providers.js`
-> `modules/storage.js`
-> `modules/project.js`
-> `main.js`

`main.js` 会完成以下核心初始化：

- 初始化 toast、键盘服务、浮动菜单快捷键
- 获取运行时信息和开发模式
- 注册所有节点类型到节点注册表
- 初始化 renderer
- 绑定 UI 层事件
- 启动 store runtime effects
- 初始化 minimap、设置、项目下拉、吉祥物、自动更新
- 创建应用级业务对象：
  - `createAppCanvasNodeFlows`
  - `createAppBusinessEvents`
  - `createAppTopbarAndConfig`
  - `createAppPanels`
  - `createProjectLifecycle`
- 注册全局页面事件

后端启动链路：

`server.py`
-> 初始化各类 route service
-> 构建 `HTTP_ROUTE_DISPATCHER`
-> 启动 `ThreadingTCPServer`
-> `Handler` 接管 `GET / POST / DELETE / PATCH`

---

## 5. 核心目录说明

以下说明按“职责边界”组织，不只是列目录名。

### 5.1 根目录

- `index.html`
  - 前端主页面
  - 包含主画布容器、工具栏、设置面板、弹层、项目切换区等 DOM 结构

- `main.js`
  - 前端应用总装配入口
  - 不建议继续把大量细节逻辑塞进这里
  - 新功能优先落到 `modules/app/`、`components/` 或 `services/`

- `server.py`
  - Python 本地服务入口
  - 负责 server 启动、静态文件托管、CORS/本地访问控制、API 分发

- `package.json`
  - 前端工具链与测试脚本定义

- `requirements.txt`
  - Python 依赖

### 5.2 `src/`

#### `src/core/`

前端引擎层，属于底座代码。

- `renderer.js`
  - 画布渲染核心
  - 负责节点/连线的可视化渲染
  - 注意：项目明确把 DOM 事件绑定从 renderer 中拆到了 `ui/rendererUiEvents.js`

- `interaction.js`
  - 画布交互核心
  - 处理拖拽、框选、缩放、连接、上下文菜单、命令执行

- `math.js`
  - 画布世界坐标、命中检测、对齐计算等通用数学函数

- `viewportFocus.js`
  - 负责聚焦节点、聚焦多个节点、缩放定位等视口行为

- `rendererVirtualization.js`
  - 节点虚拟化配置与可见性计算

- `generationTaskLifecycle.js`
  - 任务状态生命周期辅助逻辑

- `stores/`
  - 状态管理核心，见后文“状态管理”

#### `src/utils/`

底层通用工具，不直接承载业务流程。

例如：

- `dom.js`
- `format.js`
- `validators.js`
- `thumbnailPersistence.js`

### 5.3 `components/`

节点组件层。

这里的文件通常对应“节点 UI + 节点行为”。

代表性文件：

- `SourceTextNode.js`
- `SourceImageNode.js`
- `SourceVideoNode.js`
- `SourceAudioNode.js`
- `AIGenerateNode.js`
- `AIGenTextNode.js`
- `AIGenVideoNode.js`
- `AIGenAudioNode.js`
- `StoryboardNode.js`
- `PanoramaSceneNode.js`

子目录说明：

- `components/aigenImage/`
  - 图像生成节点的状态同步、任务编排、UI 模块

- `components/aigenText/`
  - 文本生成节点的状态同步和任务逻辑

- `components/aigenVideo/`
  - 视频生成节点的渲染与任务 mixin

- `components/video-node/`
  - 视频节点参数面板、预览控制、参考输入、结果渲染等

- `components/nodeToolbar/`
  - 各类节点工具栏按钮和 HTML 拼装

### 5.4 `modules/`

业务模块层，是本项目的重要扩展区。

#### `modules/app/`

这是应用编排层，优先级很高。

- `appBusinessEvents.js`
  - 应用业务事件绑定

- `appPanels.js`
  - 侧边面板、弹层、面板联动相关装配

- `appTopbarAndConfig.js`
  - 顶部栏、配置面板、API 配置、Dreamina 相关入口

- `canvasNodeFlows.js`
  - 节点创建、资源转节点、生成流转等高层业务流

- `projectLifecycle.js`
  - 项目初始化、自动保存、本地缓存、导入导出、生命周期事件

- `globalEvents.js`
  - 页面级全局事件注册

- `resourceEntry.js`
  - 资源上传入口注册

#### 其他重要模块

- `CanvasTabManager.js`
  - 多画布页签管理

- `CanvasProjectDropdownManager.js`
  - 项目下拉面板管理

- `SettingsManager.js`
  - 设置面板管理

- `history.js`
  - 撤销/重做/提交记录

- `registry.js`
  - 节点注册表

- `nodeMeta.js`
  - 节点类型元信息、别名、样式类、引用类型

- `providers.js`
  - 模型提供商元信息

- `subscriptionAccess.js`
  - 订阅与模型可用性逻辑

- `minimap.js`
  - 小地图

- `workflows/`
  - 工作流相关业务模块

- `panoramaSceneNode/`
  - 全景/3D 场景相关的独立子域

### 5.5 `api/`

前端 API 封装层。

建议把它理解为“对外接口 SDK”，不要在业务模块里直接散落 `fetch()`。

重要文件：

- `requester.js`
  - 当前主请求封装
  - 提供 `requester / get / post / del`
  - 支持超时、AbortSignal、重试、错误解析、相对路径自动补基址

- `apiUrl.js`
  - 构造本地 API 基址
  - 在 `file:` 协议下会回退到 `http://127.0.0.1:8777`

- `configApi.js`
  - 配置接口封装

- `projectsV2Api.js`
  - 项目、资产、工作流、上传、输出保存、派生图相关接口

- `aiImageApi.js`
  - 图像生成 API 统一封装

- `aiTextApi.js`
  - 文本生成 API 封装

- `aiVideoApi.js`
  - 视频生成 API 封装

- `aiAudioApi.js`
  - 音频生成 API 封装

- `dreamina*`
  - Dreamina 登录、提交、轮询

- `runninghub*`
  - RunningHub 任务与工作流接口

- `errors/`
  - 错误对象与不同服务商错误解析器

- `adapters/`
  - 第三方服务商适配器

### 5.6 `services/`

注意：这个目录同时存在前端 JS service 和后端 Python route service。

#### 前端 `services/*.js`

示例：

- `fileService.js`
  - 文件转节点、节点默认尺寸、拖拽上传处理

- `projectService.js`
  - 项目加载/保存/导入/导出、本地化远端图片

- `toastService.js`
  - 全局提示

- `keyboardService.js`
  - 键盘服务

- `storeRuntimeEffectsService.js`
  - store 运行时联动副作用

- `thumbnailCacheService.js`
  - 缩略图缓存迁移与处理

#### 后端 `services/*.py`

示例：

- `http_route_dispatcher.py`
  - 后端统一路由分发器

- `config_route_service.py`
  - 配置读取与保存

- `json_file_route_service.py`
  - 项目、资产、工作流、用户 JSON 文件的 CRUD

- `library_file_route_service.py`
  - prompt 预设、缩略图保存

- `media_file_route_service.py`
  - 上传、输出保存、图片派生图

- `local_media_processing_route_service.py`
  - 视频裁剪、音频裁剪、视频合成、元信息、首帧提取

- `remote_proxy_route_service.py`
  - 远程任务代理、RunningHub 工作流代理

- `dreamina_route_service.py`
  - Dreamina 服务相关

- `sam3_route_service.py`
  - SAM3 分割服务相关

### 5.7 资源与数据目录

- `styles/`
  - 全部样式源码

- `images/`
  - 静态图标、光标、品牌图

- `vendor/`
  - vendored 第三方前端库

- `data/`
  - 运行期资源目录
  - 包括 `assets/`、`uploads/`、`workflows/`

- `user/`
  - 用户持久化数据
  - 例如：
    - `user/config.json`
    - `user/settings.json`
    - `user/Canvas Project/*.json`
    - `user/prompt/`

- `output/`
  - 生成结果输出目录

- `docs/`
  - 项目文档目录

---

## 6. 状态管理架构

本项目使用的是自研 store，不是第三方状态库。

### 6.1 核心结构

底层是：

- `src/core/stores/legacyKernelStore.js`

上层通过 facade 包装出三个分域 store：

- `graphStore`
- `uiStore`
- `workspaceStore`

对应文件：

- [src/core/stores/graphStore.js](/private/tmp/AI-CanvasPro/src/core/stores/graphStore.js)
- [src/core/stores/uiStore.js](/private/tmp/AI-CanvasPro/src/core/stores/uiStore.js)
- [src/core/stores/workspaceStore.js](/private/tmp/AI-CanvasPro/src/core/stores/workspaceStore.js)
- [src/core/stores/facadeStore.js](/private/tmp/AI-CanvasPro/src/core/stores/facadeStore.js)

### 6.2 三个分域的职责

#### `graphStore`

负责画布图结构与视口相关状态：

- 节点 `nodes`
- 边 `edges`
- 视口 `viewport`
- 选区 `selectedNodeIds`
- 连接浮层 `connOverlay`
- 选择框 `selectionBox`

典型操作：

- `addNode`
- `updateNodeData`
- `addEdge`
- `removeEdge`
- `updateViewport`
- `renameNode`
- `groupNodes`

#### `uiStore`

负责前端界面表现与交互态：

- picker / contextMenu
- annotate / matting / videoKeying / videoClip
- theme
- 对齐面板
- 特性开关
- 服务连接状态

典型操作：

- `showPicker`
- `hidePicker`
- `showContextMenu`
- `setTheme`
- `setServerConnection`

#### `workspaceStore`

负责工作区级业务数据：

- 订阅状态 `subscription`
- 资产列表 `assets`
- 工作流列表 `workflows`
- 工作流 UI 态 `workflowUi`

典型操作：

- `setSubscriptionState`
- `addAsset`
- `deleteAsset`
- `setWorkflows`
- `upsertWorkflow`

### 6.3 开发约束

- 改节点/连线/画布视口，用 `graphStore`
- 改浮层/菜单/主题/交互状态，用 `uiStore`
- 改资产/工作流/订阅，用 `workspaceStore`
- 不要把所有数据都继续塞回单一全局对象
- 新增状态前，先判断它属于哪一个域

---

## 7. 前端“路由”与界面组织方式

### 7.1 重要事实

这个项目没有传统 SPA 路由。

也就是说：

- 没有 React Router
- 没有 Vue Router
- 没有 `src/pages/`
- 没有按 URL 切换页面的设计

### 7.2 当前界面组织方式

主界面组织依赖以下机制：

- 单个 `index.html`
- 左侧浮动侧边栏
- 顶部栏
- 画布 tab
- 各类弹层、设置面板、工作流面板、资产面板

### 7.3 如何理解“加新页面”

在这个项目里，“新增页面”默认应理解为以下三种之一：

1. 新增一个面板/弹层/工具区
2. 新增一个独立节点类型
3. 新增一个独立的静态 HTML 页面

推荐优先级：

- 如果功能属于主创作流程，优先做成面板或节点，不要引入前端路由
- 只有当需求明确是“独立文档页、演示页、帮助页”时，才考虑新增单独 HTML 页面

---

## 8. 后端路由体系

### 8.1 路由入口

后端入口在 [server.py](/private/tmp/AI-CanvasPro/server.py:1412) 的 `Handler`。

请求处理顺序大体如下：

1. `Handler.do_GET / do_POST / do_DELETE / do_PATCH`
2. 调用 `HTTP_ROUTE_DISPATCHER`
3. 由 dispatcher 再分发给具体 route service
4. 如果不是 API，则回落到静态文件服务

### 8.2 Dispatcher 的角色

[services/http_route_dispatcher.py](/private/tmp/AI-CanvasPro/services/http_route_dispatcher.py) 是总分发器。

它负责把请求路由到：

- 配置服务
- JSON 文件服务
- 缩略图/预设服务
- Dreamina 服务
- SAM3 服务
- 媒体上传与保存服务
- 本地媒体处理服务
- 远程代理服务
- 更新与订阅服务

### 8.3 典型本地 API

常用接口族：

- `/api/config`
- `/api/v2/config/custom-ai`
- `/api/v2/runtime/info`
- `/api/v2/projects`
- `/api/v2/projects/save`
- `/api/v2/assets`
- `/api/v2/assets/save`
- `/api/v2/workflows`
- `/api/v2/workflows/save`
- `/api/v2/user/*`
- `/api/upload?filename=...`
- `/api/v2/save_output`
- `/api/v2/save_output_from_url`
- `/api/v2/images/derivatives/ensure`
- `/api/v2/proxy/task`
- `/api/v2/proxy/upload`
- `/api/v2/runninghubwf/run`

### 8.4 静态文件和输出文件访问

`Handler.translate_path()` 对以下路径做了虚拟映射：

- `/output/*`
- `/data/uploads/*`

因此：

- 后端保存到 `output/` 的文件可直接通过本地 URL 访问
- 上传落盘到 `data/uploads/` 的文件也可被前端直接引用

---

## 9. 持久化与数据流

### 9.1 主要持久化位置

- 项目文件：`user/Canvas Project/*.json`
- 用户配置：`user/config.json`
- 用户设置：`user/settings.json`
- 用户 prompt 预设：`user/prompt/`
- 上传文件：`data/uploads/`
- 资产数据：`data/assets/`
- 工作流数据：`data/workflows/`
- 生成输出：`output/`

### 9.2 项目保存机制

项目保存链路通常是：

前端 store / CanvasTabManager
-> `services/projectService.js`
-> `api/projectsV2Api.js`
-> `/api/v2/projects/save`
-> `JsonFileRouteService`
-> JSON 文件落盘

### 9.3 图片/视频落盘机制

远端生成结果常见流程：

前端生成节点拿到远端 URL
-> 调用 `saveOutputToServer` 或 `saveOutputFromUrlToServer`
-> 后端保存到 `output/`
-> 必要时调用 `/api/v2/images/derivatives/ensure`
-> 前端节点数据更新为本地 `localPath / displayLocalPath / thumbLocalPath`

---

## 10. 核心开发规范

以下部分是本项目最重要的“操作说明”。

### 10.1 什么时候改哪里

#### 想改画布行为

优先查看：

- `src/core/renderer.js`
- `src/core/interaction.js`
- `src/core/math.js`
- `ui/rendererUiEvents.js`
- `modules/interaction/*`

#### 想改节点本身

优先查看：

- `components/*Node.js`
- `components/aigenImage/*`
- `components/aigenText/*`
- `components/aigenVideo/*`

#### 想改顶部栏 / 设置 / 面板

优先查看：

- `index.html`
- `modules/app/appTopbarAndConfig.js`
- `modules/app/appPanels.js`
- `modules/SettingsManager.js`

#### 想改项目加载/保存/本地缓存

优先查看：

- `modules/app/projectLifecycle.js`
- `services/projectService.js`
- `api/projectsV2Api.js`
- `services/json_file_route_service.py`

#### 想改本地 API / 文件服务

优先查看：

- `server.py`
- `services/http_route_dispatcher.py`
- 相关 `services/*_route_service.py`

---

## 11. 如何新增节点

新增节点时，优先沿用现有节点体系，不要新起一套渲染机制。

### 11.1 最小步骤

1. 在 `components/` 新建节点组件文件
2. 如果该节点有复杂任务逻辑，在对应子目录拆分模块
3. 在 `main.js` 的 `NODE_COMPONENTS` 中注册类型
4. 如需别名、wrapper class、引用类型，在 `modules/nodeMeta.js` 补元信息
5. 如需新增节点创建流，接入 `modules/app/canvasNodeFlows.js` 或交互命令流
6. 如需默认尺寸，补 `services/fileService.js` 的尺寸逻辑
7. 如需持久化字段，保持字段挂在 node data 上，并确认项目保存/恢复能正常工作

### 11.2 规范建议

- 优先复用已有节点结构和 mixin
- 节点自有状态尽量挂在节点 data，而不是额外全局变量
- 若节点依赖异步任务，优先对齐现有 image/video/audio task 模式
- 若节点需要引用上游资源，注意 `nodeMeta.js` 中的 `refKind`

---

## 12. 如何新增界面或“新页面”

### 12.1 推荐路径：新增面板或弹层

如果需求仍属于主画布应用，不要引入前端路由。推荐做法：

1. 在 `index.html` 加对应容器 DOM
2. 在 `modules/app/appPanels.js` 或 `modules/app/appTopbarAndConfig.js` 绑定逻辑
3. 在 `styles/` 增加对应样式
4. 需要状态时使用 `uiStore` 或 `workspaceStore`

适合场景：

- 资源面板
- 设置扩展项
- 工作流详情
- 模型配置面板
- 辅助弹窗

### 12.2 如果必须新增独立 HTML 页面

只适用于：

- 文档页
- 演示页
- 独立帮助页面

做法：

1. 在根目录或 `docs/` 下新增 HTML
2. 因为后端有静态文件托管，不需要额外加前端路由
3. 若页面需要访问本地 API，继续复用 `api/requester.js`

不建议：

- 为普通功能引入单独 URL 页面
- 为主流程引入前端路由框架

---

## 13. 如何调接口

### 13.1 前端统一约定

前端调用接口时，优先使用：

- `api/requester.js`
  - `get`
  - `post`
  - `del`
  - `requester`

不要在业务模块里直接散落裸 `fetch()`，除非是非常特殊的流式或浏览器原生能力场景。

### 13.2 推荐调用分层

推荐的前端调用路径是：

业务模块 / 节点组件
-> `api/*.js` 业务 API 封装
-> `api/requester.js`
-> 本地 `/api/...`
-> Python route service

不要这样做：

业务模块
-> 直接拼很多 URL
-> 直接 fetch

### 13.3 现有请求机制特点

- 相对路径会通过 `buildApiUrl()` 自动补基址
- 在 `file:` 协议下会回退到 `http://127.0.0.1:8777`
- 已内置超时与错误解析
- 支持 `AbortSignal`
- 支持重试

### 13.4 新增前端 API 的标准步骤

1. 在 `api/` 新建或扩展对应 API 文件
2. 用 `requester.js` 的 `get/post/del` 包一层
3. 在 `api/index.js` 导出
4. 在业务模块中从 `api/index.js` 或具体 API 文件引用

### 13.5 新增后端 API 的标准步骤

1. 优先判断该接口属于哪个 route service
2. 若已有服务能承载，则直接在对应 `services/*_route_service.py` 扩展 `handle_get / handle_post / ...`
3. 若确实是新领域，再新增新的 `*_route_service.py`
4. 在 `server.py` 初始化该 service
5. 在 `services/http_route_dispatcher.py` 挂接分发逻辑
6. 如需前端调用，再在 `api/` 新增封装

### 13.6 接口设计偏好

- 本地持久化相关：优先归入 `/api/v2/projects`、`/api/v2/assets`、`/api/v2/workflows`、`/api/v2/user`
- 输出文件保存：优先复用 `/api/v2/save_output` 或 `/api/v2/save_output_from_url`
- 远程第三方调用：优先经本地代理层，不要把复杂密钥逻辑散落在前端

---

## 14. 如何新增第三方模型或服务商

通常涉及四层：

1. `modules/providers.js`
   - 增加 provider 元信息

2. `api/adapters/`
   - 如有必要新增适配器

3. `api/*Api.js`
   - 在图像/文本/视频/音频 API 中接入 provider 分支

4. 设置面板
   - 如需用户录入 API Key，在 `index.html` 和 `modules/app/appTopbarAndConfig.js` / `SettingsManager` 中接入

如果该 provider 需要本地代理或特殊签名：

- 在 Python route service 中实现代理接口
- 前端只调用本地 API

---

## 15. 测试与验证规范

### 15.1 常用命令

- `npm test`
- `npm run test:critical`
- `npm run test:e2e:smoke`

### 15.2 功能改动后的最低验证建议

#### 改 store / math / history

优先补或运行对应 `node --test`

#### 改 API 路由

至少验证：

- 前端调用是否成功
- 后端是否返回预期 JSON
- 落盘路径和字段是否正确

#### 改节点生成链路

至少验证：

- 节点创建
- 任务执行
- 结果显示
- 项目保存后再次加载恢复

#### 改媒体处理

至少验证：

- 本地文件存在
- 前端 URL 可访问
- 输出目录落盘正确

---

## 16. 重要架构事实与坑点

### 16.1 `main.js` 很重

当前 `main.js` 是装配中心，承担了很多初始化职责。

规范建议：

- 新业务不要继续堆到 `main.js`
- 优先下沉到 `modules/app/`、`components/`、`services/`

### 16.2 `services/` 目录前后端同名混放

这是项目当前的实际情况。

阅读时必须区分：

- `.js` 是前端 service
- `.py` 是后端 route service

### 16.3 大量 JS 文件是压缩/混淆后的可运行源码

这会影响可读性。

因此开发时应注意：

- 先根据文件职责定位，再做局部修改
- 尽量做小而准的改动
- 不要因为代码丑就顺手大重构

### 16.4 本项目不是“页面驱动”，而是“画布驱动”

默认新增功能的思考方式应该是：

- 它是一个节点吗？
- 它是一个面板吗？
- 它是一个画布级交互吗？

而不是先想“我要不要加一个新路由页面”。

### 16.5 本地文件路径是核心能力

这个项目强依赖：

- `user/`
- `data/uploads/`
- `output/`

排查生成结果显示问题时，优先检查：

- 后端是否已落盘
- 前端节点数据里是否拿到了 `localPath / displayLocalPath / thumbLocalPath`
- 本地 URL 是否能被 `Handler.translate_path()` 正确映射

---

## 17. 新 AI 会话的推荐阅读顺序

如果以后新开一个 AI 会话，建议按这个顺序继续补上下文：

1. 先读本文件 `docs/PROJECT_ARCHITECTURE.md`
2. 再读：
   - `README.md`
   - `index.html`
   - `main.js`
   - `server.py`
3. 若任务偏前端：
   - `src/core/`
   - `components/`
   - `modules/app/`
4. 若任务偏接口：
   - `api/`
   - `services/http_route_dispatcher.py`
   - 对应 `services/*_route_service.py`
5. 若任务偏保存/恢复：
   - `modules/app/projectLifecycle.js`
   - `services/projectService.js`
   - `api/projectsV2Api.js`
   - `services/json_file_route_service.py`

---

## 18. 给后续 AI 的执行建议

处理这个项目时，请默认遵守以下原则：

- 先判断需求属于前端画布、节点业务、API 封装还是 Python route service
- 非必要不要引入新框架
- 非必要不要引入前端路由
- 优先复用现有 store 和模块边界
- 前端调接口优先走 `api/` 封装层，不要散落裸 `fetch`
- 后端新增接口优先挂到已有 route service，而不是乱加到 `server.py`
- 变更生成结果显示问题时，同时检查：
  - 远端返回
  - 后端落盘
  - 节点字段更新
  - 本地静态映射

---

## 19. 关键文件索引

- [README.md](/private/tmp/AI-CanvasPro/README.md)
- [index.html](/private/tmp/AI-CanvasPro/index.html)
- [main.js](/private/tmp/AI-CanvasPro/main.js)
- [server.py](/private/tmp/AI-CanvasPro/server.py)
- [src/core/stores/appStore.js](/private/tmp/AI-CanvasPro/src/core/stores/appStore.js)
- [src/core/stores/legacyKernelStore.js](/private/tmp/AI-CanvasPro/src/core/stores/legacyKernelStore.js)
- [src/core/interaction.js](/private/tmp/AI-CanvasPro/src/core/interaction.js)
- [src/core/renderer.js](/private/tmp/AI-CanvasPro/src/core/renderer.js)
- [modules/app/projectLifecycle.js](/private/tmp/AI-CanvasPro/modules/app/projectLifecycle.js)
- [modules/registry.js](/private/tmp/AI-CanvasPro/modules/registry.js)
- [modules/nodeMeta.js](/private/tmp/AI-CanvasPro/modules/nodeMeta.js)
- [api/requester.js](/private/tmp/AI-CanvasPro/api/requester.js)
- [api/projectsV2Api.js](/private/tmp/AI-CanvasPro/api/projectsV2Api.js)
- [services/http_route_dispatcher.py](/private/tmp/AI-CanvasPro/services/http_route_dispatcher.py)
- [services/json_file_route_service.py](/private/tmp/AI-CanvasPro/services/json_file_route_service.py)
- [services/media_file_route_service.py](/private/tmp/AI-CanvasPro/services/media_file_route_service.py)

