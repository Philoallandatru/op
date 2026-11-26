# 第五轮留出试验

第四轮的配对对照没有改善主指标。很多答卷先给对了决定，随后附加的诊断、复测和假设性放行条件改变了处置。本轮保留同一个第三轮基线，候选使用 `decision` MCP、`closure` skill 和 `scoped` 提示。要求首答最多三项，当前处置与直接依据已经足够时直接结束。只在放行缺一项观测时给出必要的只读核验。[第四轮结果](../field-usable-v4/README.md) · [候选 skill](../../skills/closure/ssd-field-decisions/SKILL.md)

候选配置先冻结，再编写 8 道题。四道用 NVMe，四道用 PCIe，按 8 个独立故障族避开既有 86 道工程题。相同 Pi、模型、语料和检索排序，每题 120 秒，8 次取证含两个预取。按题交叉投放先后，只保留首答。两位模型分别审阅匿名答卷，第三位裁定分歧后才揭盲。公开档案可用于回归。[冻结记录](registration.json) · [题面](questions.jsonl) · [评审配置](review-protocol.json)

## 配对结果

| 指标 | 第三轮配置 | 第五轮配置 |
| --- | ---: | ---: |
| 原样可用 / 计划 | 0/8 | 3/8 |
| 可能误导 / 交卷 | 7/7 | 3/8 |
| 可能误导 / 计划 | 7/8 | 3/8 |
| 严格评分通过 / 计划 | 6/8 | 5/8 |
| 交卷 / 计划 | 7/8 | 8/8 |

双方都交卷的 7 道题中，4 道由可能误导转出，其中 3 道原样可用、1 道需要修改。另有 1 道基线超时、候选交卷且需要修改。两位初评在 13/16 个计划答卷上给出相同可用性标签，5 份在标签或评分项上的分歧经过匿名裁定。220 字是提示目标，实际完成答卷的中位长度从 866 字符降到 459 字符。候选调用了 9 次字面核验。小样本只衡量这一批题，改善也无法分别归因到 skill、MCP 和提示。[旧版已审原答](baseline-reviewed.jsonl) · [新版已审原答](candidate-reviewed.jsonl) · [匿名裁定](ratings-final.jsonl)

候选仍在 FRS 溢出、仲裁 burst 和确定性窗口题上给出会改变现场动作的错误推断。FRS 答卷在拒绝“恰好一条”后，又把快照当作本窗口漏采数下界。确定性窗口答卷用事后一次状态读数判定之前的样本窗口。此前冻结题库的 NVMe p.225、p.396 页码和英文锚点正确，图号在现行题库更正为 Figure 201、Figure 386。原冻结记录和两轮评分均保留。[冻结判据](bank-as-tested.jsonl)

## 在工作台回放

打开 **设置 → 智能体 → 智能体评估 → 导入报告**，选择任一题可并排阅读两版首答和评审。指标直接引用同一批已审数据，整页读取和字面片段实际命中的页都可从记录核对。[第五轮归档报告](../../reports/field-usable-v5.json)

从归档重建报告。

```powershell
$kit = 'examples/ssd-evaluation'
python -X utf8 "$kit/export_workbench.py" "$kit/studies/field-usable-v5/workbench-manifest.json" --output "$kit/.local/replay-v5.json"
```
