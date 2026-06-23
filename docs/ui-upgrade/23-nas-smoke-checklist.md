# NAS 团队共享库 — 真机冒烟验收清单（§11.2，7 条阶段 2 门禁）

> **性质：手动真机测试。** 代码假设本地 NTFS，这 7 条必须在真实 SMB/NAS 上跑过才算阶段 2 验收通过。
> **#5（SMB `os.replace` 行为）是阶段 2 交付门禁** — 它的真机结论直接决定
> `atomic_replace_with_retry(attempts, base_delay)` 的取值是否够用。
> 不通过 `python -m unittest` 运行；每条用人工「操作 / 预期 / 通过判据」照做，全部勾选即门禁通过。

**前置依赖：** 阶段 1 + 阶段 2 全部代码任务已完成并合入：
- `services/library_storage.py` 五个纯函数
- `server.py` 薄包装：`LIBRARY_DIR` / `_library_enabled` / `_refresh_storage_globals`、扩 4 个 thumbs 全局、`machine_id` 前缀文件名、`GET /api/v2/library/status`、`POST /api/v2/user/settings.json` 带 `libraryDir`

---

## 测试环境要求

- NAS 共享路径：`\\NAS\share\huanying-lib`（管理员账号可读写；另备一个**成员只读**账号给 #7）
- 两台 Windows 机 **机器 A / 机器 B**，各自跑 `启动项目.bat`，server 绑 `127.0.0.1`
  - 机器 A：`http://127.0.0.1:<portA>`
  - 机器 B：`http://127.0.0.1:<portB>`
- 两机系统设置里 `libraryDir` 均指到**同一个** `\\NAS\share\huanying-lib`（经 `POST /api/v2/user/settings.json` 保存、走校验 + 迁移 + 刷新）
- 一个能在 NAS 端「同毫秒并发写同一文件」的最小脚本（两进程各 `os.replace(tmp, dst)` 写同一 `presets/prompt-presets.json`，给 #5 用）
- 不涉及：账户/跨进程锁/云（契约约束）

---

## 环境就绪自检（开测前一次性）

- [ ] **Step 0a: 两机都已启用库且看见同一根**

  **操作：** A、B 两机各自浏览器开 `http://127.0.0.1:<port>`，进设置 → 团队共享库分区，确认「库目录」显示同一 UNC，状态行为 `● 已连接 · 可读写`。

  命令（任一机终端，验证后端真识别库）：
  ```
  curl http://127.0.0.1:<portA>/api/v2/library/status
  ```

  **预期：** 返回 JSON `{"reachable":true,"writable":true,"counts":{"assets":<int>,"workflows":<int>,"presets":<int>}}`（即契约 `library_status(LIBRARY_DIR)` 的形状）。

  **通过判据：** 两机 `reachable=true && writable=true`，且两机 `counts.assets` 相等（同一份库）。若任一机 `reachable=false`，先解决 NAS 可达再继续——否则后续全部无效。

- [ ] **Step 0b: 确认机器前缀已生效（#3/#5 的撞号前提）**

  **操作：** A 机生成或保存一张图，到 `\\NAS\share\huanying-lib\output\` 看新文件名。

  **预期：** 文件名形如 `gen_<machineId>_YYYYMMDD_NNNN.png`（契约 `_next_gen_output_filename` 产出 `f"gen_{machine_id()}_{date}_{seq}.{ext}"`，ext 不含前导点、点号在 `{seq}.{ext}` 处显式加），`<machineId>` 为 `[a-z0-9-]`、约 ≤12 字符、A/B 两机不同。

  **通过判据：** A、B 各生成一张，两个文件名的 `<machineId>` 段**不相同**；且产出名**确含扩展名分隔点**（断言文件名匹配 `^gen_[a-z0-9-]+_\d{8}_\d{4}\.[a-z0-9]+$`，即 `{seq}` 与 `{ext}` 之间有 `.`，绝不出现 `..._0001png` 缺点号）；若 `<machineId>` 相同（如都回退成 `host`），#3/#5 的跨机撞号防护失效，需先查 `machine_id()`。

---

## #1 两机互见（自动获取的基本盘）

- [ ] **Step 1: 各建不同资产 → 双方刷新后互见**

  **操作：**
  1. A 机新建/保存一个资产，记其标题/id（记为 `assetA`）。
  2. B 机新建/保存另一个不同资产（`assetB`）。
  3. A 机在资产库面板手动刷新（切面板或刷新按钮，参照 §7.3 非实时推送语义）；B 机同样刷新。

  **预期：** A 机刷新后看到 `assetA`+`assetB` 两条；B 机刷新后同样两条。两文件落在 `\\NAS\share\huanying-lib\assets\` 下不同 `<id>.json`。

  **通过判据：** 两机刷新后资产列表均含**对方新建的那条**；NAS `assets\` 目录里两个 `<id>.json` 并存、互不覆盖。直接对照 `library_status` 的 `counts.assets` 在两机一致且较测前 +2。

---

## #2 媒体不裂图（output 与 uploads 两类来源都要验，§4.2 核心）

- [ ] **Step 2a: output 来源不裂图**

  **操作：** A 机**生成**一张图并存为资产（媒体走 `/output/gen_...png`）；B 机刷新后打开这条资产。

  **预期：** B 机资产卡/详情正常显示该图与缩略图，无破图占位符。

  **通过判据：** B 机肉眼看到图；浏览器 DevTools Network 里 `/output/gen_<machineId>_...png` 与其派生缩略图（`/api/v2/images/derivatives/ensure`）均 HTTP 200、非 404/403。

- [ ] **Step 2b: uploads 来源不裂图（最容易漏的一类）**

  **操作：** A 机**上传一张参考图**并存为资产（媒体走 `localPath:data/uploads/upload_...jpg`，实测有资产 100% 来自 uploads）；B 机刷新后打开。

  **预期：** B 机正常显示上传图来源的资产，无破图。

  **通过判据：** B 机肉眼看到图；Network 里 `/data/uploads/upload_...` 与其派生图均 200。

  > **红线：只验 output 不验 uploads 不算通过** — 附录 A 第 1 条裂图正是漏 uploads 造成；两类来源都绿才算 #2 过。

---

## #3 同 id 并发写：后写赢、文件完好（非半截/损坏）

- [ ] **Step 3: 两机同时改同一条 id**

  **操作：**
  1. 先在任一机建一条资产 `assetX`，等两机都刷新可见（确保是**同一个 `<id>.json`**）。
  2. A、B 两人**同时**编辑 `assetX` 并保存（A 改标题为 `T-A`、B 改标题为 `T-B`，尽量同一刻点保存）。
  3. 用 `curl http://127.0.0.1:<port>/api/v2/assets` 在两机各拉一次完整列表。

  **预期：** `assetX` 仍是**一条合法 JSON**，标题是 `T-A` 或 `T-B` 之一（后写者赢，§7.4 接受语义）；**不得**出现半截 JSON、双份、或该条从列表消失。

  **通过判据：** 直接打开 NAS 上 `assets\<id>.json` 能被 `json.load` 解析成功：
  ```
  python -c "import json;json.load(open(r'\\NAS\share\huanying-lib\assets\<id>.json',encoding='utf-8-sig'))"
  ```
  无异常即合法；标题为 `T-A`/`T-B` 其一；两机列表里 `assetX` 各恰好出现一次。

  > **说明：** 本条**接受**「先写者内容丢失」为已知取舍，只验**文件不损坏**；丢的那版靠备份兜底，不在本条门禁内。

---

## #4 并发读撞他机写句柄：暂时消失 + 自愈（统计频率与恢复时延）

- [ ] **Step 4: A 持续写、B 反复拉列表，统计该条消失/恢复**

  **背景：** B 拉列表时若 open 撞上 A 的写句柄，`JsonFileRouteService._load_json_file` 的 `except Exception: return default`（`services/json_file_route_service.py:78-79`）会静默吞掉 PermissionError，该条**当场从列表消失**，写完释放后下次扫描恢复。这是 §2.6/§9 承认的体验降级，本条量化它、确认是**暂时**非永久。

  **操作：**
  1. A 机用脚本对同一个 `assetY` 的 `<id>.json` **持续覆盖写** ~60 秒（循环 save，制造高频写句柄占用）。
  2. 同时 B 机用脚本每 ~500ms `curl http://127.0.0.1:<portB>/api/v2/assets`，记录每次响应里 `assetY` 是否存在，跑满这 60 秒。
  3. A 停写后，B 再拉 3~5 次。

  **预期：** 写期间 `assetY` 会**间歇性消失**（统计：消失次数 / 总拉取次数 = 消失频率；每次从「消失」到「再次出现」的间隔 = 恢复时延）；**A 停写后 B 的后续每一次拉取都稳定含 `assetY`**。

  **通过判据：**
  - ① 全程 `assetY` 的 `<id>.json` 在 NAS 上始终是合法 JSON（未损坏）。
  - ② A 停写后连续 ≥3 次拉取 `assetY` 100% 在列（证明是**暂时消失非永久丢失**）。

  记录下「消失频率 + 最大恢复时延」两个数，作为该已知降级在本 NAS 上的真实画像，写进交付报告（不设硬阈值，但要有数）。

  **实测数据记录（测后填入）：**
  - 消失频率（消失次数 / 总拉取次数）：______
  - 最大恢复时延（秒）：______

---

## #5 SMB `os.replace` 行为 —— **阶段 2 交付门禁**，决定 `atomic_replace_with_retry` 参数

> **本条不过则阶段 2 不予交付。**

- [ ] **Step 5a: 两进程同毫秒写同一文件，观测是否抛 ERROR\_SHARING\_VIOLATION / 产坏文件**

  **背景：** 契约 `atomic_replace_with_retry(tmp_path, dst_path, attempts=5, base_delay=0.05)` 的存在前提，就是 SMB 上 `os.replace` 可能抛 `PermissionError`/`OSError`（SMB `ERROR_SHARING_VIOLATION`）。本条用真机确认它**会不会抛、抛得多频、默认 attempts/base_delay 够不够**。

  **操作（裸 `os.replace`，不经 retry 包装，直接观测原始行为）：** 在两台机（或一机两进程）各跑一个脚本，循环 N=200 次：写一个临时文件 → `os.replace(tmp, r'\\NAS\share\huanying-lib\presets\prompt-presets.json')`，两进程尽量同刻启动，捕获并计数每次 `os.replace` 抛出的异常类型与 winerror。

  最小探针脚本（目标文件用一次性测试文件而非真预设表，避免污染库）：
  ```powershell
  # 在 A、B 两机同时运行；TARGET 指同一 NAS 文件
  python -c "
  import os, time, json, tempfile
  T = r'\\NAS\share\huanying-lib\presets\_replace_probe.json'
  os.makedirs(os.path.dirname(T), exist_ok=True)
  errs = {}
  for i in range(200):
      fd, tmp = tempfile.mkstemp(dir=os.path.dirname(T))
      os.close(fd)
      open(tmp, 'w', encoding='utf-8').write(json.dumps({'i': i, 'pid': os.getpid()}))
      try:
          os.replace(tmp, T)
      except OSError as e:
          key = (type(e).__name__, getattr(e, 'winerror', None))
          errs[key] = errs.get(key, 0) + 1
          if os.path.exists(tmp):
              os.remove(tmp)
      time.sleep(0.001)
  print('errors:', errs)
  "
  ```

  **预期：** 打印 `errors: {...}`。若出现 `('PermissionError', 32)`（winerror 32 = `ERROR_SHARING_VIOLATION`）或 `('OSError', ...)`，说明 SMB 下 `os.replace` 确实会被占用打断——证明 retry 必要。

  **通过判据（门禁）：**
  - ① 跑完后 NAS 上 `_replace_probe.json` 仍是**合法 JSON**（`json.load` 不抛），**绝不能**出现 0 字节/半截文件 → 证明 `os.replace` 在本 NAS 上即便竞争也保持「整文件替换」原子性；若出现坏文件，则 `os.replace` 方案在此 NAS 不成立，需上报阻断阶段 2。
  - ② 统计 `errors` 里 `ERROR_SHARING_VIOLATION` 的**最长连续失败次数**：用它反推契约默认 `attempts=5`、退避 `base_delay=0.05`（首轮 0.05s、指数退避累计 ~0.05+0.1+0.2+0.4 ≈ 0.75s 覆盖窗口）是否够。若实测最长连击 ≥5 次或单次占用窗口 > ~0.75s，**必须把实测值反馈给实现任务上调 `attempts`/`base_delay`**。

- [ ] **Step 5b: 把结论写回**

  **操作：** 在下方「结论记录」栏填入三件事后勾选本步。

  **通过判据：** 下述 (a)(b)(c) 三项均有真实数据与明确结论；门禁 = (b) 为「否（无坏文件）」且 (c) 给出参数够用或已上调。

  **Step 5 结论记录（测后填入）：**

  | 项 | 结论 |
  |---|---|
  | (a) `os.replace` 是否抛 `ERROR_SHARING_VIOLATION`（是/否 + winerror） | ______ |
  | (b) 是否产生过坏/空文件（决定 `os.replace` 方案成立与否） | ______ |
  | (c) 最长连续失败次数 vs `attempts=5/base_delay=0.05`，给「够用/需上调到 X」结论 | ______ |

---

## #6 断 NAS：明确报错、不静默回退本地（§8.9）

- [ ] **Step 6: 运行中拔网/断 NAS**

  **操作：** A 机正常使用中，**拔网线 / 断开 NAS 映射 / 关 NAS 共享**，使 `\\NAS\share\huanying-lib` 不可达；然后：
  - (a) 看设置状态行
  - (b) 拉一次资产列表
  - (c) 尝试新建一个资产

  **预期：**
  - 状态行变警告（`无法访问该路径` 一类），`GET /api/v2/library/status` 返回 `reachable=false`（其余字段安全降级，契约 `library_status` 不可达时不崩）。
  - 资产列表显示「库不可达」而非空库，**不**自动把读写切回本机 `data/`（避免「以为写 NAS、实写本机」的状态分裂）。
  - 新建/保存动作**明确报错**，不静默落到本地默认目录。

  **通过判据：**
  - ① `curl .../api/v2/library/status` 返回 `{"reachable":false, ...}` 且进程不崩。
  - ② 断网期间到本机 `writable_root/data/assets/` 检查，**没有**新出现刚才尝试新建的那条（证明未静默回退本地写）。
  - ③ 恢复 NAS 后状态行回 `● 已连接`、列表恢复。

  > **红线：** 只要断网后本机 `data/` 里冒出了本该写 NAS 的新文件，即判**不通过**（违反 §8.9 不回退）。

---

## #7 库设成员只读：新增友好失败、不崩（§6.2 写探针 / §10.2）

- [ ] **Step 7: 用只读成员账号接入**

  **操作：** 在 NAS 把库目录对**成员账号**设为只读；该成员机用此账号挂载 `\\NAS\share\huanying-lib`，在设置里保存 `libraryDir`，然后：
  - (a) 看状态行
  - (b) 尝试新建/保存一个资产

  **预期：**
  - 保存设置时的写探针（库写 `.huanying_probe` 临时文件再删，契约 `library_status` 的 writable 探针同源逻辑）探到不可写，状态行标 `只读，新增将失败`（`reachable=true && writable=false`）。
  - 读路径正常：能列出并**只读浏览**团队已有资产/工作流/预设（含图，复用 #2 的解析）。
  - 新增/保存动作**友好失败**（明确提示「库只读，无法写入」），**进程不崩**、不抛未捕获异常、不静默假成功。

  **通过判据：**
  - ① `curl .../api/v2/library/status` 返回 `reachable=true, writable=false`。
  - ② 该成员能看到团队资产且不裂图（读通）。
  - ③ 触发保存后：server 进程仍存活、前端有可读的失败提示、NAS 库目录里**没有**新增该条（写确实被拒而非假装成功）。

---

## 收尾

- [ ] **Step 8: 汇总门禁结论 + 落盘清单**

  **操作：** 把 #1–#7 的勾选结果、#4 的「消失频率/恢复时延」两数、#5 的 `os.replace` 三项结论（是否抛 SHARING_VIOLATION / 有无坏文件 / 参数够用与否）整理进本文档，作为阶段 2 验收证据。

  **通过判据：** 7 条全勾，其中 **#5 明确给出 `atomic_replace_with_retry` 参数结论**（门禁），#2 含 output+uploads 两类来源、#6 证实未回退本地。

- [ ] **Step 9: 提交清单文档**（仅文档，无源码改动）

  ```
  git add docs/ui-upgrade/23-nas-smoke-checklist.md
  git commit -m "docs(nas-library): add §11.2 manual NAS smoke checklist (7-item stage-2 gate)"
  ```

  **通过判据：** 单文件提交成功；不动任何 `.py`/前端文件。

---

## 判据速查（门禁 = 全绿）

| # | 一句话通过判据 |
|---|---|
| 1 | 两机刷新后互见对方新建资产，NAS `assets\` 两 `<id>.json` 并存 |
| 2 | output **和** uploads 两类来源在对端均显示、派生图 200，无破图 |
| 3 | 并发写后 `<id>.json` 仍合法 JSON、标题为后写者、列表恰一条 |
| 4 | 写期间间歇消失但停写后稳定恢复、文件始终合法（暂时非永久，记下频率/时延） |
| **5** | **(门禁)** `os.replace` 无坏文件 + 抛 SHARING_VIOLATION 数据已采、`attempts/base_delay` 给够用或上调结论 |
| 6 | 断 NAS 后 `reachable=false` 不崩、不回退本地写、恢复后自愈 |
| 7 | 只读成员 `writable=false`、读通、写友好失败不崩、库无新增 |
