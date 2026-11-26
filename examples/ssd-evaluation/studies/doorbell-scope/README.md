# 门铃槽位恢复与通知分支回归

旧答卷已确认 QID=9 的槽位、两页写入方和本代配置有效，却把 EventIdx 比较和 MMIO 轨迹列为槽位恢复的额外门槛。原始取证同时预取了布局与配置的第 445–446 页和通知的第 702 页。现在只验配置和槽位时优先提供第 445–446 页；工单要求判通知、漏写或阈值跨越时继续提供第 702 页。Skill 给两种工单各自的记录和判据。[旧答卷](../field-usable-v16/regression-replay.jsonl) · [签发 skill](../../skills/scoped-field-acceptance/ssd-field-decisions/SKILL.md)

| 回归题 | 现场应如何签发 | 本次复核 |
| --- | --- | --- |
| SSD-F15-08 | 签本代次两个最远槽位。留存布局、本次 Admin SQE/CQE 和两类槽写的地址、值及写入方。 | 3 次均签，均未把通知轨迹设为门槛。 |
| SSD-F13-06 | 同一 CQ 的 4→7 未跨过当时的 9，签发该次省略额外 MMIO 符合要求。 | 1 次答对。 |
| SSD-F12-06 | 事后读回 12 无法证明当时无需 MMIO；需要同一 SQ 的当次比较输入和真实轨迹。 | 1 次答对。 |

这些是已用于调优的合成回归题。工作台报告收录每题首跑及代理复核，槽位题另外保留两次重放记录。[盲题](questions.jsonl) · [首跑及复核](reviewed.jsonl) · [补充重放](repeat-slots.jsonl) · [工作台报告](../../reports/doorbell-scope-regression.json)

### 在其他机器查看和复跑

直接在 **设置 → 智能体 → 智能体评估 → 导入报告** 打开上面的报告。生成报告只需要 Python 3.11 或更新版本。

```text
python -X utf8 examples/ssd-evaluation/export_workbench.py examples/ssd-evaluation/studies/doorbell-scope/workbench-manifest.json --output examples/ssd-evaluation/.local/doorbell-scope.json
```

运行模型时，按[语料准备](../../README.md#复跑与审计)安装 Python 依赖及配置当前规范语料。安装 Pi 和 `pi-mcp-adapter`，启用所选模型的提供方，替换下列两个入口文件路径。以下单行命令适用于从仓库根目录启动的 PowerShell 或 Bash。输出目录应为新目录。

```text
python -X utf8 examples/ssd-evaluation/pi_trial.py --input examples/ssd-evaluation/studies/doorbell-scope/questions.jsonl --output examples/ssd-evaluation/.local/doorbell-run --pi-entry "path/to/pi/dist/bundle/cli.js" --adapter "path/to/pi-mcp-adapter/index.ts" --provider magpie --model codex/gpt-6.2-sol --prefetch --evidence-view decision --answer-style field-acceptance --skill examples/ssd-evaluation/skills/scoped-field-acceptance/ssd-field-decisions/SKILL.md --calls 8 --timeout 120
```

逐份检查原答是否给出表中的处置和证据要求。计时从各运行记录读取。可用性参照本表，避免用一条规范引用或总分替代实际签发判断。
