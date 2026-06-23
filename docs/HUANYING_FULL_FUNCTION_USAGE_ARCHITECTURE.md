# 幻映工作台完整功能文档、最佳使用说明与产品架构

> 适用项目：`huanying-source-windows-20260430-122116`
> 文档语言：中文
> 文档目的：面向用户、运营交付、产品设计和二次开发，完整说明幻映工作台的功能、最佳使用方式和产品架构。

---

## 1. 产品总览

幻映工作台是一个本地优先的 AI 多模态无限画布创作工具。它用“节点 + 连线 + 无限画布”的方式，把文本、图片、视频、音频、素材、工作流和本地媒体处理组织到同一个可视化工作台中。

一句话概括：

```text
幻映 = 无限画布 + 多模态节点 + AI 生成 + 本地媒体处理 + 素材/工作流复用 + 本地 Python 服务
```

核心定位：

| 维度 | 说明 |
|---|---|
| 产品形态 | 浏览器打开的本地 Web 工作台 |
| 技术形态 | 原生 HTML / CSS / JavaScript ES Modules + Python 本地 HTTP 服务 |
| 主要用户 | AI 创作者、短视频/图像工作流用户、提示词工作流用户、需要可视化串联多模型的人 |
| 主要产物 | 文本、图片、视频、音频、项目画布 JSON、素材库、工作流模板 |
| 默认访问 | `http://127.0.0.1:8777/` |
| 数据原则 | 本地优先保存，远程仅在调用模型、下载远程输出或代理厂商 API 时发生 |

---

## 2. 功能全景

### 2.1 功能地图

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           幻映工作台                                  │
├─────────────────────────────────────────────────────────────────────┤
│  画布与项目                                                          │
│  ├─ 无限画布 / 缩放 / 平移 / 小地图 / 网格吸附                         │
│  ├─ 多画布 / 多项目 / 自动缓存 / Ctrl+S 保存                           │
│  └─ JSON 项目导入导出 / 拖拽项目文件恢复                               │
│                                                                     │
│  节点系统                                                            │
│  ├─ 源节点：文本 / 图片 / 视频 / 音频                                  │
│  ├─ AI 节点：文生文 / 文图生图 / 文图生视频 / 音频工作流                 │
│  ├─ 工具节点：场景检测 / 分镜 / 全景场景 / 分组 / 注释 / 调试            │
│  └─ 连线引用：上游结果进入下游输入，提示词内支持 @ 引用                  │
│                                                                     │
│  AI 与模型                                                           │
│  ├─ 文本：Gemini、OpenAI 兼容、PPIO、APIMart、RunningHub 等             │
│  ├─ 图像：GRSAI、PPIO、APIMart、RunningHub、Dreamina、注册模型           │
│  ├─ 视频：GRSAI、APIMart、RunningHub 工作流、Dreamina、Seedance Web     │
│  └─ 音频：RunningHub 音频工作流，如音色克隆、音色转换                   │
│                                                                     │
│  媒体处理                                                            │
│  ├─ 图片裁剪 / 扩图 / 任意角度 / 标注 / 抠图 / 衍生缩略图                │
│  ├─ 视频裁剪 / 合成 / 元信息 / 首帧 / 场景检测                          │
│  ├─ 音频裁剪 / 音频上传 / 音频生成                                     │
│  └─ ffmpeg / ffprobe 本地处理                                         │
│                                                                     │
│  复用体系                                                            │
│  ├─ 素材库：保存节点或媒体，按类型/标签管理，再拖回画布                 │
│  ├─ 工作流：保存一组节点连线，插入到当前画布复用                       │
│  └─ 预设：提示词片段，通过 / 菜单快速插入                              │
│                                                                     │
│  运行与治理                                                          │
│  ├─ API 设置 / 模型注册 / 订阅与 CDKEY / 更新检查                       │
│  ├─ 本地上传输出 / 远程代理 / 私网下载防护                             │
│  └─ Dreamina 登录态 / Seedance Web 桥 / SAM3 抠图服务                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 节点类型总表

| 节点类型 | 内部类型 | 主要用途 | 典型输入 | 典型输出 |
|---|---|---|---|---|
| 文本源节点 | `source-text` | 放置原始文字、剧本、需求、提示词草稿 | 手写文本、粘贴文本 | 文本内容 |
| 图片源节点 | `source-image` | 放置本地/远程图片，作为参考图、首帧、素材 | 上传图片、拖拽图片 | 图片 URL / 本地路径 |
| 视频源节点 | `source-video` | 放置视频素材，做裁剪、首帧、场景检测、视频参考 | 上传视频 | 视频 URL / 本地路径 |
| 音频源节点 | `source-audio` | 放置配音、参考音色、目标音色 | 上传音频 | 音频 URL / 本地路径 |
| AI 文本节点 | `ai-text` | 文生文、改写、总结、提示词生成、多轮文本输出 | 文本、图片引用、上游节点 | 文本结果 |
| AI 图片节点 | `ai-image` | 文生图、图生图、批量出图、参考图生成 | 提示词、参考图、比例/尺寸 | 图片结果 |
| AI 视频节点 | `ai-video` | 文生视频、图生视频、多帧/首尾帧视频 | 提示词、图片、视频参考 | 视频结果 |
| AI 音频节点 | `ai-audio` | 音频生成、音色克隆、音色转换 | 文本、参考音频、目标音频 | 音频结果 |
| 场景检测节点 | `scene-detection` | 对视频做镜头/场景切分 | 视频 | 场景片段/关键帧信息 |
| 分镜节点 | `storyboard` | 整理故事、镜头、画面段落 | 文本、图像、视频节点 | 分镜结构 |
| 全景场景节点 | `panorama-scene` | 3D/全景场景相关编辑 | 图片/场景数据 | 场景数据 |
| 360 全景节点 | `panorama-360` | 从图片创建 360 全景相关节点 | 图片 | 全景画布节点 |
| 注释节点 | `comment-note` | 记录说明、分组注释、创意备忘 | 手写文本 | 注释 |
| 分组节点 | `group` | 管理一组节点，组织画布结构 | 节点区域 | 视觉分组 |
| 调试节点 | `debug` | 开发/调试用途 | 任意 | 调试信息 |
| 测试视频节点 | `test-video` | 开发测试用视频节点 | 视频 | 测试结果 |

### 2.3 画布与交互功能

| 功能 | 说明 | 最佳用法 |
|---|---|---|
| 无限画布 | 节点可自由摆放、拖动、缩放视野 | 按“输入 → 生成 → 后处理 → 输出”从左到右排布 |
| 小地图 | 快速查看画布全局位置 | 大项目中用小地图定位主流程 |
| 网格吸附 | 让节点更整齐 | 做可复用工作流前建议开启 |
| 多画布 | 同项目下多个画布标签 | 一个项目拆成“素材准备 / 主流程 / 备选方案” |
| 选中与拖拽 | 单选/多选节点，移动节点组 | 工作流成组移动前先框选 |
| 连线 | 上游节点结果传给下游节点 | 图片源连到 AI 图片/视频节点，文本源连到提示词节点 |
| 撤销重做 | 支持常见编辑回退 | 大批移动、删除前先保存 |
| 拖拽文件 | 支持媒体和项目 JSON 导入 | 把图片/视频/音频直接拖进画布 |

---

## 3. 最佳使用说明

### 3.1 普通用户最快上手路径

```text
启动程序
  ↓
打开 http://127.0.0.1:8777/
  ↓
设置 API Key / 登录 Dreamina / 配置 RunningHub
  ↓
拖入素材或添加源节点
  ↓
添加 AI 节点
  ↓
用连线或 @ 引用把素材喂给 AI 节点
  ↓
点击生成
  ↓
满意结果保存为素材或工作流
```

推荐第一次使用按下面顺序：

| 步骤 | 操作 | 目的 |
|---|---|---|
| 1 | 先创建一个文本源节点 | 写清楚主题、风格、目标 |
| 2 | 创建 AI 文本节点 | 让模型扩写提示词或生成分镜 |
| 3 | 创建 AI 图片节点 | 用扩写后的提示词出图 |
| 4 | 创建 AI 视频节点 | 用选中的图片作为首帧/参考图生成视频 |
| 5 | 保存满意节点到素材库 | 以后复用 |
| 6 | 保存整套节点为工作流 | 下次一键插入同样结构 |

### 3.2 源码版启动

适合开发者或需要查看源码的人。

| 要求 | 建议 |
|---|---|
| Python | 3.12 或更高 |
| ffmpeg | 建议安装并加入 PATH，否则本地视频/音频处理会受限 |
| Node.js | 仅二次开发和运行前端测试需要 |

Windows 源码版最简单启动：

```bat
start_windows_dev.bat
```

该脚本会做这些事：

```text
进入项目目录
  ↓
检查 Python 3.12+
  ↓
创建 venv
  ↓
安装 requirements.txt
  ↓
检查 ffmpeg
  ↓
启动 python server.py
  ↓
打开 http://127.0.0.1:8777/
```

手动启动：

```bat
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
python server.py
```

### 3.3 EXE 版使用

适合普通用户。

| 场景 | 操作 |
|---|---|
| 启动 | 双击 `huanying-workbench-...-windows-x64-onefile.exe` |
| 打不开浏览器 | 手动访问 `http://127.0.0.1:8777/` |
| 关闭 | 关闭浏览器页面后，再关闭命令窗口 |
| 数据位置 | `%LOCALAPPDATA%\AI-CanvasPro` |
| 第一次慢 | 单文件 EXE 需要先解压资源，等待几秒到十几秒正常 |

### 3.4 API 与模型配置建议

配置入口通常在左下角头像或设置面板中。

| 能力 | 推荐配置 | 说明 |
|---|---|---|
| 文本生成 | Gemini / OpenAI 兼容 / PPIO / APIMart / RunningHub | 适合提示词、分镜、总结、改写 |
| 图片生成 | GRSAI / PPIO / APIMart / RunningHub / Dreamina / 注册模型 | 适合批量图、参考图、风格图 |
| 视频生成 | GRSAI / APIMart / RunningHub 工作流 / Dreamina / Seedance Web | 视频通常耗时更长，注意额度 |
| 音频生成 | RunningHub 工作流 | 支持音色克隆、音色转换等 |
| 自定义模型 | `config_route_service` / 模型注册表 | 可配置 OpenAI 兼容地址、Key、模型 ID |

模型记录通常包含：

| 字段 | 含义 |
|---|---|
| `modelName` | 用户可见模型名 |
| `modelId` | 实际请求模型 ID |
| `apiKey` | 模型密钥 |
| `baseUrl` | OpenAI 兼容或厂商接口地址 |
| `adapterType` | 适配器类型 |
| `status` | 当前状态 |
| `lastTestedAt` | 最近测试时间 |
| `lastError` | 最近错误 |
| `templateHints` | 模型模板提示 |

### 3.5 推荐工作流一：一句话到视频

```text
[source-text: 一句话创意]
        │
        ▼
[ai-text: 扩写成分镜/镜头提示词]
        │
        ▼
[ai-image: 生成关键画面]
        │
        ▼
[ai-video: 图生视频/文生视频]
        │
        ▼
[source-video 或素材库保存]
```

建议：

| 阶段 | 最佳做法 |
|---|---|
| 文本阶段 | 先让 AI 文本节点生成清晰镜头描述 |
| 图片阶段 | 选择最满意的一张作为视频首帧 |
| 视频阶段 | 优先短时长测试，满意后再提高质量 |
| 复用阶段 | 保存为工作流，下次替换第一段文本即可 |

### 3.6 推荐工作流二：角色/场景一致性

```text
[source-image: 角色参考] ─┐
                         ├─► [ai-image: 生成同角色新画面]
[source-text: 场景描述] ──┘
                                  │
                                  ▼
                         [ai-video: 生成动态片段]
```

建议：

| 要点 | 说明 |
|---|---|
| 参考图 | 尽量选择清晰正面或有辨识度图片 |
| 提示词 | 固定角色特征、服装、场景、镜头语言 |
| 批量出图 | 先批量生成，挑选最稳定结果 |
| 视频生成 | 使用选中图片作为首帧或参考图 |

### 3.7 推荐工作流三：素材库驱动创作

```text
导入常用角色 / 场景 / 音色
        ↓
保存到素材库并打标签
        ↓
新项目中从素材库拖回画布
        ↓
连接 AI 节点生成新内容
```

素材库适合保存：

| 素材类型 | 示例 |
|---|---|
| 文本 | 品牌语气、角色设定、固定提示词 |
| 图片 | 角色参考、场景参考、风格图 |
| 视频 | 参考片段、成片、镜头素材 |
| 音频 | 参考音色、旁白、音乐 |
| 节点组 | 一小段常用生成链路 |

### 3.8 工作流、预设、素材的区别

| 概念 | 保存内容 | 使用方式 | 适合场景 |
|---|---|---|---|
| 素材 | 媒体、文本、节点或节点组 | 从素材库拖回画布 | 复用角色图、音色、成片、提示词 |
| 工作流 | 一组节点、连线、视口、封面、标签、说明 | 插入到当前画布中心附近 | 复用完整创作流程 |
| 预设 | 提示词片段或模板 | 在提示词框输入 `/` 插入 | 快速套用固定提示词结构 |

注意：

```text
工作流不会替换当前画布，而是复制一份节点结构插入当前画布。
预设只影响提示词输入，不等于节点工作流。
素材可以是单个媒体，也可以包含节点结构。
```

---

## 4. 完整产品架构

### 4.1 总体架构

```text
┌───────────────────────────────────────────────────────────────────────┐
│                         用户浏览器 / 本地 UI                            │
│                                                                       │
│  index.html                                                           │
│    ├─ modules/providers.js                                             │
│    ├─ modules/storage.js                                               │
│    ├─ modules/project.js                                               │
│    └─ main.js                                                          │
│         ├─ 注册节点组件                                                 │
│         ├─ 初始化 renderer / interaction / store                       │
│         ├─ 初始化设置、素材、工作流、小地图、更新                         │
│         └─ 绑定项目生命周期、全局事件、快捷键                            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTP / JSON / 文件上传
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         Python 本地服务 server.py                       │
│                                                                       │
│  SimpleHTTPRequestHandler + ThreadingTCPServer                         │
│    └─ services/http_route_dispatcher.py                                │
│         ├─ 配置与模型注册                                                │
│         ├─ 项目/素材/工作流 JSON 持久化                                  │
│         ├─ 媒体上传、输出保存、缩略图衍生                                  │
│         ├─ 本地音视频处理 ffmpeg/ffprobe                                  │
│         ├─ 远程厂商代理与 RunningHub 工作流                               │
│         ├─ Dreamina 登录与生成                                            │
│         ├─ SAM3 抠图服务                                                  │
│         ├─ 订阅/CDKEY/授权                                                │
│         └─ 运行状态、心跳、更新                                            │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
        ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
        │ 本地文件系统  │ │ 本地模型/工具 │ │ 外部 AI/厂商 API │
        │ user/data/...│ │ ffmpeg/SAM3   │ │ GRSAI/PPIO/...  │
        └──────────────┘ └──────────────┘ └─────────────────┘
```

### 4.2 前端分层

```text
frontend
├─ index.html
├─ main.js
│  ├─ 应用启动入口
│  ├─ 注册节点组件
│  ├─ 初始化画布渲染、交互、状态、面板
│  └─ 动态加载素材库与工作流管理器
│
├─ src/core/
│  ├─ renderer.js                 画布渲染
│  ├─ interaction.js              指针、连线、拖拽、缩放
│  ├─ math.js                     坐标、命中测试、ID
│  ├─ generationRunController.js  生成任务运行控制
│  └─ stores/                     graph/ui/workspace/runtime 状态
│
├─ components/
│  ├─ SourceTextNode.js
│  ├─ SourceImageNode.js
│  ├─ SourceVideoNode.js
│  ├─ SourceAudioNode.js
│  ├─ AIGenTextNode.js
│  ├─ AIGenerateNode.js
│  ├─ AIGenVideoNode.js
│  ├─ AIGenAudioNode.js
│  ├─ SceneDetectionNode.js
│  ├─ StoryboardNode.js
│  └─ PanoramaSceneNode.js
│
├─ modules/
│  ├─ app/                        应用级事件、面板、项目生命周期
│  ├─ settings/                   设置模块
│  ├─ workflows/                  工作流保存、预览、应用
│  ├─ AssetManager.js             素材库
│  ├─ ProjectManager.js           项目管理
│  ├─ CanvasTabManager.js         多画布
│  ├─ Image*Controller.js         图片工具
│  ├─ Video*Controller.js         视频工具
│  ├─ AudioClipController.js      音频裁剪
│  ├─ modelRegistryService.js     模型注册表
│  └─ subscriptionAccess.js       授权状态
│
└─ api/
   ├─ aiTextApi.js
   ├─ aiImageApi.js
   ├─ aiVideoApi.js
   ├─ aiAudioApi.js
   ├─ configApi.js
   ├─ projectsV2Api.js
   ├─ runninghubWorkflowApi.js
   ├─ dreaminaGenApi.js
   ├─ seedanceWebApi.js
   └─ subscriptionApi.js
```

### 4.3 后端分层

```text
backend
├─ server.py
│  ├─ 静态文件服务
│  ├─ API 请求入口
│  └─ ThreadingTCPServer
│
└─ services/
   ├─ http_route_dispatcher.py
   │  └─ 按路径把请求分发给各 RouteService
   │
   ├─ config_route_service.py
   │  └─ /api/config, /api/v2/config/custom-ai
   │
   ├─ json_file_route_service.py
   │  └─ 项目、素材、工作流、用户 JSON 持久化
   │
   ├─ media_file_route_service.py
   │  └─ 上传、输出保存、远程输出本地化、缩略图
   │
   ├─ local_media_processing_route_service.py
   │  └─ 视频裁剪、音频裁剪、视频合成、元信息、首帧
   │
   ├─ remote_proxy_route_service.py
   │  └─ 厂商 API 代理、RunningHub 工作流代理
   │
   ├─ dreamina_route_service.py
   │  └─ Dreamina 登录、状态、生成、查询、退出
   │
   ├─ sam3_route_service.py / sam3_service.py
   │  └─ SAM3 抠图准备与分割
   │
   ├─ subscription_gate_service.py
   │  └─ 授权、订阅、CDKEY、受保护模型门禁
   │
   ├─ hot_update_service.py
   │  └─ 更新检查、本地预览、应用更新
   │
   └─ runtime_paths.py
      └─ 源码版 / onedir / onefile 的资源与可写目录解析
```

### 4.4 启动链路

```text
源码版：

start_windows_dev.bat
  │
  ├─ 检查 Python 3.12+
  ├─ 创建 venv
  ├─ pip install -r requirements.txt
  ├─ 检查 ffmpeg
  ├─ python server.py
  └─ 浏览器打开 127.0.0.1:8777

EXE onefile：

huanying-workbench.exe
  │
  ├─ 解压运行资源
  ├─ 计算 resourceRoot / writableRoot
  ├─ 启动本地 HTTP 服务
  ├─ 打开浏览器
  └─ 数据写入 %LOCALAPPDATA%\AI-CanvasPro
```

### 4.5 数据与目录架构

源码版默认可写目录是项目根目录；onefile 版默认是 `%LOCALAPPDATA%\AI-CanvasPro`。

```text
writableRoot
├─ user/
│  ├─ config.json                 API 与模型配置
│  ├─ settings.json               用户设置
│  ├─ prompt-presets.json         用户提示词预设
│  └─ Canvas Project/             项目画布 JSON
│
├─ data/
│  ├─ uploads/                    上传文件
│  ├─ assets/                     素材库
│  │  └─ thumbs/                  素材缩略图
│  └─ workflows/                  工作流 JSON
│     └─ thumbs/                  工作流封面
│
└─ output/                        AI 输出、本地处理结果
```

### 4.6 主要 API 路由地图

| 类别 | 路由 | 用途 |
|---|---|---|
| 运行状态 | `/api/v2/runtime/info` | 查询运行模式、版本、开发模式 |
| 心跳 | `/api/v2/heartbeat_stream` | 服务连接状态 |
| 更新 | `/api/v2/update/check` | 检查更新 |
| 更新 | `/api/v2/update/local-preview` | 本地更新预览 |
| 更新 | `/api/v2/update/apply` | 应用更新 |
| 授权 | `/api/v2/subscription/status` | 查询订阅/CDKEY 状态 |
| 授权 | `/api/v2/subscription/activate` | 激活 CDKEY |
| 配置 | `/api/config` | 读写基础 API 配置 |
| 模型注册 | `/api/v2/config/custom-ai` | 自定义 AI 模型配置 |
| 项目 | `/api/v2/projects` | 项目列表 |
| 项目 | `/api/v2/projects/{file}` | 读取项目 |
| 项目 | `/api/v2/projects/save` | 保存项目 |
| 素材 | `/api/v2/assets` | 素材列表 |
| 素材 | `/api/v2/assets/save` | 保存素材 |
| 工作流 | `/api/v2/workflows` | 工作流列表 |
| 工作流 | `/api/v2/workflows/save` | 保存工作流 |
| 用户 JSON | `/api/v2/user/*.json` | 用户级 JSON 数据 |
| 上传 | `/api/upload` | 上传媒体文件 |
| 输出 | `/api/v2/save_output` | 保存输出文件 |
| 输出 | `/api/v2/save_output_from_url` | 从远程 URL 保存输出 |
| 图片衍生 | `/api/v2/images/derivatives/ensure` | 确保显示图/缩略图 |
| 视频处理 | `/api/v2/video/cut` | 本地裁剪视频 |
| 音频处理 | `/api/v2/audio/cut` | 本地裁剪音频 |
| 视频处理 | `/api/v2/video/compose` | 合成视频 |
| 视频处理 | `/api/v2/video/meta` | 读取视频元信息 |
| 视频处理 | `/api/v2/video/first_frame` | 提取首帧 |
| 代理 | `/api/v2/proxy/task` | 通用任务代理 |
| 代理 | `/api/v2/proxy/upload` | 远程上传代理 |
| RunningHub | `/api/v2/runninghubwf/run` | 运行工作流 |
| RunningHub | `/api/v2/runninghubwf/query` | 查询工作流 |
| RunningHub | `/api/v2/runninghubwf/cancel` | 取消工作流 |
| Dreamina | `/api/v2/dreamina/status` | 登录/运行状态 |
| Dreamina | `/api/v2/dreamina/login/runtime` | 运行时登录 |
| Dreamina | `/api/v2/dreamina/login/web` | Web 登录 |
| Dreamina | `/api/v2/dreamina/login/import` | 导入登录态 |
| Dreamina | `/api/v2/dreamina/logout` | 退出登录 |
| Dreamina | `/api/v2/dreamina/query_result` | 查询生成结果 |
| Dreamina | `/api/v2/dreamina/text2image` 等 | 图像/视频生成 |
| SAM3 | `/api/v2/matting/sam3/info` | SAM3 状态 |
| SAM3 | `/api/v2/matting/sam3/prepare` | 准备模型 |
| SAM3 | `/api/v2/matting/sam3/segment` | 抠图分割 |
| Seedance Web | `/api/v2/seedance-web/*` | 海外 Seedance Web 桥相关 |

### 4.7 AI 生成链路

```text
用户点击 AI 节点生成
  │
  ▼
节点组件收集输入
  ├─ prompt
  ├─ @ 引用的上游节点结果
  ├─ 参考图片/视频/音频
  ├─ 模型、比例、尺寸、时长、批量数
  └─ 当前项目 ID
  │
  ▼
前端 api/ai*Api.js
  ├─ 选择 provider
  ├─ 处理输入媒体上传
  ├─ 构造厂商请求
  └─ 调用本地后端代理
  │
  ▼
Python 本地服务
  ├─ 校验配置 / 授权
  ├─ 代理远程请求
  ├─ 轮询异步任务
  ├─ 下载远程输出到本地
  └─ 生成缩略图 / 衍生图
  │
  ▼
前端节点更新
  ├─ 成功：显示结果并写入节点状态
  ├─ 失败：显示错误、保留重试信息
  └─ 异步：保存 taskId，支持恢复
```

### 4.8 图片生成 provider 路由

```text
aiImageApi.generateImage(payload)
  │
  ├─ provider = dreamina
  │    └─ /api/v2/dreamina/text2image 或 image2image
  │
  ├─ provider = ppio
  │    └─ PPIO Adapter
  │
  ├─ provider = apimart
  │    └─ APIMart Adapter
  │
  ├─ provider = runninghub / runninghubwf
  │    └─ RunningHub Adapter / 工作流查询
  │
  ├─ provider = registry-openai
  │    └─ 自定义 OpenAI 兼容模型注册表
  │
  └─ 默认 grsai
       └─ /api/v2/proxy/image
```

### 4.9 视频生成 provider 路由

```text
aiVideoApi.generateVideo(payload)
  │
  ├─ Seedance Web 条件命中
  │    └─ seedanceWebVideoBridge
  │
  ├─ Dreamina 视频模型
  │    └─ dreaminaGenApi
  │
  ├─ RunningHub 工作流
  │    └─ /api/v2/runninghubwf/run + query
  │
  ├─ APIMart
  │    └─ APIMartAdapter.buildVideoRequest
  │
  └─ GRSAI
       └─ /v1/draw/nano-video 代理
```

### 4.10 工作流保存与应用

```text
保存工作流：

选中一组节点
  ↓
收集 nodes / edges / viewport / cover / tags / note
  ↓
生成 workflow JSON
  ↓
POST /api/v2/workflows/save
  ↓
写入 data/workflows/*.json
  ↓
封面写入 data/workflows/thumbs/

应用工作流：

打开工作流面板
  ↓
选择工作流
  ↓
读取 workflow JSON
  ↓
重新映射 nodeId / edgeId
  ↓
插入到当前画布中心附近
  ↓
选中新插入节点
```

工作流元数据建议：

| 字段 | 建议 |
|---|---|
| 名称 | 50 字以内，说明用途 |
| 标签 | 最多 5 个，每个 12 字以内 |
| 说明 | 300 字以内，写明输入、输出、注意事项 |
| 封面 | 选择最能代表该工作流结果的图或节点截图 |

### 4.11 素材保存与恢复

```text
保存素材：

选中节点或媒体
  ↓
提取节点数据 / 媒体 URL / 缩略图 / 标签
  ↓
POST /api/v2/assets/save
  ↓
写入 data/assets/

恢复素材：

素材库点击添加
  ↓
复制素材节点/媒体
  ↓
重新映射 ID
  ↓
插入画布
  ↓
选中新增节点
```

### 4.12 本地媒体处理链路

```text
前端控制器
  ├─ ImageCropController
  ├─ ImageMattingController
  ├─ VideoClipController
  ├─ VideoComposeController
  └─ AudioClipController
        │
        ▼
本地 API
  ├─ /api/v2/video/cut
  ├─ /api/v2/audio/cut
  ├─ /api/v2/video/compose
  ├─ /api/v2/video/meta
  └─ /api/v2/video/first_frame
        │
        ▼
本地工具
  ├─ ffmpeg
  ├─ ffprobe
  ├─ pillow/opencv
  └─ scenedetect
        │
        ▼
output/ 或 data/uploads/
```

### 4.13 订阅与受保护能力

```text
用户选择受保护模型/工作流
  │
  ▼
前端 subscriptionAccess 检查
  │
  ├─ 已激活：继续
  │
  └─ 未激活：弹出 CDKEY/授权面板
          │
          ▼
    /api/v2/subscription/activate
          │
          ▼
    本地/远程授权状态同步
```

典型用途：

| 能力 | 门禁原因 |
|---|---|
| VIP 模型 | 控制高级模型调用 |
| RunningHub 受保护视频工作流 | 控制高成本视频能力 |
| Seedance/Dreamina 特殊能力 | 依赖账号、区域或登录态 |

### 4.14 安全边界

| 边界 | 设计 |
|---|---|
| 本地优先 | 项目、素材、工作流、设置默认保存在本机 |
| API Key | 保存于用户配置，前端通过本地服务代理使用 |
| 远程下载 | 后端保存远程输出时有私网/不安全地址防护 |
| 异步任务 | taskId 写回节点状态，便于恢复，不直接暴露复杂厂商响应 |
| 订阅门禁 | 受保护模型和工作流需要授权 |
| 本地处理 | ffmpeg/SAM3 等在本地执行，不需要上传到第三方 |

---

## 5. 已实现、进行中与规划能力判定

本表根据当前源码与文档可见内容整理。

| 能力 | 状态 | 说明 |
|---|---|---|
| 无限画布、节点、连线、缩放、拖拽 | 已实现 | 核心工作台能力 |
| 源节点与 AI 文本/图片/视频/音频节点 | 已实现 | 组件和 API 均存在 |
| 项目保存、加载、自动缓存 | 已实现 | `projectLifecycle` 与 `/api/v2/projects` |
| 素材库 | 已实现 | `AssetManager.js` 与 `/api/v2/assets` |
| 工作流库 | 已实现 | `WorkflowManager.js` 与 `/api/v2/workflows` |
| 提示词预设 `/` 菜单 | 已实现 | `promptPresets.js` / `slashMenu.js` |
| 多 provider 图片生成 | 已实现 | GRSAI、PPIO、APIMart、RunningHub、Dreamina、注册模型 |
| 多 provider 视频生成 | 已实现 | GRSAI、APIMart、RunningHub、Dreamina、Seedance Web 桥 |
| RunningHub 音频工作流 | 已实现 | 音色克隆、音色转换相关逻辑存在 |
| 本地视频/音频裁剪、视频合成 | 已实现 | 依赖 ffmpeg |
| SAM3 抠图 | 已实现/依赖环境 | 路由和服务存在，模型准备依赖环境 |
| Seedance Web 海外桥 | 阶段性实现 | 登录/状态/重置能力明确；队列/页面自动化部分按文档仍是后续阶段 |
| Claw Code Assistant | 文档/协议/历史任务较多，当前代码树未见完整主实现 | 不应在交付中当成稳定主功能宣传 |
| LLM Wiki 集成 | 规划/阶段性文档能力 | 当前更像文档化方案与部分历史计划，不是主线已完成功能 |

---

## 6. 面向不同角色的最佳实践

### 6.1 创作者

| 目标 | 建议 |
|---|---|
| 快速出图 | 用文本源节点写需求，再接 AI 图片节点 |
| 做视频 | 先生成稳定关键帧，再图生视频 |
| 做系列内容 | 固定角色参考图、场景提示词和比例 |
| 提升复用 | 每条成熟链路保存为工作流 |
| 降低成本 | 低分辨率/短时长先试，满意后再高质量生成 |

### 6.2 工作流设计者

| 目标 | 建议 |
|---|---|
| 让别人容易用 | 输入节点放最左边，输出节点放最右边 |
| 让结构清晰 | 用注释节点标明“输入区 / 生成区 / 输出区” |
| 降低误操作 | 不把测试节点混在正式工作流里 |
| 提高可迁移性 | 少依赖个人本地绝对路径，多使用上传后的相对路径 |
| 便于检索 | 工作流命名、标签、说明写清楚 |

### 6.3 二次开发者

| 目标 | 入口 |
|---|---|
| 新增节点类型 | `components/` + `modules/registry.js` + `main.js` 注册 |
| 新增 provider | `api/adapters/` 或 `api/ai*Api.js` provider 分支 |
| 新增后端路由 | `services/http_route_dispatcher.py` 下挂 RouteService |
| 新增设置项 | `modules/settings/` 与 `SettingsManager.js` |
| 新增媒体处理 | 前端 Controller + 后端 local media route |
| 新增工作流字段 | `modules/workflows/` 与 JSON 持久化服务 |

---

## 7. 故障排查

| 问题 | 可能原因 | 处理 |
|---|---|---|
| 页面打不开 | 服务未启动、端口被占用、浏览器未自动打开 | 手动访问 `http://127.0.0.1:8777/`，或重启程序 |
| 本地视频处理失败 | 未安装 ffmpeg 或未加入 PATH | 安装 ffmpeg 并加入 PATH |
| 生成失败：API Key 未配置 | 对应 provider 未填 Key | 到设置中配置 API Key |
| 视频生成很慢 | 视频模型异步任务耗时长 | 保持页面打开，等待轮询结果 |
| 远程输出保存失败 | URL 不可访问、私网地址被拦截、厂商返回异常 | 重新生成或手动下载后拖入画布 |
| Dreamina 失败 | 登录态失效、区域/账号限制 | 重新登录或检查账号权限 |
| RunningHub 工作流失败 | Key、工作流 ID、节点参数或授权问题 | 检查 RunningHub 配置和订阅状态 |
| EXE 第一次启动慢 | onefile 解压资源 | 等待几秒到十几秒 |
| 只关浏览器程序还在 | 本地服务窗口仍运行 | 关闭命令窗口 |

---

## 8. 产品架构速查表

| 架构层 | 关键文件/目录 | 职责 |
|---|---|---|
| 页面入口 | `index.html`, `main.js` | 加载应用、注册节点、启动画布 |
| 渲染核心 | `src/core/renderer.js` | 节点画布渲染 |
| 交互核心 | `src/core/interaction.js` | 拖拽、连线、缩放、右键 |
| 状态核心 | `src/core/stores/` | 图、UI、工作区、运行状态 |
| 节点组件 | `components/` | 各类源节点和 AI 节点 |
| 业务模块 | `modules/` | 设置、项目、素材、工作流、媒体工具 |
| 前端 API | `api/` | 文本/图片/视频/音频生成和后端调用 |
| 后端入口 | `server.py` | 本地 HTTP 服务 |
| 路由分发 | `services/http_route_dispatcher.py` | API 路由派发 |
| JSON 持久化 | `services/json_file_route_service.py` | 项目、素材、工作流、用户 JSON |
| 媒体持久化 | `services/media_file_route_service.py` | 上传、输出保存、缩略图 |
| 本地处理 | `services/local_media_processing_route_service.py` | ffmpeg/ffprobe 相关 |
| 远程代理 | `services/remote_proxy_route_service.py` | 厂商 API、RunningHub |
| 特殊集成 | `services/dreamina_route_service.py`, `services/sam3_route_service.py` | Dreamina、SAM3 |
| 路径管理 | `services/runtime_paths.py` | source/onedir/onefile 数据路径 |

---

## 9. 最推荐的使用范式

最终建议把幻映当作“可视化 AI 创作操作台”，而不是单个生成器。

```text
不要只用一个 AI 节点反复试：

    [ai-image]

更推荐形成可复用链路：

    [source-text: 主题]
          ↓
    [ai-text: 扩写提示词/分镜]
          ↓
    [ai-image: 批量关键帧]
          ↓
    [ai-video: 动态生成]
          ↓
    [素材库/工作流保存]
```

最佳实践总结：

| 原则 | 说明 |
|---|---|
| 先结构，后生成 | 先把节点和连线搭好，再逐步生成 |
| 先低成本试错 | 图片先小批量，视频先短时长 |
| 输入输出分区 | 画布左侧放输入，中间放生成，右侧放结果 |
| 把好结果沉淀 | 好提示词存预设，好素材存素材库，好流程存工作流 |
| 模型配置留痕 | 工作流说明里写清楚推荐 provider、比例、尺寸和时长 |

---

## 10. 一页架构摘要

```text
┌────────────────────────────────────────────────────────────────────┐
│                            幻映工作台                               │
├────────────────────────────────────────────────────────────────────┤
│ 用户层：创作者 / 工作流设计者 / 二次开发者                           │
├────────────────────────────────────────────────────────────────────┤
│ 产品层：无限画布 / 多模态节点 / 连线引用 / 素材库 / 工作流 / 预设      │
├────────────────────────────────────────────────────────────────────┤
│ 前端层：原生 JS ES Modules                                           │
│   main.js + src/core + components + modules + api                    │
├────────────────────────────────────────────────────────────────────┤
│ 服务层：Python 本地 HTTP                                             │
│   server.py + http_route_dispatcher + RouteService                   │
├────────────────────────────────────────────────────────────────────┤
│ 能力层：模型代理 / 本地媒体处理 / Dreamina / RunningHub / SAM3         │
├────────────────────────────────────────────────────────────────────┤
│ 存储层：user / data / output                                         │
│   项目 JSON、素材、工作流、上传文件、输出文件、设置                    │
└────────────────────────────────────────────────────────────────────┘
```
