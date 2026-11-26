# 第八轮三份答卷复盘

逐题核对第八轮候选答卷、取证页和裁定。原有裁定保留，可从候选归档追溯。[答卷与取证记录](../field-usable-v8/candidate-reviewed.jsonl)

| 工单 | 当时已经找到的证据 | 答卷仍缺的核验 | 第九轮的改动 |
| --- | --- | --- | --- |
| F8-05 Doorbell Buffer Config | NVMe pp.445–446、702，先合并查找，再分别打开布局表和 PRP 定义页 | 答卷用正文公式确认容量，未计算 Figure 486 的 SQ Tail / CQ Head 条目末端。重新配置、对齐和 Admin CQE 成功都无法代替本地边界核验。 | 一次预取正文、布局和 PRP 定义。独立计算正文、图示范围和计划实际触及的字节。底线为每个末字节严格小于当前页大小。 |
| F8-02 Fused 环尾发布 | NVMe pp.120–121，已返回相邻、回绕、一次 Tail 和各自 CQE 的原文 | 建议能修正提交，验收止于门铃更新。FUSE 首条和次条都需要完成记录及各自状态。 | 提交与完成分别核对。PCIe 共享 CQ 按 SQID/CID 匹配。消息型 NVMe-oF 按连接上下文匹配，CQE.SQID 是保留字段。 |
| F8-15 MSI-X Steering Tag | PCIe pp.607–608、947–948，已知表位置、MSI 启用情况与范围 | 答卷只写向“ST 条目”编程。必须定位到具体 MSI-X 表项的 Vector Control。 | 预取 PCIe p.789 的精确位段。ST Lower [23:16]，ST Upper [31:24] 写入需核对 Extended TPH 支持。修改时保留其余字段。 |

在数值回归中，CC.MPS=0、CAP.DSTRD=2、NSQA=NCQA=255，正文计算正好 4096。实际 SQID 64 的末字节 2051 合法，CQID 128 的末字节 4115 越界。两页各自用相同偏移检查；工具同时返回 Figure 486 整个图示范围的末端，两组结果分别呈现。页对齐和本次 Admin CQE 仍属于签发流程中的独立门槛。[计算测试](../../test_decision_checks.py)
