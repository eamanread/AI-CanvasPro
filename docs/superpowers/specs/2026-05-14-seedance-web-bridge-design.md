# 海外版 Seedance 扩展桥接入设计

日期：2026-05-14

## 背景

当前工作台里的即梦接入主要依赖国内版 `dreamina.exe` CLI。现有登录、生成、查询结果都通过 `DreaminaCliService` 调用 CLI 完成。国内版链路已经可用，本设计不改动国内版 CLI 链路。

海外版 Dreamina/CapCut 暂无可用 CLI 暴露，因此不能沿用现有 CLI 登录和提交逻辑。桌面目录 `Seedance2-Chrome-Extensions-master` 是一套 Chrome 扩展自动化工具，可以在网页中完成上传参考图、填写提示词、点击生成、轮询结果、上传产物等操作。本设计目标是把它以可拔插方式接入工作台，作为海外版视频生成通道。

二维码登录本期不纳入范围。国内版 CLI 当前也不依赖二维码能力，本期只处理网页登录与长期复用登录态。

## 目标

1. 保持国内版即梦 CLI 逻辑不变。
2. 新增海外版 Seedance 网页扩展桥，作为独立 provider。
3. 用户在设置页点击“海外版”后，登录、状态、生成都切换到海外版接口。
4. 用户第一次登录海外版后，浏览器 profile 可长期复用。
5. 扩展桥可拔插：后续可以禁用、删除、替换为纯 Playwright 实现，不牵连国内版和其他节点功能。
6. 打包 EXE 时能带上扩展资源和必要浏览器运行能力。

## 非目标

1. 本期不做二维码登录。
2. 本期不把海外版塞进 `DreaminaCliService`。
3. 本期不修改国内版即梦 CLI 的登录、生成、查询逻辑。
4. 本期不把扩展做成用户手动安装的 Chrome 插件。
5. 本期不承诺绕过海外版网站验证码、风控或平台限制；遇到验证码由用户在浏览器中手动处理。

## 总体方案

新增一个独立集成模块：

```text
integrations/
└─ seedance_extension_bridge/
   ├─ extension/              # 内置 Seedance2 Chrome 扩展代码
   ├─ bridge_service.py       # 海外版扩展桥服务
   ├─ task_store.py           # 任务队列与状态存储
   ├─ browser_launcher.py     # 启动 Chromium 并加载扩展
   ├─ models.py               # 任务数据结构
   └─ README.md               # 中文说明
```

工作台主逻辑只通过 provider 接口访问它，不直接依赖扩展内部文件。

```text
视频节点
  ↓
统一视频生成 API
  ↓
provider 判断
  ├─ dreamina      → 国内版 Dreamina CLI
  └─ seedance_web  → 海外版 Seedance 扩展桥
```

## UI 设计

现有设置 UI 可以沿用：

```text
版本区域
[ 国内版 ] [ 海外版 ]
```

切换行为：

- 选择“国内版”：继续请求 `/api/v2/dreamina/*`。
- 选择“海外版”：请求 `/api/v2/seedance-web/*`。

按钮行为：

- “网页登录”：当前选择国内版时走国内 CLI web 登录；当前选择海外版时启动内置 Chromium + 扩展，打开海外 Dreamina 登录页。
- “扫码登录”：本期不处理。可以先隐藏或置灰，避免误导。
- “退出登录”：按当前选择的版本分别退出，不混用登录状态。

文案建议：

- 海外版提示：“海外版登录会打开 Dreamina/CapCut 页面，请确认 VPN 可用。”
- 登录态失效时提示：“海外版登录已失效，请重新登录。”

## 后端接口

新增独立路由前缀：

```text
/api/v2/seedance-web/status
/api/v2/seedance-web/login
/api/v2/seedance-web/logout
/api/v2/seedance-web/tasks
/api/v2/seedance-web/query_result
/api/v2/seedance-web/files/upload
```

扩展内部需要兼容任务桥接口。推荐让扩展的 API Base 指向：

```text
http://127.0.0.1:8777/api/v2/seedance-web/bridge
```

桥接兼容接口：

```text
GET  /api/v2/seedance-web/bridge/api/events?clientId=xxx
GET  /api/v2/seedance-web/bridge/api/tasks/pending?clientId=xxx
POST /api/v2/seedance-web/bridge/api/tasks/ack
POST /api/v2/seedance-web/bridge/api/tasks/status
GET  /api/v2/seedance-web/bridge/api/tasks/release?taskCode=xxx
POST /api/v2/seedance-web/bridge/api/files/upload
```

这样可以少改扩展代码，同时避免再启动它原来的 `mock-server.js`。

## 数据与存储隔离

海外版所有数据放在独立目录：

```text
user_data/
└─ seedance_web/
   ├─ profile/          # 海外版 Chromium 登录态
   ├─ tasks.json        # 任务状态
   ├─ files/            # 生成结果或上传文件
   └─ config.json       # 海外版扩展桥配置
```

影响说明：

- 清理普通 Chrome 缓存通常不会影响该 profile。
- 删除工作台 `user_data/seedance_web/profile` 会导致海外版需要重新登录。
- 海外版网站 cookie 自己过期时，也需要重新登录。
- 换电脑后需要重新登录。

## 登录流程

1. 用户在设置页选择“海外版”。
2. 点击“网页登录”。
3. 后端调用 `SeedanceWebBridgeService.start_login()`。
4. `browser_launcher.py` 启动 Chromium：

```text
--load-extension=<seedance extension dir>
--disable-extensions-except=<seedance extension dir>
--user-data-dir=<user_data/seedance_web/profile>
```

5. 浏览器打开海外 Dreamina/CapCut 登录页。
6. 用户手动登录。
7. 登录完成后 profile 自动保存。
8. 后端状态接口通过页面探测或浏览器会话状态判断登录是否可用。

## 生成流程

1. 视频节点选择海外版 provider。
2. 前端提交任务到 `/api/v2/seedance-web/tasks`。
3. 后端把工作台视频请求转换为扩展任务格式：

```json
{
  "taskCode": "SDW-...",
  "prompt": "生成提示词",
  "description": "任务描述",
  "modelConfig": {
    "model": "Seedance 2.0 Fast",
    "referenceMode": "全能参考",
    "aspectRatio": "16:9",
    "duration": "5s"
  },
  "referenceFiles": [
    {
      "fileName": "图片1",
      "base64": "data:image/png;base64,...",
      "fileType": "image/png"
    }
  ],
  "realSubmit": true,
  "status": "pending"
}
```

4. 扩展通过 SSE 或 pending 接口领取任务。
5. 扩展在海外 Dreamina 页面上传素材、填写提示词、提交生成。
6. 扩展找到生成结果后上传到 `/api/v2/seedance-web/bridge/api/files/upload`。
7. 后端保存产物，并把任务状态转为 `completed`。
8. 前端节点通过 query/poll 拿到视频结果。

## 可拔插边界

主项目只注册一个 provider：

```text
seedance_web
```

主项目不直接访问：

- 扩展 `content.js`
- 扩展 `panel.js`
- 扩展 `manifest.json`
- 浏览器启动细节
- 任务队列内部结构

主项目只依赖稳定接口：

```text
start_login()
logout()
get_status()
submit_video_task()
query_task()
cancel_task()
```

如果后续要替换为纯 Playwright，只需要替换 `integrations/seedance_extension_bridge` 内部实现，保留外部接口即可。

## 扩展改造点

`Seedance2-Chrome-Extensions-master` 需要做最小改造：

1. `manifest.json` 增加海外版域名：

```text
https://dreamina.capcut.com/*
https://www.dreamina.ai/*
```

2. 默认 API Base 改为工作台本地服务。
3. 页面路径从国内即梦页面适配到海外 Dreamina 页面。
4. 选择器适配海外版页面。
5. 面板 UI 可以保留，但正式运行时不要求用户手动操作面板。
6. 移除或禁用扩展自带 `mock-server.js` 在正式流程中的依赖。

## 打包设计

打包时需要包含：

```text
integrations/seedance_extension_bridge/extension/
```

扩展运行时必须是一个真实目录。若使用 onefile EXE，需要启动时把扩展释放到可访问目录，例如：

```text
user_data/seedance_web/runtime_extension/
```

浏览器策略：

1. 优先使用随包 Chromium。
2. 如果随包 Chromium 不存在，再尝试系统 Chrome/Edge。
3. 最后允许用户手动配置浏览器路径。

## 错误处理

海外版常见错误需要转换成用户能理解的提示：

- 未登录：提示重新登录海外版。
- VPN 不可用：提示检查 VPN。
- 页面结构变化：提示海外版页面适配失效，需要更新。
- 任务超时：提示生成超时，可重试。
- 上传失败：提示素材上传失败。
- 未找到结果：提示未在历史记录中找到对应任务结果。

错误状态需要保存在任务状态里，不只做短暂 toast。

## 测试范围

第一阶段测试：

1. 国内版 CLI 登录与生成不受影响。
2. 切换海外版后不调用 `/api/v2/dreamina/*`。
3. 海外版登录能打开独立 profile 浏览器。
4. 重启工作台后海外版 profile 仍能复用。
5. 扩展能连接工作台 bridge 接口。
6. 任务状态能从 `pending` 走到 `completed` 或 `failed`。
7. 生成结果能回写到视频节点。
8. 打包 EXE 后扩展目录能正确释放并被 Chromium 加载。

## 分阶段实现建议

### 阶段一：骨架与可拔插边界

- 新增 `seedance_web` provider。
- 新增后端路由和空实现。
- UI 切换海外版时调用新接口。
- 国内版接口保持不变。

### 阶段二：内置扩展与登录

- 将扩展纳入 `integrations/seedance_extension_bridge/extension/`。
- 实现浏览器启动和独立 profile。
- 跑通海外版网页登录长期复用。

### 阶段三：任务桥

- 实现兼容扩展的任务接口。
- 扩展能从工作台领取任务并回传状态。
- 先用模拟任务验证链路。

### 阶段四：海外版页面适配

- 适配海外版页面选择器。
- 跑通上传、填词、提交、找结果、上传结果。

### 阶段五：打包与回归

- 加入 EXE 打包资源。
- 验证 clean 环境首次登录与二次复用。
- 回归国内版即梦、普通视频节点、图片/文本/音频节点。


## 推荐结论

采用“海外版 Seedance 扩展桥”作为可拔插集成模块。国内版继续走现有 CLI；海外版独立走 Chromium + 扩展 + profile。设置页 UI 可以沿用当前“国内版 / 海外版”切换方式，但海外版必须调用独立 `/api/v2/seedance-web/*` 接口，不能继续复用国内版 `DreaminaCliService`。
