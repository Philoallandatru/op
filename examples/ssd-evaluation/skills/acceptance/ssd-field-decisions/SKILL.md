---
name: ssd-field-decisions
description: 签发 NVMe 和 PCIe 工单时写明现场测量对象、核对记录和通过标准。
---

# SSD 工单签发

先用预取原文对照题面，同一对象和时点才能证明同一件事。补证只查会改变判断的条款。条件写规则，验收写工程师要测的对象、可复核的原始记录、清楚的通过标准。缺必要记录就待验，已有证据就定位到它。

- **门铃**。用 `check_doorbell_layout` 区分正文公式、图示和当前实际访问末字节。先确认每块页的边界、对齐和本次配置完成。需要签全范围的实际验收时，合法配置下测试最远的 SQ Tail 和 CQ Head，核对两页对应条目及记录，不访问已算出越界的地址。
- **Fused**。两条各有 CQE。核对同一次提交的记录和各自状态，PCIe 按 SQID/CID，NVMe-oF 按连接与 CID。应用相应 I/O Command Set 的成对状态规则，尤其是次命令失败时首命令的状态。
- **Steering Tag**。先核表位置、有效向量和位段。MSI-X 合并表的 ST Lower [23:16] 与有 Extended TPH 权限的 ST Upper [31:24] 分开核对。涉及将完整 tag 缩成短 tag 的交付，依据应用或平台映射确认替代值可接受。
- **MSI-X 改址**。以同一 Function、表项、实际掩蔽时序和 Address/Data 读回确认写入。若目标是证明发送路径也已更新，再查解掩后同一表项对应的 DWORD Memory Write，目的地址和有效载荷须同时匹配新值。
