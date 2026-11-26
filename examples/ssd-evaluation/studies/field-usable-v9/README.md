# 第九轮门铃边界与验收核对

复盘第八轮的 1 份可能误导与 2 份需修改答卷。答题进程已经找到相关规范页。门铃题缺计算实际槽位，fused 题缺分别核对完成，Steering Tag 题缺写入位段。[三份答卷复盘](three-answer-audit.md)

## 改动

- 门铃缓冲区使用基于字节偏移的确定性 MCP 核验。正文公式、Figure 486 的分配范围与实际访问槽位分别返回。有实际 ID 时分别核对 SQ Tail 和 CQ Head，`最后一个字节 < 页大小` 才在页内。对齐、所有权和本次 Admin CQE 由签发者独立核对。
- 对 Doorbell Buffer Config、fused 操作和 Steering Tag，把对应原文放进同一次预取。Fused 验收要求每条命令各自的 CQE；PCIe 共享 CQ 与消息型传输分别处理。Steering Tag 需核对表位置、索引、实际位段和 Extended TPH 权限。
- 两种配置都通过一次 Codex Sol 会话完成取证与签发。[第九轮 skill](../../skills/verified-conditions/ssd-field-decisions/SKILL.md)

## 盲测方法

答题配置先冻结。16 道合成留出题使用与旧题不同的现场观测和决策，覆盖 6 道门铃题、4 道 fused 题、4 道 Steering Tag 题及 2 道其他工程核验题。35 个短证据锚点分别核对 NVMe Base 2.1 与 PCIe Base 5.0 Version 1.0 的文件页。两组采用相同模型、规范、120 秒时限和 8 次取证预算，按题交错安排先后。答题进程只收到问题与观测，两个评审模型分别接收匿名答卷，并由第三个模型在揭盲前裁定标签或分值分歧。[冻结记录](registration.json) · [题面](questions.jsonl) · [评审口径](review-protocol.json)

误导率以已交卷答卷为分母，原样可用率和处置条件完整率以计划题为分母。条件完整要求 C2 满分。耗时看已交卷的中位数和逐题配对差，预先将 2.5 秒设为容许回退量，同时对照新题上的第八轮配置及旧题上的 24.695 秒。模型盲评覆盖本批合成工单。

## 结果

| 指标 | 第八轮配置 | 第九轮配置 | 排除告警配对 |
| --- | ---: | ---: | ---: |
| 原样可用 / 计划 | 10/16 | 12/16 | 10/15 → 11/15 |
| 可能误导 / 交卷 | 0/16 | 0/16 | 0/15 → 0/15 |
| 处置条件完整 / 计划 | 16/16 | 16/16 | 15/15 → 15/15 |
| 端到端耗时中位数 | 21.815 秒 | 19.91 秒 | 22.50 → 19.77 秒 |

两组都交齐 16 份。第九轮有 13/16 题提速，逐题节省的中位数为 3.78 秒。门铃题原样可用保持 5/6，fused 题从 2/4 到 3/4，Steering Tag 题保持 3/4，另外两题从 0/2 到 1/2。两组均未观察到误导，样本对更低的误导率没有区分力。两位初评对 22/32 份给出相同的可用性标签，11 份分歧在揭盲前完成裁定。[指标](metrics.json) · [基线答卷](baseline-reviewed.jsonl) · [候选答卷](candidate-reviewed.jsonl) · [评审裁定](ratings-final.jsonl)

候选 F9-16 的 Windows Pi MCP 缓存文件写入发生共享冲突。该次仍成功做了一次交互取证，两次预取也完成，保留首答。剔除此题的同题对照列在上表。

第八轮三道问题题和一条数值用例以最终配置复跑。答卷分别补齐门铃每页末字节、匹配两条 fused CQE、选择 Vector Control 的两个位段。此处是对具体故障的回归核验。[回归答卷](regression-replay.jsonl)

候选仍需修改的 4 份答卷缺少重新配置后对最远门铃槽位的实测（F9-03）、恢复首条 CQE 后仍查适用命令集确认状态含义（F9-09）、应用能否接受缩短后的 Steering Tag（F9-11），以及复验新 MSI-X Address/Data 是否实际用于发出的消息（F9-15）。它们都给对了主要处置，并通过了条件完整性判据。

## 重放记录

评估使用本地规范语料和 Pi 的 `magpie` 提供方。已评答卷可以直接导出到工作台。

```powershell
$kit = 'examples/ssd-evaluation'
python -X utf8 "$kit/export_workbench.py" "$kit/studies/field-usable-v9/workbench-manifest.json" --output "$kit/.local/replay-v9.json"
python -X utf8 "$kit/studies/field-usable-v6/summarize.py" "$kit/.local/replay-v9.json" --bank "$kit/scenarios/field-engineering-v9.jsonl"
```
