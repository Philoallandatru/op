# SSD 工程场景盲题册

共 266 道题。请根据每道题首次提问时已有的观测回答。
本册由评分工具从题库导出，仅包含首问和首轮观测。

## SSD-BOOT-01

冷启动偶尔报“SSD 不见了”。同事想加大 NVMe 控制器就绪超时，或者直接把这块盘判坏。看这段时间线，先改哪里？给我一个复测点，能把枚举失败与后续的控制器启动慢分开。

- 单个 PCIe SSD 直连支持 16 GT/s 的下行端口；本次没有使用 Readiness Notifications，已启用 CRS Software Visibility。
- 端点 Conventional Reset 结束记为 0 ms，分析仪确认链路在 80 ms 进入 DL_Active。
- 系统在 110 ms 向端点发第一个配置读，在 150 ms 因未获成功完成停止枚举并标记设备损坏。整个窗口内主机没有写 NVMe CC.EN。

## SSD-BOOT-02

这块盘配置空间和 BAR 都能读，RDY 也起来了，但开机第一条 Identify 就超时。有人说是 MSI-X 漏中断或 NAND 太慢。你会先验证哪条因果链？说明怎么用一次复测区分没取命令、没写完成和单纯没通知。

- 普通 Type 0 PCIe Endpoint，Admin SQ、CQ 均在主机内存；从创建队列至超时，PCI Command 读回一直是 0x0002。
- CSTS.RDY=1 后主机填写 Identify Controller SQE，并写了 SQ0 Tail Doorbell；分析仪看到了该下行 MMIO 写。
- 按该 BDF 过滤，窗口内没有上行读 Admin SQ 的 Memory Read，也没有写 Admin CQ 的 Memory Write；CPU 轮询未见该 CID 的新 CQE。

## SSD-BOOT-03

维护窗口做了 SSD 固件升级。工具提示重启后生效，同事执行了驱动里的 reset-function，重连后还是旧版本。该报升级失败、重刷，还是调整复位方式？旁边另一块业务盘也在同一座下行桥后，请给验证步骤。

- Firmware Commit 的 CQE 为命令专用状态 SCT=1、SC=0Bh。已记录旧版本 A、目标版本 B。
- 主机 trace 只显示对目标 Function 发起 FLR，链路保持活动；没有记录 Conventional Reset。
- 重新初始化后 Identify Controller 的 FR 仍显示 A。尚未核对桥下其他 Function 的停机窗口。

## SSD-BOOT-04

我们的开机验收把“RDY 后第一次读失败”统一记成坏盘。下面两轮来自相同固件，你会怎样分别判定？下一次抓什么可以判断是否仍是介质初始化窗口，还是该升级调查？

- 本地 PCIe NVMe 控制器，CAP.CRMS=11b，启用前 CC.CRIME=1；两轮均观测到 CRTO.CRIMT=1、CRTO.CRWMT=4。
- 所有时间相对同轮 CC.EN 从 0 变 1；CSTS.RDY 在 200 ms 置 1。无中途复位或再次启用。已建立 I/O 队列，NSID 已附加，读请求参数有效。
- A 轮在 600 ms 发 Read，610 ms 返回 Namespace Not Ready、DNR=0；B 轮在 2.3 s 首发相同 Read，2.31 s 同样返回该状态。尚无更深的设备内部日志。

## SSD-SHUT-01

关机偶发超时，驱动同事说 SSD 在收到普通关机通知后卡住了。这个 trace 能定位到固件吗？我们该改哪段时序，下一次抓什么才能区分两种原因？

- 单功能单控制器 PCIe SSD，正常关机。主机在 D0 停止 I/O 并成功写入 CC.SHN=01b；最后一次成功读 CSTS 得到 ST=0、SHST=01b。
- 随后平台配置写将 PMCSR.PowerState 置为 D3hot，配置空间仍可读。驱动在此之后轮询同一功能的 BAR 上的 CSTS，分析仪显示该 Memory Read 收到 Unsupported Request。
- 设备和平台时间戳已对齐，进入 D3hot 前没有更晚的 CSTS 样本。

## SSD-SHUT-02

双端口 SSD 共用一根主电源轨。机箱准备按 A 口的完成标志拉掉整盘主电，这条放行逻辑够吗？怎么设计一个能抓到误放行的验收条件？

- 设备只有一个 NVM 子系统，控制器 A、B 分别在两棵独立的 PCIe 层次结构上，Identify/属性记录显示 CAP.CPS=11b。题设采用各控制器单独的关机通知。
- A 的主机记录 CC.SHN=01b，随后读到 ST=0、SHST=10b。A 支路已见 PME_Turn_Off / PME_TO_Ack；电压探头显示此刻主电仍在。
- 同一时刻 B 仍有未结束的业务 I/O，读到 ST=0、SHST=00b。两个主机的记录和电源探头共用时基。

## SSD-SHUT-03

夜测掉电后 SMART 的 Unsafe Shutdowns 加一，测试单却写着关机成功。能据此报数据损坏或者固件误计数吗？请解释这个组合，并给一个能区分原因的复测。

- 同一单控制器 SSD、同一 SMART 日志字段 bytes 159:144，试验前后各读一次；期间只有本次主电源掉电。设备实现 NVMe Base 2.1。
- 供电切断前，主机曾读到 ST=0、SHST=10b。BMC 随后发过一条带外管理请求，但当前日志没有操作码、Ignore Shutdown 位、完成记录或切电前最后的介质状态。
- 恢复后设备可识别；测试没有保存掉电前业务数据校验基线。

## SSD-SHUT-04

这次整机下电被取消。驱动想清掉 SHN，沿用旧的 I/O 队列，直接让同事恢复业务。这个恢复点可以放行吗？请写出恢复路径和验证条件。

- 单控制器内存型传输。正常控制器关机完成后采到 CC.EN=1、CSTS.ST=0、CSTS.SHST=10b。此后供电一直正常，没有复位，没有带外访问。
- 关机前驱动成功删除了该控制器的所有 I/O SQ 和 CQ，保留的只是主机内存里的旧队列结构。PCIe 链路可用，能够正常读 NVMe 属性。

## SSD-X-01

换主机后 SSD 的可选 CMB 被分到 4 GiB 以上，映射器仍给外部发起方返回 0x40020000。先禁用这块盘的 CMB，还是修映射器？还得防止把哪一套地址错当成同一个？

- 已重新枚举并使能该 Type 0 Function 的 Memory Space。已核 CAP.CMBS=1、CMBMSC.CRE=1。以下均为当前 PCIe 总线地址，不涉及 CPU 地址转换。
- CMBLOC.BIR=2。配置读回 BAR2=0x4000000C、BAR3=0x00000002，这是起始于 BAR2 的 64 位、大小 1 MiB 的 Memory BAR。CMBLOC.OFST=3，CMBSZ.SZU=1，CMBSZ.SZ=4；SZU 的编码按 NVMe Base 2.1。
- 控制器的 CMBMSC.CMSE 已使能，CMBMSC 设置的控制器侧 CMB 基址为 0x90000000，且与正常 DMA 区间不重叠。外部映射当前只作地址审查，尚未启动写测试。

## SSD-X-02

I/O 验收脚本把 PCIe 的 256 B 和 NVMe 的最大传输限制当成同一个值。一条 64 KiB 读成功，另一条 192 KiB 读返回 Invalid Field。是总线没执行限长，还是 SSD 的命令限长实现有错？

- 同一 PCIe NVMe 控制器，Identify Controller 的 MDTS=5，CAP.MPSMIN 指示最小内存页为 4096 B；两个 Read 均访问有效 LBA，PRP 有效，无元数据、无其他更小上限。
- SSD Function 的 PCIe Device Control.Max_Payload_Size 已配置为 256 B。第一条命令的数据阶段抓包显示多个从 SSD 发往主机的 Memory Write TLP，每个 payload 均为 256 B 或更小；只对数据区间计数，总量恰为 64 KiB，随后收到成功 CQE。
- 第二次是单个 SQE 请求 192 KiB，收到该 CID 的 Invalid Field in Command。主机未拆分该请求。

## SSD-X-03

虚拟化主机已经撤下两块直通盘，资产巡检却仍从 NVMe 主控制器列出两个子控制器。应把它们标成还可直通的设备并恢复旧映射，还是重置整块盘清掉记录？后续重新交付时，用哪些证据判定可用？

- 该 NVMe SSD 通过同一 PCIe PF 向两个已停机的客户机各提供一项 VF；先由虚拟化管理程序解除绑定并停止两项 VF 的 I/O。
- PF 保持 D0、主控制器仍响应 Admin 命令。管理程序已成功清除 SR-IOV Control.VF Enable，两秒后读回为 0；主机重新扫描后两个 VF 的 BDF 均已消失。
- 同一时刻由该 PF 的主控制器执行 Identify，CNS=15h、起始 CNTID=0。回包仍列出原来两个 SCID，两项 SCS.OLS 都为 0。未执行后续启用动作。

## SSD-X-04

工单机器人把两条同秒的“AER”合并成“SSD 过热导致 PCIe 数据损坏”，并建议直接下线。两个监控源如下。现在能确认什么？下个维护窗口怎么验证原因、分别派单？

- 测试盘直连 Root Port。主机保存了该 SSD 一条已提交的 NVMe Asynchronous Event Request 的 CQE：AET=001b，AEI=01h，LID=02h。没有把此条通知与具体温度传感器、上下阈值或当时温度曲线关联。
- 同一秒，该 Root Port 的 PCIe Advanced Error Reporting Correctable Error Status 的 Receiver Error Status 位置 1；该位受支持，本窗口开始前已清零。没有未纠正错误记录，没有发现业务校验差异。两个源的秒级采样无法确定先后。

## SSD-X-05

资产系统按 PCIe Device Serial Number 和容量把两条记录并作一个卷，准备把两条路径交给多路径软件。硬件清单和卷清单应该各留下几条？能放行这次自动合并吗？

- 拓扑确认是同一块普通 PCIe 多功能 Endpoint（非 RCiEP）的 Function 0 和 Function 1，各提供一个 NVMe 控制器。两个 Function 均实现 PCIe Device Serial Number Extended Capability，读出的 64 位值相同。
- 这次采集同时完成，期间没有重建命名空间。两个控制器分别返回一个活动命名空间，容量和 LBA 格式相同。各自的 Namespace Identification Descriptor 中 NIDT 均为 03h、NIDL 为 10h。
- 按相同字节序解码，两个 NID 分别为 14a0b667-bbbd-42b2-a86c-b46e6e119ac0 和 7220df66-fc91-4161-95ef-78480e7135df。

## SSD-X-06

同一块盘的管理中断一直在涨，业务 CQ 却只能靠轮询取到完成。值班同事建议清全 Function 的屏蔽。现在能定位到哪一层，下一次复现要留哪两条记录才能决定怎样修？

- 普通 PCIe NVMe SSD。主机平台确认 MSI-X Enable=1、MSI Enable=0，Function Mask 从建队到取样一直为 0。管理队列使用表项 0，有独立计数。
- 目标业务 CQ 独占 MSI-X 表项 2 的分配；业务命令的 SQID、CID、状态与轮询读到的 CQE 全部匹配。表项 2 对应的操作系统 IRQ 计数一直为 0。
- 当前这次成功 Create I/O CQ 的 CDW11 没有归档，IRQ 配置日志也没有保留表项 2 的 Vector Control。

## SSD-DATA-01

后台说卷建好了，业务主机却一直没有块设备。现在直接再建一个，还是要让主机重扫？

- Namespace Management Create 已成功返回 NSID 17。清单在同一子系统列出 17 为 allocated。
- 从承载业务的控制器读活动 NSID 列表，没有 17。编排器未保存后续 Attachment 的提交或完成记录。

## SSD-DATA-02

三个控制器批量挂卷返回失败。回滚程序准备按‘一个都没改’把同一列表再发一遍，这样记账可靠吗？

- 单个 Namespace Attachment 指定有序控制器列表 A、B、C。
- 对应 Error Information Log 给出的首个失败项偏移按原始列表解码为 B；尚未实读三个控制器的附件。

## SSD-DATA-03

分配清单的变更日志里只剩一串 F，余项全零。资产同步服务想把上一版的所有卷都标为已删，可以吗？

- 读取 Log Identifier 1Ch，首个条目 FFFFFFFFh，其余条目全零。
- 主机保留着上轮已分配卷清单。本窗口发生过批量变更，没有逐卷流水。

## SSD-DATA-04

资产系统在同一子系统的两个控制器上都看见 NSID 3，准备去重成一个多路径盘。仅凭这张表能上线吗？

- 两控制器均不支持 Namespace Management、ANA Reporting 和 NVM Sets。
- 已确认同一子系统；缓存中只有控制器号与 NSID，缺共享属性以及可比对的持久标识。

## SSD-DATA-05

一条路径上 Identify 回报 NUSE 和 NVMCAP 为零，容量平台要把卷标记成被回收。该相信哪一次采样？

- 已知是同一命名空间。第一控制器对该组报 ANA Persistent Loss；第二控制器对该组报 ANA Optimized 且可响应管理命令。
- 零值来自第一控制器，尚未读取第二控制器的 Identify。

## SSD-DATA-06

A 路一直报 Persistent Loss，B 路报 Inaccessible。现在 5 秒报警已经红了，能宣告这组全部路径掉线吗？

- 仅 A、B 两条访问路径，面向同一 ANA Group。B 的 ANATT 为 30 秒；B 的连续可见记录只有 5 秒，当前没有可服务路径。
- 值班员正在决定是否发布 all paths down 告警。

## SSD-DATA-07

对 NSID 7 的变更单写着‘只影响这块测试卷’，同一子系统有在线生产卷。根据审批附件能签吗？

- 待审的 Format NVM 指定一个已分配的 NSID 7、SES=001b。
- 控制器公布 FNA.FNS=0、FNA.SENS=1。生产卷属于同一 NVM 子系统，审批未授权触碰它。

## SSD-DATA-08

审计脚本只保存了成功 CQE，就给归档卷开了已擦除证明。能接受这份证明吗？

- 控制器支持 Format NVM 广播，FNVMBS=0；命令 NSID=FFFFFFFFh、SES=001b、SENS=0。
- 命令执行时没有命名空间附加到这个控制器；归档卷仍只挂在另一个控制器。

## SSD-DATA-09

资产要交割，工具在提交 Sanitize 后马上显示绿色对勾，为什么验收端还不肯签字？

- 启动 Block Erase 的 Sanitize 命令 CQE 为 Successful Completion；此后读到 Sanitize Status 的 SOS=010b。
- 用户要求证明本次后台净化已经成功完成，设备仍留在隔离测试机。

## SSD-DATA-10

交接单说‘本班已做过一次全盘 Sanitize’，证据只有一张 GDE=1 的截图。库存控制器还读出 SOS=000b，这张单怎么判？

- 已确认是同一子系统、同一时刻的 81h 日志。GDE=1，SOS=000b；没有该班次 Sanitize 命令记录。
- 审批要证明本次操作的执行历史，不是只判断某个字段的当前值。

## SSD-DATA-11

实验卷设了‘写保护直到掉电’，我们做过 Controller Level Reset，卷还是只读。返修单该填成永久锁死吗？

- 单域测试子系统。先前 Set Features 把该卷置入 010b，读回确认。
- 轨电压记录显示此次只做了控制器级复位；写保护配置仍返回 010b。其余写入限制未知。

## SSD-DATA-12

集群主盘刚经历真实掉电。备机看到‘支持预留跨掉电’，有人想直接开放它写这个卷。这个证据够吗？

- 普通非 dispersed 命名空间。该命名空间声明支持 PTPL。掉电前有主机持有写独占预留，但变更日志没有保留实际 PTPL 设置。
- 业务尚停，暂未取得恢复后的 Reservation Report，也未做集群所有权确认。

## SSD-F10-01

新版门铃配置的边界算过了，旧抓包能否为新的最高编号验收？

- 当前 CC.MPS=0、CAP.DSTRD=0，拟签 SQ/CQ 最大 ID 均为 127。两页已对齐，按本次参数最高编号条目在页内，重新配置的 Admin CQE 成功。
- PRP1/PRP2 这次换了物理页。唯一最高编号访问记录来自前一套页；新页现有记录只覆盖 Admin 的 ID 0。工单要求签最高编号实际访问。

## SSD-F10-02

CQ Head 更新到 9 和从 9 更新到 10 这两次，现场应该怎样判实际 Doorbell 是否漏写？

- 同一个 CQ 的深度为 16，同一轮有效 Doorbell Buffer Config。同步旁路记录确认两次判断中 EventIdx 均为 9。
- 主机依次把 Shadow CQ Head 从 7 写到 9，再从 9 写到 10，期间没有回绕。工单只验这两次写。

## SSD-F10-03

新配置下最远 SQ/CQ 已在页内。压测记录能签两个缓冲区的所有权和映射正确吗？

- 本次配置的 PRP1=Shadow 页 A，PRP2=EventIdx 页 B。台架证实门铃 ID 和地址偏移都合法。
- trace 把主机写入标为页 B，仿真控制器对相同索引的更新标为页 A。工单要求实测两页写入方，上层 I/O 数据对比已通过。

## SSD-F10-04

两条 CQE 的 SQID、CID 看着都对，能签这次 fused pair 的成功吗？

- PCIe 内存队列共享 CQ，当前 CQ 刚回绕，驱动按该消费位置已确认本轮预期 Phase Tag=0。目标 pair 为 SQ6 上 CID 31 和 CID 32。
- CID31 的 CQE 在预期位置、Phase=0、Status 成功。CQ 另一槽残留 SQID=6、CID32、Status 成功，但该消费位置记录确认仍是上轮 Phase=1。

## SSD-F10-05

负向验收规定首条失败、次条因该失败而中止。能用眼前两条非成功 CQE 签通过吗？

- PCIe，目标 fused pair 支持且同次相邻、同一门铃提交。对应两条 CQE 均属同一提交。首条为测试预期的失败状态。
- 次条 Generic Status 是 0Ah。工单只接受次条因伙伴失败中止，不接受不匹配或缺失配对。

## SSD-F10-06

按“整对已中止”结案前，手上的 Abort 管理完成够吗？

- 在目标 I/O SQ 上有一组尚未确认完成的 fused operation，脚本只对首条的 CID 发送一条 Abort。
- 采集到的是该 Abort 管理命令自身的 CQE，尚未看到这组 I/O 各自的状态。工单只让核对记录，不授权再发送命令。

## SSD-F10-07

读回全宽 Steering Tag 正确，能签这条数据路径确实发送了 Extended TPH 吗？

- 目标 Function 支持 Extended TPH，请求使能与 Interrupt Vector Mode 已确认。正确 MSI-X 表项 Vector Control 读回 ST Upper=0x43、ST Lower=0x27。
- 唯一捕获的目标 Memory Write 只有普通 TPH header，低字节 0x27，未见 TPH TLP Prefix。工单要求验证 Extended TPH 实际输出。

## SSD-F10-08

两条业务流改用同一个低字节 0x44，可以签保持原有平台路由了吗？

- 应用原始 tag 为 0x3144 与 0x7244，用于两个不同目标处理资源。替代配置只能用短 tag，台架抓到两条请求都携带 0x44。
- 应用没有提交可接受的替代映射，平台目标资源也没有随当前测试记录。工单要保留两条业务流各自资源映射。

## SSD-F10-09

Device Specific Mode 下，写好 ST Table 并读回能签所有指定请求都用了这些 tag 吗？

- Function 已选 Device Specific Mode 并使能 TPH；写入的两个 ST Table 槽位都正常读回。
- 工单要证实两种指定工作负载分别发出预期 tag。设备没有提供 request-to-tag 关联记录，未做链路捕获。

## SSD-F10-10

先前 MSI-X Message Address/Data 已按要求写入，表项 Mask 清零后能签实际解掩并发包了吗？

- Function Mask=1 时改写并读回了目标表项的新 Message Address 和 Data。随后只把该项 Vector Mask 从 1 改成 0，Function Mask 仍为 1。
- 两位的当前值都有记录，发送跟踪只覆盖这段操作。工单批准在安全窗口验证实际发包。

## SSD-F10-11

改址后的目标 MSI-X 消息地址已经是新值，能签改址改数据都通过吗？

- 同一 Function、同一 MSI-X 表项在有效掩蔽时从 (A0,D0) 改为 (A1,D1)，D1≠D0；解掩前读回为 (A1,D1)，两级掩码解除顺序已核。
- 对同一次解掩后目标测试事件，分析仪唯一归属于该表项的 DWORD Memory Write 是 (A1,D0)。

## SSD-F10-12

改 T0 后仍抓到旧的 MSI-X Address/Data，能判 T0 的缓存没有刷新吗？

- 同一 Function 的表项 T0、T1 原先使用同一旧地址 A0 和数据 D0。本次只将 T0 有效掩蔽后改成 A1,D1 并实际解掩；T1 继续保持旧值且未掩蔽。
- 随后看到同一 Function 发出 (A0,D0)，跟踪只保留 Requester ID 和 Address/Data，缺少表项触发事件。

## SSD-F10-13

能用电源状态表给这台 SSD 签 50 微秒恢复 SLA 吗？

- 目标状态的 Identify Power State Descriptor 显示 ENLAT=30 µs、EXLAT=0。客户验收目标为该状态退出延迟 ≤50 µs。
- 采样只记录了控制器已进入并停留在该状态，没有本次退出起止时点。

## SSD-F10-14

SMART Data Units Read 从 1 到 2，能据此签这批测试正好读取 512,000 字节吗？

- 同一控制器可报告 SMART，两个 DUR 值为 1 和 2。测试关注触发统计的用户数据字节，元数据另行记录。
- 缺少这批主机命令及本次真实完成长度的记录。

## SSD-F10-15

Memory Read 长度低于 MRRS，能签当前那个跨页事务通过吗？

- Requester 的 MRRS=512B。链路捕获有一条从 0x1F80 开始的 Memory Read，Length=64 DWORD，首尾 Byte Enable 全开。
- 验收脚本只比较请求长度与 MRRS。工单要求核对请求边界，当前无补发授权。

## SSD-F10-16

单笔 Memory Read 的 Completion 到达顺序合规吗？

- 同一观察点，Requester A 的 Read Tag=4 被拆成两段。A/4 高地址段最先到，随后是 Requester B/4 的一段，然后是 A/4 低地址段。
- 工单只查 Split Completion 顺序，两段 A/4 已确认属于同一个未完成请求，Lower Address 与原始请求地址的映射已核对。

## SSD-F11-01

能签映射版本 r8 在当前 SSD 端口可以上线吗？

- 平台已激活短 Steering Tag 映射 r8，两路测试请求在同轮实测命中预定资源。记录与 TLP 的短 tag 均可关联。
- 发布单要求应用负责人批准实际部署的映射版本。应用确认记录只列 r7；r8 虽复用相同的短 tag，平台的资源映射版本已变化。

## SSD-F11-02

能按实验合同签两条短 Steering Tag 路径通过吗？

- 工单规定平台资源负责人是本次映射批准人，并已签署 m5。没有附加的应用签字条件。
- 台架同次记录能将两条已批准请求分别绑定到 m5 下的短 tag 和指定的处理资源。Requester 与链路支持已核对，配置与捕获均为 m5。

## SSD-F11-03

实验机发包已对，能按这份证据直接执行生产机 MSI-X 地址替换吗？

- 实验机同一型号和配置上，目标 MSI-X 表项在有效掩蔽下改地址和数据，读回匹配，解掩后发包匹配。
- 生产发布单要求生产变更审批和生产 Function 对应的表项及版本复核。当前只有实验签字，无生产批准。

## SSD-F11-04

页大小变更的技术门槛都齐了，能现在写 CC.MPS 吗？

- 该非 Discovery 控制器 CC.EN=0 已读回，CAP.MPSMIN=0、CAP.MPSMAX=1。拟从 MPS=0 改为 MPS=1，配套 8 KiB PRP 已准备。
- 本次只允许获准窗口内写控制器。记录显示批准窗口在 15 分钟前结束，尚无续批。

## SSD-F11-05

CQ 5 的 Shadow Head 更新能按另一条队列的 EventIdx 直接断定漏写门铃吗？

- 同次成功配置，CQ5 无回绕从 3 更新到 7。日志在这段期间没见实际 CQ5 Head Doorbell 写。
- 唯一 EventIdx=5 的原始读数来自 CQ6；CQ5 对应条目在更新时没有捕获。

## SSD-F11-06

首、次命令各有一条有效完成，能签它们的状态组合符合该 fused 命令集吗？

- PCIe，pair 的 SQID/CID、Phase Tag 和本轮提交编号均一致。两条 CQE 的 SCT/SC 均已完整保存，确认是次命令本身报错而非被首条错误中止。
- 工单要签这一命令序列的状态组合是否符合其 I/O Command Set。日志没有命令集版本或该序列条款。

## SSD-F11-07

改址后 PBA 已清零，能签第一次消息使用新地址和数据了吗？

- MSI-X 目标表项已在掩蔽时写入 (A2,D2) 并读回，随后实际解掩。解掩前曾看见 Pending=1，解掩后 PBA=0。
- 设备日志还指出掩蔽期间软件可能已服务该事件。测试没有保留发送事务。

## SSD-F11-08

合同只验普通 TPH。当前两条都没带 TPH TLP Prefix，能判为通过吗？

- 应用为两条测试请求确认了普通 8 位 tag 分别为 0x2C、0x3D。Requester 已使能普通 TPH，链路接收方也支持。
- 同期抓包识别出两个同一 Function 的对应 Memory Write，TH=1，ST[7:0] 分别是对应确认值；范围只验发出的普通 tag。

## SSD-F11-09

静置 5 秒后只采样 10 秒，能按 Identify IDLP 定义签 idle power 实测吗？

- IDLP 非零，对应 Idle Power Scale 也已读回。台架五秒前进入静置，以后无命令、属性访问或后台操作，取十秒平均值。
- 工单要求测量窗口与 IDLP 定义一致，并与工程目标比较。

## SSD-F11-10

脚本把两类 AtomicOp 失败都归档成 Unsupported Request，可以验收吗？

- 接收端实现 AtomicOps，FetchAdd 只支持 32 位。故障注入 A 使用 FetchAdd Length=3 DW，B 使用 Length=2 DW 且其他字段合法对齐。
- 两种输入分别在隔离的验收记录里，当前脚本不区分架构长度合法性。

## SSD-F11-11

这份 NVMe retry 日志可以签严格遵守 CRD 等待了吗？

- 同一控制器同期 ACRE=1，目标失败 CQE 的 DNR=0、CRD=10b，CRDT2 解析为 200 ms。工单规定按 CQE 收到时计算至少等待 200 ms。
- 日志只有原命令提交与重提时间，差 240 ms，原失败 CQE 的收到时标丢失。

## SSD-F11-12

分析器摘要把两个 Read 的 Completion 合在一行，能给 Switch 签违规合并吗？

- 日志 UI 按地址把来自两个 Transaction ID 的事件聚成一条摘要行。没有导出交换机端口的原始 TLP，未知实际线上有几个 Completion。
- 工单只给证据归因，未要求改设置。

## SSD-F12-01

应用已批准短 Steering Tag 映射 r12，两条流现在可以签通过吗？

- 应用批准 r12，合同要求流 A 命中资源 R1、流 B 命中 R2。两流的同次捕获都带批准的短标签。
- 平台同次逐流记录显示 A→R1、B→R1。

## SSD-F12-02

这份批准只允许停表项 2。为了换它的地址，能直接置 Function Mask 吗？

- 同一 Function 的表项 2、3 都在使用，两个表项当前均解掩。只授权对表项 2 做短时掩蔽，明确禁止影响表项 3。
- 脚本准备置 Function Mask，再改表项 2 的 Message Address/Data，最后清 Function Mask。

## SSD-F12-03

已经能确定 fused pair 还在途，值班人能直接按这份诊断单执行两条 Abort 吗？

- 同一次提交的两条 I/O 都已定位，当前记录没有两条目标 CQE。诊断单仅批准只读取证，执行 Abort 需要维护人另行批准。
- 操作手册已确认若走主动取消路径需要处理两条命令。

## SSD-F12-04

平台验证单要求两路普通 TPH 保持 8 位标记，能签本项通过吗？

- 该单由平台负责人最终验收。负责人已批准向量 1 使用 0x28、向量 2 使用 0x29，且本项只验普通 TPH 发包。
- 同一个 Requester 两条对应请求的捕获含 TH=1，低 8 位分别匹配，批准记录、向量与报文均可追溯。

## SSD-F12-05

PRP1 和 PRP2 都页对齐且容量通过，能让 Shadow Doorbell 与 EventIdx 共用同一物理页吗？

- PRP1 与 PRP2 使用不同的虚拟映射名，但提交时解析为同一个物理页。CC.MPS 和所有槽位末端都在合法范围。
- 测试只核了数值边界，没有验证两个缓冲区的写入隔离。

## SSD-F12-06

事后读到 EventIdx=12，就能证明旧 Shadow Tail=7 到新值 9 的那次没有漏写吗？

- 同一 SQ 不回绕，当前配置已成功。只抓到主机写 Shadow Tail=9，随后才取到该项 EventIdx=12。
- 控制器可在观察间隔修改 EventIdx，没有二者同次判断所用的比较记录。

## SSD-F12-07

控制器不支持本项 fused operation，脚本能把收到 Missing Fused 当成本次负向验收通过吗？

- 测试范围明确：两条位于同一 SQ，相邻且单次 Tail 更新。在 Identify 的 FUSES 及适用命令集中已确认不支持本项 fused 操作。
- 验收约定验证 Base 建议的“不支持操作”状态。当前抓到有 FUSE 非零的命令的 Generic 0Ah。

## SSD-F12-08

目标消息保持原地址，只改了 Data。捕获的同项事务 Data 仍是旧值，能签更新成功吗？

- 该 MSI-X 表项已在有效掩蔽期写入并读回地址 A、数据 D3，随后实际解掩。D3≠原 D0。
- 唯一可归属于该次事件的解掩后 DWORD Memory Write 目的地址 A，32 位数据 D0。

## SSD-F12-09

看到正确 Address/Data 后能签表项 7 本次发包吗？

- 同 Function 的项 7 和项 8 使用相同的 Address/Data，均已解掩，均可触发。捕获只有一个匹配值的 DWORD Memory Write。
- 本次工单只验表项 7，采集没保留触发来源，两项同时处于活跃工作负载。

## SSD-F12-10

系统是 Device Specific Mode，本次两条指定请求的 tag 与预期匹配，可以签这两条的发包吗？

- 当前 Device Specific Mode 已生效。ST Table 读回与两条预定 tag 不同，但有逐条关联的 Requester、工作负载和 TLP 记录。
- 同次抓包这两条的 ST 分别为 0x33、0x66，与工单一致。本单只验指定两条发包。

## SSD-F12-11

IDLP 为 0，但这次有完整功耗实测。可以签合同定义的实测值吗？

- 目标同一电源状态，记录连续 10 秒空闲后采样 30 秒，全程无挂起命令、属性访问、后台、Sanitize、自检。
- 校准表计平均 0.9W，合同只验实测 ≤1W。Identify 的 IDLP 为 0。

## SSD-F12-12

分析器 UI 合成了一行，这次是否还要报 Switch 合并 Completion 的违规？

- 已补原始抓包。Switch 同一次输出在同一端口实际发出了两条独立 Completion，分别为 A/Tag4 和 A/Tag9，对应两个请求，数据各自正确。
- 此前违规票只依据软件列表的按地址聚合。工单只核这两笔。

## SSD-F12-13

失败 CQE 有 CRD=01b 和 DNR=1，脚本把它标为“等 CRDT1 到时可重试”。这条归档规则能签吗？

- 同次 CQE 和 ACRE=1 的状态有原始记录。CRDT1 有非零配置，除此之外没有专项恢复授权。
- 工单要求核对单次完成的重试语义，当前只读。

## SSD-F12-14

具备 64 位 FetchAdd 能力的 Completer 能把这条请求记为“宽度不支持”吗？

- 测试 TLP 是合法的 2 DWORD FetchAdd，Completer 支持该宽度。请求地址为 0x1004，完整操作数未自然 8 字节对齐。
- 原始捕获可验证 Length、操作地址以及所属 Completer。

## SSD-F12-15

为了复盘前一小时故障，可以用当前 SMART Critical Warning.AMRO=0 签历史上全介质未只读吗？

- 期间没有早一小时的 SMART 记录。故障后仅一条命名空间后来开启了写保护，当前 AMRO=0。
- 工单只判旧时点是否全部介质进入只读。

## SSD-F12-16

验收脚本发现一个 Completion 的 IDO 位为 1 就拒签 Malformed 检测通过，这个判据能保留吗？

- 适用普通 Memory Read Completion。Completer 的 IDO Completion Enable=0。接收端识别出该位为 1，未见其他 Malformed 原因。
- 工单同时核对发送端设置规则和接收端处理规则。

## SSD-F13-01

工单只验这条采到的普通 TPH 请求显式不指定处理资源。可以签吗？

- 平台要求本测试请求的 ST[7:0] 为 00h，指定的 Requester 和请求地址已在仪器同步记录。
- 实际目标 Memory Write 是 TH=1、ST[7:0]=00h，和同一测试请求一一对应。

## SSD-F13-02

MSI-X Vector Control 低字节读对了，这次普通 TPH 报文验收能签吗？

- 工单针对本次目标 Requester 的普通 Memory Write 标记。配置支持并已使能，预期 ST[7:0]=0x2A，适用表项是否正确已核。
- 同一次目标 TLP 的 TH=0，分析器原始 header 在 ST 通常使用的位段碰巧数值为 0x2A。

## SSD-F13-03

这条故障注入只验证首条报错后次条因伙伴失败中止。本次能签通过吗？

- PCIe 同 SQ 相邻并单次发布，控制器和适用命令集支持这对。用当前相位及 SQID/CID 唯一匹配了两条有效 CQE。
- 首条错误状态与注入计划一致，次条为 Generic SCT=0、SC=09h。逐条完成状态已留存。

## SSD-F13-04

只验测试机这次表项 5 的 Message Data 替换，材料够签吗？

- 工单负责人已授权此次测试机的表项 5。记录显示掩蔽后改值并读回，读回的新数据 D5 与已知地址 A5 匹配，之后实际解掩。
- 同一中断源触发关联的首条 DWORD Memory Write 为 A5/D5，另外受保护的表项全程未改。

## SSD-F13-05

两块 PRP 和布局都合格，当前测试可以开始用 Shadow Doorbell 吗？

- PRP1、PRP2 对应独立对齐物理页，已复算实际槽位并核对主机页/控制器页写入角色。
- 同一次 Doorbell Buffer Config 的 Admin CQE 确认非成功；以往成功记录是在上一次配置上。

## SSD-F13-06

同一个 CQ 这次从 4 推到 7，确切 EventIdx 是 9，未写控制器 Doorbell 可以签本次规则符合吗？

- 当前配置成功，未回绕。比较记录证明同一 CQ 本次实际采用 EventIdx=9，Shadow 更新已捕获。
- 工单只验这一次是否有额外 MMIO 义务。

## SSD-F13-07

Function Mask 已从 1 清零，能签表项 6 已实际解掩并用新值发包吗？

- 改写与读回发生在 Function Mask=1 时。清除 Function Mask 后，表项 6 的 Vector Mask 位仍是 1。
- 目标工单只验表项 6，现有事务捕获中未见它的发包。

## SSD-F13-08

新的高 32 位地址已经写入，分析仪看到数据正确、地址低位正确。能签实际改址通过吗？

- 掩蔽、写入、读回及真实解掩已经核对。目标地址 A 的高 32 位是 0x00000002，低 32 位已知。
- 本次同一个 MSI-X 表项对应的 DWORD Memory Write 的数据和低地址都正确，但线上地址高 32 位仍是 0x00000001。

## SSD-F13-09

两个状态码都合乎流程表，可以签这次 fused 测试吗？

- 两个提交队列共用 CQ，其工作负载重用了相同的 CID。手里只有按 CID 汇总的两个状态码，没有原始 Dword2 的 SQID。
- 目标是一对指定 SQ 上的 PCIe 内存队列操作，验收该对的实际结果。

## SSD-F13-10

设备声明不会用软件提供的 Steering Tag。No ST Mode 下抓到非零 tag，能签它符合该模式吗？

- 同一 Requester 的模式读回为 No ST Mode，启用了普通 TPH。目标请求已按事件关联。
- 同次 TLP 的 TH=1、ST[7:0]=0x02。验收只核这一模式的 tag 值。

## SSD-F13-11

某条 CQE 的 CRD=11b，能归档这次由 CRDT3 指定重试等待吗？

- 同一命令失败，DNR=0，但在完成时同一控制器的 Host Behavior ACRE=0。已有原始 CQE 的 SCT/SC 和控制器设置记录。
- 工单只签“是否由 CRD 指定延迟”。

## SSD-F13-12

这份 AMRO 清零的当前读回可以用作“已恢复当前全介质可写”的验收吗？

- 同一个控制器 Get Log Page Critical Warning 中 AMRO=0。只有一条测试命名空间成功写入，其他命名空间及路径没有写入结果。
- 合同要验全部目标命名空间的写入恢复，不只是 SMART 告警。

## SSD-F13-13

两个 Requester 都用了 Tag 5，分析器把 Completion 混在一起判地址下降。这个判法能签吗？

- 按 Requester ID 已关联原始抓包。A/Tag5 的两段地址按升序，B/Tag5 的两段也各自升序。两者到达顺序交错，在混合序列里出现地址下降。
- 工单只验拆分 Completion 的先后。

## SSD-F13-14

SMART Data Units Written 为 0，能签测试期间零写流量吗？

- 测试期首尾读到 DUW=0，期间主机侧命令追踪丢失。工单只判用户数据写入是否为零。
- 没有记录能覆盖所有会影响这项统计的命令。

## SSD-F13-15

IDLP 测试时间都够，功率也低于目标，后台 Sanitize 还在运行可以签吗？

- 目标状态保持不变，已等待 10 秒后连续测 30 秒。测得低于工单上限。
- 但同一控制器的日志证实已有 Sanitize 在整个测量窗运行。

## SSD-F13-16

从 0x3FFC 发一条完整 1 DW Memory Read，这笔边界检查能签通过吗？

- 同一次原始请求的 Address=0x3FFC，Length=1 DW，字节使能覆盖这四字节，Requester MRRS=128B。
- 工单只看这一笔请求的 Length 与 4 KiB 边界。

## SSD-F14-01

普通 TPH 工单只验 VF 03 本次写请求的 TH/ST。两笔的数据都保留了，现在可以签吗？

- 同一轮时间窗、同一目标地址。分析仪按 Requester 区分了 VF 02 与 VF 03。
- 工单要求 VF 03 实际 TH=1、ST[7:0]=0x26。目标 VF 03 的两个已解码字段分别为 1 和 0x26，VF 02 是 1 和 0x31。

## SSD-F14-02

只验这次屏蔽期间置 pending、解屏蔽后发送该 MSI-X 消息。这条负载小的记录能签吗？

- 目标 Function MSI-X Enable=1、Function Mask=0，目标表项 Vector Mask=1 时注入同一事件。对应 PBA 位由 0 到 1，期间没有该消息。
- 目标表项读回地址 0x00000010_FEE04000、数据 0x00000093；Vector Mask 清零后，同一 Function 的唯一对应 DWORD Memory Write 匹配完整地址和数据，随后 PBA 清零。

## SSD-F14-03

验收项只问这批写是否落在当前 Flush 的规范覆盖范围内。本轮可签吗？

- 易失写缓存已使能；Write 与 Flush 在同一控制器，Flush NSID=7。按原始 SQ/CQ 配对，要求覆盖的三条 NSID=7 Write 的成功完成记录都早于该 Flush 的提交。
- 该 Flush 自身的有效 CQE 为 SCT=0、SC=0。同轮另有 NSID=8 的流量，不在本工单范围。

## SSD-F14-04

工单只验这一次正常断电不会增加 Unexpected Power Losses。可以验收吗？

- CAP.CPS=01b，本次只验这颗控制器。断电轨迹在主电源下降前最后采到 CSTS.SHST=10b，且没有之后的状态变化。管理端日志确认没有 Ignore Shutdown 的介质访问。
- 同一控制器跨同一次断电前后 SMART 日志的 UPL 都是 42。

## SSD-F14-05

驱动用一条“CID 相同、成功”的完成记录认定新门铃缓冲已生效，可以签吗？

- 配置新 Shadow Doorbell 和 EventIdx 的 Doorbell Buffer Config 使用 Admin SQ0、CID=0x13。缓冲布局和最远槽位已确认；本轮 CQ 的正确相位是 P=1。
- 截图成功 CQE 是 CQ 旧圈 P=0。原始队列里本轮 P=1、SQID=0、CID=0x13 的 CQE 为 SCT=0、SC=02h；当前还没解释为什么控制器返回该状态。

## SSD-F14-06

本次 Compare+Write 工单要求两条命令都成功，并确认该 LBA 的回读哈希与已知写入模式相同。能放行吗？

- 该控制器及当前命令集支持该 Fused 对。目标 NSID=9 同一 SQ、相邻且一次发布；按有效相位及 SQID/CID 分别匹配两条原始 CQE，两条都是 SCT=0、SC=0。
- 工单要求同次目标 LBA 0x600 的 SHA-256 与预期 H9 相同。独立读回记录为 H7，数据校验工具自检正常。

## SSD-F14-07

新门铃缓冲在最高实用 QID 的全链路验证能签吗？

- 布局、页对齐与最远合法 SQ/CQ 槽位已通过。匹配的 Doorbell Buffer Config Admin CQE 为 SCT=0、SC=0。
- 脚本宣称捕获了 QID=12 的两类槽，但内存写事务记录显示主机 doorbell 写落在 PRP2，控制器 event index 写落在 PRP1；这是该工单指定逐项核的两个事件。

## SSD-F14-08

固件说 MSI-X 可以仿照 MSI 的多消息模式替换 Message Data 的最低两位，工单可以收吗？

- 目标 Function MSI-X 启用且两级掩蔽均清除；同次受控中断明确选定表项 6。已读回地址 0x00000081_FEE04100、Message Data=0x000000A4。
- 目标 TLP 的 Function、完整地址与注入记录都匹配，实际 Data=0x000000A6。

## SSD-F14-09

平台已批准映射 R41，本次联合工单要求流 A、B 都落到各自指定目标。能给整个变更签字吗？

- 同一次映射 R41 的审批绑定目标设备，表项及配置读回已核。工单 A 要 ST[7:0]=0x11、实际落到 CPU4，B 要 ST[7:0]=0x22、实际落到 CPU7。
- A 的同次 TLP 和落点明确匹配。B 的目标 TLP 已有 TH=1、ST[7:0]=0x22，但 CPU7 记录来自前一天 R40，R41 当下目标落点未捕获。

## SSD-F14-10

准备按工单拿掉电源，当前记录能证明这条写已经被指定 Flush 覆盖吗？

- 同一控制器、NSID=4，易失缓存已启用，Write 未要求 FUA。工单的覆盖路径限定为 Flush。
- 合并时间轴显示 Write SQE t=1，Flush SQE t=2，Flush 成功 CQE t=3，Write 成功 CQE t=4。硬件轨迹也确认控制器在 t=4 才完成 Write。

## SSD-F14-11

这次热阈值注入只验 Sensor 2 到上限时 SMART 温度告警置位。记录可以通过吗？

- 同轮确认 Sensor 2 有实现，Composite 与其余传感器未触发阈值。匹配的 Get Features 04h 成功返回 Sensor 2 上阈值 340 K。
- 同次 SMART 样本 Sensor 2=340 K 且 Critical Warning.TTC=1。工单未要求复原或异步事件。

## SSD-F14-12

工单只验 32-bit CAS 在页尾的长度/自然对齐/4 KiB 边界。分析器因 Length=2 DW 报跨页，这条能签吗？

- 目标 CAS 语义支持已确认。实际报文操作数 32 位，Address=0x00008FFC、Length=2 DW，有两个 32 位的比较/交换操作数。
- 该工单只验该请求头和边界，不验完成或数据结果。

## SSD-F14-13

夜班准备按旧记录直接重提 Read。当前命令这次可签“按同样条件重试”吗？

- 旧 CQE 的 CID 相同但已完成于上一次队列代次，DNR=0。当前失败的 Read 已按当前 CQ 相位、SQID/CID 匹配，原始 SCT/SC 非成功且 DNR=1。
- 变更记录显示重提沿用相同 NSID、地址、命令参数和控制器状态。

## SSD-F14-14

首个 SMART 样本 DUW=1，脚本据此签“精确写入 512000 字节”，可以吗？

- 是同一控制器本轮非零的 DUW 初值记录，没有此前的主机 I/O 字节账本。测试明确要求精确值，不包含元数据。
- 题目仅验主机 User Data Out 累计逻辑数据量。

## SSD-F14-15

工单要求 IDLP 非零且换算报告典型值不超过 0.20 W，同时同功率状态的合规 30 s 窗口实测均值不超过 0.20 W。能通过吗？

- 同一 NVM subsystem 的目标功率状态描述符 IDLP=15、IPS=10b。原始计量日志显示进入该状态后连续 30 s 无待处理 I/O、Admin 或后台任务，表计均值 0.170 W。
- 功率状态标识、状态开始时刻和仪器采样窗口已关联。

## SSD-F14-16

验收只查这个 PCIe CAS 的操作数自然对齐和合法请求长度。地址对 8 字节但没对 16 字节，能签吗？

- 目标支持 64-bit CAS。捕获显示地址 0x1818 和 Length=4 DW，含两个 64 位操作数。
- 接收端正常，工单只验实际 TLP 的地址和 Length。

## SSD-F15-01

这份工单只验 NSID=21 的测试写进入 Flush 覆盖范围。有不同的提交队列，能签字吗？

- 易失写缓存已使能。NSID=21 的 Write 在 SQ 3 上，用有效相位、SQID/CID 匹配的成功 CQE 记录在 10:02:11.230，之后另一 SQ 5 才在 10:02:11.310 提交该 NSID 的 Flush，匹配的 CQE 成功。
- 时钟源相同，第三条 I/O 属于 NSID=22。工单需要列明应附的原始记录。

## SSD-F15-02

表项 2 的中断在保持掩蔽时被服务，验收只测解掩后不会误发这条已完成事件。能签吗？

- MSI-X Enable=1，Function Mask=0，表项 2 从事件注入到处理完成一直 Vector Mask=1。PBA 位随事件置位，事件被服务后清零，期间无该表项消息。
- 解掩后工单规定的观察窗口内无新事件。同步分析仪按 Function 和目标表项地址/数据捕获，未发出该表项的消息。

## SSD-F15-03

目标功率状态的 IDLP 描述符和空闲表计均值都要 ≤0.075 W。这是完整采样，能签吗？

- 同一子系统目标功率状态的 IDLP=600、IPS=01b。保持该状态并空闲 10 秒后无间断采样 30 秒，期间没有待处理命令、属性访问或后台操作。
- 表计平均 0.071 W，状态时序和表计串在同一测试事件。

## SSD-F15-04

只验非正常电源切断要计入 UPL。这一次的计数器结果可以签吗？

- 同一控制器同次断电轨迹在主电源下降时 CSTS.SHST=01b；管理端没有介质访问。唯一这次断电前 UPL=71、冷启后也是这颗控制器读出的 UPL=72。
- 工单不评价实际数据损失。

## SSD-F15-05

当前错误 DNR=0。值班流程要求重试审批且只准单次，去年的许可已过期，能直接做这一次吗？

- 本次 Read 与有效的当前 CQE 按队列和 CID 对上，实际 SCT/SC 已记录为非成功，DNR=0。此机的工单、NSID 与旧许可对象相同，但有效期已于上一个班次结束。
- 应按当前错误重新确认处置，系统从未授权无限重试。

## SSD-F15-06

本次 Fused 故障注入工单既要首 Compare 因预定不匹配失败并使 Write 中止，也要原数据不变。现场能结案吗？

- 适用命令集及支持位已核，两个提交和有效 CQE 分别按当前相位及 SQID/CID 对上。首条为计划明确指定的 Compare 不匹配状态，次条 SCT=0、SC=09h。
- 同一 NSID=3、LBA=0xB20 的独立读回记录，测试前与 Fused 结束后的校验值均为预期 A6；期间无其他写该 LBA。

## SSD-F15-07

工程师准备换短 Steering Tag。目标报文已能写出这个值，但工单要求固件和应用都批准映射。现在能启用吗？

- 目标 Function 当前笔普通报文 TH=1、ST[7:0]=0x56，符合候选映射 R52。固件签字有效，应用只签过旧 R51 中的 0x38。
- 工单要求目标 Function+应用映射的新值获双方批准，并能对应真实请求。

## SSD-F15-08

控制器重启后沿用原物理页。本次工单要签最高合法 SQ Tail/CQ Head 的实际快速路径恢复，能验收吗？

- 发生 Controller Level Reset 后，按当前 MPS 和队列分配重新检查了两页边界、页对齐和所有权。新 Doorbell Buffer Config 的匹配有效 Admin CQE 为 SCT=0、SC=0。
- 本代次最高合法 SQ 与 CQ 均为 QID=9。同次两类事件的轨迹分别记录了主机写 PRP1 的对应 Shadow 槽、控制器写 PRP2 的对应 EventIdx 槽，实测地址和条目均与该代次配置及工单值匹配。

## SSD-F15-09

冻结 MSI-X 表项 3 后仍抓到同地址写。工单只验表项 3 被禁止发消息，可以说屏蔽失败吗？

- 同一 Function 的表项 3、7 目的地址相同，读回数据分别为 0x100、0x107。Function Mask=0，表项 3 在测试窗口一直掩蔽，7 可发送。
- 同步注入分别标记了两项的事件，窗口内抓到的唯一匹配地址的消息为该 Function 的 Data=0x107，表项 3 的 PBA 置位。

## SSD-F15-10

计划刷完附着的每个 NSID 再停机。驱动提交广播 NSID 的 Flush 后收到报错，可以签全体通过吗？

- VWC 已启用，控制器 Identify VWC.FB=10b。已完成的待覆盖写位于 NSID=4 与 9。
- 本次 FFFFFFFFh Flush 有唯一匹配有效 CQE，实际为 Generic SCT=0、SC=0Bh（Invalid Namespace or Format）。未对两个 NSID 单独 Flush。

## SSD-F15-11

热保护恢复脚本看到温度等于回差门槛就准备签恢复，当前可以签吗？

- 控制器支持 Composite Temperature 的 over-temperature hysteresis。已触发事件，上阈值 340 K，TMPTHH=4 K。没有其他温度事件。
- 当前同次 SMART Composite=336 K、TTC=1，事件与测试同步，脚本准备把这个采样点签为已恢复。

## SSD-F15-12

协议验收要求同个 Read 的两个 Completion 在链路按地址升序。导出表按 Completion Address 排序后看起来正常，可以签吗？

- 两条原始 Completion 属于同一 Requester、Tag 和 Read 事务。当前导出表显示 Lower Address 0x10 在 0x30 之前，仪器确认导出表按地址排序。
- 原始链路包号 802 的 Lower Address=0x30，包号 803 的 Lower Address=0x10；同一地址窗口无回绕。

## SSD-F15-13

SMART DUR 从 2 变成 3。可以用这两个样本验收“主机恰好读了 1000 个 512 B 单元”吗？

- 同一控制器、同 scope 的两个有效非零样本。工单只验精确主机读取量，忽略元数据。
- 上层 I/O 的实际传输长度记录尚未采集。

## SSD-F15-14

从 Get Features 的成功返回字判断这个 Feature 支持保存。该证据能签吗？

- 属于同一控制器的原始 Admin SQE 记录 SEL=000b，匹配的成功 CQE DW0 最低位为 1。
- 工单只要 Feature 是否支持保存，不要求执行保存。尚无 SEL=011b 的请求或完成。

## SSD-F15-15

只验交换机这一笔 Completion 超越较早 Posted Request 是否被 IDO 规则允许。可以签吗？

- 同方向同流量类别的原始入端和出端捕获表明该对确实发生超越。较早 Posted Request 的 Requester ID=04:00.0。
- 实际 Completion 的 IDO=1、RO=0、Completer ID=05:00.0、Requester ID=04:00.0。工单不需要判断所有请求的排序。

## SSD-F15-16

这条失败记录的 CQE 有 More=1，但值班只查看了 SMART 错误计数。工单只验是否已找到该次失败的追加状态，能签吗？

- 按当前有效相位、SQID=5、CID=0x53 匹配了原始失败 CQE，实际 SCT/SC 已保留，More=1。
- 只有同控制器 SMART 的 Error Information Log Entry 总计数增加；未读取 Error Information Log Page 条目。

## SSD-F16-01

工单只验关闭易失写缓存、非 Sanitize 时 Flush 仍返回成功，现有记录能签吗？

- 目标控制器上的缓存禁用读回、非 Sanitize 状态，均对应同一事件窗口。
- 同一控制器 NSID=5 Flush 的原始 SQE 和有效 CQE 已关联，实际 SCT=0、SC=0。工单不验断电后数据。

## SSD-F16-02

工单只验普通 MSI 的单条消息数据。发包的高半字都是零，可以签吗？

- 目标 Function 使用 MSI，MSI-X 禁用。MSI Enable=1、事件向量未掩蔽、Multiple Message Enable=000b、Extended Message Data Enable=0。
- Message Address 与 Message Data 已读回；后者是 0xB142，目标 DWORD Memory Write 的地址与读回相符，数据是 0x0000B142。

## SSD-F16-03

工单只验这一笔 deferred abort，Abort 成功时 IANP=1，后来目标 I/O 也有完成。现在可签吗？

- 本次受控注入没有复用队列或 CID。Admin Abort 的有效 CQE 为 SCT=0、SC=0、DW0.IANP=1。
- 之后同一 SQID/CID 的目标 I/O 原始有效 CQE 为 Generic SCT=0、SC=07h，时序与该次注入相符。

## SSD-F16-04

只验启用 MSI 的 Function 在中断向量模式下忽略超出启用向量范围的 ST 表项，不验真实发包。配置和调试日志已齐，可以签吗？

- 同一 Function 的 MSI Multiple Message Enable=001b，即启用了向量 0–1；TPH 已选中断向量模式，ST 表可容纳 0–3。
- 同轮选表日志显示事件 0、1 分别用了 0、1，0–1 以外的条目没有被作为启用向量使用。工单明确是本次配置检查。

## SSD-F16-05

本次门铃 SQ/CQ 两个最远槽的访问都和规划地址相符。现场能签重绑定后的快速路径吗？

- 本代次 Admin Doorbell Buffer Config 的有效 CQE 成功，但解码原始 SQE 时发现实际 PRP1 指向旧 Shadow 页 X，PRP2 指向正确的 EventIdx 页 Y。
- 现场访问记录所期待的是新 Shadow 页 Z。题面仅验重绑定关联，无其他证据能将访问 Z 归到已被成功配置的 PRP1。

## SSD-F16-06

同一 SQID/CID 出现两个错误条目。工单只验找到本次失败的追加状态，现有窗口记录能签吗？

- 受控复现只有一条失败发生。前后快照在同控制器、无复位的窗口内取得；旧条目 Error Count=103，复现后新增 Error Count=104。
- 两项的 SQID/CID 相同，但新增项 104 的 SCT/SC 与本次相位有效、More=1 的失败 CQE 一致，并包含所需状态。

## SSD-F16-07

脚本要把已捕获的目标消息作为改址生效证据。工程师发现唯一抓包其实发生在改址之前，这轮能签吗？

- 改写和读回都发生在目标 Function、表项 4 有效掩蔽时，地址从 A 变到 B，完整 Message Data=0x87，之后实际解掩。
- 唯一匹配地址 B/Data 0x87 的仪器包号早于本轮写入，工单要求实测本轮改址后的用法。

## SSD-F16-08

目标 Compare+Write 两个命令状态达标，脚本把另一个命名空间的读回也用了，工单能验完整吗？

- 目标 NSID=14、LBA=0x99 的 Fused 支持与提交配对已确认，两条有效 CQE 都 SCT=0/SC=0。
- 工单需要同一次写后读回模式 T9。脚本唯一的 T9 读回来自 NSID=15 的同一个 LBA。

## SSD-F16-09

工单要验 Device Specific Mode 下一次目标请求实际发送指定普通 Tag 值。有人要求必须读回 MSI-X 表对应项才能签，可以吗？

- 目标 Function 的 Device Specific Mode 与 TPH 使能均已核。平台记录给定测项期望 ST[7:0]=0x5C。
- 同一次设备触发的目标 Memory Write 被以 Requester/地址关联，TH=1、ST[7:0]=0x5C。工单不评价内部选择算法。

## SSD-F16-10

控制器支持广播 Flush，两个命名空间都有成功写的 CQE。这次能签两条写都在覆盖范围内吗？

- VWC 已启用且 Identify VWC.FB=11b。附着的 NSID=1 写在 t=10 完成；NSID=2 写在 t=14 完成。三个命令的匹配记录有效。
- 广播 NSID=FFFFFFFFh 的 Flush 在 t=12 提交、t=15 完成且 SCT=0/SC=0。

## SSD-F16-11

值班只需要判断本次日志能否把状态 CRD=10b 注释成“选用了 CRDT2”。可以这样标吗？

- 请求的当前失败 CQE 唯一匹配；DNR=0，CRD=10b。命令完成时的 Host Behavior Support 读回 ACRE=0，工单不授权重试或更改设置。

## SSD-F16-12

低温事件回升到回差边界，脚本准备签恢复。能签吗？

- 受控环境的 Composite Temperature 低阈值 269 K，TMPTHH=2 K，温度回升到 271 K，只有该事件激活。
- 同次温度和 TTC 由 SMART 样本固定，TTC 仍为 1。

## SSD-F16-13

同一 Requester 的两个读分配了不同 Tag。第二个读的 Completion 插到第一个读的两个片段之间，这项排序可签吗？

- 链路原始顺序为 Tag A/Lower Address 0x20、Tag B/0x10、Tag A/0x40，三个 Completion 分别上链，Tag A 的两个片段地址没有回绕。
- 工单只验同事务顺序，两个读属于同一个 Requester、不同 Tag。

## SSD-F16-14

看见 SMART NEILE=180，报告可以写“这一轮压力测试生成了 180 条错误日志”吗？

- 同一控制器仅有本轮结束后的 SMART 样本，NEILE=180。开始前没存计数也没有完整事件日志。
- 工单只要本轮错误日志新增数量。

## SSD-F16-15

原始 Get Features 显示这个 Feature 可改但不可保存，工单要签这两个属性。能签吗？

- 同一控制器/FID 的 Get Features SQE 指明 SEL=011b。匹配的有效 Admin CQE 成功，DW0.CHANG=1、SVBL=0。
- 工单只验能力标志，不要求逐项修改和保存。

## SSD-F16-16

设备支持 128-bit CAS，控制器把这笔失败归因于访存对齐，能签“报文通过对齐检查”吗？

- 目标 CAS 的原始报文 Address=0x3018，Length=8 DW，有两份 128 位操作数。支持位和长度都已通过。
- 工单只验请求地址自然对齐和长度，不判断系统其他故障。

## SSD-F3-01

驱动的取消接口收到成功，应用立即要拿回这块读缓冲并对用户显示“已取消”。现在可以交还吗？该用哪份记录决定这条 I/O 的结局？

- PCIe SSD 的 Admin Abort 指向 SQID=5、CID=47，其自身 CQE 的状态为 Success，DW0.IANP=1。
- 该笔 I/O 的 CQ 仍由轮询线程负责，当前抓取截止时尚未保存对应目标 CQE。缓冲未复用，队列未删除、未复位。

## SSD-F3-02

恢复程序给 SSD 准备好 HMB，又想保留上次的缓存收益。恢复的这份内存能按“归还原缓冲”交回吗？

- 控制器支持 HMB。上次按正常流程禁用 HMB；恢复后总大小、描述符列表地址和每项地址都一样，主机却在恢复期间把 HMB 数据页清零。
- 设备仍未重新启用 HMB。这次允许正常重新分配并启用缓存，要求不向设备提供错误的缓存历史。

## SSD-F3-03

维护后，盘日志时钟比同一采集机上的上一条早了。可以把早的那段按重复事故剔除，再以控制器时间差给本次停顿定时长吗？

- 同一 SSD 支持可保存的 Timestamp feature，维护前曾保存一个时间值，期间发生过控制器复位，维护后没有主机重新校时的记录。
- 本次 Get Features 的 SYNC=1。采集机保留了不跨重启的单调时间戳和命令序列号。

## SSD-F3-04

资产平台只读到 Saved 和 Default 相同，准备把这份导出作为“维护脚本已把该值持久写入”的证明。现在可以签吗？

- 目标是一个可查询的控制器级 Feature。同一对象的 SEL=010b 和 SEL=001b 都成功并返回 X，而 SEL=000b 返回 Y。
- 变更窗口未留 Set Features 的提交、Save 位或成功 CQE。也未保存此 Feature 的 supported capabilities。业务盘不允许为核实而改值或复位。

## SSD-F3-05

两块 SSD 的 Percentage Used 分别为 102 和 255。导入器把前者报成非法遥测，把后者记作精确 255% 并发起故障退役，两项规则能用吗？

- 取自 NVMe SMART / Health Information 的 byte 5，读取有效；没有报 Available Spare 字段异常。
- 两块都仍在线，未提供介质出错、数据可靠性或厂商退役阈值。客户可依自定寿命策略安排维护，但故障工单要求证据。

## SSD-F3-06

采购的 SSD 把 Get Features 的缓存开关读成 Invalid Field in Command，验收程序准备判盘故障；供应商又要据此直接签全部数据已具备掉电保护。哪两个结论可以签？

- 读取的是 FID 06h；同一控制器 Identify 报告 VWC.Present=0。本轮采集没有断电试验、特定写请求的完成记录或外部平台持久性证据。

## SSD-F3-07

一次盘资产抓取把上一槽序列号登记到了这块盘。采集器发起 VPD 读取后，看到 F 仍为 0 就重写地址跳到下一项，随后直接取 Data。该按哪笔数据登记？

- VPD 能力和地址有效。第一笔读用同一次寄存器写提交 F=0 与目标对齐地址。读回 F 尚为 0，此时另一个工作线程写入了另一目标地址。
- 未保留第一笔 F 变 1 的记录；没有授权改写任何 VPD 内容。

## SSD-F3-08

现场同事想在第二次按键后马上拔出混合背板上的 SSD，说“两次确认已经完成”。值班员应放行这次物理拔盘吗？

- 插槽配有标准 Attention Button、Power Indicator 和热插拔软件。第一次按下后软件接受了移除请求，电源指示灯开始闪；2 秒后又按了一次同一按钮。
- 没有软件已完成下线、指示可移除或电源已经断开的记录，业务在此前有活动。

## SSD-F3-09

链路保护触发后，盘的 MMIO 全读成 F。脚本准备认定盘被拔出，随即清 DPC Trigger Status 试图重新发现设备。这一拍能清吗？

- 该 Root Port 支持 RP Extensions for DPC。DPC Trigger Status=1，DLL Link Active 已读为 0，但同一拍 DPC RP Busy=1。
- 平台已知会把保护期间的某些 UR 读合成为全 F。尚无物理存在和受控恢复后的枚举记录。

## SSD-F3-10

同一插槽换装两种 SSD 后，财务资产系统固定从 Power Budgeting Data Select=8 取值。两块 Data 都是全零，它想把二者的 D0 最大功率登记为 0 W 并增加装机数。能这样核预算吗？

- 两块都实现 PCIe Power Budgeting Capability。此前没有从 index 0 顺序枚举过记录，也未检查返回记录的 PM State、Type 或 Power Rail。
- 槽位和 PSU 的可用预算单独管理，没有外部实测功耗。

## SSD-F3-11

业务流量已在默认通道运行。维护员刚给存储链路启用了一个新 VC，看到 Root Port 侧 Pending 清了，就要求把测试流切到该 VC。可以切吗？

- 链路报告 DL_Active，双方都是多 VC 实现，同一非默认 VC 在两端 Enable 均为 1。Root Port 的 VC Negotiation Pending=0，但 SSD 一端同一 VC 的 Pending 仍为 1。
- 未观察到两端同一时刻都清零。原业务可以留在原通道。

## SSD-F3-12

SSD 发起一笔 PCIe Memory Read，用来读取主机中的一段描述数据。工具在看到第一段带 Success 的 Completion 后，把整段内存标为已取齐，并据此宣称后面的超时来自 NVMe。该接受这个归因吗？

- 分析仪确认该请求需要多个 Completion；当前只有同一请求的前半段数据，尚无完整覆盖。Requester 报告该请求 Completion Timeout。
- 采集未覆盖路径各段，没有该描述符对应的后续 NVMe 完成证据。允许做只读抓取，不允许主动重放业务命令。

## SSD-F4-01

维护脚本清零 KATO 后，要把连接移给一个不发 Keep Alive 的客户端。可以移交吗？

- 该 Fabrics 传输绑定要求开启 Keep Alive Timer。变更前记录非零 KATO。
- 同一控制器对本次 Set Features 返回 Keep Alive Timeout Invalid，之后没有别的变更记录。

## SSD-F4-02

维护窗口内要向 NSID=4 提交一个维护命令。队列里只剩 NSID=7 的数据命令。可以立即提交吗？

- 这是一台 NVMe 控制器。该命令在 Commands Supported and Effects 中的 CSE=010b，CSER=0。
- NSID=7 的命令确实仍未完成。计划要求遵守规范的调度建议。

## SSD-F4-03

跨多次读取的 Persistent Event Log 中没有重启事件。能把这份导出签成‘未发生重启’吗？

- 采集端建立了 reporting context，先读的 Generation Number 为 21，读完全部分段后同一头字段为 22。
- 前后都成功返回。没有其他连续的主机事件记录。

## SSD-F4-04

盘组监控的只读巡检要保留 pending 通知给另一流程。怎样取组 3 的告警详情而不确认清除？

- 组 3 出现在 Endurance Group Event Aggregate。采集器尚未读取组 3 的 Endurance Group Information。
- 巡检的授权只包含读取。消费通知的工作由另一流程处理。

## SSD-F4-05

安全审计准备把日志里列出的某个 FID 登记为‘主机 Admin 路径已经封禁’。这份日志够吗？

- 取自 Command and Feature Lockdown Log，SCP=2h，CNTTS=00b。返回的列表包含 FID。
- 无 Lockdown 操作记录，授权只允许读取。

## SSD-F4-06

驱动评审里有人用 CQE 上的非零 CRD 给这次命令套退避延时，然后直接重试。可以放行吗？

- 同一主机与控制器的已确认 Host Behavior Support 当前 ACRE=0。CQE 的命令身份有记录，但解析得到非零 CRD。
- 尚未对照原始 CQE 字节和驱动位段，未批准重新提交该命令。

## SSD-F4-07

维护员向一个 PCIe Function 发出 FLR，接着看到共享链路掉线。能签‘正常 FLR 链路重训’并跳过调查吗？

- 抓取确认目标为 F0 的 Initiate FLR 写。F1 也在同一链路上。
- 没有对其他复位、供电或链路错误做同步采样。

## SSD-F4-08

有人建议给 PCIe Switch 加一条规则，转发时重算并替换不匹配的 ECRC，‘修一下’再送给 SSD。可以验收吗？

- 该 TLP 是经过 Switch 转发的请求，不以 Switch 本身为目标。进入时带 ECRC。
- 目标端要能保留端到端完整性判断。

## SSD-F4-09

资产扫描把 ARI Capability 中的 Next Function Number 当数量，并把 04h 解释成增减了四个功能。当前应怎么记？

- ARI 转发已启用。Function 0 报 04h，Function 4 报 00h，两个读取均有效。
- 没有旧拓扑对照，也没有物理槽位变化记录。

## SSD-F4-10

两块盘挂不同 Root Port。两端端口都标 AtomicOp Routing Supported，有人要凭这两位开启跨端口 P2P AtomicOp。可以签吗？

- 两个 Root Port 都读到 Routing Supported=1。目标盘的计划操作类型和位宽能力已确认。
- 没有这对端口的路由支持记录或经过授权的验证结果。

## SSD-F4-11

SSD 只支持 No ST Mode，脚本见 TPH Requester Capability 存在就要把 ST Mode Select 写成 Interrupt Vector Mode。可以放行吗？

- 该 Function 的 No ST Mode Supported=1，Interrupt Vector Mode Supported=0，Device Specific Mode Supported=0。
- 本次只要求验收模式选择；没有业务允许修改的其他功能。

## SSD-F4-12

隔离验收仅检查 Switch Downstream Port 的 ACS Source Validation Enable=1，然后就签‘下游方向所有 P2P 请求都会被重定向’。能签吗？

- 本次留下的是该 Downstream Port 的 ACS Control 快照，没记录 ACS P2P Request Redirect Enable。
- 没有读路径验证结果，也没有授权在线改寄存器。

## SSD-F5-01

监控要再投一条 Asynchronous Event Request 保活。可以现在提交吗？

- 同一控制器已经挂有两个尚未完成的 AER。驱动已确认该控制器允许同时挂起的上限为两个。
- 目前没有任何一条 AER 的完成记录，监控流程还在消费事件。

## SSD-F5-02

某支持索引读取的 NVMe 日志有等长 64 字节记录。工具要读取索引 3，拟在 OT=1 时把 LPO 填 192。能这么填吗？

- 该日志支持结构索引，记录起点没有额外头部。索引按从零开始解释。
- 本次只校验读取目标与 LPO 单位，没要求改日志的其他参数。

## SSD-F5-03

成功开启某个 NVM Set 的 Predictable Latency Mode 后，性能验收要把紧接着的流量记作确定性窗口样本。可以直接入账吗？

- 只保留了 Predictable Latency Mode Config 启用的成功完成记录。
- 没有单独的 window 设置或同一时间段的 window 观测。

## SSD-F5-04

看到 Arbitration Feature 的 AB=111b，验收员准备把每个提交队列每轮最多抓取 128 条当成规范保证。可以签吗？

- 采集器把 AB 按 2 的幂计算。当前工单只验证 AB 这个字段。
- 既没有本控制器执行上限的厂商约定，也没有单次抓取的测量。

## SSD-F5-05

多功能 SSD 的 F1 配置空间没找到 Lane Margining Extended Capability，验收员拟仅凭这一点判整端口缺功能。成立吗？

- 这是多功能设备的 Upstream Port，Supported Link Speeds Vector 包含 16 GT/s。
- 读 F1 的配置空间操作本身成功。本轮还没有读 F0 的能力链。

## SSD-F5-06

根据 FRS Message Overflow=1，能否把这一时间段内未被采集的 FRS 通知数登记为恰好一条？

- Snapshot 来自某 Root Port 的 FRS Queueing Status；未留存逐条消息或上次清状态的时间。
- 该位目前为 1，除这份快照外没有别的采集。

## SSD-F5-07

SSD 的 MSI-X 通知 TLP 抓包中同时看到 RO=1，验证脚本采用“数据流可以 Relaxed Ordering，所以通知也可用”的规则。能通过吗？

- 抓包已经确认这条 Memory Write 为该 Function 发出的 MSI-X 通知，位段解码已复核。
- 本次只验收该条通知的 PCIe 属性。

## SSD-F5-08

系统清单看到某 BAR 的 Resizable BAR Capability 支持 16 MB，就把当前窗口记成 16 MB。这里可以签当前分配值吗？

- 功能确实支持该 BAR 的 16 MB 选项。记录未保留对应 Control 的 BAR Size 或系统资源分配。
- 本轮只读核对，不允许重新分配 BAR。

## SSD-F6-01

掉电复电后 NSSRO=0，能签复电前的故障窗口内没有发生 NVM Subsystem Reset 吗？

- CAP.NSSRS=1。只保留复电重新枚举后该控制器的 CSTS 读值。
- 复电前窗口没有同一域的寄存器快照或 reset trace。

## SSD-F6-02

PMRSTS.NRDY=0，验收程序要立即写这个 PMR 窗口，可以放行吗？

- 同一控制器同一次有序采样，PMRCTL.EN=0，地址映射没有变。
- 当前工单只决定是否允许访问这个 PMR，未授权修改控制寄存器。

## SSD-F6-03

先后两次读不同 Boot Partition，后来 BPINFO.BRS=10b。可以补签第一份旧缓冲已成功读出吗？

- 第一笔针对分区 A。第一笔状态和缓冲快照未留存。
- 明确看到之后向分区 B 写了 BPRSEL.BPID，同一控制器在 B 之后读得 BRS=10b。

## SSD-F6-04

夜间功耗峰值后，把 NOPPME 清零。现在读回 0，能签凌晨峰值一定违反非工作电源态限制吗？

- 峰值发生在变更之前，当时记录了盘处于目标非工作电源态。
- 峰值时没有捕获同一控制器的 NOPPME，当前值来自变更成功后的读回。

## SSD-F6-05

在同一控制器开启某条 Notice 后收到一份对应通知。能把通知时刻作为问题最早出现的时刻吗？

- 此前 Notice 被关闭；开启时该事件条件已真，这一点有同一控制器的同步监控。
- 开启成功后正常交付了通知，开启前没有够细的时间序列。

## SSD-F6-06

成功给 NVM Set 2 设置新的 Read Recovery Level，能把 Set 5 一起标成已变更吗？

- 该设备支持 NVM Sets，命令带的 NVMSETID=2，成功 CQE 已核对。
- Set 5 是同一子系统下另一个独立的 NVM Set，没有对 Set 5 做变更。

## SSD-F6-07

CDQ 刚创建，首个槽的 CDQP 从预置 0 读到 1，可以按新 CDQ 条目处理吗？

- 队列内存已按规范清零，此次是第一次遍历；同一 CDQ 同一槽，主机已按所用平台做读取顺序同步。
- 当前只判断新 CDQ 条目的发布，不是对业务处理成功做结案。

## SSD-F6-08

一次 Controller Level Reset 完成后要写 Boot Partition。之前已明确锁到下一次 power cycle，现在可以试写吗？

- 该设备且该 Boot Partition 支持相应保护方式。复位前已记录 Write Locked Until Power Cycle。
- 复位控制链说明这次只做 Controller Level Reset，未发生 power cycle。

## SSD-F6-09

链路重建后 Remote Data Link Feature Supported Valid=1，能签事故前那一轮对端能力取值和现在一致吗？

- 期间捕获进入 DL_Inactive。重建后同一端口重新交换成功，远端位图保持在这次记录里。
- 事故前旧交换或旧位图未保存。

## SSD-F6-10

Root Error Status 显示收到多个不可纠正错误，Error Source ID 只有 BDF A。能将第二个及以后的报告全部派给 A 吗？

- 已知采集前未清掉首条状态；Multiple ERR_FATAL/NONFATAL Received=1。
- 未保存第二条及后续的错误 Message 或报告者身份。

## SSD-F6-11

FLR 后 Device Status 的 Transactions Pending=0。能据此签之前两笔 Non-Posted 请求在复位开始前都成功完成吗？

- 目标为 Endpoint Function。两笔请求身份清楚，但没有保存各自 Completion。
- 现有读数在本次 FLR 完成之后，无复位前同一时刻的 Pending 快照。

## SSD-F6-12

抓到有效 Ack DLLP 覆盖该 PCIe Memory Read 请求 TLP 的序号，可以把这笔读记成已经收到返回数据吗？

- 两端同链路抓包确认 Ack 覆盖该请求的链路序号。
- 事务层没有抓到此请求的 CplD，也没有上层接收记录。

## SSD-F6-13

已捕获同一 Function 发出 FRS，紧接着的配置读取却返回 CRS。现有同期记录足以判这次返回违反 FRS 约束吗？

- Requester ID 和目标 Function 已核对一致。记录覆盖 FRS 发送直至这笔请求，期间没有后续 DRS Event 或 FRS Event。
- 本次只判这条 Completion 是否符合，不要求定位底层原因。

## SSD-F6-14

初次 FLR 期间曾读 FLR Time，但当时 Valid=0。稳定后 Valid=1 且数值相同，能回填为首次 FLR 的实测恢复时间吗？

- 两个样本来自同一 Function。首次 FLR 没有捕获配置就绪的转折时刻。
- 较晚样本在驱动已启动并重新采集后取得。

## SSD-F6-15

Root Port 开启 PME Interrupt Enable 后立刻中断。值班要把中断时间登记成 SSD 新发 PME 的时间，可以吗？

- 中断使能写之前，已对同一 Root Port 读得 PME Status=1；这次写仅把 Enable 从 0 变成 1。
- 没有同期链路上的新 PME Message 抓包。

## SSD-F6-16

ePTM Requester 重放一次 PTM TLP，之后两个无重放 dialog 恢复了上下文。能把中间采集的样本用恢复后的 PTM 映射补签吗？

- 从重放到第二个成功 dialog 完成的区间里，只有本地时间戳，没有独立公用时基或有效映射记录。
- 两个成功 dialog 和样本的先后已经捕获，样本在第二次成功前。

## SSD-F7-01

维护脚本想并发发送第二条 Abort。能按目前记录放行吗？

- 同一控制器实际支持的同时在途 Abort 上限经 Identify 解析为 1。已有一条 Abort 未完成。
- 它当时指向的 I/O 已见目标完成，但未见 Abort 管理命令自己的完成。

## SSD-F7-02

申请创建 800 GB Endurance Group。Identify Controller 宣告单组最多 1,000 GB，这是否足以放行？

- 已用同一单位按规范换算。Identify Controller 的 UNVMCAP 为 900 GB。
- 目标 domain 的 Domain Attributes Entry 给出的 MEGCAP 为 700 GB。

## SSD-F7-03

同一控制器上的 I/O Command Set A 能返回 CNS=16h。验收脚本要把 A 的 Namespace Granularity List 复制给 Set B，能放行吗？

- A 和 B 的 Command Set Identifier 不同。B 所对应的 I/O Command Set 未定义对 Namespace Granularity List 的支持。
- 已经成功读取 A，但没有任何 B 的列表。

## SSD-F7-04

正常 PMR 写入后，工具做了一次 PMR 地址读并准备签此前写入均已持久化。可以签吗？

- 当时 PMR 已就绪且健康正常，同一控制器 PMRWBM.CMR=0、CPMTSTSR=1。
- 这次操作只收到 PMR 内存地址的读完成，尚无 PMRSTS 属性读完成。

## SSD-F7-05

脚本对 Enhanced Controller Metadata 用 EA=00b，希望已有的元素会覆盖，缺少的会创建。可以部署这条规则吗？

- 已确认目标为 Enhanced Controller Metadata。团队用过常规 Host Metadata 的 Add or Replace。
- 该命令还没有提交，当前只做字段与失败预期核对。

## SSD-F7-06

验证器看到预启动软件成功时 PBSLC 从 255 变 0，认定是规范定义的计数回卷。可以按这个规则放行吗？

- 同一控制器，预启动软件成功加载前已保存 PBSLC=255。
- 后续只保存了 PBSLC=0，期间没有记录 OS 驱动是否写过此字段。

## SSD-F7-07

同一 NVMe 控制器在把 Host Identifier 从 0 改成非零之前已有 reservation 注册。能把旧注册直接登记到新身份，跨控制器级复位也沿用吗？

- 设备允许使用 Host Identifier=0 的 reservation，旧记录明确绑定 0。
- 变更成功后没有同一非零身份的新注册记录。

## SSD-F7-08

同一 host 通过 P0 与 P1 连到同一个 Exported NVM Subsystem。成功撤销 P0 的访问后，可以把 P1 也记成应被断开吗？

- 该操作只指定这个 host、子系统以及 P0，已核验成功完成。
- 没有其他修改权限或连接的操作记录，P1 不在本次列表中。

## SSD-F7-09

协议验收希望用一条同样的 UR 期望覆盖 Root Port 和普通 Endpoint 收到超限 End-End TLP Prefix 的请求。能这样写吗？

- 比较对象分别是适用该规则的 Root Port ingress 和一个非 Root Port Endpoint。
- 两个都是 Request TLP，Prefix 数量分别已确定超过接收方的支持上限。

## SSD-F7-10

采集器看到一个无数据负载的 TLP 上 EP=1。验收员想同时写‘发送端设置合法’和‘接收端必须报 Malformed’。可以吗？

- 抓包完整，TLP 确实没有 data payload，EP 位有效解码。
- 本轮没有任何厂商附加行为合同。

## SSD-F7-11

把 Completion Timeout Disable 从 1 清 0 后，能否用这个写入时刻作为所有旧在途请求的唯一计时起点并写验收超时线？

- 同一 Function 支持清除此位，成功写入已核对。清位前已有 Non-Posted 请求在路上。
- 设备团队没有另外约定硬件对已在途请求如何启动新计时。

## SSD-F7-12

DPA Substate Control 写 3 并读回 3，功耗验收要登记‘当前被软件切到了 substate 3’。可以吗？

- 同一 Function 在写前和写后都读到 Substate Control Enabled=0，也没有在本窗口保存 Substate Status。
- 没有授权修改其他电源配置。

## SSD-F7-13

同一 Endpoint 的 LNR Registration Max 是 00101b，验证要在 16 个 cacheline 已登记时再允许登记第 17 个。可否放行？

- LNR 已启用。LNR Control 的 Registration Limit 当前为 00100b。
- 同一时点确认已经有 16 个注册，占用尚未释放。

## SSD-F7-14

验证脚本想在运行中把 Execute Permission Enable 从 0 改为 1，设备同时开启 ATS。可以按这次工单放行写入吗？

- 同一 Endpoint 支持 PASID 和 ATS。ATS Control.Enable 当前为 1，Execute Permission Supported 已读为 1。
- 这次只授权评审，不授权在线改 ATS 或中断业务。

## SSD-F7-15

在 Downstream Port 发起 Hierarchy ID Message 后读到 Pending=0。期间链路掉过线，能据此签对端确实收到更新吗？

- 开始时已设置 Pending，随后捕获了同一链路 DL_Down，只有恢复时的 Pending=0。
- 没有本次 Hierarchy ID Message 的发送或对端接收记录。

## SSD-F7-16

停止 PCIe Page Request Interface 时已经清 Enable=0，但 Stopped 仍为 0。维护脚本要马上写回 Enable=1，可以放行吗？

- 同一接口无额外 SR-IOV 关联。已确认 Enable=0、Stopped=0 在同一时点读得。
- 本轮未授权向接口写 Reset。

## SSD-F8-01

能签控制器漏报第一次 Traffic Based Keep Alive 超时吗？

- 同一个 Traffic Based Keep Alive 控制器的计时器一直有效，抓包标明了控制器实际区间起点；区间结束前最后 1 ms 抓到了控制器取走一个 I/O 命令。
- 首个 KATT 边界后未见超时报出。第二个区间的取命令记录不完整。

## SSD-F8-02

这个 PCIe 内存队列的 fused pair 能按现在的门铃方式上线吗？

- 控制器明确支持这个 fused operation。队列有空位，第一条 FUSE=01b 在环尾槽，第二条 FUSE=10b 在环首槽，均属同一 SQ。
- 驱动打算分别推进两次 SQ Tail 门铃，每次只公开一条命令。

## SSD-F8-03

能向现场承诺这一个 Feature 设置会跨重启吗？

- 同一控制器 Identify 的 SSFS=1，目标 Feature 通过 Get Features Supported Capabilities 确认为 Changeable=1、Saveable=0。
- 提交 Set Features 时仍设 SV=1，提交日志完整，完成记录还未获交接。

## SSD-F8-04

能在这个 Secondary Controller 继续提供 I/O 时原地增加 Flexible Resources 吗？

- Primary Controller 已启用，目标 CNTLID 确认属于它，目标 Secondary Controller 正处于 Online、持有 Flexible Resources。
- 维护单只允许判定方案，尚未授权造成掉线。

## SSD-F8-05

复位后能只恢复写 Shadow Doorbell 就签驱动快速路径恢复吗？

- 仿真控制器支持 Doorbell Buffer Config。在本次 Controller Level Reset 前配置成功；复位完成后还未重发该命令。
- 旧 Shadow Doorbell 与 EventIdx 页内容依然可读，但新初始化的 CC.MPS 或 I/O 队列分配与复位前不保证相同。

## SSD-F8-06

能用抓包中的 Command Interrupted 和 CRD 给当时主机重试定责吗？

- 早期某 I/O CQE 明确是 Command Interrupted 且 CRD 非零；该时刻同一控制器的 Host Behavior Support.ACRE 未抓到。
- 随后主机成功清 ACRE，事后 Get Features 确认 ACRE=0。

## SSD-F8-07

维护脚本能删完队列后在同一轮控制器初始化里重办 Number of Queues 吗？

- 这次控制器初始化的 I/O CQ 已创建过，甚至没有建 I/O SQ。现在 I/O CQ 已删除干净。
- 仍在同一轮初始化，Admin Queue 工作正常，工单未授权控制器复位。

## SSD-F8-08

CMB 内的 I/O 队列改成两段物理不连续后可否放行？

- 整个拟使用的队列及关联内存均留在同一 CMB，队列类型受支持，地址空间足够。CMBLOC.CQMMS=1，CQPDS=0。
- 为了绕过碎片，拟把该队列本身放进两段不连续的物理内存。

## SSD-F8-09

能对 A、B 两个 Completer 共用这个 10-bit Tag 池策略吗？

- Requester 的 10-Bit Tag Requester Supported 和 Enable 都已核实。A 支持 10-Bit Tag Completer，B 不支持。
- 策略对两个 Completer 均可发 Tag[9:8] 非零的 Memory Read；也允许同时保留较短 Tag。Requester 的 Extended Tag Field Enable=0。

## SSD-F8-10

可以忽略这条 VC 的所有 NP UpdateFC 吗？

- 跟踪的是同一 VC 同一方向，初始化时 NPH 广告为无限，NPD 广告为有限。
- 有人按“见 00h 就无限”写了整类 NP UpdateFC 忽略逻辑；后续 NP UpdateFC 的 header credit 有一次非零。

## SSD-F8-11

能用这组均衡标志为上一次 16 GT/s 训练签失败吗？

- 同一个 Downstream Port 已明确进入下一次 16 GT/s 的 Recovery.Equalization Phase 1。刚进入后读到 16 GT/s Phase 3 Successful 和 Complete 均为 0。
- 上一次 16 GT/s 过程没有保留退出时读取或过程日志。

## SSD-F8-12

能因为收到 ERR_COR 就从验收记录里排除底层 uncorrectable 错误吗？

- 同一 AER Function 上有同期证据：底层错误属于规范列出的 Advisory Non-Fatal 情形，Uncorrectable Severity 为 non-fatal；Advisory Non-Fatal Mask=0，Correctable Error Reporting Enable=1。
- 抓到同一事件的 ERR_COR。该错误需要头部日志，但对应 Uncorrectable Error Mask=1。

## SSD-F8-13

能放行记录里的这些 IDO 位设置，并保留对单个 Completion 的 Malformed 判据吗？

- 同一 Requester 的 IDO Request Enable=1，驱动打算给 Memory Read 和 Configuration Read 都置 IDO。
- Completer 的 IDO Completion Enable=0，分析脚本会把观察到的 IDO=1 单独作为 Malformed Packet 依据。

## SSD-F8-14

枚举脚本能把 0001h 登记为真实 Vendor ID，并把这套规则用于配置写吗？

- 已证实该 Root Port 支持并开启 CRS Software Visibility。一次覆盖 Vendor ID 两个字节的配置读收到 CRS 后，软件看到 0001h。
- 紧接着对同一目标的一次配置写也在链路上收到 CRS，尚无最终软件结果。

## SSD-F8-15

能以 MSI-X 没启用为由改写另一处 Steering Tag 表吗？

- Function 同时实现 MSI、MSI-X，当前使用 MSI，MSI-X 未启用。TPH 能力报告 ST Table Location 在 MSI-X Table，且设备工作于 Interrupt Vector Mode。
- 调试工具要先把相同 tag 写到 TPH Requester Extended Capability 的表，再按所有向量可用推送请求。

## SSD-F8-16

在固件持有 DPC 的热插槽上，能签 OS 直接 Link Disable 的停链路脚本吗？

- DPC 已启用但未触发，由平台固件持有。该端口没实现可选的 DPC Software Trigger。
- 设计要求说明有软件触发能力的另一块板该走哪条路径。本工单评审按规范推荐流程验收。

## SSD-F9-01

这个 Doorbell Buffer Config 的现有页面能签给计划中的 CQ 吗？请核定字节边界。

- CC.MPS=0，CAP.DSTRD=1，NSQA/NCQA 原始值分别是 63/256。PRP1、PRP2 分别指向独立对齐的 4 KiB 单页。
- 计划访问的最大 SQID=32，最大 CQID=256。测试员看到正文容量公式通过，打算放行。

## SSD-F9-02

这次只签 Shadow Doorbell 和 EventIdx 的槽位边界，最大 ID 对应的条目都在页内吗？

- 两块分别是页对齐的单独物理页。CC.MPS=0，CAP.DSTRD=0，NSQA 和 NCQA 的原始编码均是 511。
- 计划访问的最大 SQID 和 CQID 均是 511，支持性及其他命令前提另行验收。

## SSD-F9-03

只测过低编号门铃，能据此签 Figure 486 的整个分配范围吗？

- CC.MPS=1，每页 8192 字节。CAP.DSTRD=2，NSQA、NCQA 均为未经加一解码的 511。
- 两块页的低编号 SQ/CQ 验证成功，没有对高编号做任何访问；报告声称正文不等式等号成立，整个分配窗口可用。

## SSD-F9-04

容量计算合格后，值班人员可以签这次 Doorbell Buffer Config 生效吗？

- 当前 CC.MPS=0，两个缓冲区的实际用到的槽位末端均在页内，正文条件已通过。PRP1=0x100000，PRP2=0x200080，都是各自分配好的页地址区域。
- 命令还没发，工程师想先签快速路径通过。

## SSD-F9-05

这一次环尾回绕只写 Shadow Doorbell 就算正确交付了吗？

- 支持 Doorbell Buffer Config 的控制器已成功完成配置，同一 SQ 的深度为 16。
- 同一时点用于判断的旧 Shadow Tail=12，新的 Tail=2，EventIdx=0，按向前推进方向从 12 回绕到 2。驱动只更新了 Shadow 表项。

## SSD-F9-06

旧页上成功过，可否批准本次复位后按更小的页尺寸恢复？仅签容量与生效门槛。

- 旧会话 CC.MPS=1 时 Doorbell Buffer Config 的 Admin CQE 成功；本次 Controller Level Reset 后已按支持设置 CC.MPS=0。
- 当前 CAP.DSTRD=2，NSQA=128、NCQA=127（原始值）。实际最大 SQID=128、CQID=127。新页都对齐，控制器已就绪，但未重配。

## SSD-F9-07

两条成功 CQE 都已到这一个 CQ，可以签 SQ3 上的 fused pair 执行成功吗？

- PCIe 内存队列已按同一 SQ 相邻、单次 Tail 发布完成。SQ3 的 fused first CID=21、second CID=22。SQ3 和 SQ7 共用同一 CQ。
- 有效的新 CQE 为 (SQID=3,CID=21,Success) 与 (SQID=7,CID=22,Success)。没有其他完成记录。

## SSD-F9-08

首条报失败、第二条报成功，能按“第二条已完成”签 fused 验收吗？

- 同一个支持该操作的 PCIe 控制器，I/O SQ5 中相邻且单次门铃提交。两条新的 CQE 通过 SQID 和 CID 匹配到该 pair。
- 第一条返回非成功，第二条返回 Successful Completion。没有复位或其他提交混入。

## SSD-F9-09

第二条已经确认失败，能直接归档首条的完成码也必须是失败吗？

- 支持该 fused operation 的控制器上，已经核对两条命令正确配对。确认第二条 CQE 非成功。
- 第一条完成记录缺失，现有验收材料只有 Base Specification，还没有该命令集的 fused 执行规则。

## SSD-F9-10

能用 PCIe 的单次 SQ Tail 和 CQE.SQID 作为这条消息型链路的验收门槛吗？

- NVMe-oF 消息型传输，I/O Command Set 的此 fused operation 已确认支持。成对的 I/O capsule 是同一队列相邻且按 first、second 顺序提交。
- 两条 I/O 完成到达同一连接，记录含两条对应的 CID 和成功状态。验收脚本现在要求一笔 MMIO 门铃，并因 CQE.SQID 为 0 拒绝。

## SSD-F9-11

设备支持合并表，能用一次全 16 位写把 0xA519 填到这个 Steering Tag 吗？

- 同一 Function 实现 TPH Requester Capability 且 ST Table Location=10b。目标向量在当前 MSI-X 和 ST 表范围内；Extended TPH Requester Supported=0。
- 脚本打算在 MSI-X 表该向量对应的 Vector Control 同时覆盖 bits 31:16，还声称能发扩展 tag。

## SSD-F9-12

能在当前 MSI 路径给向量 3 安装 16 位 Steering Tag 0x9B2D 吗？限定表项配置。

- Function 同时实现 MSI/MSI-X，使用 MSI，MSI-X 未启用。Interrupt Vector Mode，MSI Multiple Message Enable=2，已分配向量 0–3。
- ST Table Location=10b，ST Table Size 原始值是 3，MSI-X 表至少四项；Extended TPH Requester Supported=1，所需使能已核验。

## SSD-F9-13

MSI-X 正在使用，可以直接把向量 2 的低字节 Steering Tag 写进 MSI-X Vector Control 吗？

- Function 处于 Interrupt Vector Mode，ST Table Location=01b，ST 表四项，向量 2 已核实在 MSI-X 启用范围内。
- 此次只改 8 位 tag 的低部分。脚本发现 MSI-X 已启用就写 MSI-X 表。

## SSD-F9-14

向量 6 可发 MSI，能要求它固定使用合并表里的第 6 项 tag 吗？

- Interrupt Vector Mode，MSI 已分配 0–7；Function 实现 TPH 和 MSI-X，声明 Location=10b。
- ST Table Size 的原始读数为 3，因此实际表项是 0–3。提案按向量 6 硬取表项，另有向量 1 正常路径需要核验写入位置。

## SSD-F9-15

能按现在的顺序给 MSI-X 表项换一个 Message Address 并验收吗？

- 目标表项当前 Vector Mask=0，Function Mask=0。脚本拟直接写新 Message Address 和 Data，然后保持解掩。
- 其他表项无变更。验收需要避免设备继续使用缓存中的旧 Address/Data。

## SSD-F9-16

可以现在把控制器 CC.MPS 写成 2 给新的 PRP 页大小吗？

- 同一个非 Discovery 控制器 MPSMIN=0、MPSMAX=1，当前 CC.MPS=0，CC.EN=1。新的方案要求 16 KiB 页。
- 维护窗口还未授权控制器禁用或重配；本单只签方案。

## SSD-IO-01

合并完成队列后，监控报两个用户请求撞了 CID，并准备把后到的请求标为失败。能这样处理吗？怎样确认谁收到哪个完成？

- 同一 PCIe NVMe 控制器上，SQ2 与 SQ5 关联 CQ7。两队列分别只有一条 CID=41 的命令在途，没有复位。
- CQ7 出现两个新 CQE，分别为 (SQID=5,CID=41,成功) 和 (SQID=2,CID=41,成功)。驱动全局哈希表只以 CID 为键。

## SSD-IO-02

内存池提前回收一条 Read 的结果缓冲区后，调用方偶尔读到旧数据。SQHD 已经跨过了该槽，这能作为发布结果的栅栏吗？

- 单 SQ 深度 16，无环绕。Read A 占 slot 3、CID=7，Read B 占 slot 4、CID=8。两者的结果缓冲区不同。
- 驱动收到的第一个新 CQE 是 CID=8、SQHD=5、成功，随后就将 A 的结果交给调用方并回收 A 缓冲区。此时未收到 CID=7 的完成，数据损坏根因尚未复现。

## SSD-IO-03

两条业务队列同时停出完成，第三条业务正常。要把整盘报成死机吗？还差哪项观测能分清是主机没归还 CQ 空位，还是其他队列故障？

- SQ1、SQ2 都投向 CQ4，SQ3 使用 CQ6。负载期间 CQ6 持续见新完成。
- CPU 某线程称仍在消费 CQ4，但 trace 缺少 CQ4 实际占用与主机向控制器提交的 CQ Head Doorbell，无法判断 CQ4 是否已满。

## SSD-IO-04

并发提交器看到 tail 指向物理空槽就再塞一个请求。深度 8 的 SQ，下面这一拍允许提交吗？

- PCIe NVMe，SQ 分配了 8 个槽（编号 0～7）。最新可用的 SQ head=2，本地 tail=1。
- 环形指针跨过了 7，期间没有新的 SQHD。生产者准备把命令写入 slot 1 并把 tail 推到 2。

## SSD-IO-05

总线分析仪看到 CQE 的 CID 先改成预期值，几微秒后状态才变。我们能提早交付，还是应因这两次 DMA 写判固件违例？

- 正常运行的 PCIe I/O CQ，主机知道本轮期望的 Phase=1，目标槽原值为 0。
- 对同一槽的第一笔写更新了 CID 等字段，Phase 仍为 0；第二笔写才把 Phase 改成 1。没有复位或消费方抢读其他槽。

## SSD-IO-06

热迁移优化想把已创建 CQ 的 PRP List 搬到另一页；空队列已经连续空闲 10 秒，能原地改旧列表再回收吗？

- PCIe 控制器允许非连续队列。CQ3 以 PC=0 成功建立，PRP List 和 CQ 数据页都在主机内存。
- CQ3 的控制器对象仍存在，无 Delete CQ 成功完成、也无控制器复位。迁移器准备重写旧列表中的页地址并把列表物理页还给分配器。

## SSD-IO-07

同一份 8 KiB 读测试，仅把起始缓冲区后移 512 B 就开始出现 DMA 映射异常。PRP 构造器仍把第二个页地址直接填入 PRP2，这两轮都适用吗？

- CC.MPS 对应 4096 B，数据区采用 PRP，无独立元数据。A 轮起始地址页对齐，B 轮起始页内偏移 512 B。数据区后续页各自已映射但不要求连续。
- 两轮传输长度都为 8192 B，命令抓包确认 PRP2 填的是第二个数据页的 DMA 基地址，未分配 PRP List。

## SSD-IO-08

业务 CQ 在轮询线程开着时很少收到中断。有人拿 FID 08h 的 TIME 算了一个绝对截止期，超时就要把盘判失败。这个验收能用吗？

- 主机在 I/O CQ 上启用中断，配置了非零的 Aggregation Time 与非零 Threshold，该向量没有禁用中断合并。业务命令都成功。
- 复测中 CPU 持续更新该 CQ 的 Head Doorbell，轮询能持续看到新 CQE。尚无停轮询对照或设备到主机的 MSI-X 时间线。

## SSD-IO-09

在线缩容期间删除 SQ 后还有三个业务请求没回调。我们应永久等它们自己的 CQE，还是当成功向上层交付？

- 同一代 SQ9 仅有三个剩余在途 CID。I/O CQ 已完整排查，包括 Delete SQ 成功之前已贴出的队列项；没有这三个 CID 的显式完成。
- Admin CQ 已收到 Delete I/O SQ9 的成功完成。没有复位和重建，应用层还保留着这三个请求的上下文。

## SSD-IO-10

虚拟机热插 CPU 后，驱动打算在线把 NVMe I/O 队列从四组扩到十六组。初始化时就请求过十六，是不是可以直接建队列或补发一次 Number of Queues？

- 本地 PCIe 控制器本轮启动时，FID 07h 请求的 NSQR、NCQR 都为 15，成功 CQE 返回 NSQA、NCQA 都为 3。
- 已创建 SQ1～4、CQ1～4 并承载业务，无控制器复位。服务目标是继续提供 I/O；尚无已批准的停机窗口。

## SSD-IO-11

中断维护窗口屏蔽一个 MSI-X 向量，期间业务 CQ 贴了三个完成。解除屏蔽只抓到一条 MSI-X 消息，可按少两条中断报丢 I/O 吗？

- PCIe SSD，三个 CQE 均来自同一 I/O CQ、同一独占向量，SQID/CID 均可匹配。软件在屏蔽期间未服务这些事件。
- 屏蔽期间已观测到该向量的 Pending Bit 置位；解屏蔽前这些事件仍待处理，解屏蔽后见一条相应消息。尚未核对三份完成的最终回调。

## SSD-IO-12

压测发生队列门铃写值无效后，现场想保持原 SQ 继续塞请求，看设备会不会自愈。哪些完成还可能出现，怎样恢复更可靠？

- 本地内存型 NVMe 控制器，有 outstanding Asynchronous Event Request。Admin CQ 收到已确认对应 SQ5 的 Invalid Doorbell Write Value 异步事件。
- 事件前 SQ5 有在途业务；业务日志不能说明触发时是满队列仍提交、软件指针错误还是其他写值问题。其他队列仍有进展。

## SSD-OPS-01

热巡检要因为“传感器 2 报绝对零度”把这块盘摘掉。我手里只有这条原始读数，先换盘还是先改监控？

- 同一次成功的 SMART 读取里，TSEN1=309、TSEN2=0h、CTEMP=311，原始字段未经过单位换算。
- 资产表没有传感器与芯片位置的映射。温度采集任务把每个原始数值都减去 273.15 后发低温告警。

## SSD-OPS-02

热压测平台因为两个超温时间计数都没涨，就给有过高温的这轮签字。这个判据可靠吗？

- 同盘 Identify Controller 的 WCTEMP=340 K，CCTEMP=0h。
- 试验期间独立抓到六分钟 CTEMP 持续在 345 K；运行前后 WCTT=0、CCTT=0，未记录设备降频事件。

## SSD-OPS-03

同事想凭 SMART 两个数，关闭这次尾延迟尖峰的热管理排查。这两个数足以排除强节流吗？

- 尖峰前后保存了同一控制器的两个快照：TMT2TC 两次均为 FFFFFFFFh，TTTMT2 两次均为 0h。
- 这轮没有连续温度记录，也没有厂商热管理动作记录。业务未更改负载目标。

## SSD-OPS-04

一条出错的 I/O 刚触发控制器复位，重连后错误日志全是零。供应商要以“没有错误记录”结案，你会怎么保住下一次的证据？

- 复位前主机保存了一条 Error CQE，M=1，SQID=4、CID=18。此前未读 LID 01h。
- 对同一控制器完成 Controller Level Reset 后才取 LID 01h，各条目的 ECNT 都是零。

## SSD-OPS-05

两条并发 I/O 恰好用了相同 CID，工单按 CID 把错误算给业务 A，要不要改归属？

- 控制器 ID、时间窗已核对。A 在 SQ 2 使用 CID=31，B 在 SQ 5 使用 CID=31；两队列在窗口内都没有重用这个 CID。
- 最新错误日志的 SQID=5、CID=31、ECNT 非零。没有保存复位或其他时段的同号条目；工单只展示了 CID。

## SSD-OPS-06

下载任务跨了一次控制器复位。脚本准备从检查点继续补后半个镜像再提交；这次能沿用那个断点吗？

- 用 Firmware Image Download 分四段更新控制器固件，前两段已成功。未发送任何 Firmware Commit。
- 同一控制器在段二后发生并完成 Controller Level Reset。恢复后脚本能访问相同的镜像文件和该设备。

## SSD-OPS-07

资产平台的“正在运行版本”从 A 跳成 B，于是灰度验收要放行。设备导出如下；它真切到 B 了吗？下次重启会切过去吗？

- 同一控制器的 Firmware Slot Information 页：CAFS=1，NAFS=0，FRS1="A"，FRS2="B"。
- 仅保存了槽目录，没有采到同时点的 Identify Controller.FR，也没有 Firmware Commit 完成记录或后续复位轨迹。平台选用了非空槽中版本最高的字符串。

## SSD-OPS-08

盘的自测明明报了失败，工具又列出了“坏块的 LBA 和 NSID”。现在能按这个地址隔离业务数据吗？

- 涉测业务命名空间使用 NVM Command Set，是普通块命名空间，试验期间未重新格式化或重建；地址归属仍需与本次结果核对。
- 日志 06h 最新有效结果的 DSTR=7h，SEGN=3。结果条目中的 NSID 与 FLBA 原始字节均非零。
- 驱动把日志解码成表格时漏存了 VDINFO；此后尚无其他自测，同一结果仍可读。

## SSD-OPS-09

换盘前要拿一次完整长自测作为判据。仪表显示 100%，但我们中间做过控制器复位，这样算长测通过吗？

- 已启动 extended self-test，复位前有过 DSTOS=2h 记录。复位后没有其他维护者发起新测试。
- 最新快照 DSTOS=0h、DSTCS=100；该采集器只保留了结果头，没有保存 RDS1 的 DSTR 与自测类型。

## SSD-OPS-10

我们把一次卡顿的 telemetry 分六次抓全后给厂商分析，两端 header 的代号不同。能把中间六块当成同一时刻的一份证据吗？

- 读取的是 Host-Initiated Telemetry（07h），同一控制器、同一次开机、未做 Firmware Commit。开头 THDGN=2Ah，结尾 THDGN=2Bh。
- 第二个采集器在中途对同一控制器发送了 CTHID=1；主采集器的分段读取用 CTHID=0。

## SSD-OPS-11

告警后主机取设备自发的 telemetry 只剩一个 header，值班员据此想关闭机箱 BMC 侧的追数。还值得去看带外端点吗？

- 同一控制器的 Admin SQ 读取 08h 页，TCDA=0h。此前无主机侧首次抓取记录。
- BMC 提供该机箱的 NVMe 管理端点。目前没有该端点对同一故障的日志结果。

## SSD-OPS-12

主机通过 Admin SQ 能读某厂商日志，换到 BMC 的管理端点就失败。现在准备按“同盘能力不一致”报固件缺陷；你要先补哪一条证据？

- 主机在该 Admin SQ 上读 Supported Log Pages，目标 LID 的 LSUPP=1；随后读取目标厂商页成功。
- 同一盘的管理端点能成功返回 LID 00h。测试脚本只保存了主机侧支持表，以及 BMC 一次泛化的“日志读取失败”，厂商 UUID 选择条件已由测试设置统一。

## SSD-PWR-01

笔记本待机功耗超预算。两端都启用了 L1，测到 SSD 空闲五毫秒还停在 L0。可以按 PCIe 违规退盘吗？下一轮该盯哪一侧？

- 单功能端点在 D0，两端均宣告支持 ASPM L1；配置顺序与两端的最终使能已核实。
- 应用停止发 I/O 后采了 5 ms；链路保持 L0，抓包设备只记了 L 状态，没记录入 L1 请求或应答。

## SSD-PWR-02

平台同事说 CLKREQ# 已释放，SSD 此时理应进入 L1.2，建议直接加大恢复等待。这个方向对吗？

- 两端都在 ASPM L1.0，两端对应的 L1.2 使能均为 1，CLKREQ# 已解除断言；两端的阈值解码均为 65.536 μs（Value=64、Scale=010b，每单位 1024 ns）。
- 最近有效的 snoop 与 no-snoop LTR 都表示有延迟要求，分别为 32 μs、128 μs；这个窗口内未更新。

## SSD-PWR-03

两块系统板最终 L1.2 配置一样，一块偶发唤醒失败。先让固件团队换 TPOWER_ON 数值，还是先修平台的配置顺序？

- 两端都支持 ASPM L1.2。捕获到平台先写 SSD 的 Upstream Port 的 L1.2 Enable，再写 Root Port（Downstream Port）；写这两个位时 ASPM L1 仍启用。
- TPOWER_ON、Common_Mode_Restore_Time 和 LTR 阈值在两个 enable 写入后才配置。快照显示最终值与能正常唤醒的板相同。

## SSD-PWR-04

分析仪上主机发往 SSD 的方向进了 L0s，反方向继续送数据。脚本因为“双向状态不一致”报错，要修 SSD 的 PHY 吗？

- 两端均声明支持 L0s。本样本仅允许 Root Port 的发射方向进入 L0s，SSD 发射端的 L0s 使能为 0。
- 分析仪将两个方向分开解码。Root Port 的发送方向空闲后进入 L0s，稍后退出；同一时段 SSD 端仍有待发数据，数据校验通过。

## SSD-PWR-05

恢复速度优化准备在 SSD 断主电后沿用休眠前的队列，因为唤醒标志和内存环都还在。这个快速路径能放行吗？

- 电源探头证实 SSD 主电实际移除后恢复；辅助电源保留，设备支持并已允许 D3cold wake，主机 DRAM 保持。
- 恢复的配置读证实设备重新可枚举；PME_Status 仍置位，旧主存 SQ/CQ 内容还可读，尚未重配该 Function 和 NVMe 控制器。

## SSD-PWR-06

热插拔台上 SSD 的唤醒源触发了，但抓包里没看到 PM_PME。应从 PCIe Message 发送逻辑开始查吗？

- 板卡明确采用 WAKE# 侧带唤醒。设备和平台支持从 D3cold 唤醒，进睡前 PME_En=1，辅助电源可用。
- 触发时设备的上游链路仍处于非通信的 L2。当前探头只抓 TLP，未采 WAKE#、主电、参考时钟或链路重训。

## SSD-PWR-07

SSD 报告 snoop LTR 为 32 μs；我们看到一次 NVMe Read 从提交到完成用了 180 μs。这能判定 PCIe 根复合体违反 32 μs 上限吗？

- 报告的 snoop Requirement 位有效。唯一测量由驱动的提交和完成时间戳构成，未采到该命令各次 PCIe Memory Request 与 Completion。
- Root Complex 和路径上的设备支持 LTR。当前未知哪段用时较长。

## SSD-PWR-08

运维把下行口 Target Link Speed 设为 16 GT/s，SSD 反复重训后仍是 8 GT/s，准备因“未达到目标”判板卡退化。这个判据成立吗？

- 本次只串接一个 Root Port 和一块 SSD。Root Port 的 Supported Link Speeds Vector 包含 16 GT/s，SSD 端公布的最高支持速率是 8 GT/s。
- 两端 Link Status.Current Link Speed 均为 8 GT/s，宽度 x4，持续工作负载没有观察到链路掉线。

## SSD-PWR-09

同一块 SSD 压测波动时被记录为 x2；带宽管理状态位置位，是不是已经可以判定插槽有坏 Lane？

- 变更前清过该 Root Port 的带宽状态位，其支持 Link Bandwidth Notification。窗口前 x4，后 x2，未经过 DL_Down。
- 窗后 Link Bandwidth Management Status=1、Link Autonomous Bandwidth Status=0。当前没有该窗口的配置写或训练轨迹，后台可能运行链路管理服务。

## SSD-PWR-10

我们在交换机的下行端口写 Retrain Link=1，立即读同一位却看见 0。测试脚本要循环重写到读回 1，才能开始跑 SSD。这个等待条件可用吗？

- 该端口不在 DPC；写入前分析仪没有看到训练进行。该端口对端是 SSD 的 Upstream Port。
- 代码尚未读端口 Link Status，也没采 LTSSM 或实际协商速率/宽度。

## SSD-PWR-11

复合存储板上我们只把 NVMe Function 置成 D3hot，功耗却没下降到预算。应以“设备未请求 L1”为由退回 NVMe 固件吗？

- 这是一块非 ARI 多功能端点，两个 Function 共用一个 Upstream Port。ASPM 在本轮关闭，只验 PCI-PM 的 L1 进入。
- Function 0 的 PMCSR 已进 D3hot；独立管理用途的 Function 1 仍记录为 D0active 并持续服务。Link 保持 L0，没有 L1 请求。

## SSD-PWR-12

同一主机上做 idle-to-read，启用整套省电策略后第一条读慢了约 2 ms。可以据此把缺陷分给 NVMe APST，还是应归给 PCIe？

- 仅有两组数据：APST 与 ASPM 均关时不出现，二者均开时出现；均使用本地 PCIe SSD、相同空闲时长、队列深度和目标 LBA。
- 当前未保存 APST 工作状态表、转移时间和链路 L 状态轨迹，也没有控制器电源状态驻留记录。
