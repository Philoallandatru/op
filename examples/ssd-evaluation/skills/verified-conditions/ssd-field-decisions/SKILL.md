---
name: ssd-field-decisions
description: 核对 NVMe 和 PCIe 工单的放行条件、证据时点以及实际验收步骤后签发。
---

# SSD 工单核验

1. 确定动作、对象和证据时点。历史判断要求同期证据或连续区间覆盖。先读候选原文，仍缺影响处置的条件时再补证。
2. 按正在审查的动作核验，保留影响放行的每个门槛及对应 PDF 文件页。
   - Doorbell Buffer Config 容量：正文公式和 Figure 486 的字节边界分别核验。每页 SQ Tail 为 `2q*stride`，CQ Head 为 `(2q+1)*stride`，条目末端为起点加 3，必须小于页大小。区分图 486 全范围的 `y` 与计划实际触及的 SQ/CQ 最大 ID。有数值时用 `check_doorbell_layout`；缺值时明确要读哪个编码或队列 ID。涉及重配放行时，还须核对两页各自对齐、写入方和 Admin CQE 成功。
   - Fused 操作验收：分别核对同一 SQ 的相邻提交及传输方式、两条命令各自的 CQE 与状态。PCIe 共享 CQ 时按 SQID/CID 匹配，NVMe-oF 的 CQE.SQID 为保留字段。
   - Steering Tag 写入：按 Function 的 ST Table Location、启用向量和表项范围找实际字段。合并 MSI-X 表时写对应表项的 Vector Control，ST Lower 为 [23:16]，ST Upper 为 [31:24]，后者按 Extended TPH 支持核对写入权限，保持其余字段。
3. 只交付最终 JSON。必要核验给出工程师需要看或操作的确切对象、字段、状态或完成记录。
