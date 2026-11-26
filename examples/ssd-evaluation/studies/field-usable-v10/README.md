# 第十轮现场验收证据

第九轮四份需修改的答卷已命中关键处置条件。剩余缺口分别落在实测范围、完成记录的解释、应用映射和真实发包。最终配置在同四道旧题上回放，检查是否给出可执行的通过标准。[四份答卷复盘](four-answer-audit.md) · [回归答卷](regression-replay.jsonl)

## 改动

签发仍在单次模型会话完成。每项必要核验写出对象、具体记录和通过标准，候选证据中的规范规则照常按页引用，现场测试的门槛按工单目标描述。已有实证时可以直接引用同一对象和时点的记录。术语触发时，MSI-X 消息、掩蔽和缓存更新的原文并入原有预取。[签发 skill](../../skills/acceptance/ssd-field-decisions/SKILL.md)

## 盲测方法

先冻结答题配置，再拟定 16 道没有用于调优的合成题。门铃、fused、Steering Tag、MSI-X 各 3 道，另有 4 道迁移题。证据来自 NVMe Base 2.1 和 PCIe Base 5.0 Version 1.0。两组使用同一 Codex Sol 模型、语料、120 秒时限和 8 次取证预算，按题交错配置顺序。两位模型评审只看匿名答卷、题面和原文片段，意见分歧交第三位模型裁定，然后揭盲。评审按可执行性给分，格式本身不加分。[冻结记录](registration.json) · [题面](questions.jsonl) · [评审口径](review-protocol.json)

处置条件完整为 C2 满分，验收可执行为 C3 满分，两者和原样可用的分母是计划题。误导率以交卷为分母。端到端耗时按交卷取中位数，同时记录同一题的差值及 20 秒目标，预定容许回退量为 2.5 秒。

## 结果

| 指标 | 第九轮配置 | 第十轮配置 |
| --- | ---: | ---: |
| 原样可用 / 计划 | 12/16 | 15/16 |
| 验收可执行 / 计划 | 12/16 | 15/16 |
| 处置条件完整 / 计划 | 16/16 | 16/16 |
| 可能误导 / 交卷 | 0/16 | 1/16 |
| 端到端耗时中位数 | 19.88 秒 | 21.98 秒 |

两边交齐 16 题，无 MCP 初始化告警。三道转为原样可用，基线原样可用的题均保持。配对耗时增加的中位数为 2.44 秒。两位初评对 27/32 份给出同一可用性标签，5 份有判据或标签分歧后由第三位裁定。[指标](metrics.json) · [基线答卷](baseline-reviewed.jsonl) · [候选答卷](candidate-reviewed.jsonl) · [裁定](ratings-final.jsonl) · [可导入工作台报告](../../reports/field-usable-v10.json)

F10-08 已正确拒签共用短 Steering Tag 并要求同轮逐流核验。但后续把应用批准和当前平台映射写成“或”，允许在应用批准缺失时按平台配置签发。这个风险由后续配置修复，独立新题验证见第十一轮。[批准与实测复测](../field-usable-v11/README.md)

## 重放记录

```powershell
$kit = 'examples/ssd-evaluation'
python -X utf8 "$kit/export_workbench.py" "$kit/studies/field-usable-v10/workbench-manifest.json" --output "$kit/.local/replay-v10.json"
python -X utf8 "$kit/studies/field-usable-v6/summarize.py" "$kit/.local/replay-v10.json" --bank "$kit/scenarios/field-engineering-v10.jsonl"
```
