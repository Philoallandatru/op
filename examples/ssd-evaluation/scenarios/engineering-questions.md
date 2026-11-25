# SSD 工程场景盲题册

共 74 道题。请根据每道题首次提问时已有的观测回答。
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
