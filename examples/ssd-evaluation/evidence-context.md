# 规范原文片段与适用范围

从仓库根目录运行以下检查，可以复现两套 MCP 工具的返回格式、调用上限和规范原文定位。

```powershell
python -X utf8 -m unittest discover -s examples/ssd-evaluation -p test_evidence_context.py -v
```

工具服务默认使用 `SPEC_EVAL_EVIDENCE_VIEW=classic`。将启动 MCP 子进程时的环境变量设为 `SPEC_EVAL_EVIDENCE_VIEW=bounded`，即可为 `search_spec` 开启带适用范围的预览。两种视图使用相同的检索模式、页排名和调用额度。预取器可以把原始问题传给 `PageRetriever.scoped_passage(protocol, pdf_page, query)`，获得相同格式。

## 工程师怎样核对

- `lines` 是 `read_spec_page.text` 抽取文本的起止行，两端均计入，从 1 开始。用这段连续原文复核判断，引用时注明规范版本、PDF 文件页和章号或图名。PDF 版心印刷页码可能与文件页码不同。
- `preceding_section` 标记原文前最近可定位的书签，含书签起始文件页，若起始位置在本页还附行号。页内版式使标题无法匹配时，`unlocated_page_bookmarks` 单列这些标题。整页阅读返回当页书签和上一有书签页面的最后一个标题。
- 有图表标题或流程引句时，预览在这些边界内选段。`preceding_caption` 或 `preceding_list_intro` 提供核对坐标。图表中字段的基准、限定词、可选性和注脚仍须按原文核对。
- 片段抵达抽取文本页首或页尾时，`adjacent_pages_at_excerpt_edge` 指出可继续阅读的相邻文件页。整页读取保留原文排版抽取结果，跨页表格、脚注和图形必要时回看 PDF。

## 开发回归

| 已公开场景 | 原文复核点 |
| --- | --- |
| 门铃偏移 | NVMe Base 2.1 PDF p.445，§5.2.5，Fig. 486 的 `00h` 明列为缓冲区内偏移。p.73，Fig. 34 注 2 给出 PCIe 传输的 `1000h` 计算示例；相邻 Fig. 35 对应另一种属性模型。 |
| 正常控制器关机 | NVMe Base 2.1 PDF p.133，§3.6.1 在 normal 和 abrupt 两个步骤列表间切换。p.135–136 的 `CAP.NSSES` 取值条件归属 §3.6.3 NVM Subsystem Shutdown。 |
| 电源状态 | PCIe Base 5.0 v1.0 PDF p.464 一页涵盖 L0s 退出以及 §5.4.1.2 L1 ASPM State。定位到 L1 的预览从后一个标题开始。 |

对历史开发阶段和历史迁移阶段的 8 个 `prefetched` 会话，重放其中成功的主动 `search_spec` 调用，逐一核对 103 个返回页（重复命中计入）。103 段均以相同行号在对应页逐字复现，55 段有图表标题，22 段触及页边界。预览正文中位长度由 548 增至 948 个字符，最大 1,000 个字符。这个数字只计引文，模型同时接收少量范围元数据。

这组检查衡量片段能否审计。规范允许的行为、平台当前状态、操作权限和实测因果仍需在答复中逐项判断，答案能否直接用于工单要由独立盲评衡量。

## 核对结果编码和适用条件

`SPEC_EVAL_EVIDENCE_VIEW=outcomes` 启用本轮使用的结果视图。Pi 仍使用 `search_spec`、`read_spec_page`，每次工具请求计入同一额度。预取可用 `PageRetriever.outcome_passage(protocol, pdf_page, query)`。选择结果表时先核对 `field` 和 `field_line` 指向的字段或表名，再读各行。NVMe 自测的类型 DSTC 和结果 DSTR 分别使用独立的编码，同一个值在两张表中可有不同含义。

- 检索片段的 `value_table.rows` 逐行列出原页打印的编码或范围、起始行和结束行。简短的匹配表连同续行原文一起返回；较长的表保留行位置，可以请求整页。整页返回的 `page_outcomes.value_tables` 可以用来对照同页其他字段。
- `check_previous_page`、`check_next_page` 表示可能存在页外内容。跨页时继续读同一规范、同一表名的邻页再归并编码。`value_table: null` 表示本次片段没有匹配可识别的编码表。默认、保留、厂商专用等含义都须由适用条款明示。
- `condition_lines` 指向该页可识别的条件句。规则中涉及的观测对象、关联 ID、设备状态和时序可以从原句核对。工具不掌握现场未提供的回调、状态或动作权限。

例如 NVMe Base 2.1 PDF 第 240 页第二个表中，5h 行延续到“未完成”，6h 和 7h 行延续到失败段是否已知的说明。第一个表的 2h 表示长测类型。PCIe Base 5.0 PDF 第 154 页的 Table 2-35 只列出四个 Completion Status 编码；工具保留原始二进制写法。贯穿多页的表、图内文字和版式不明的编码需要结合邻页或视觉原件复核。

运行 `python -X utf8 -m unittest discover -s examples/ssd-evaluation -p "test_*evidence*.py"` 可复测行号、同页字段隔离、跨页边界、条件句、预算和两个旧视图的兼容性。
## 决策核对视图

`decision` 保留 `outcomes` 的搜索、整页和结果表，并增加 `read_spec_context(protocol, pdf_page, cue)`。用一个英文命令字段名或短语从候选页及前后相邻页取带页号、行号和章节位置的原文。术语按英文词逐词命中，允许原文跨行。用它核对寄存器所有者、位段、条件和结果表续页。范围包含原文上下文，可能有同名字段或邻近字段，需要结合表名核对。

返回 `matches` 和 `pages_examined`。空结果只代表这几页没找到同一短语。该调用消耗一次原有预算，审计记录保存匹配到的页和行范围。

## 时序证据复核

`pi_trial.py --answer-style timeline --evidence-view decision` 在同一个 MCP 上增加 `read_spec_transition`。给定一份规范、候选页、触发和状态的英文字面短语，工具分别返回三个邻近页内命中的原文和行号。两个命中可能属于不同对象或过程，需要从原文核对。工具不读取现场日志，也不生成事件时间。

工具会话先产生草稿。第二次模型调用在同一时限内接收题面、草稿和实际返回过的规范片段，不开启工具，也不读取评审题库。最终输出包含当前处置、直接依据和可选必要核验。超时或结构无效会作为未交卷保留，草稿仍在本地原始运行档案中。

## 完整处置条件

`pi_trial.py --answer-style conditions --evidence-view decision` 增加 `read_spec_conditions(protocol, field, pdf_page, top_k)`，按字面字段定位同页和相邻页的原文。命中在页尾时附随后的续行，便于核对并列前提、备选结果和恢复门槛。仍需核对具体对象及规则方向。

`--answer-style fast-conditions` 增加 `find_spec_conditions(protocol, query)`。一次调用按关键英文字段定位两个候选文件页，返回带行号的原文窗口，并在窗口碰到页边界时附相邻页原文。候选内容需核对字段、对象、时间和适用条件。需要补证时仍可读取字面命中、整页或时序原文。同一个签发模型完成补证、条件核对和结构化交付。独立草稿时间为零，最终作答计入签发时间。

`--answer-style verified-conditions` 保留一次签发会话，并将匹配的门铃、Fused、Steering Tag 原文窗口并入预取。对数值化的门铃布局，`check_doorbell_layout` 接受当前 CC.MPS、CAP.DSTRD、NSQA、NCQA 的原始编码和可选的计划最大 SQID/CQID。它分别报告正文公式、Figure 486 的布局范围和实际 ID 对应槽位。返回末字节为含端点的偏移，落页要求末字节严格小于页大小。缺少实际 ID 时对应的计划结果为未知，页对齐和命令完成单独核验。

`--answer-style acceptance` 将必需的验收写成对象、记录和通过条件三项。涉及 MSI-X Message Address/Data 时，预取包含发送、有效掩蔽和解掩更新缓存的条款。取证仍使用同一会话和门铃边界核验。题面只要求解释或限定范围时，核验只覆盖当前工单。

`--answer-style concise-acceptance` 同样以一个会话完成取证和签发，复用验收三项，并将各项事实放在首次使用的位置。预取对 IDLP 和 Completion 合并定位到对应规范段落。配合 `skills/concise-fieldproof/ssd-field-decisions/SKILL.md`，验收记录保留同次失败 CQE 的状态字段和工单要求的数据校验。在现有记录足以覆盖工单时可以按实测范围签发。

`--answer-style field-acceptance --skill examples/ssd-evaluation/skills/concise-witnesses/ssd-field-decisions/SKILL.md` 继续使用同一个取证和签发会话。预取匹配 Flush 覆盖时序和作用域、DNR 状态含义，以及 IDLP 换算和测量起点。答卷区分已有证据的留存记录和待验项目的重新评估门槛，配对原始提交与完成，并核对日志是否来自同次事件。

复核输入将搜索结果拆成带页号的完整摘录，优先装入字段读取，并保留实际返回的预取结果。输出把关键条件逐项列在处置下方。只有同期证据或可核实的区间覆盖支持历史结论。
