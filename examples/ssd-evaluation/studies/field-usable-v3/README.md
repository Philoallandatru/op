# 第三轮工程问答留出试验

2026 年 11 月 24 日在同一台 Windows 测试机上运行。12 道题均为独立编写的模拟工单，6 道以 PCIe 为主，6 道以 NVMe 为主。题库排除了既有的 62 道工程题和已登记的 48 个故障族。8 题证据足以作当前决定，2 题需要条件分支，2 题需要补充观测。新题的题面、36 条判据和 26 处规范锚点在投放前冻结，两组都只收到问题和初始观测。[冻结题面](questions.jsonl) · [当时的判据](bank-as-tested.jsonl) · [预注册](historical-registration.json)

## 改动和运行条件

| 配置 | 基线 | 候选 |
| --- | --- | --- |
| Pi skill | 检查对象、状态及授权 | 逐码核对结果和动作，只有前提与处置相同才合并 |
| MCP 证据 | `bounded`，按章节、行号、页边界给原文 | `outcomes`，增加版面可识别的结果表字段、续行和条件句 |
| 共同设置 | Pi 1.5.2，`magpie/auto/deepseek-v4.1-flash`，thinking off，`domain`，相同索引 | 120 秒、8 次取证（含两次预取），每答独立会话，保留首次结果 |

运行顺序用冻结种子安排，六题旧版先答，六题新版先答，最多三个并发。两位模型评审分别读匿名答卷，第三位模型评审根据原题、判据和出处在揭盲前裁定分歧。模型服务的解码随机性及负载未固定。[独立评分约定](assessment.md) · [盲评裁决](adjudication.md) · [历史候选指纹](historical-candidate.json)

## 输出与结论

| 指标 | 旧版 | 新版 |
| --- | ---: | ---: |
| 原样可用 / 计划提问 | 1/12 | 2/12 |
| 可能误导 / 已交卷 | 9/10 | 10/12 |
| 可能误导 / 计划提问 | 9/12 | 10/12 |
| 严格评分通过 | 7/12 | 7/12 |
| 交卷 | 10/12 | 12/12 |

新增的可用答卷按目标 I/O 的完成结果分别处理，并在证据不足时保留读缓冲。两份原先超时的答卷在新版交卷，仍存在会影响现场动作的错误。双方都交卷的 10 题中，有一道由误导变为可用，没有反向变化。该样本不足以确认稳定收益，且尚未测量一线工程师实际采用率。[逐题统计](summary.json) · [旧版已审答卷](baseline-reviewed.jsonl) · [新版已审答卷](candidate-reviewed.jsonl)

此前高分误答中，长测中止与已完成失败被合并成同一种动作。回归时虽实际送入了规范结果表，新版仍有同一错误。另有一处旧参考答案漏掉了扩展自测跨控制器级复位恢复的要求，现行维护题库已修订。[逐项处置与旧题复盘](five-answer-audit.md) · [五份复跑记录](old-five-regression.jsonl)

## 运行与展示

从仓库根目录，按[语料准备说明](../../README.md)构建两份规范的本地索引。将 `$pi` 和 `$adapter` 设为已安装的 Pi Node 入口和 MCP 适配器入口，`$provider` 与 `$model` 使用本机已有的模型配置。下面示例只复问一题。对照复跑需要两次分别使用 `bounded` 和 `outcomes`，保持其余参数一致。公开的题面和评审材料只适合复现与回归，下一轮应预先另选新故障族。

```powershell
$kit = 'examples/ssd-evaluation'
$round = "$kit/studies/field-usable-v3"
$trial = @{ input = "$round/questions.jsonl"; id = 'SSD-F3-01' }
$out = "$kit/.local/pi-$([guid]::NewGuid())"
python -X utf8 "$kit/pi_trial.py" --input $trial.input --id $trial.id --output $out --pi-entry $pi --adapter $adapter --provider $provider --model $model --mode domain --answer-style decision-audit --prefetch --calls 8 --timeout 120 --evidence-view outcomes --skill "$kit/skills/outcomes/ssd-field-decisions/SKILL.md"
python -X utf8 "$kit/export_workbench.py" "$round/workbench-manifest.json" --output "$kit/.local/field-usable-v3.json"
```

第二条命令由已审档案重建前端报告。要对比新的首答，复制清单，添加相对于清单的 `runs` 目录和新的 `reviews` 文件。留出评审由独立评审读取随机编号的首答。保存 `id, completed, criteria, reject_hits, usability, reason, other_error` 后可用 `scenario_eval.py score` 重算判据。用 `export_workbench.py` 生成对照 JSON，再到 **设置 → 智能体 → 智能体评估** 导入。

本目录保存投放题、双评和裁决、配对统计、用于报告的答案及必要取证记录。历史原始运行事件和 PDF 仍由实验机器保管。工作台可导入同一份已审档案重建的[第三轮报告](../../reports/field-usable-v3.json)。
