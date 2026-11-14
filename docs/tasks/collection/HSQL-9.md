# HSQL-9：阶段1.1：公开书籍与评论 RESTful API

- 任务规格版本：v1.0；上位计划：SDD v1.2（已批准）。
- 状态：交接规格已整理；待开始。
- 平台任务 ID：`a6d28238-ddab-4739-8b4c-158f5461189d`；[原任务](https://app.hifox.com/redlong/task/HSQL-9)。
- 原任务更新日期：2026-11-14T00:10:46Z；导出日期：2026-11-15（Asia/Shanghai）。
- 前置：[HSQL-8](HSQL-8.md)。HSQL-8 全部基线命令与真实 MongoDB 验证通过，已有共享包及测试入口。
- 共同约束：[执行手册](EXECUTION.md)、[待决事项](DECISIONS.md)、[交接门禁](HANDOFF.md)。
- 执行开始条件：前置证据满足且本任务受影响契约已冻结；业务范围沿用已有批准，实质变化需新版本审核。

## 1. 目标、范围与非目标

交付匿名可用、只读且不泄露隐藏数据的书籍和评论 RESTful API。

范围以第 2 节原始描述及[已批准计划](../../plans/SDD-PLAN-v1.2.md)为准。本规格的步骤是执行细化，不增加未经批准的功能。

非目标：不实现登录、用户写入、管理员 API 或 GitHub 外部评论。

## 2. 平台任务原始描述

<!-- BEGIN ORIGINAL TASK DESCRIPTION -->
父任务：HSQL-6。前置：HSQL-8 必须完成并推送。执行顺序：第 3 个执行任务；规划师确认基线后派发。

范围：
1. 按已批准 v1.2 在 apps/api 实现 books/comments 模块和 Mongo schema/repository/service。
2. 先写失败契约/集成测试，再实现 RESTful：GET /api/books、GET /api/books/{bookId}、GET /api/books/{bookId}/comments；只返回 published；status=reading|finished 过滤；分页上限。
3. 实现共享 contracts 的 PublicBook/PublicBookDetail/PublicComment、分页和统一错误结构；不得泄漏 owner 敏感字段。
4. 建立 slug、visibility/status、book/comment 查询索引；数据库异常转稳定错误。
5. 非目标：认证写入、用户发布、管理接口、GitHub 外部评论。
6. 创建 docs/tasks/HSQL-9.md，记录测试矩阵、HTTP 方法/状态码、验收证据、数据模型与未决项。

验收：匿名 API smoke 可读已发布书籍、详情和评论；非法状态/分页为 400；隐藏/不存在为统一 404；无写接口；测试和构建通过；提交并推送 GitHub，回报 SHA 与命令结果。
<!-- END ORIGINAL TASK DESCRIPTION -->

## 3. 现状证据、目标模块与数据流

当前导出基线是 `c19e1b5`：仅有文档，没有应用或测试实现。现存文件、历史报告和待确认事实见 HANDOFF；下列除显式标明“现存”外都是目标路径，执行时须用实际代码符号与调用链回填验收记录。

- 待新增 apps/api/src/books、comments：schema、索引、repository、service、controller 和 DTO 映射。
- 更新 packages/contracts/src：PublicBook、PublicBookDetail、PublicComment、分页和统一错误。
- 新增当前模块契约/HTTP/真库集成测试；证据写 docs/tasks/HSQL-9.md。

共同数据流：web → HTTP client/共享 contracts → controller → service/认证与权限策略 → repository → MongoDB → 脱敏 DTO；具体边界见 EXECUTION §1。HSQL-7 为纯文档，不存在运行时调用链。

## 4. 对外契约、状态与不变量

GET /api/books、GET /api/books/{bookId}、GET /api/books/{bookId}/comments 返回 200；列表 {items,page,pageSize,total}；只读 published，status=reading|finished；非法查询 400，隐藏/不存在统一 404。公开 DTO 不含邮箱、密码、OAuth subject、内部角色或会话字段。

输入输出字段、状态转换、认证/所有权、错误、安全、兼容性和性能约束同时遵守 [SDD §3-5](../../plans/SDD-PLAN-v1.2.md) 与 [RESTful 契约](../../contracts/restful-api.md)。对应未决项必须在 DECISIONS 所列时点冻结；不能从实现当前返回值反推契约。

## 5. 依赖排序的实施步骤

1. 依据 SDD §4.5/4.6/5.2 冻结 D02 的 ID、分页、DTO 和排序/索引契约，建立确定测试夹具，不新增线上写接口。
2. 先写共享 schema 与 HTTP 失败测试，覆盖 published 过滤、状态筛选、分页边界、统一错误和脱敏。
3. 实现 books/comments schema 和必要索引：slug 唯一、visibility/status/createdAt、bookId/visibility/createdAt，并以真实 MongoDB 验证。
4. 实现 repository→service→controller 查询和显式公开 DTO，嵌套评论先检查书籍公开性。
5. 验证空页、非法 ID/状态/分页、隐藏书籍评论、DB 故障与无写接口；准备可重复的测试数据加载方式。
6. 运行模块测试、真库集成和基线回归、构建；回填 SHA、命令和风险再交 HSQL-10。

迁移/删除：导出时没有旧业务代码或生产数据可迁移；后续新增索引、状态或身份数据的变更要记录兼容性与回滚。仅清理本任务产生的临时脚手架/日志/验证副本，不删除历史文档、他人改动或生产数据。

## 6. TDD 测试矩阵

以下是执行目标，除 HANDOFF 明确引用的历史检查外，本合集没有运行这些应用测试。

| 维度 | 先失败的断言/反例 | 正常、边界、错误与回归通过标准 |
|---|---|---|
| 公开过滤 | 返回 hidden/非 published 书籍或关联评论时失败 | 匿名读取列表/详情/评论，reading/finished 分别和混合数据正确 |
| 查询边界 | 非法状态/页码/上限/ID 未拒绝时失败 | 空结果、最后一页、越界页按冻结契约处理，不作无上限查询 |
| 数据与错误 | DTO 泄漏敏感字段或 DB 原始错误时失败 | 数据库异常映射稳定错误，隐藏/不存在响应不泄露存在性 |
| 真库与索引 | 重复 slug 未受唯一索引约束或筛选绕过 DB 时失败 | 索引定义存在且查询结果正确；测试数据与开发数据隔离 |
| 只读回归 | 存在能匿名成功写入的接口时失败 | 公开 API 本任务无业务写接口，基线命令仍通过 |

RED/GREEN 必须记录同一测试命令和真实退出码，不把语法/安装失败当作行为红测；不删断言、不零测试成功。安全/兼容性/失败回滚要求见 EXECUTION，不得用文档存在替代运行验证。

## 7. 验收命令与可判定标准

HSQL-7 使用其文档联合检查和变异反例；其他任务在 HSQL-8 建立根命令后，按 [统一命令顺序](EXECUTION.md) 执行适用的 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:integration`、`pnpm build` 和 `pnpm smoke`。HSQL-11/15 运行全量，不能仅选当前模块。每条命令的真实参数、退出码和环境必须写入验收记录；当前没有 package.json，不声称这些命令已可运行。

- 匿名 smoke 能读取已发布书籍、筛选、详情和评论；隐藏/不存在统一 404，非法查询稳定 400。
- 公开 DTO、真实查询、索引与错误语义有契约/集成证据，测试与构建通过。
- 实际证据统一更新到 `docs/tasks/HSQL-9.md`，包含变更文件/符号、红绿测试、全量结果、前置和交付 SHA、远程 ref、风险、未验证项和审查结论。
- 提交/推送与验证均真实成功后才交接；独立审查发现阻塞必须修复复核，不能将待审查写成通过。

## 8. 风险、回滚与未决项

公开过滤漏到详情/嵌套评论会泄漏隐藏数据；必须分别测。新 schema 无生产迁移，后续索引演进需先备份和测试回放。

已知前置阻塞和最新事实见 HANDOFF，业务未决项见 DECISIONS。本任务没有在本次文档整理中完成实现或验收。原始任务中“创建任务文档”在执行时表示补充实际证据，不是覆盖本合集规格或旧记录。

## 9. 版本与执行记录

| 版本 | 状态 | 变更 |
|---|---|---|
| v1.0 | 文档交接规格 | 保留原任务描述，补充模块、契约、实施步骤、TDD 与验收；不改变 SDD v1.2 |

执行 Agent 在 `docs/tasks/HSQL-9.md` 追加实际过程，规格如有实质变更则新增版本并记录批准，历史失败/审查结果保留。
