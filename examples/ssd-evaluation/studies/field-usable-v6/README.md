# 第六轮时序证据留出试验

先拆解第五轮的 3 份误导和 2 份需修改答卷。两道历史题分别暴露了缺初始状态条款，以及规范条款已取得、但没有同期现场证据。三份其他答卷涉及恢复条件遗漏、字段作用范围和与现场不符的附加规则。[逐题复盘](five-answer-audit.md)

候选在同一取证预算内增加 `read_spec_transition`，按两个字面线索返回触发与状态的原文。交卷复核只读题面、草稿和实际取到的规范片段，按同一对象、同一次事件和同一时段核对支撑动作的句子。出现复位、清位或重新读取时，明确把历史结论和当前结论绑定到各自的证据。可以依有效的同期证据下定论。

## 对照设置

本轮的基线是第五轮实际使用的 `closure` skill、`scoped` 提示和 `decision` MCP。候选使用 `timeline` skill 和新增触发取证工具，由同一 DeepSeek Flash 模型取证起草，再由 Codex Sol 复核后交卷。候选的第二次模型调用计入同一 120 秒时限。两版均有 8 次取证额度，含两次预取，语料与检索排序一致。最初同模型复核在旧窗口题触发超时，最终的复核模型经旧题验证后选定，实际新题答题开始前冻结。试验比较整套配置的效果。[冻结记录](registration.json) · [复核 skill](../../skills/timeline/ssd-field-decisions/SKILL.md)

16 个合成工单来自此前 94 道工程题未用的 16 个故障族，NVMe 和 PCIe 各 8 道。其中 10 道问历史事件或对旧窗口下结论，6 道问同期证据可支持的决定。32 处原文定位已用原版 PDF 验证。两个配置按题交叉安排先后，均保留首个计划会话的交卷状态。评分模型与生成和复核模型分开，初评独立匿名，裁决完成后揭盲。[题面](questions.jsonl) · [评审配置](review-protocol.json)

揭盲前登记了两次运行异常。基线的 SSD-F6-13 在 Windows 进程异常退出后未交卷。候选的 SSD-F6-04 遇到共享 MCP 缓存写入冲突，只收到预取证据，仍给出交卷。配对主统计保留这两个首次结果，并单列去掉这两对后的敏感性结果。

## 结果

| 口径 | 原样可用，旧 → 新 | 可能误导，旧 → 新 |
| --- | ---: | ---: |
| 全部 16 题 | 9/16 → 10/16 | 3/15 → 0/16 |
| 历史结论 10 题 | 6/10 → 6/10 | 2/10 → 0/10 |
| 去掉两个运行异常题 | 9/14 → 9/14 | 3/14 → 0/14 |

原样可用以计划题数为分母，误导以已交卷为分母。双方都交卷的 15 题中，3 份旧误导转为 2 份可用、1 份待修改。所有计划题中，4 题转为原样可用，3 题从原样可用转为待修改。严格评分通过从 14/16 到 11/16，运行中位耗时从 23.9 秒到 30.2 秒。候选 16 次交卷复核均成功，新 MCP 触发和状态取证调用成功 2 次。[指标明细](metrics.json) · [旧版已审作答](baseline-reviewed.jsonl) · [新版已审作答](candidate-reviewed.jsonl)

候选减少的历史错误包括把既有 PME 状态引发的中断写成新消息，以及把 Notice 交付的时刻写成条件首次出现。剩下 6 份需修改答卷中，有的漏了进入 DL_Inactive 清 Valid、Timeout 结束后 Pending 也能清零等重要条件。有一份 PMR 禁写决定正确，却增加了未被证实的写请求完成行为。去掉两个运行异常后，原样可用数持平。这个样本支持继续检验误导下降，并未建立可用率有稳定增益或单项工具的独立效果。

两位初评对 32 个计划答卷中的 21 个给出相同可用性标签，13 个在标签、判据或否决项上需要裁决。一个模型的部分返回缺少判据键，在揭盲前按同一规则和同一模型逐条补齐，保留有效的初评记录。冻结题库保留了原定位，现行题库更正 SSD-F6-11、12、15 的节号。页码、原文锚点和评分判据均保持原样。[冻结题库](bank-as-tested.jsonl) · [匿名裁决](ratings-final.jsonl)

## 工作台

在 **设置 → 智能体 → 智能体评估** 选择 **导入报告**，可查看两版在同一批题的原样可用率、误导率、严格评分和交卷，逐题打开原答及规范证据。[第六轮归档报告](../../reports/field-usable-v6.json)

```powershell
$kit = 'examples/ssd-evaluation'
python -X utf8 "$kit/export_workbench.py" "$kit/studies/field-usable-v6/workbench-manifest.json" --output "$kit/.local/replay-v6.json"
```

准备语料后，可用下面的 PowerShell 命令复问一条。复问的首次运行和复核日志落在新目录，历史评审报告仍引用本轮冻结的档案。[语料准备](../../README.md#复跑与审计)

```powershell
$pi = Join-Path $env:APPDATA 'npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
$adapter = Join-Path $env:USERPROFILE '.pi/agent/npm/node_modules/pi-mcp-adapter/index.ts'
$out = "$kit/.local/v6-replay-$([guid]::NewGuid())"
python -X utf8 "$kit/pi_trial.py" --input "$kit/studies/field-usable-v6/questions.jsonl" --id SSD-F6-15 --output $out --pi-entry $pi --adapter $adapter --provider magpie --model auto/deepseek-v4.1-flash --review-model codex/gpt-6.2-sol --answer-style timeline --evidence-view decision --prefetch --skill "$kit/skills/timeline/ssd-field-decisions/SKILL.md" --calls 8 --timeout 120
```
