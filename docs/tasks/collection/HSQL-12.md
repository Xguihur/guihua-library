# HSQL-12：阶段2：邮箱会话、GitHub OAuth 与个人资料

- 任务规格版本：v1.0；上位计划：SDD v1.2（已批准）。
- 状态：交接规格已整理；待开始。
- 平台任务 ID：`b883123f-247e-4662-8b44-0afd9ccc1958`；[原任务](https://app.hifox.com/redlong/task/HSQL-12)。
- 原任务更新日期：2026-11-14T00:11:56Z；导出日期：2026-11-15（Asia/Shanghai）。
- 前置：[HSQL-11](HSQL-11.md)。HSQL-11 阶段验收及独立审查通过；D03、D05、D06、D07 的受影响契约先冻结。
- 共同约束：[执行手册](EXECUTION.md)、[待决事项](DECISIONS.md)、[交接门禁](HANDOFF.md)。
- 执行开始条件：前置证据满足且本任务受影响契约已冻结；业务范围沿用已有批准，实质变化需新版本审核。

## 1. 目标、范围与非目标

完成邮箱会话、GitHub OAuth 和个人资料，使登录状态与服务端权限边界可验证，并提供相应前端入口。

范围以第 2 节原始描述及[已批准计划](../../plans/SDD-PLAN-v1.2.md)为准。本规格的步骤是执行细化，不增加未经批准的功能。

非目标：不实现验证码、强制邮箱验证、找回密码、修改邮箱或未批准账号关联产品；本任务不开放业务写入。

## 2. 平台任务原始描述

<!-- BEGIN ORIGINAL TASK DESCRIPTION -->
父任务：HSQL-6。前置：HSQL-11 通过。执行顺序：第 6 个执行任务；必须取得阶段 1 审查通过后派发。

范围：
1. 先写失败契约/集成测试，再实现 RESTful 用户/会话/OAuth/个人资料资源。
2. 支持 POST /api/users 邮箱注册、POST /api/sessions 创建会话、GET/DELETE /api/sessions/current、GET/PATCH /api/me。
3. 支持 GitHub OAuth 协议授权/回调；state/PKCE；provider subject 唯一；禁止仅按邮箱静默合并；首次 GitHub 登录可进入合法 ASCII 用户名设置流程。
4. 用户名禁止中文且唯一；资料可更新 username/gender/avatarUrl/signature；不得修改 roles/email/ownerId。
5. 会话 HttpOnly/Secure/SameSite Cookie；密码哈希；统一错误和限流；不实现验证码/邮箱验证/找回密码，除非计划变更批准。
6. 创建 docs/tasks/HSQL-12.md。

验收：认证契约、权限、敏感信息脱敏、唯一索引、会话撤销、OAuth 失败路径测试通过；提交推送并回报 SHA/命令。
<!-- END ORIGINAL TASK DESCRIPTION -->

## 3. 现状证据、目标模块与数据流

当前导出基线是 `c19e1b5`：仅有文档，没有应用或测试实现。现存文件、历史报告和待确认事实见 HANDOFF；下列除显式标明“现存”外都是目标路径，执行时须用实际代码符号与调用链回填验收记录。

- 待新增 apps/api/src/auth、users、sessions、OAuth 适配与权限 guard；更新共享认证/资料契约。
- 待新增 web /login、/register、/auth/github/callback、/profile 与会话状态消费。
- 新增身份/会话唯一索引、TTL 与安全 ADR；证据写 docs/tasks/HSQL-12.md。

共同数据流：web → HTTP client/共享 contracts → controller → service/认证与权限策略 → repository → MongoDB → 脱敏 DTO；具体边界见 EXECUTION §1。HSQL-7 为纯文档，不存在运行时调用链。

## 4. 对外契约、状态与不变量

POST /api/users 和 POST /api/sessions 为 201；GET/DELETE /api/sessions/current 为 200/204；GET/PATCH /api/me 为 200；GitHub authorization/callback 为协议端点。错误凭据统一 401，重复身份 409，非法用户名 INVALID_USERNAME。资料只可改 username/gender/avatarUrl/signature。

输入输出字段、状态转换、认证/所有权、错误、安全、兼容性和性能约束同时遵守 [SDD §3-5](../../plans/SDD-PLAN-v1.2.md) 与 [RESTful 契约](../../contracts/restful-api.md)。对应未决项必须在 DECISIONS 所列时点冻结；不能从实现当前返回值反推契约。

## 5. 依赖排序的实施步骤

1. 先记录用户名/邮箱归一化、密码策略/哈希、Cookie/CSRF/CORS/限流、头像来源和 OAuth 过渡状态的安全 ADR，不扩大已批准规则。
2. 先写注册/会话/资料契约失败测试及真实唯一索引并发测试；用户不存在和密码错误使用相同对外错误。
3. 实现 users/auth_identities/sessions、唯一索引、会话 TTL/撤销与 guard；密码只存哈希，session secret 不写日志。
4. 实现 GitHub state/PKCE 和一次性用户名设置；同 provider subject 复用身份，同邮箱不静默合并；回调重放与取消均有稳定结果。
5. 实现登录、注册、资料和会话 UI，后端白名单校验资料字段；修改用户名不得改变书籍归属。
6. 运行认证/资料/权限/限流测试和基线回归；有凭据时做真实 OAuth 回调，缺凭据明确记录未验证，不能冒充真实登录通过。
7. 更新验收记录及索引/契约说明，提交推送；验证通过才交 HSQL-13。

迁移/删除：导出时没有旧业务代码或生产数据可迁移；后续新增索引、状态或身份数据的变更要记录兼容性与回滚。仅清理本任务产生的临时脚手架/日志/验证副本，不删除历史文档、他人改动或生产数据。

## 6. TDD 测试矩阵

以下是执行目标，除 HANDOFF 明确引用的历史检查外，本合集没有运行这些应用测试。

| 维度 | 先失败的断言/反例 | 正常、边界、错误与回归通过标准 |
|---|---|---|
| 唯一身份 | 重复邮箱/归一用户名/provider subject 或中文用户名未拒绝时失败 | 合法注册、并发唯一索引、GitHub 无邮箱路径，稳定错误映射 |
| 会话 | 错误凭据被区分账号存在性、撤销后仍有效时失败 | 创建→current→撤销→拒绝；重复 DELETE 204，过期/禁用按契约拒绝 |
| OAuth | state/PKCE 错误、回调重放、邮箱静默合并成功时失败 | 新用户用户名流程、已有身份登录、取消和凭据缺失分支 |
| 资料与权限 | 普通用户修改 roles/email/ownerId 成功时失败 | 允许字段更新、重名/非法头像/长度/控制字符拒绝，敏感信息脱敏 |
| UI/安全回归 | 未登录仍可读受保护资料或凭据进响应/日志时失败 | 认证 UI、Cookie、限流与基线回归通过，真实外部验证单独标明 |

RED/GREEN 必须记录同一测试命令和真实退出码，不把语法/安装失败当作行为红测；不删断言、不零测试成功。安全/兼容性/失败回滚要求见 EXECUTION，不得用文档存在替代运行验证。

## 7. 验收命令与可判定标准

HSQL-7 使用其文档联合检查和变异反例；其他任务在 HSQL-8 建立根命令后，按 [统一命令顺序](EXECUTION.md) 执行适用的 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:integration`、`pnpm build` 和 `pnpm smoke`。HSQL-11/15 运行全量，不能仅选当前模块。每条命令的真实参数、退出码和环境必须写入验收记录；当前没有 package.json，不声称这些命令已可运行。

- 注册/会话/资料/OAuth 契约、真实唯一索引、撤销和权限测试通过，UI 完成相应用户流程。
- Cookie、安全 ADR 和敏感信息边界有证据；所有外部依赖未验证项如实列明。
- 实际证据统一更新到 `docs/tasks/HSQL-12.md`，包含变更文件/符号、红绿测试、全量结果、前置和交付 SHA、远程 ref、风险、未验证项和审查结论。
- 提交/推送与验证均真实成功后才交接；独立审查发现阻塞必须修复复核，不能将待审查写成通过。

## 8. 风险、回滚与未决项

账号接管、身份冲突、CSRF 和会话撤销是重点。索引/身份数据演进先测试回放和备份，不以删除账号解决冲突。

已知前置阻塞和最新事实见 HANDOFF，业务未决项见 DECISIONS。本任务没有在本次文档整理中完成实现或验收。原始任务中“创建任务文档”在执行时表示补充实际证据，不是覆盖本合集规格或旧记录。

## 9. 版本与执行记录

| 版本 | 状态 | 变更 |
|---|---|---|
| v1.0 | 文档交接规格 | 保留原任务描述，补充模块、契约、实施步骤、TDD 与验收；不改变 SDD v1.2 |

执行 Agent 在 `docs/tasks/HSQL-12.md` 追加实际过程，规格如有实质变更则新增版本并记录批准，历史失败/审查结果保留。
