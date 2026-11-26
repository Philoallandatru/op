# SSD 知识问答评估

这套题评估工程师能否根据当时的观测作出处置。PCIe Base 5.0 v1.0 和 NVMe Base 2.1 为条款依据。工程观测为模拟案例，答题报告来自已完成的 Pi 对照实验。

## 题库与出题

| 数据 | 数量 | 内容 |
| --- | ---: | --- |
| [工程盲题册](scenarios/engineering-questions.md) | 266 道 | 启停试跑、扩展题和多个留出轮次，只显示问题和首次观测。 |
| [工程评审题库](scenarios/) | 266 条记录 | 参考答案、加权判据、否决项和规范定位。18 题另有两种预设补充观测，同一题的分支仍属于同一故障族。 |
| [PCIe 检索题](bank/pcie.jsonl) · [NVMe 检索题](bank/nvme.jsonl) | 170 道 | 逐问的规范证据、回答断言及一种改写。两种问法找全证据的成绩单独计算。 |
| [早期 NVMe 题](eval_queries.jsonl) | 30 道 | 此前的金标和检索探针，保留原数据格式。 |

先写当班工程师要作的决定，再写当时能知道的观测。对每个影响处置的判据登记规范版次、PDF 文件页、节号或图表以及短锚。复测分支要写清观测如何改变动作。出题和调试按故障族分隔，已用过的题转入回归集。[出题指南](ssd-testset-generation-guide.md) · [研究依据与样题](ssd-testset-design.md)

## 在前端查看

打开 **设置 → 智能体 → 智能体评估**，在空白工作台点击 **打开 SSD 示例**，即可查看最新一轮独立新题的同题对照。页面显示原样可用、误导、处置条件完整、验收可执行和交卷耗时。验收可执行以该题预先定义的测量对象、记录与通过标准为准。耗时图显示每道同题的增减和各阶段的耗时，点选柱条可查看原答、评判理由和取证页。展开迭代历史可查看各轮的方法、进展和下一步。**导出盲测题目**输出当前对照轮的题面与观测。

第七轮从第六轮六份需修改的答卷出发，检验复核能否保留处置门槛和替代路径。[六份答卷复盘](studies/field-usable-v7/six-answer-audit.md) · [第七轮](studies/field-usable-v7/README.md)

第八轮拆解耗时，将取证与签发合并到一次模型会话，再用新题对照响应时间和交付质量。[第八轮](studies/field-usable-v8/README.md)

第九轮补齐槽位末字节、各命令完成项和 Steering Tag 写入字段。[第九轮](studies/field-usable-v9/README.md)

第十轮逐题复盘第九轮四份需修改答卷，补齐该测什么、核对哪条现场记录、什么结果才算通过。[四份答卷复盘](studies/field-usable-v10/four-answer-audit.md) · [第十轮](studies/field-usable-v10/README.md)

第十一轮复测同一记录里的审批和实测能否分别作为正确的放行条件。[第十一轮](studies/field-usable-v11/README.md)

第十二至十四轮把同题耗时拆成检索、起草、签发和其他开销。去掉签发中的重复表述，并逐轮补回现场验收的关键证据。[逐题耗时诊断](studies/field-usable-v12/latency-diagnosis.md) · [第十二轮](studies/field-usable-v12/README.md) · [第十三轮](studies/field-usable-v13/README.md) · [第十四轮](studies/field-usable-v14/README.md)

第十五轮增加通过项留存记录与待验项复验门槛，并在原预取预算内提供 Flush、DNR 和 IDLP 条款。第十六轮配对门铃配置的原始提交与完成，要求错误日志关联同次事件。[第十五轮](studies/field-usable-v15/README.md) · [第十六轮](studies/field-usable-v16/README.md)

门铃专项回归覆盖槽位恢复签发、通知无需额外写入、历史通知遥测不足三种场景。报告可直接导入，模型用同一盲题册跨机器重放。真实工单另有本地题库和工程师签发记录评审口径。[门铃回归](studies/doorbell-scope/README.md) · [现场工单盲测](field-work-order-review.md)

各轮也可通过 **导入报告** 打开。[八题试跑](reports/pilot.json) · [六题改进实验](reports/iteration-study.json) · [两道迁移题](reports/iteration-transfer.json) · [第二轮](reports/field-usable-v2.json) · [第三轮](reports/field-usable-v3.json) · [第四轮](reports/field-usable-v4.json) · [第五轮](reports/field-usable-v5.json) · [第六轮](reports/field-usable-v6.json) · [第七轮](reports/field-usable-v7.json) · [第八轮](reports/field-usable-v8.json) · [第九轮](reports/field-usable-v9.json) · [第十轮](reports/field-usable-v10.json) · [第十一轮](reports/field-usable-v11.json) · [第十二轮](reports/field-usable-v12.json) · [第十三轮](reports/field-usable-v13.json) · [第十四轮](reports/field-usable-v14.json) · [第十五轮](reports/field-usable-v15.json) · [最新内置示例](../../packages/app/src/components/evaluations/ssd-example-report.json)

从仓库根目录执行下列 PowerShell 命令，可以把全部工程题作为一个尚未作答的轮次导入工作台。生成和浏览这份报告只需要 Python 3.11 或更新版本。

```powershell
$kit = 'examples/ssd-evaluation'
$scratch = "$kit/.local"
python -X utf8 "$kit/scenario_eval.py" blind --suite all --output "$scratch/questions.jsonl"
@'
{"title":"SSD 工程题库","rounds":[{"id":"planned","label":"计划提问","config":"工程首问","plan":"questions.jsonl"}]}
'@ | Set-Content -Encoding utf8 "$scratch/plan.json"
python -X utf8 "$kit/export_workbench.py" "$scratch/plan.json" --output "$scratch/question-bank.json"
```

## 复跑与审计

真实取证用本地规范原件。获取 PCIe Base 5.0 v1.0 与 NVM Express Base 2.1 后，设置两个 PDF 的路径，安装工具依赖，再准备语料。准备程序检查版本及页数，并将副本与索引写入 Git 忽略的 `.local/`。之后可用同一索引运行检索和 MCP。[PCI-SIG 规范目录](https://pcisig.com/specifications) · [NVMe 2.1 原件](https://nvmexpress.org/wp-content/uploads/NVM-Express-Base-Specification-Revision-2.1-2024.08.05-Ratified.pdf)

```powershell
python -m pip install -r examples/ssd-evaluation/requirements.txt
$pcie = Read-Host 'PCIe Base 5.0 v1.0 PDF'
$nvme = Read-Host 'NVMe Base 2.1 PDF'
python -X utf8 examples/ssd-evaluation/prepare_corpus.py --pcie $pcie --nvme $nvme
python -X utf8 examples/ssd-evaluation/scenario_eval.py validate --suite all
python -X utf8 examples/ssd-evaluation/benchmark.py validate
python -X utf8 examples/ssd-evaluation/benchmark.py run --split test --modes domain --output examples/ssd-evaluation/.local/retrieval
python -X utf8 -m unittest discover -s examples/ssd-evaluation -p 'test_*.py'
```

默认语料根为 `.local/corpus`。也可用 `SPEC_EVAL_ROOT` 指向另一个已准备的语料目录。旧版本的检索实验还使用了知识库里的概念词表和索引，独立检出版从两份 PDF 构建规范页索引和基础术语表。它能复跑相同题面、规范、评审流程及证据视图；检索排序、耗时和模型答案会随语料提取器、词表、运行环境和模型路由而变。[历史检索实验](spec-retrieval-study.md) · [MCP 返回格式](evidence-context.md)

下一轮从旧答卷中找到导致错误处置的具体句子，冻结改动前后的 skill 和 MCP，按相同预算投放新故障族，再匿名评分。报告同时记录原样可用数除以计划数、误导数除以交卷数和误导数除以计划数。[第三轮选题、评分、复跑和报告生成](studies/field-usable-v3/README.md)
