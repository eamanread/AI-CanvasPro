---
name: director-camera-path
description: >-
  运镜轨迹示意图。把分镜镜头组转成给客户/团队看的"运镜轨迹示意图"——彩色箭头标运镜、逐切中文标注、
  机位图标虚线轨迹、节奏总结框。当用户要"运镜示意图/分镜表格图/storyboard sheet/可视化分镜/给客户看的运镜图"时使用。
---

# 运镜轨迹示意图（Camera-Path Schematic）

把分镜（`../storyboard/output-contract.md`）的运镜/景别/切镜/时长，画成一张**可视化施工图**。

## 10 运镜唯一配色（图例）

推=#E03B3B 拉=#3B7BE0 跟前=#E0A23B 跟后=#8B3BE0 环绕=#3BE08B 手持=#E03B9B 斯坦尼康=#3BD7E0 升降上=#9BE03B 升降下=#E0633B 固定=#777777（各唯一，禁撞色）。

## 示意图卡 4 区块

`轨迹`（彩色箭头+机位图标虚线）｜`图例`（10 运镜配色）｜`逐切标注`（条数==源镜头数，中文景别+动作）｜`节奏框`（总时长==Σ镜±1s）。

## 套打提示词铁律

提示词必须含原句 `this is a schematic NOT a final frame`（声明非成片帧）。

## 引擎隐身（铁律）

`schematic / 箭头 / 机位图标 / PUSH IN / 轨迹示意图` 等示意层词**绝不进成片镜头卡**——示意图是另一个产物。审计见 `../_shared/scripts/audits/audit_camera_path.py`。
