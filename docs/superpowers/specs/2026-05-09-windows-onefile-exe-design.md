# Windows Onefile EXE Design

**Goal**

为当前项目提供一个面向 Windows 普通用户的单文件 `exe` 发布方式，双击即可启动本地服务并自动打开浏览器，同时补齐一份真正给小白看的使用说明。

**Context**

仓库已经具备 Windows 单文件发布的基础设施：

- `tools/build_windows_onefile.py` 已经定义了 PyInstaller onefile 构建流程
- `packaging/windows_onefile_launcher.py` 已经负责启动本地服务并自动打开浏览器
- `docs/RELEASE_WINDOWS_ONEFILE.md` 已有开发向打包说明

当前缺口不是底层能力，而是“普通人如何一键打包、如何一键使用”的最后一层包装。

## Scope

本次只做以下内容：

1. 提供一个适合 Windows 本机双击执行的打包脚本
2. 复用现有 onefile 构建链路生成单文件 `exe`
3. 输出明确的发布产物位置
4. 新增一份小白使用文档，覆盖启动、关闭、常见问题、数据位置

本次不做以下内容：

1. 不改为安装包
2. 不改应用架构
3. 不引入 Electron、Tauri 或新的桌面壳
4. 不重做现有开发文档

## Approach Options

### Option A: 继续使用现有 PyInstaller onefile 流程，并补一层 Windows 友好入口

这是推荐方案。

优点：

- 与当前仓库结构完全一致
- 改动小，风险低
- 最接近用户要的“双击一个 exe 就能用”
- 后续继续发布也简单

缺点：

- 首次启动仍然是“本地服务 + 浏览器”模式，不是真正原生桌面 UI

### Option B: 输出便携文件夹版

优点：

- 构建更稳，排查更直观

缺点：

- 不符合“单个 exe”诉求
- 交付体验差

### Option C: 改成安装包

优点：

- 更像正式桌面软件

缺点：

- 工作量明显更大
- 当前仓库并没有现成安装器链路
- 对这次交付来说属于过度设计

## Chosen Design

采用 **Option A**。

执行方式：

1. 保留 `tools/build_windows_onefile.py` 作为实际构建入口
2. 新增一个 Windows 批处理脚本作为小白打包入口
3. 新增一份单独的小白使用说明，和开发文档分开
4. 直接在当前项目上执行打包，产出 onefile `exe`

## File Responsibilities

- `tools/build_windows_onefile.py`
  - 继续作为实际 onefile 构建器
- `packaging/windows_onefile_launcher.py`
  - 继续作为 exe 入口，负责启动服务和自动打开浏览器
- `打包EXE.bat` 或同类 Windows 脚本
  - 给 Windows 用户一个双击即可执行的打包入口
- `docs/RELEASE_WINDOWS_ONEFILE.md`
  - 保持开发向说明
- 新增小白文档
  - 保持用户向说明，不混入开发术语

## UX Requirements

### 打包者体验

打包者应能：

1. 双击一个批处理脚本开始打包
2. 在命令窗口看到是否成功
3. 明确知道最终 `exe` 在哪里

### 最终用户体验

最终用户应能：

1. 双击 `exe`
2. 自动打开浏览器进入工作台
3. 不需要手动装 Node.js
4. 明白如何关闭程序
5. 知道生成内容和用户数据保存在哪里

## Error Handling

打包入口脚本至少要对以下情况给出清晰提示：

1. Python 不存在
2. 虚拟环境未准备好时自动创建
3. `pyinstaller` 未安装时自动安装或提示安装失败
4. 构建失败时暂停窗口，避免一闪而过

## Verification

完成后至少验证：

1. 打包脚本可运行
2. `tools/build_windows_onefile.py` 成功产出 onefile `exe`
3. 产物位于 `release/windows/`
4. 小白文档存在且内容覆盖启动、关闭、数据位置、常见问题

## Success Criteria

满足以下条件即可视为完成：

1. 项目能成功构建出单文件 Windows `exe`
2. `exe` 文件路径明确可交付
3. 仓库内有一份可供非技术用户阅读的使用文档
4. 打包流程不依赖人工手改 Python 命令
