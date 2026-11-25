# SSD 知识问答评估

这套题评估工程师能否根据当时的观测作出处置。PCIe Base 5.0 v1.0 和 NVMe Base 2.1 为条款依据。工程观测为模拟案例，答题报告来自已完成的 Pi 对照实验。

## 题库与出题

| 数据 | 数量 | 内容 |
| --- | ---: | --- |
| [工程盲题册](scenarios/engineering-questions.md) | 74 道 | 8 道启停试跑题、54 道首批扩展题、12 道新故障族工单。只显示问题和首次观测。 |
| [工程评审题库](scenarios/) | 74 条记录 | 参考答案、加权判据、否决项和规范定位。18 题另有两种预设补充观测，同一题的分支仍属于同一故障族。 |
| [PCIe 检索题](bank/pcie.jsonl) · [NVMe 检索题](bank/nvme.jsonl) | 170 道 | 逐问的规范证据、回答断言及一种改写。两种问法找全证据的成绩单独计算。 |
| [早期 NVMe 题](eval_queries.jsonl) | 30 道 | 此前的金标和检索探针，保留原数据格式。 |

先写当班工程师要作的决定，再写当时能知道的观测。对每个影响处置的判据登记规范版次、PDF 文件页、节号或图表以及短锚。复测分支要写清观测如何改变动作。出题和调试按故障族分隔，已用过的题转入回归集。[出题指南](ssd-testset-generation-guide.md) · [研究依据与样题](ssd-testset-design.md)

## 在前端查看

打开 **设置 → 智能体 → 智能体评估**，在空白工作台点击 **打开 SSD 示例**。已有报告时，也可以通过 **导入报告** 打开下方链接中的第三轮 JSON。页面先显示基线和候选两轮的原样可用、误导、通过及交卷数据。选一道题后逐栏显示原答、评判理由、实际读过的页，展开参考答案能看到证据定位和判据。窄屏可横向滚动指标表，并纵向阅读两份回答。选择候选轮次后，**导出盲测题目**只输出该轮实际计划的题面与观测。

建议先在示例中切到 **SSD-F3-01**，对照两份回答分别依据哪条完成记录决定是否归还缓冲，再展开评审理由。这个例子有同题两份原答、原样可用标签和证据页。

旧轮次通过 **导入报告** 打开。[八题试跑](reports/pilot.json) · [六题改进实验](reports/iteration-study.json) · [两道迁移题](reports/iteration-transfer.json) · [第二轮 12 题](reports/field-usable-v2.json) · [内置的第三轮报告](../../packages/app/src/components/evaluations/ssd-example-report.json)

从仓库根目录执行下列 PowerShell 命令，可以把 74 道题作为一个尚未作答的轮次导入工作台。生成和浏览这份报告只需要 Python 3.11 或更新版本。

```powershell
$kit = 'examples/ssd-evaluation'
$scratch = "$kit/.local"
python -X utf8 "$kit/scenario_eval.py" blind --suite all --output "$scratch/questions.jsonl"
@'
{"title":"SSD 工程题库","rounds":[{"id":"planned","label":"计划提问","config":"74 道工程首问","plan":"questions.jsonl"}]}
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
