# ultraworkers/claw-code 项目调研报告

调研日期：2026-05-21  
目标仓库：https://github.com/ultraworkers/claw-code  
结论基于：GitHub 仓库主页、README/USAGE/PARITY/PHILOSOPHY/ROADMAP、`rust/` 工作区文档、关键目录与源码入口页面、模型兼容性文档。

> 说明：本次尝试浅克隆仓库到本地时，网络链路先后出现 Schannel 凭证错误、GitHub 连接重置/超时，因此没有在本机完整跑 `cargo test`。本文的“项目能力”以仓库公开文档和 GitHub 文件结构为依据；“风险/判断”是基于这些资料的工程推断。

## 1. 一句话结论

`ultraworkers/claw-code` 是一个公开的 Rust 版 `claw` CLI agent harness：它试图做一个 Claude Code 形态的命令行/REPL 代理运行时，支持多 provider、工具调用、权限控制、会话恢复、MCP、插件、skills、JSON 输出和自动化工作流。

它不是 Anthropic 官方 Claude Code，也不是一个图形界面产品；它更像一个面向“自动化 coding agent / 多代理协同”的终端运行时与实验性基础设施。

## 2. 快速判断

- 主实现位置：`rust/`。仓库 README 明确说 `rust/` 是 canonical Rust workspace，根目录 `src/` 和 `tests/` 是 Python/reference/audit companion，不是主要 runtime。
- 运行形态：生成 `claw` CLI 二进制，支持交互 REPL、一次性 prompt、JSON 输出、doctor/status/sandbox/init 等直接命令。
- 技术栈：Rust workspace，9 个 crate；workspace 配置 `unsafe_code = "forbid"`，license 为 MIT，不发布 crates.io 主包。
- 模型/provider：支持 Anthropic direct/bearer、xAI、OpenAI-compatible、DashScope/Qwen/Kimi 类路由；模型名前缀会影响 provider 选择。
- 设计方向：从“人盯终端”转向“clawable harness”，强调机器可读状态、事件、恢复、worker boot、MCP/plugin 生命周期、报告 schema、自动化交接。
- 成熟度：功能面很宽，但文档也承认部分表面仍是 registry-backed approximation 或未完整落地，例如 ACP/Zed daemon、部分 MCP/LSP/cron/team 外部运行时深度、bash 深验证等。
- 使用风险：默认权限文档显示 `danger-full-access`，工具面又包括 bash/read/write/edit/web/plugin/skills/MCP 等，真实使用前必须强制收窄权限和工作区边界。

## 3. 项目身份与定位

仓库 README 把 Claw Code 定义为 `claw` CLI agent harness 的公开 Rust 实现，并强调当前 source of truth 是 `ultraworkers/claw-code`。它也声明不隶属、不背书、不由 Anthropic 维护。

截至本次打开 GitHub 页面时，仓库显示约 192k star、110k fork、约 1.4k issues、50 个左右 PR。这个量级非常异常，也意味着信息噪声和变更速度可能很高；这些数字是时间敏感信息，后续应以 GitHub 实时页面为准。

从 `PHILOSOPHY.md` 看，项目不只把自己当作一个 CLI 工具，还把仓库当成一个“自治软件开发系统”的展示物：人给方向，多代理协同执行、测试、恢复、推送。它提到的外围系统包括：

- OmX / `oh-my-codex`：工作流与插件层。
- `clawhip`：事件和通知路由。
- OmO / `oh-my-openagent`：多代理协调、交接、争议收敛和验证循环。

换句话说，`claw-code` 本体是 agent harness；项目真正想展示的是围绕它的协同生产系统。

## 4. 仓库结构

主要目录：

| 路径 | 作用 |
|---|---|
| `rust/` | canonical Rust workspace，真正的 `claw` CLI 实现 |
| `docs/` | 安装、模型、容器、事件、MCP、Windows、ACP、provider 等文档 |
| `src/` | Python/reference/audit companion workspace，不是主 runtime |
| `tests/` | Python 审计/安全相关测试 |
| `scripts/` | 辅助脚本 |
| `.claude/`, `.omx/`, `.port_sessions/` | 与代理工作流/迁移/会话有关的配置或产物 |
| `README.md`, `USAGE.md`, `PARITY.md`, `PHILOSOPHY.md`, `ROADMAP.md` | 项目入口、使用、迁移状态、理念和路线图 |

`rust/Cargo.toml` 使用 `members = ["crates/*"]`，说明所有 crate 统一挂在 `rust/crates/` 下。workspace package 版本是 `0.1.0`，edition 2021，license MIT，`publish = false`，并禁止 unsafe code。

## 5. Rust workspace 结构

`rust/README.md` 列出 9 个 workspace crate：

| crate | 责任 |
|---|---|
| `api` | Provider client、SSE streaming、请求/响应类型、认证、context/window preflight |
| `commands` | slash command 定义、解析、help、JSON/text 渲染 |
| `compat-harness` | 从上游 TS source 抽取 tool/prompt manifest 的兼容 harness |
| `mock-anthropic-service` | 本地 deterministic Anthropic-compatible mock，用于 parity 测试 |
| `plugins` | 插件 metadata、安装/启用/禁用/更新、插件工具与 hook 表面 |
| `runtime` | `ConversationRuntime`、配置、会话、权限、MCP、system prompt、usage |
| `rusty-claude-cli` | 主 CLI 二进制 `claw`，REPL、prompt、命令解析、stream display、工具渲染 |
| `telemetry` | session trace event 与 usage telemetry 类型 |
| `tools` | 内建工具 spec 与执行：bash、read、write、edit、grep、glob、web、agent、todo、skill 等 |

几个工程观察：

- 主 CLI 入口 `rust/crates/rusty-claude-cli/src/main.rs` 在 GitHub 页面显示约 15,057 行、539 KB。这说明 CLI orchestration 目前集中度很高，短期迭代快，但长期可维护性压力不小。
- `runtime/src` 文件很多，覆盖 `bash`、`file_ops`、`permissions`、`permission_enforcer`、`sandbox`、`session`、`mcp_*`、`hooks`、`worker_boot`、`lane_events`、`report_schema`、`stale_branch`、`trust_resolver` 等。这是项目实际复杂度所在。
- `tools/src` 目录很小，主要是 `lib.rs`、`lane_completion.rs`、`pdf_extract.rs`；大量 tool spec/dispatch 很可能集中在 `lib.rs` 内。
- `api/src` 分出 `providers/`、`client.rs`、`http_client.rs`、`sse.rs`、`types.rs` 等，provider 适配是独立层。

## 6. CLI 使用体验

官方推荐从 `USAGE.md` 和 `/doctor` 开始。基本流程是：

```bash
cd rust
cargo build --workspace
./target/debug/claw
/doctor
```

常见模式：

- 交互 REPL：`./target/debug/claw`
- 一次性 prompt：`./target/debug/claw prompt "summarize this repository"`
- shorthand prompt：`./target/debug/claw "explain rust/crates/runtime/src/lib.rs"`
- JSON 输出：`./target/debug/claw --output-format json prompt "status"`
- 初始化仓库：`claw init`，生成 `.claw`、`.claw.json`、`.gitignore`、`CLAUDE.md` 等。
- worker 状态：`claw state` 读取 `.claw/worker-state.json`。

官方特别警告：`cargo install claw-code` 安装的是 crates.io 上的 deprecated stub，不是这个仓库的 `claw`。这个仓库当前应当从 source build，或者按 README 指向安装 upstream binary。

## 7. 权限、工具与安全边界

文档列出的权限模式：

- `read-only`
- `workspace-write`
- `danger-full-access`

`rust/README.md` 的 stats 区域写到默认 permissions 是 `danger-full-access`。这对真实项目接入非常关键：如果把它当成自动化代理跑在生产仓库，必须显式设置更窄的权限模式、限制 tools，并在隔离工作区或容器里运行。

工具面很宽：

- 文件：read/write/edit/grep/glob、notebook edit。
- 命令：bash、PowerShell、sandbox。
- 网络：WebSearch、WebFetch。
- 协作/自动化：Agent、TodoWrite、Skill、ToolSearch、Task、Team、Cron、MCP、LSP 等。
- 插件/skills：插件安装启停、skills inventory/install surfaces。

`PARITY.md` 描述了文件边界、size limit、二进制检测、symlink escape、workspace boundary、权限 enforcement 等方向已经有实现或校验。但它也承认部分地方还是浅层或 registry-backed，例如 team/cron/MCP/LSP 更像状态 registry/dispatch 层，不等同于完整外部运行时。

## 8. 模型与 provider 适配

`USAGE.md` 和 `docs/MODEL_COMPATIBILITY.md` 显示，Claw Code 不是 Claude-only。它把内部 Claude Code 形态消息转换到不同 provider：

| Provider | 协议 | 常见环境变量 |
|---|---|---|
| Anthropic direct | Anthropic Messages API | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` |
| xAI | OpenAI-compatible | `XAI_API_KEY`, `XAI_BASE_URL` |
| OpenAI-compatible | Chat Completions | `OPENAI_API_KEY`, `OPENAI_BASE_URL` |
| DashScope/Qwen/Kimi | OpenAI-compatible | `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL` |

Provider 选择规则的重点是“模型名前缀优先”：

- `claude...` → Anthropic
- `grok...` → xAI
- `openai/...` 或 `gpt-...` → OpenAI-compatible
- `qwen/...`、`qwen-...`、`kimi/...`、`kimi-...` → DashScope-compatible
- 设置了 `OPENAI_BASE_URL`/`OPENAI_API_KEY` 时，未知模型可走 OpenAI-compatible/local gateway

模型兼容性层做了不少特殊处理：

- Kimi 类模型不接受 tool result 的 `is_error` 字段，因此会剥离。
- reasoning 模型会剥离 temperature/top_p/frequency/presence 等 sampling 参数。
- GPT-5 类模型使用 `max_completion_tokens` 而不是 legacy `max_tokens`。
- Qwen 前缀路由到 DashScope compatible-mode endpoint。

这个 provider 适配层是项目一个相对实用的价值点：它试图把 Claude Code 式工具/消息工作流接到多家模型和本地 OpenAI-compatible 服务上。

## 9. Parity 与测试状态

项目有 mock parity harness：

- `mock-anthropic-service` 提供本地 Anthropic-compatible mock。
- CLI harness 用干净环境跑端到端 parity 场景。
- 覆盖场景包括 streaming、read/write/grep、multi-tool turn、bash stdout、permission prompt、plugin tool 等。

`PARITY.md` 写到 Rust port 的 9-lane checkpoint 已经 merged，包括 bash validation、CI/sandbox、file-tool、task registry、task wiring、team/cron、MCP lifecycle、LSP client、permission enforcement。

但同一文档也有“仍有限/仍开放”的提醒：

- `AskUserQuestion` 仍然是 pending response payload，不是完整交互 UI。
- `RemoteTrigger` 仍是 stub response。
- task/team/cron/MCP/LSP 虽不再只是固定 payload，但不少仍是 registry-backed approximations。
- bash deep validation 文档里有“branch-only / not fully landed on main”的矛盾提示，需要以当前 commit 实测为准。
- 仍开放：MCP runtime end-to-end、output truncation、session compaction、token/cost accuracy、CI green 等。

所以这不是“已经完全等价 Claude Code”的稳定替代品，更准确的说法是：Rust port 的核心 CLI/workflow 表面很宽，parity 正在推进，项目自己也保留了大量未完成/待验证边界。

## 10. Roadmap：项目接下来真正想补什么

`ROADMAP.md` 的目标是把 claw-code 做成“clawable coding harness”。这里的 clawable 不是简单好用，而是适合机器代理自动化：

- worker 启动状态机明确；
- 事件优先，少依赖终端文本 scraping；
- session、plugin、MCP、branch/test/worktree 状态可机读；
- 失败能自动恢复一次再升级给人；
- lane/report/roadmap/pinpoint 等输出有 schema、版本、去重、freshness、evidence、severity；
- clawhip/Discord/多代理系统可以消费结构化状态，而不是读人类日志。

这说明项目优先级很清楚：它不是在做一个漂亮终端 UI，而是在做“可被其他 agent 编排、监控、恢复、审计”的 coding worker runtime。

## 11. 安装与部署

README 当前主路径是 source build：

```bash
git clone https://github.com/ultraworkers/claw-code
cd claw-code/rust
cargo build --workspace
./target/debug/claw doctor
./target/debug/claw prompt "say hello"
```

Windows 文档强调 PowerShell 是支持路径，二进制是 `claw.exe`。README 也提供 `cargo install --path . --force` 作为把本地 build 安装到 Cargo bin 的方式，但它不是从 crates.io 安装。

仓库还有 `Containerfile` 和 `docs/container.md`，说明项目有 container-first workflow 文档。这适合在真正试跑时把高权限工具隔离起来。

## 12. 与 Claude Code / Codex 的关系

它的 UX 明显模仿 Claude Code：REPL、slash commands、tools、permissions、CLAUDE.md/project memory、MCP、subagent、session resume 等概念都很相近。

但它不是 Anthropic 官方产品，也不支持 Claude subscription login。认证是 API key 或 bearer token/provider env var。`USAGE.md` 还特别解释：项目里出现的 `codex` 多指 `oh-my-codex` 工作流层或 legacy `.codex/` lookup path，不是 OpenAI Codex CLI/session。

## 13. 工程优点

- Rust 化的 CLI/runtime 有利于启动速度、单二进制分发、系统工具调用和跨平台。
- Workspace 拆出 `api/runtime/tools/commands/plugins/telemetry` 等边界，整体方向清楚。
- Provider 适配相对务实，尤其是 OpenAI-compatible、本地模型、DashScope/Kimi/GPT-5/reasoning 参数细节。
- 机器可读输出和 JSON mode 是自动化场景刚需。
- 文档对“不完整”说得比较明白，尤其是 ACP/Zed、parity、MCP/LSP/cron/team 的边界。
- mock parity harness 是好信号：项目意识到 agent CLI 的回归很难靠普通 unit test 捕捉。
- MIT license 对集成友好。

## 14. 工程风险

- 主 CLI 文件过大：`main.rs` 超过 15k 行，后续拆分、测试和 review 难度高。
- 默认权限危险：如果默认 `danger-full-access` 属实，真实接入必须先改运行策略，而不是直接信任默认行为。
- 功能面过宽：tools、MCP、plugins、skills、LSP、team、cron、remote、event schema 同时推进，容易出现“表面存在但深度不足”。
- 文档存在时间点差异：README、PARITY、ROADMAP、docs 页可能来自不同日期，部分状态描述需要当前 commit 实测确认。
- 无稳定 release 信号：GitHub API/页面显示 releases 为空；README 又警告 crates.io 包不是本仓库产物，说明安装体验尚不成熟。
- Star/fork/issue 数据异常大，社区信号不一定等于代码成熟度。
- ACP/Zed 目前只是 status/discoverability alias，不是可用 daemon。
- Python companion workspace 与 Rust canonical workspace 并存，容易让新读者误判入口。

## 15. 适用场景

适合：

- 想研究 Claude Code-like agent harness 的开源实现。
- 想把 agent CLI 接到 OpenAI-compatible、本地模型或多 provider。
- 想实验多代理自动化、事件驱动 worker、可机读 session/report。
- 愿意读源码、跑测试、接受快速变动的团队。

不适合：

- 需要稳定 production IDE 插件/ACP/Zed daemon 的团队。
- 不愿意自己 build、自己隔离权限、自己验证 provider 行为的用户。
- 只想要 Anthropic 官方 Claude Code 体验或 Claude subscription login 的用户。
- 对安全边界没有容器/沙箱/权限策略的环境。

## 16. 建议的实测路线

如果后续要真的试用或集成，建议不要直接在重要仓库跑。更稳的顺序：

1. 新建空白测试仓库或 disposable worktree。
2. `cd rust && cargo build --workspace`。
3. 先跑无凭证/低风险命令：`claw help`、`claw status`、`claw config env`、`claw doctor`。
4. 用 `--permission-mode read-only` 跑第一次 prompt。
5. 只开放 `read,glob,grep` 等只读工具验证上下文能力。
6. 再逐步测试 `workspace-write`，禁止 `danger-full-access` 成为默认。
7. 使用 mock parity harness 或容器路径跑测试。
8. 对 provider 逐个验证：Anthropic、OpenAI-compatible/local、DashScope/Kimi/Qwen。
9. 检查 `.claw/`、session、worker-state、logs、MCP/plugin config 的真实落盘行为。
10. 再评估是否能接入自己的多代理/通知/CI 流程。

## 17. 我的总体评价

这是一个野心很大的 agent harness 项目：代码量、文档量、路线图都在说明它想解决的不是“写一个聊天 CLI”，而是“让 coding agent 可被编排、可被监控、可恢复、可审计”。它最有价值的部分是 Rust CLI/runtime、provider routing、工具/权限/session/MCP/plugin 的组合，以及围绕 agent 自动化的结构化状态观念。

但它还不是那种可以“闭眼安装、生产依赖”的成熟软件。它更适合作为研究对象、实验性工具链，或作为理解下一代 coding-agent runtime 的参考。真正落地前，要把权限、容器、provider、测试、MCP/plugin 深度和 session 恢复全部实测一遍。

## 18. 主要来源

- Repository / README: https://github.com/ultraworkers/claw-code
- README.md: https://github.com/ultraworkers/claw-code/blob/main/README.md
- USAGE.md: https://github.com/ultraworkers/claw-code/blob/main/USAGE.md
- PARITY.md: https://github.com/ultraworkers/claw-code/blob/main/PARITY.md
- PHILOSOPHY.md: https://github.com/ultraworkers/claw-code/blob/main/PHILOSOPHY.md
- ROADMAP.md raw: https://raw.githubusercontent.com/ultraworkers/claw-code/main/ROADMAP.md
- Rust README: https://github.com/ultraworkers/claw-code/blob/main/rust/README.md
- Rust Cargo workspace: https://github.com/ultraworkers/claw-code/blob/main/rust/Cargo.toml
- Rust crates directory: https://github.com/ultraworkers/claw-code/tree/main/rust/crates
- Main CLI source metadata: https://github.com/ultraworkers/claw-code/blob/main/rust/crates/rusty-claude-cli/src/main.rs
- Runtime source directory: https://github.com/ultraworkers/claw-code/tree/main/rust/crates/runtime/src
- API source directory: https://github.com/ultraworkers/claw-code/tree/main/rust/crates/api/src
- Tools source directory: https://github.com/ultraworkers/claw-code/tree/main/rust/crates/tools/src
- Model compatibility guide: https://github.com/ultraworkers/claw-code/blob/main/docs/MODEL_COMPATIBILITY.md
- Container workflow: https://github.com/ultraworkers/claw-code/blob/main/docs/container.md
