# director-suite 工程底座（_shared/scripts）

> ⚠️ **这套秤量什么、不量什么（勿误读 GO）**：17 审计验的是**契约/结构符合度**（字段齐不齐、计数对不对、有没有出现禁词），**不验创作质量**——烂分镜照样能 GO。fixtures/基线全是手写（teaching-to-the-test），真实 agent 产出/真机从未过秤；`verify` 的"357 配对"实为 **21 真跑 / 336 空转**。**GO ≠ 分镜好**。

落地状态见 [dev/01-DEV-PLAN.md](../../docs/optimization/dev/01-DEV-PLAN.md)。

## 运行（从本目录）

```bash
python verify.py                       # 合入门：reverse_test + run_eval + portability（全绿=GO/exit0）
python run.py baselines/cases_poison   # 红演示：poison 色相+30° → NO-GO/exit1（证明秤会变红）
# 有 make 时等价：make verify / make red
```

## 结构

```
harness/        纯机制底座（六构件）
  audit_report.py   Report/Finding/Verdict + GO-NO-GO + 退出码（判定区零时间戳）
  lexicon.py        集中禁词（BY_DIRECTION 各方向追加）
  leak_scan.py      铁律① 引擎隐身一票否决 + 绝对时码扫描
  portability_scan.py 铁律② 无宿主API/货币
  regression.py     L2 回归门:冻结黄金签名(check-ID集);审计被弱化(检查消失)即 FAIL(真会变红,已演示)
  reverse_test.py   assert_gate_is_real（证明闸会变红）
  run_eval.py       全基线×全审计 → GO/NO-GO 编排（@register）
  registry.py       模型注册表读取（换模型改 model_registry.json 1 处）
audits/         各方向审计插件（import 即 @register / register_reverse）
  audit_consistency.py  D5 最小版（色相±15°/头身比±5%）
baselines/      黄金基线（jadepavilion 翡翠楼）+ cases（run_eval 基线）+ cases_poison（红演示）
fixtures/       每闸一对 clean/poison 反例
model_registry.json  D3 模型单一事实来源
verify.py / run.py / Makefile  入口
```

## 接入约定（新方向 = 薄插件）

1. `audits/audit_<x>.py` 实现 `run(case)->Report` 并 `@register("<x>")`
2. 往 `harness/lexicon.py` 的 `BY_DIRECTION` 加本方向禁词
3. `fixtures/` 放一对 clean/poison，并 `register_reverse(...)`
4. 涉模型 → `harness/registry.py`，禁硬编码模型名
5. `baselines/` 放黄金基线，纳入 `run_eval`

## 已验证

**S0 G0 退出门** ✅ make verify 红绿可复现 · audit_consistency 对翡翠楼基线→GO · 注+30°色相→NO-GO测回30.0° · assert_gate_is_real · to_json 确定性 · portability 0 命中。

**S1 建秤(P0)** ✅
- D5 `audit_consistency`：6 阈值（轮廓±5%/色相±15°/明度±10%/色温≤200K/LOGO Δ0.05/白底≥245）+ 可选 Pillow 像素对图（无 PIL 优雅降级）。
- D9 `audit_storyboard`：6 类检查（字段/强制映射5级禁中景/无时码/引擎隐身/加权命中率/红线）+ 5 题基线（文戏锚翡翠楼·武戏·POV·商业·拟人）+ clean/poison。
- `run_eval` 编排 2 审计 × 6 case → GO/NO-GO。verify 全绿（reverse 2/2 真闸 · 5 题命中率 1.0 · portability 0）；`run.py baselines/cases_poison` → NO-GO/exit1；两次 run_eval 输出逐字符确定性。

**S2 杠杆(P1) · 套件侧** ✅
- D3 `audit_model_adapters`：`_model/capability-contract.md`（7 能力位）+ registry 能力矩阵；验 7 位覆盖/默认∈适配器/降级同族/图像分级/音色音乐。
- D1 `audit_execution`：`production-bible/execution-contract.md`（四表/分镜→key_elements/shots=镜头组/DAG/pause_gates）+ 翡翠楼样例；验引用闭合/时长制/敏感类强制 element_render 门/降级同族/隐身/无宿主API/DAG无环。
- D2 `audit_reverse_board`：`reverse-board/SKILL.md`（三档探针，无多模态降 C 档）+ clip_skeleton 契约；验双时长/占位符零专名/运镜切镜∈十类/换主体隐身/C档禁臆造时码。
**S3 扩展(P2)** ✅
- D4 `camera_path`(运镜图:10配色/4区块/标注==源镜头/节奏==Σ镜/schematic声明) · D6 `audio_assembly`(混音dB阶梯 duck∈[8,12]/boost∈[3,5]/cf0.5/mute_bgm) · D7 `static_board`(3Hero+8Detail/同asset_id/零视频字段) · D8 `image_genome`(四维基因卡/配比和1.0/零HEX) · D11 `cost`(fill≥0.67/禁降档/无货币)。
- 知识契约：`_shared/assembly.md` · `visual-genome.md` · `cost.md` + `camera-path/`·`static-board/` 成员。
**S4 收口(P2/P3)** ✅
- D12 `style_fidelity`(作者锚缺漏/禁用触发词含别名/成片零审计元数据) · D10 `coverage`(ledger9行+d9基线/POV摊平==可达终局/变身≥4态+不变量锁) · D13 `terminology`(扫全仓.md禁旧口径「八维/8维知识」→「五大维度」)。
- D13 口径统一：`_shared/glossary.md`(权威三概念:推理六维/支柱八大/知识库五大维度) + `VERSIONS.md`(契约台账)；已修 DESIGN/README 的「八维」漂移并脚本强制。

**套件侧尾巴（已清）** ✅
- D9 `mapping_integrity`：强制映射从 `mapping-tables.md` §1 取规则 →「打乱映射→NO-GO + 嫌疑指针」**已真机演示**。
- D13 `versions`（契约版本台账一致）· `bible_interlock`（四表互锁四不变量:引用闭合/焦点覆盖/状态轴单调/L1锚不漂）· `megaprompt_sync`（单产物成员 mega 覆盖）。

## 全部 13 方向套件侧秤 + 尾巴已落地 ✅

`verify` 跑 **17 审计 × 21 case → GO**，reverse_test **17/17 真闸**，portability 扫 39 .md 0 命中。

## 剩余

- 真机/宿主集成（需先打 de-risk 探针 + 用户亲点付费）：D1 ViMax 消费 1 shot + 暂停门真停（SPIKE-C）；D2/D8 多模态读视频/读图 A/B 档（SPIKE-A/B）。
- D5 装 Pillow 接真图（需 pip，动环境=你定）；production-bible 全案真机基线；luban 出师。
- ⚠️ 全部审计是**契约/结构符合度**校验，**非创作质量**；fixtures/基线为手写，真实 agent 产出未过秤——见迭代评审。
