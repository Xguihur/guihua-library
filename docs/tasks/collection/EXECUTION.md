# 统一执行手册

- 版本：v1.0；适用于 HSQL-7 至 HSQL-15，与已批准 SDD v1.2 配套。
- 开始条件：先核实 [交接状态](HANDOFF.md) 及当前任务前置；范围内实现沿用已有批准，实质变更先版本化并审核。
- 当前限制：本分支没有应用实现。下述 pnpm 命令是 HSQL-8 要建立的命令契约，此时执行会因缺工程而失败，不得记为已通过。

## 1. 架构、入口与数据流

目标目录和符号来自 SDD §5、§7，是待新增设计：

| 层 | 目标目录/入口 | 职责与调用方 |
|---|---|---|
| web | apps/web/src/main.ts、router、features | Vue 页面/路由调用 API client，经 HTTP 使用共享 DTO |
| API | apps/api/src/main.ts、app.module.ts | NestJS 启动、配置、错误映射和 HTTP controller |
| 业务 | apps/api/src/books、comments、auth、users、sessions、admin | controller → service/policy → repository → MongoDB |
| 共享 | packages/contracts/src | 浏览器安全的 DTO/schema、状态枚举、分页、错误/HTTP 契约 |
| 证据 | docs/tasks/HSQL-N.md | 当前任务红/绿测试、变更、验收和审查；不放进应用目录 |

web 不导入 Nest/Mongoose/数据库连接。API 从 session 获取身份，经权限/所有权策略后操作 repository；公开资源经 DTO 映射去掉敏感字段。按 SDD §5.2 建 users/auth_identities/books/comments/sessions/roles 集合及索引，禁止把 Mongoose 文档直接返回客户端。

## 2. 共同不变量与对外契约

- RESTful 使用 /api 下复数名词资源，HTTP 方法表达操作；OAuth 两个协议端点例外。路径/方法/成功状态/错误必须联合测试。
- 统一错误为 `{ error: { code, message, details, requestId } }`，不泄露 URI、凭据、堆栈、原始数据库错误。
- 公开书籍只读 published，reading/finished 是唯一阅读状态；隐藏与不存在统一 404；评论关联的书籍也必须公开。
- 匿名写入 401；有身份但无权限 403；重复身份/唯一键 409；非法查询 400；限流 429。非法用户名 400/422 待 ADR，不能覆盖重复用户名的 409。
- ownerId、authorId、roles、审计字段只能由服务端确定。用户名变化不得重写历史 ownerId。每个写接口独立检查当前账号状态、权限和所有权。
- 邮箱/GitHub 身份在各自命名空间以唯一索引约束；不按相同邮箱自动合并。首次 OAuth 用户完成合法用户名前不得发布/评论。
- Cookie 会话具备 HttpOnly、生产 Secure、明确 SameSite 和撤销；具体 CSRF/CORS/跨域策略须在认证前形成安全 ADR。
- 所有列表分页有上限和查询索引；数值、排序白名单、文本长度在对应任务冻结。书籍 API 的本地 p95 <300 ms 目标来自 SDD §4.9，数据集和测量方法须记录，不能代替正式环境目标。
- 文本/图片 URL 校验与 XSS/CSP、纯文本评论、密码哈希和限流遵循 SDD；凭据只在环境变量，不写仓库、日志或验收附件。

兼容性：目前无旧应用与消费者可迁移；后续若修改已冻结的 DTO、状态或路径，必须有版本/迁移说明和消费者回归测试，不加无效兼容别名。

## 3. 每任务按顺序执行

1. **核验前置**：读取规范、前置提交/审查和 DECISIONS；记录实际 checkout SHA、环境、已有符号及调用链，区分事实和新设计。
2. **冻结本任务细节**：在契约/ADR 明确输入、输出、状态、错误、权限、性能边界；技术细化沿既有授权，影响业务行为的未决项按要求确认，不暗设默认。
3. **RED**：先建立足以运行测试的最小设施，写消费者可观察行为断言并运行。记录因目标行为尚不存在而失败的命令/退出码；安装或语法错误不是有效业务失败测试。
4. **GREEN**：只实现当前规格的最小行为；数据库测试使用真实专用 MongoDB。离线边界可 mock，但不可用 mock 回声作为真实 API/集成验收。
5. **重构与回归**：重跑同一测试，检查正常、边界、错误、并发/重复调用、授权和既有行为。禁止删断言、skip、吞异常、零测试成功和内存 fallback。
6. **验收与清理**：按任务矩阵执行类型/lint/test/build/集成/smoke，清理本轮创建的进程、测试容器和临时副本；不影响开发数据和他人服务。
7. **记录并推送**：更新 docs/tasks/HSQL-N.md，记录命令、退出码、摘要、未验证项、变更文件、前置 SHA 和风险；提交并推送任务分支，回报完整 SHA 和远程 ref。
8. **独立审查与接续**：执行者交给另一个 Agent 只读审查；HSQL-11/15 明确做阶段全量审查。阻塞缺陷在批准范围内先修复和复核，前置未通过不能接续。不要仅靠“任务列表有顺序”假定调度会发生。

## 4. 命令契约与验收顺序

HSQL-8 建立以下根命令；准确配置、关闭语义和 R1-R9 用例参见 [HSQL-8 完整细化](../../plans/HSQL-8-SDD-v1.0.md)。新 Agent 先验证脚本实际存在，不自行声明未来命令已可执行。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:dev:up
pnpm db:test:up
pnpm test:integration
pnpm smoke
pnpm db:test:reset
pnpm db:test:down
pnpm db:dev:down
git diff --check
```

执行时逐条检查退出码；不能用分号连接掩盖失败。首轮实现先生成锁文件，干净 checkout 验收必须 frozen-lockfile。pnpm test 一次运行退出且离线；test:integration 明确使用专用测试库，依赖不可用就失败而非跳过。smoke 以前台方式运行、收集结果并关闭自己启动的进程；dev 是手动开发入口，不冒充已结束的验收命令。DB reset 的重复与隔离验证使用专用开发哨兵，验证后只清理自有哨兵，不做全局 prune。

HSQL-9 起在以上基线外加当前模块的测试选择命令；测试文件/运行器在 HSQL-8 实现后由接手者记录，不能在本空应用基线虚构可运行文件名。HSQL-11/15 执行全量及浏览器流程，不能只报告局部单测。

Git 检查与提交按命令逐条执行：git status、git diff --check、git diff --stat、git diff、精确 git add、git commit、push、git ls-remote。仅提交当前任务文件，不 force push、不改写他人提交。HiFox 环境优先托管 checkout/push，明确失败后才 Git 后备；普通 Agent 环境可正常 Git。除明确验收要求外，不轮询远端 CI 等待结果，把当前链接与本地结果交付即可。

## 5. 验收记录模板

每任务创建/更新 `docs/tasks/HSQL-N.md`，保留规格与真实结果的差别：

| 字段 | 必填内容 |
|---|---|
| 版本/门禁 | SDD 版本、任务规格版本、前置 SHA、当前状态 |
| 改动/契约 | 实际文件、符号、入口、调用方、DTO/HTTP/状态机/索引映射 |
| RED / GREEN | 同一命令、各自退出码与关键输出；修复回归的反例 |
| 全部验证 | 安装/类型/lint/test/build/集成/浏览器真实结果，未运行须注明原因 |
| 安全/数据 | 权限矩阵、脱敏、测试隔离、唯一索引和迁移/回滚证据 |
| 交付 | 提交 SHA、远程 ref、push 结果、独立审查锁定 SHA/结论 |
| 剩余事项 | 缺陷、待决规则、风险、下一任务是否满足前置 |

计划中的成功状态不是运行结果，历史某次 PASS 不是当前提交通过。审查必须针对确定提交，P0/P1 及影响契约/验收的阻塞 P2 修复后复核；不能提前把未来审查写为通过。

## 6. 风险、发布与回滚

文档/代码按任务形成可独立核验提交。若需撤回本交接，保留 Git 历史，正常 revert 文档提交或停止使用交接分支；不 reset/force push。应用变更通过普通 revert 回滚，数据库变更先测试回放、备份并标注可逆性，禁止为回滚删除生产数据。尚无生产数据库可迁移。

生产部署、域名、存储、备份保留期、OAuth app 和管理员初始化都需在对应阶段确认。本地测试通过不能声明 staging/production 或真实 GitHub 授权已通过；缺凭据则明确缺口，同时完成可离线验证的分支。第三方评论未经决策不接入，失败不得阻断原生书库与评论。

## 7. 版本记录

v1.0：整理已有批准计划的执行、TDD、证据、独立审查与回滚规则；命令为后续实施目标，当前未运行应用测试。
