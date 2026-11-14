# HSQL-8：阶段0.2：建立 monorepo 基线与本地开发环境

- 任务规格版本：v1.0；上位计划：SDD v1.2（已批准）。
- 状态：交接规格已整理；待开始；已有细化方案，HSQL-7 审查阻塞。
- 平台任务 ID：`452e2d3f-9b70-4025-830f-a5aeba456903`；[原任务](https://app.hifox.com/redlong/task/HSQL-8)。
- 原任务更新日期：2026-11-14T15:01:01Z；导出日期：2026-11-15（Asia/Shanghai）。
- 前置：[HSQL-7](HSQL-7.md)。HSQL-7 的审查与证据闭环；读取 docs/plans/HSQL-8-SDD-v1.0.md。
- 共同约束：[执行手册](EXECUTION.md)、[待决事项](DECISIONS.md)、[交接门禁](HANDOFF.md)。
- 执行开始条件：前置证据满足且本任务受影响契约已冻结；业务范围沿用已有批准，实质变化需新版本审核。

## 1. 目标、范围与非目标

建立可安装、测试、构建和启动的最小 monorepo，为后续业务提供真实且隔离的运行基线。

范围以第 2 节原始描述及[已批准计划](../../plans/SDD-PLAN-v1.2.md)为准。本规格的步骤是执行细化，不增加未经批准的功能。

非目标：不实现书籍、认证、评论、后台、视觉品牌最终稿或远程部署；不预建 packages/config。

## 2. 平台任务原始描述

<!-- BEGIN ORIGINAL TASK DESCRIPTION -->
父任务：HSQL-6。前置：HSQL-7 必须完成并推送。执行顺序：第 2 个执行任务；规划师确认前置提交后才派发。

范围：
1. 在仓库根目录建立 pnpm workspace monorepo；文档统一位于 docs/，不得放进 apps/web、apps/api、packages。
2. 建立 apps/web（Vue 3 + Vite）与 apps/api（NestJS）最小可运行入口；建立 packages/contracts 共享包。
3. 添加 TypeScript、lint、测试、构建、开发启动脚本；添加 .env.example 和 .env.test.example，禁止真实密钥。
4. 提供 MongoDB 本地开发/测试编排（优先 Docker Compose），健康检查和清理命令；测试库与开发库隔离。
5. 先写并运行基线失败/通过测试：环境变量缺失失败、API 健康检查、共享包可被 web/api 引用、生产配置不被测试读取。
6. 创建 docs/tasks/HSQL-8.md，记录契约、测试矩阵、验收证据和未决项。

非目标：不实现业务书籍、认证、评论或管理功能；不部署远程环境。
验收：从干净工作树可执行安装、类型检查、lint、测试、构建和本地启动；MongoDB 编排可重复启动/停止；提交并推送 GitHub，回报 commit SHA、命令输出摘要和剩余风险。
<!-- END ORIGINAL TASK DESCRIPTION -->

## 3. 现状证据、目标模块与数据流

当前导出基线是 `c19e1b5`：仅有文档，没有应用或测试实现。现存文件、历史报告和待确认事实见 HANDOFF；下列除显式标明“现存”外都是目标路径，执行时须用实际代码符号与调用链回填验收记录。

- 待新增根 package.json、pnpm-workspace.yaml、pnpm-lock.yaml、TS/lint/测试配置、compose.yaml、环境样例与版本文件。
- 待新增 apps/api/src/main.ts、app.module.ts、config/、health/ 与数据库连接模块。
- 待新增 apps/web/src/main.ts、App.vue、Vite 配置；packages/contracts/src 与真实包 exports。
- 新增 docs/development.md、更新工具链 ADR；实际证据写 docs/tasks/HSQL-8.md。

共同数据流：web → HTTP client/共享 contracts → controller → service/认证与权限策略 → repository → MongoDB → 脱敏 DTO；具体边界见 EXECUTION §1。HSQL-7 为纯文档，不存在运行时调用链。

## 4. 对外契约、状态与不变量

完整 CLI/健康/配置契约见 HSQL-8 细化 §4：GET /api/health 真 Mongo ping 成功为 200；不可用为 503 SERVICE_UNAVAILABLE。web/api 真实消费 @guihua/contracts；测试配置只使用独立 TEST_* 和专用测试库。

输入输出字段、状态转换、认证/所有权、错误、安全、兼容性和性能约束同时遵守 [SDD §3-5](../../plans/SDD-PLAN-v1.2.md) 与 [RESTful 契约](../../contracts/restful-api.md)。对应未决项必须在 DECISIONS 所列时点冻结；不能从实现当前返回值反推契约。

## 5. 依赖排序的实施步骤

1. 核验前置、Node/pnpm/Docker 与端口；兼容性核对后固定版本、镜像和锁文件，不用 latest。
2. 建立足以运行测试的最小 workspace；先运行细化方案 R1-R9 中配置/exports/健康/隔离测试，记录目标行为未实现的失败。
3. 实现显式环境加载与测试库护栏；实现共享契约的运行时和类型出口，分别验证 Node/CJS 与 web/ESM。
4. 实现最小 Nest API 真实健康检查和关闭钩子；实现 Vue 健康加载/正常/失败状态，不伪造书籍。
5. 提供开发/测试 MongoDB 独立编排及安全清理；先验证测试 reset 不影响开发哨兵，再跑真库断开/恢复。
6. 完成根命令、最小 CI 与说明；在干净 checkout 运行冻结安装、类型、lint、离线/集成测试、构建和前台 smoke。
7. 回填验收记录、提交并推送；独立复核前置/约束和证据后再进入 HSQL-9。

迁移/删除：导出时没有旧业务代码或生产数据可迁移；后续新增索引、状态或身份数据的变更要记录兼容性与回滚。仅清理本任务产生的临时脚手架/日志/验证副本，不删除历史文档、他人改动或生产数据。

## 6. TDD 测试矩阵

以下是执行目标，除 HANDOFF 明确引用的历史检查外，本合集没有运行这些应用测试。

| 维度 | 先失败的断言/反例 | 正常、边界、错误与回归通过标准 |
|---|---|---|
| 配置/隔离 | 缺 URI、非法模式/端口、读取开发或生产配置时失败 | 配置有效可启动；测试 URI 指向非专用库时在连接前拒绝 |
| 健康与恢复 | 真库不可用却返回 200 时失败 | 真 ping 200；停测试 DB 为稳定 503，恢复后 200；有界响应且不泄露 URI |
| 共享契约 | 任一端不能加载真实 exports 时失败 | 构建后 Node 与 Vite 均可用；浏览器无服务端依赖 |
| 编排/清理 | reset 破坏开发哨兵或吞掉失败时失败 | up/down/reset 可重复、测试隔离、只清理自己启动的进程和资源 |
| 全链回归 | 构建产物不能启动或零测试成功时失败 | 干净安装、类型、lint、test、integration、build、smoke 有真实结果 |

RED/GREEN 必须记录同一测试命令和真实退出码，不把语法/安装失败当作行为红测；不删断言、不零测试成功。安全/兼容性/失败回滚要求见 EXECUTION，不得用文档存在替代运行验证。

## 7. 验收命令与可判定标准

HSQL-7 使用其文档联合检查和变异反例；其他任务在 HSQL-8 建立根命令后，按 [统一命令顺序](EXECUTION.md) 执行适用的 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:integration`、`pnpm build` 和 `pnpm smoke`。HSQL-11/15 运行全量，不能仅选当前模块。每条命令的真实参数、退出码和环境必须写入验收记录；当前没有 package.json，不声称这些命令已可运行。

- 完整通过 HSQL-8 细化 §8 的可运行验收；检查不能只停留在文件存在或源码 TS 导入成功。
- 缺依赖/镜像/环境时报告失败和原因，不 skip、不 fallback、不写成完成。
- 实际证据统一更新到 `docs/tasks/HSQL-8.md`，包含变更文件/符号、红绿测试、全量结果、前置和交付 SHA、远程 ref、风险、未验证项和审查结论。
- 提交/推送与验证均真实成功后才交接；独立审查发现阻塞必须修复复核，不能将待审查写成通过。

## 8. 风险、回滚与未决项

工具链兼容、包 exports 和环境污染是主要风险。无旧数据迁移；回滚本任务代码提交，数据库清理仅限专用测试服务。

已知前置阻塞和最新事实见 HANDOFF，业务未决项见 DECISIONS。本任务没有在本次文档整理中完成实现或验收。原始任务中“创建任务文档”在执行时表示补充实际证据，不是覆盖本合集规格或旧记录。

## 9. 版本与执行记录

| 版本 | 状态 | 变更 |
|---|---|---|
| v1.0 | 文档交接规格 | 保留原任务描述，补充模块、契约、实施步骤、TDD 与验收；不改变 SDD v1.2 |

执行 Agent 在 `docs/tasks/HSQL-8.md` 追加实际过程，规格如有实质变更则新增版本并记录批准，历史失败/审查结果保留。
