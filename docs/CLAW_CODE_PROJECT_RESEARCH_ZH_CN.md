# claw-code 项目中文版调研报告

调研对象：`ultraworkers/claw-code`  
GitHub 地址：https://github.com/ultraworkers/claw-code  
调研日期：2026-05-21  
阅读对象：README、USAGE、PARITY、PHILOSOPHY、ROADMAP、`rust/` 工作区说明、Rust crate 目录、模型兼容文档、容器/安装文档等。

> 这是一份面向中文读者的合并版。英文术语尽量保留必要原词，并在第一次出现时解释清楚。

## 1. 最核心结论

`claw-code` 是一个开源的 Rust 版命令行 AI 编程代理运行时。你可以把它理解成一个“类似 Claude Code 的终端工具”，但它不是 Anthropic 官方 Claude Code。

它的目标不是做网页 UI，也不是做普通聊天机器人，而是做一个可以在命令行里执行编程任务的 agent harness。这里的 harness 可以理解为“代理运行框架”：它负责接收用户任务、调用模型、读写文件、执行命令、管理权限、保存会话、恢复上下文、调用 MCP/插件/技能，并把结果输出给用户或其他自动化系统。

一句话概括：

> 它想做一个开源、Rust 原生、多模型兼容、可被自动化系统编排的 Claude Code 类命令行编程代理。

## 2. 它不是哪些东西

它不是 Anthropic 官方 Claude Code。仓库自己也声明不隶属于 Anthropic。

它不是一个桌面端或网页端 IDE。主入口是命令行程序 `claw`。

它不是只支持 Claude。它支持 Anthropic、xAI、OpenAI-compatible、本地模型网关、DashScope/Qwen/Kimi 等多种 provider。

它也不是一个已经非常稳定、闭眼安装就能生产使用的软件。文档里有不少 parity、roadmap、未完成项和实现边界说明。

## 3. 仓库目前最重要的事实

这个仓库有一个很容易误解的地方：根目录下有 `src/` 和 `tests/`，但真正的主实现不在这里。

根据 README，真正的主实现是：

```text
rust/
```

根目录的 `src/` 和 `tests/` 更像 Python 参考实现、审计辅助、迁移辅助，不是当前主运行时。

所以看这个项目时应该优先看：

```text
rust/Cargo.toml
rust/README.md
rust/crates/
rust/crates/rusty-claude-cli/
rust/crates/runtime/
rust/crates/api/
rust/crates/tools/
```

## 4. 项目结构

主要目录可以这样理解：

| 路径 | 作用 |
|---|---|
| `rust/` | 真正的 Rust 主工程，包含 `claw` 命令行程序 |
| `rust/crates/` | Rust workspace 的各个 crate，也就是模块包 |
| `docs/` | 安装、模型、容器、安全、MCP、Windows、事件等文档 |
| `src/` | Python 参考/审计/辅助代码，不是主实现 |
| `tests/` | Python 审计和安全相关测试 |
| `scripts/` | 辅助脚本 |
| `README.md` | 项目总入口 |
| `USAGE.md` | 使用说明 |
| `PARITY.md` | 与目标功能的对齐情况 |
| `PHILOSOPHY.md` | 项目理念 |
| `ROADMAP.md` | 后续路线图 |

## 5. Rust workspace 拆分

`rust/README.md` 说明项目由 9 个 Rust crate 组成：

| crate | 中文理解 |
|---|---|
| `rusty-claude-cli` | 主命令行程序，最终生成 `claw` |
| `runtime` | 核心运行时，负责会话、权限、MCP、配置、上下文等 |
| `api` | 模型 provider 客户端，负责请求 Anthropic/OpenAI-compatible 等接口 |
| `tools` | 内置工具，如读文件、写文件、编辑、grep、bash、web、agent、todo 等 |
| `commands` | slash command，例如 `/doctor`、`/status`、`/help` 等命令 |
| `plugins` | 插件系统 |
| `telemetry` | 事件、usage、trace 等遥测结构 |
| `mock-anthropic-service` | 本地 mock 服务，用于测试 Anthropic 兼容行为 |
| `compat-harness` | 兼容性/对齐测试工具 |

这说明项目不是简单脚本，而是一个比较完整的命令行 agent 框架。

## 6. 使用方式

官方建议从源码编译，而不是从 crates.io 安装。

基本方式：

```bash
git clone https://github.com/ultraworkers/claw-code
cd claw-code/rust
cargo build --workspace
./target/debug/claw doctor
./target/debug/claw prompt "say hello"
```

常见用法：

```bash
./target/debug/claw
```

进入交互式 REPL，也就是像 Claude Code 一样在终端里连续对话。

```bash
./target/debug/claw prompt "summarize this repo"
```

执行一次性任务。

```bash
./target/debug/claw --output-format json prompt "status"
```

输出 JSON，方便其他自动化系统读取。

```bash
claw init
```

初始化项目工作区，生成 `.claw`、配置文件、项目记忆文件等。

特别注意：文档明确提醒，`cargo install claw-code` 安装到的不是这个仓库的完整实现，而是一个 deprecated stub。所以要用这个项目，应该从源码构建。

## 7. 它支持哪些模型

这个项目的一个重点是“多 provider 兼容”。provider 可以理解成模型服务商或模型接口来源。

支持方向包括：

| 类型 | 说明 |
|---|---|
| Anthropic | Claude 官方 API 或 bearer token |
| xAI | 通过 OpenAI-compatible 风格调用 Grok |
| OpenAI-compatible | OpenAI、LM Studio、Ollama 网关、本地模型服务等 |
| DashScope/Qwen/Kimi | 阿里 DashScope 兼容接口，适配 Qwen/Kimi 类模型 |

它通过模型名前缀来判断 provider，例如：

| 模型名特征 | 走向 |
|---|---|
| `claude...` | Anthropic |
| `grok...` | xAI |
| `gpt-...` 或 `openai/...` | OpenAI-compatible |
| `qwen...` | DashScope/Qwen |
| `kimi...` | DashScope/Kimi |

文档还提到了一些兼容细节：

- Kimi 不接受某些 tool result 字段，所以会剥离。
- reasoning 模型会去掉 temperature/top_p 等采样参数。
- GPT-5 类模型使用 `max_completion_tokens`。
- Qwen 会走 DashScope compatible mode。

这部分对国内用户比较有价值，因为它不只绑定 Claude，也考虑了 Qwen、Kimi、本地模型和 OpenAI-compatible 网关。

## 8. 它的工具能力

`claw-code` 试图复刻或接近 Claude Code 的工具调用体验。

主要工具包括：

- 读文件
- 写文件
- 编辑文件
- grep 搜索
- glob 文件匹配
- bash/PowerShell 命令执行
- web search / web fetch
- todo 管理
- 子 agent / task
- skill 技能系统
- MCP 工具接入
- 插件系统
- notebook 编辑
- 项目记忆
- session resume

这些能力很强，但也意味着风险很高。因为一旦模型可以读写文件、执行命令、访问网络，就必须管理好权限。

## 9. 权限和安全风险

文档里提到权限模式：

| 模式 | 含义 |
|---|---|
| `read-only` | 只读 |
| `workspace-write` | 允许写当前工作区 |
| `danger-full-access` | 高权限，风险最大 |

比较需要警惕的是：文档里的统计信息显示默认权限可能是 `danger-full-access`。如果属实，真实使用时一定不能直接在重要项目里裸跑。

建议：

- 第一次只用空白测试仓库。
- 优先使用 `read-only`。
- 逐步开放 `workspace-write`。
- 不要让 `danger-full-access` 成为默认。
- 最好放进容器、虚拟机或隔离工作区。
- 对 bash、写文件、网络访问、MCP、插件都要单独确认权限。

## 10. Parity 状态：它做到什么程度了

项目有 `PARITY.md`，说明它在对齐 Claude Code 类体验。

已经覆盖或正在覆盖的方向包括：

- provider streaming
- REPL
- slash commands
- bash 工具
- 文件工具
- permission prompt
- session
- MCP lifecycle
- plugin tool
- task/team/cron registry
- LSP client
- JSON 输出
- usage/cost/stats

但是也要注意，文档自己承认并不是所有东西都完全成熟：

- 有些能力只是 registry-backed approximation，可以理解为“有状态表和接口，但不一定是真实完整运行时”。
- ACP/Zed daemon 还不是完整可用的 JSON-RPC daemon。
- 部分 bash 深度验证、MCP end-to-end、session compaction、token/cost accuracy 等还有开放项。
- 文档之间可能有时间差，需要以当前 commit 实测为准。

所以它不是“完全开源平替 Claude Code”，更准确是“一个正在快速推进的 Rust 版 Claude Code 类 agent harness”。

## 11. 项目的路线图

`ROADMAP.md` 的关键词是 clawable harness。

这句话可以翻译成：

> 让这个命令行 agent 不只是给人看的工具，而是能被其他自动化系统稳定调用、监控、恢复和审计的 worker。

路线图关注的不是 UI 好不好看，而是：

- worker 启动状态能不能机器读取
- session 能不能恢复
- 事件能不能结构化输出
- MCP/plugin 状态能不能检查
- 失败后能不能自动恢复
- 报告能不能有 schema
- 多 agent 系统能不能接管它
- CI/通知系统能不能读懂它的状态

这说明项目的长期方向很偏工程自动化和多代理协同。

## 12. 项目理念

`PHILOSOPHY.md` 里最有意思的一点是：这个仓库不只是一个软件项目，也像是在展示一种“AI agent 自治开发流程”。

它提到：

- 人给方向。
- 多个 agent 协同开发。
- agent 之间有交接、验证、争议处理。
- 工具链可以自动跑测试、提交、修复、恢复。
- 仓库本身就是这种流程的产物。

相关名字包括：

- OmX / `oh-my-codex`
- `clawhip`
- OmO / `oh-my-openagent`

可以理解为：`claw-code` 是底层 agent 运行器，周围还有一套多代理协同系统。

## 13. 优点

我认为它的优点主要有这些：

- Rust 实现，适合做高性能、跨平台、单二进制 CLI。
- 不绑定单一模型 provider，对国内模型和本地模型更友好。
- 工具面很完整，覆盖读写文件、命令执行、web、MCP、插件、skills。
- 支持 JSON 输出，适合被自动化系统调用。
- 文档比较坦诚，会说明哪些地方还没完全做完。
- 有 mock parity harness，说明项目重视行为对齐测试。
- MIT license，集成许可上比较友好。

## 14. 风险

风险也很明显：

- 主 CLI 入口文件非常大，后续维护压力可能比较高。
- 默认权限如果真是 `danger-full-access`，安全风险很大。
- 功能面太宽，可能出现“接口有了，但深度不足”的情况。
- 没有稳定 release 体验，README 还提醒 crates.io 包不是当前实现。
- 文档和实际代码可能存在时间差。
- GitHub star/fork/issue 数量非常异常，不能只凭热度判断成熟度。
- ACP/Zed、MCP、LSP、team、cron 等高级能力需要实测，不要只看文档判断。

## 15. 适合谁

适合：

- 想研究 Claude Code 类工具实现的人。
- 想把 agent CLI 接到国产模型、本地模型、OpenAI-compatible 网关的人。
- 想做多 agent 自动化、CI worker、代码机器人、自动修复系统的人。
- 愿意读源码、跑测试、接受快速变化的人。

不太适合：

- 想要官方 Claude Code 体验的人。
- 想直接生产使用、不要折腾的人。
- 对权限隔离、容器、测试没有准备的人。
- 需要成熟 IDE 插件或稳定 ACP/Zed daemon 的团队。

## 16. 如果你要试用，我建议这样做

不要直接在重要项目里跑。建议这样：

1. 新建一个空白测试仓库。
2. 克隆 `claw-code`。
3. 进入 `rust/`。
4. 跑 `cargo build --workspace`。
5. 先跑 `claw help`、`claw doctor`、`claw status`。
6. 设置只读权限。
7. 只开放 read/grep/glob 工具。
8. 再测试 prompt。
9. 再测试 OpenAI-compatible、本地模型、Qwen、Kimi。
10. 最后才考虑开放写文件和命令执行。

如果在 Windows 上试，优先按项目的 Windows 文档走，不要混用 WSL、PowerShell、Git Bash 的路径规则。

## 17. 总体评价

`claw-code` 是一个很有野心的项目。它真正想做的不是“聊天命令行”，而是“可自动化、可恢复、可审计、可被多 agent 系统编排的代码执行代理”。

对我们这种需要理解 AI 编程工具生态的人来说，它很值得研究。尤其是它的 Rust runtime、多 provider 适配、工具权限、MCP/plugin/session、JSON 输出和 agent workflow 思路，都有参考价值。

但如果问“现在能不能当稳定生产工具用”，我的判断是：还需要谨慎。它更适合作为研究对象、实验性工具链、或者二次开发参考。真正落地前，必须完整实测构建、权限、provider、工具调用、session 恢复、MCP/plugin、安全边界。

## 18. 一句话给你

如果你是想了解它值不值得关注：值得。

如果你是想马上拿它替代 Claude Code：不建议直接替代，先隔离环境试跑。

如果你是想借鉴它做自己的 agent 工具：很值得看 `rust/runtime`、`rust/api`、`rust/tools`、`USAGE.md`、`ROADMAP.md`。

## 19. 主要来源

- 仓库主页：https://github.com/ultraworkers/claw-code
- README：https://github.com/ultraworkers/claw-code/blob/main/README.md
- 使用说明：https://github.com/ultraworkers/claw-code/blob/main/USAGE.md
- Parity 状态：https://github.com/ultraworkers/claw-code/blob/main/PARITY.md
- 项目理念：https://github.com/ultraworkers/claw-code/blob/main/PHILOSOPHY.md
- 路线图：https://raw.githubusercontent.com/ultraworkers/claw-code/main/ROADMAP.md
- Rust 说明：https://github.com/ultraworkers/claw-code/blob/main/rust/README.md
- Rust workspace：https://github.com/ultraworkers/claw-code/blob/main/rust/Cargo.toml
- Rust crates：https://github.com/ultraworkers/claw-code/tree/main/rust/crates
- 模型兼容文档：https://github.com/ultraworkers/claw-code/blob/main/docs/MODEL_COMPATIBILITY.md
- 容器文档：https://github.com/ultraworkers/claw-code/blob/main/docs/container.md
