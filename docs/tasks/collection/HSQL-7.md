# HSQL-7：阶段0.1：提交批准方案与工程契约文档

- 任务规格版本：v1.0；上位计划：SDD v1.2（已批准）。
- 状态：交接规格已整理；进行中；已推送文档，但审查阻塞未闭环。
- 平台任务 ID：`745f9941-4927-4b24-aea5-ae7089ffc012`；[原任务](https://app.hifox.com/redlong/task/HSQL-7)。
- 原任务更新日期：2026-11-14T12:26:46Z；导出日期：2026-11-15（Asia/Shanghai）。
- 前置：无执行前置（上位 HSQL-6 已批准）。SDD v1.2 已批准；dev 已有 c19e1b5，但独立审查仍为需修改。
- 共同约束：[执行手册](EXECUTION.md)、[待决事项](DECISIONS.md)、[交接门禁](HANDOFF.md)。
- 执行开始条件：前置证据满足且本任务受影响契约已冻结；业务范围沿用已有批准，实质变化需新版本审核。

## 1. 目标、范围与非目标

让已批准方案、契约与验收检查形成一致、可追溯的文档基线；本次接手重点是闭环已有两项审查发现。

范围以第 2 节原始描述及[已批准计划](../../plans/SDD-PLAN-v1.2.md)为准。本规格的步骤是执行细化，不增加未经批准的功能。

非目标：不新增应用、业务 endpoint、环境配置、数据库或 mock；不修改已批准业务规则。

## 2. 平台任务原始描述

<!-- BEGIN ORIGINAL TASK DESCRIPTION -->
父任务：HSQL-6。执行顺序：第 1 个执行任务。按已批准的 docs/plans/SDD-PLAN-v1.2.md 工作，先测试/校验再实现。

范围：
1. 将现有版本化方案文档纳入仓库外部统一文档区：docs/plans/SDD-PLAN-v1.md、docs/plans/SDD-PLAN-v1.1.md、docs/plans/SDD-PLAN-v1.2.md；确认 v1.0/v1.1 废止、v1.2 已批准。
2. 创建 docs/README.md，说明文档区不属于 apps/web、apps/api、packages；创建 docs/contracts/ 与 docs/adr/。
3. 创建 RESTful 契约初稿和错误语义文档，内容必须与 v1.2 一致；创建 stack/workspace ADR，记录 pnpm workspace、Vue 3/Vite、NestJS、MongoDB/Mongoose 的边界。
4. 创建 docs/tasks/README.md，约定后续开发任务规格、验收证据和状态文档统一放在 monorepo 外部 docs/tasks/，不得放入前后端项目目录。
5. 不创建业务实现；不得提交密钥、真实环境变量或 mock endpoint。

验收：文档结构可读；RESTful 资源、方法、状态码、过滤和统一错误结构无冲突；执行仓库文档检查；提交并推送 GitHub；回报 commit SHA、push 结果、检查命令和未决项。完成后由规划师派发第 2 个任务。
<!-- END ORIGINAL TASK DESCRIPTION -->

## 3. 现状证据、目标模块与数据流

当前导出基线是 `c19e1b5`：仅有文档，没有应用或测试实现。现存文件、历史报告和待确认事实见 HANDOFF；下列除显式标明“现存”外都是目标路径，执行时须用实际代码符号与调用链回填验收记录。

- 现存 docs/plans/SDD-PLAN-v1.2.md、docs/contracts/restful-api.md：只读执行基线。
- 现存 docs/contracts/errors.md：纠正 INVALID_USERNAME 与唯一性冲突的混用。
- 现存 docs/tasks/HSQL-7.md：保留历史证据，补齐联合断言、反例和本轮结果。

共同数据流：web → HTTP client/共享 contracts → controller → service/认证与权限策略 → repository → MongoDB → 脱敏 DTO；具体边界见 EXECUTION §1。HSQL-7 为纯文档，不存在运行时调用链。

## 4. 对外契约、状态与不变量

非法格式用户名使用 INVALID_USERNAME（400/422 待认证 ADR）；重复用户名必须为 409 IDENTITY_CONFLICT。联合核对 POST /api/users→201、GET /api/books→200、POST /api/books→201；所有错误保留统一 JSON 形状。

输入输出字段、状态转换、认证/所有权、错误、安全、兼容性和性能约束同时遵守 [SDD §3-5](../../plans/SDD-PLAN-v1.2.md) 与 [RESTful 契约](../../contracts/restful-api.md)。对应未决项必须在 DECISIONS 所列时点冻结；不能从实现当前返回值反推契约。

## 5. 依赖排序的实施步骤

1. 读取 HANDOFF 的 B1/B2 和原审查结论，核验远程 dev 是否已有更新，不重复覆盖其他人的修复。
2. 在临时副本先复现：重复用户名归类冲突；只把注册 POST 改成 GET 时旧脚本仍成功。记录真实失败/漏检，不改历史结果。
3. 仅修正文档语义，建立方法+路径+成功状态、错误码+HTTP 的联合检查；保留 INVALID_USERNAME 的 400/422 待决边界。
4. 正确文档跑绿；临时副本分别改方法、成功状态、错误状态，必须非零退出。按内容定位检查块，不依赖易漂移的固定行号。
5. 追加 docs/tasks/HSQL-7.md 的命令、退出码、修复提交和推送结果；交独立只读复核。无阻塞后才开始 HSQL-8。

迁移/删除：导出时没有旧业务代码或生产数据可迁移；后续新增索引、状态或身份数据的变更要记录兼容性与回滚。仅清理本任务产生的临时脚手架/日志/验证副本，不删除历史文档、他人改动或生产数据。

## 6. TDD 测试矩阵

以下是执行目标，除 HANDOFF 明确引用的历史检查外，本合集没有运行这些应用测试。

| 维度 | 先失败的断言/反例 | 正常、边界、错误与回归通过标准 |
|---|---|---|
| 语义一致性 | 重复用户名被映射为 INVALID_USERNAME 应失败 | 重复身份始终 409；非法格式保持独立码和待决状态 |
| HTTP 联合契约 | POST /api/users→201 对应不正确时失败 | GET /api/books→200、POST /api/books→201 同时正确 |
| 反例与失败传播 | 只改方法/状态/错误映射应使检查非零 | 正确副本通过；负向副本清理；中途失败不能被末尾 PASS 掩盖 |
| 回归与审查 | 缺计划/废止/链接/错误字段检查失败 | 文档结构、批准历史、diff 检查和独立复核均无阻塞 |

RED/GREEN 必须记录同一测试命令和真实退出码，不把语法/安装失败当作行为红测；不删断言、不零测试成功。安全/兼容性/失败回滚要求见 EXECUTION，不得用文档存在替代运行验证。

## 7. 验收命令与可判定标准

HSQL-7 使用其文档联合检查和变异反例；其他任务在 HSQL-8 建立根命令后，按 [统一命令顺序](EXECUTION.md) 执行适用的 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:integration`、`pnpm build` 和 `pnpm smoke`。HSQL-11/15 运行全量，不能仅选当前模块。每条命令的真实参数、退出码和环境必须写入验收记录；当前没有 package.json，不声称这些命令已可运行。

- 两项已复现审查问题得到修复，保留原始发现和修复后的真实证据。
- 独立复核锁定最终 SHA，确认无阻塞；不得仅依据旧脚本 PASS 宣称通过。
- 实际证据统一更新到 `docs/tasks/HSQL-7.md`，包含变更文件/符号、红绿测试、全量结果、前置和交付 SHA、远程 ref、风险、未验证项和审查结论。
- 提交/推送与验证均真实成功后才交接；独立审查发现阻塞必须修复复核，不能将待审查写成通过。

## 8. 风险、回滚与未决项

文档检查可能漏检语义冲突，必须做联合断言及变异反例；只需普通文档提交即可回滚，不涉及数据库。

已知前置阻塞和最新事实见 HANDOFF，业务未决项见 DECISIONS。本任务没有在本次文档整理中完成实现或验收。原始任务中“创建任务文档”在执行时表示补充实际证据，不是覆盖本合集规格或旧记录。

## 9. 版本与执行记录

| 版本 | 状态 | 变更 |
|---|---|---|
| v1.0 | 文档交接规格 | 保留原任务描述，补充模块、契约、实施步骤、TDD 与验收；不改变 SDD v1.2 |

执行 Agent 在 `docs/tasks/HSQL-7.md` 追加实际过程，规格如有实质变更则新增版本并记录批准，历史失败/审查结果保留。
