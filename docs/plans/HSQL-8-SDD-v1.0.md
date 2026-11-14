# HSQL-8：monorepo 基线与本地开发环境实施细化

- 细化版本：v1.0
- 文档状态：待用户审核。
- 上位计划：`SDD-PLAN-v1.2.md`，已批准，原执行授权继续有效。本细化不废止、不替代上位计划，也不要求重新批准其中已有范围。
- 当前执行门禁：HSQL-7 提交及推送已核验；独立审查尚未闭环。HSQL-8 暂不派发编码。
- 执行者：专项执行工程师；实现后由独立代码审查师只读审查。规划师只维护规格与协调，不代写实现。
- 开始条件：规划师收到 HSQL-7 无阻塞项的独立审查结论，确认其证据已纳入仓库后，按 v1.2 既有授权派发；本细化中如有改变既有契约的意见，先递增版本并取得明确批准，再执行受影响部分。
- 当前禁止：创建实现提交、启动执行工程师编码、提前派发 HSQL-9、把待验证项目记录为通过。
- 日期：2026-11-14，Asia/Shanghai。

## 1. 背景、问题、目标、非目标与范围

HSQL-7 已建立文档基线，HSQL-8 是顺序任务中的第二项。当前只有文档，没有可安装、构建、启动的应用。目标是让后续业务任务拥有可复现且隔离的运行环境，先以失败测试明确边界，再实现最小可运行工程。

本任务范围：根 pnpm workspace、Vue 3/Vite web、NestJS API、共享 contracts；TypeScript、lint、测试、构建与开发命令；示例环境变量与显式配置校验；本地开发/测试 MongoDB 编排、健康检查、清理；统一位于根 `docs/` 的环境说明、契约和验收证据。上位计划要求的最小 CI 可运行安装、类型、lint、离线测试、构建；不引入部署流水线。

非目标：书籍、认证、评论和管理功能的业务实现，用户/权限规则冻结，GitHub OAuth 或外部评论接入，远程部署、生产数据库、真实密钥、样式与动画设计、SSR、Turborepo/Nx。`packages/config` 当前没有重复需求，不预建。

共享包只落实上位计划要求的基础类型、枚举和错误/健康契约。评论输入长度、用户名正则、分页默认值及上限等尚未冻结的业务规则留待对应任务，不能为了基线测试擅自定值。

## 2. 现状与证据：事实、推断与待确认

### 2.1 已核验事实

仓库：`https://github.com/Xguihur/guihua-library.git`。

本轮托管检出路径：`/Users/xiaolongxia/.hifox/organizations/a4ea/runs/2026/11/4888b44b/workdir/guihua-library`。

基线提交：`52d06386155384573ab1b3cb4d57b7b4b7408fdc`；本地工作分支 `hifox-agent/zhuan-xiang-gui-hua-shi/HSQL-8`。`git ls-remote origin refs/heads/dev` 真实输出该 SHA，证明前置提交已推送。工作树在本计划生成前干净。

| 实际文件/入口 | 证据位置 | 对本任务的约束 |
|---|---|---|
| `docs/plans/SDD-PLAN-v1.2.md` | 行 3–9、88–91、阶段 0.2、8 节工程基线、9.1 节 | 已批准；pnpm、Vue、NestJS、MongoDB/Mongoose；先失败测试；健康检查须区分数据库不可用；共享契约被两端引用 |
| `docs/README.md` | 行 3、文档约束 | 文档位于根 docs，不属于 apps 或 packages |
| `docs/adr/0001-stack-and-workspace.md` | 行 33–45、62 | web 不依赖服务端或数据库；contracts 浏览器安全；精确工具版本本阶段固定 |
| `docs/contracts/errors.md` | 行 9–28、32–43 | 统一错误形状；依赖不可用为 503 SERVICE_UNAVAILABLE；不暴露 URI/堆栈 |
| `docs/contracts/restful-api.md` | 通用约定、95–97 行 | `/api`、JSON；业务未决规则不得静默冻结 |
| `docs/tasks/README.md` | 状态判定及编写要求 | 先失败、真实命令/退出码；独立审查后才能记为通过 |
| `docs/tasks/HSQL-7.md` | 真实结果、验收结论 | 仓库仍留有“待提交/待推送/待验证”记录，与会话最终报告未同步 |

`git ls-tree -r --name-only HEAD` 仅列出上述九份文档。无根 package.json、锁文件、应用入口、业务符号、测试或 CI；因此没有既有代码调用方或需要迁移的调用链。本文所有新增文件和符号均为设计目标，不是现有实现。

授权事实：HSQL-6 会话消息 `c898b2ca-628f-46ab-b73e-06916bc20876` 明确要求先开发前几个阶段、提交 GitHub、按顺序派发；HSQL-7 会话中本轮实际读取的用户原文为“可以开始执行。远程仓库你自己创建一个 dev 分支来用”。最终执行报告消息 `6026e3a6-f4bf-4cc9-867f-27249750a0d6` 给出 SHA、文档检查通过、git diff 检查通过及推送成功。前置 HSQL-7 平台状态仍为进行中，仓库任务文档仍为待审查，尚不能将该报告等同独立审查通过。

本机只读环境探测：Node `v22.22.1`、pnpm `11.5.2`、Docker `29.4.0`、Docker Compose `v5.1.2`；`docker info --format '{{json .ServerVersion}}'` 返回 `"29.4.0"`。仅证明工具及 daemon 可访问，未拉取镜像、未创建容器、未运行应用。

文档只读校验：Python 检查九份文档存在、v1.2 批准标记、旧版废止标记以及相对 Markdown 链接存在，通过，输出 `document-structure-and-relative-links: PASS (9 files)`；`git diff --check` 退出 0。此检查不验证全部业务契约，更不替代独立审查。

### 2.2 推断

可在该文档提交之上新增 workspace，无旧业务或数据迁移负担。本机 Docker 可能足以完成真实 MongoDB 集成验收；镜像拉取、端口、资源占用、浏览器和 CI 可用性仍未验证。

### 2.3 待确认/阻塞

1. 前置 HSQL-7 的独立审查、最终命令与结论回填未闭环。已在本 Crew 会话发出只读审查请求；尚未收到结论，不宣称审查已启动或通过。
2. 本文健康响应、环境命名和命令是范围内执行细化提案，用户可审核；如调整，不覆盖 v1.0 历史文件，发布 v1.1 并记录废止关系。
3. 精确应用依赖与 MongoDB 镜像版本由执行工程师在实现前核对兼容性，写入锁文件/ADR 并实际运行。不得使用未固定的 `latest` 或仅凭生成器默认值声称可用。

## 3. 术语、前置条件和不变量

- 基线通过：干净 checkout 安装、类型、lint、离线测试、数据库集成测试、构建、实际启动及独立审查均有证据。
- 健康：API 进程可响应且在有界时间内真实 MongoDB ping 成功；不以常量或 mock 判为健康。
- 开发库：仅本地开发数据；测试库：独立实例/端口/数据生命周期的可销毁测试数据。
- 契约包：浏览器和 Node 都能解析、运行的共享公开类型/校验器，不包含服务端连接、凭据、进程环境读取或 Mongoose 类型。

前置：HSQL-7 无阻塞项；执行 checkout 包含其最终证据提交；Node/pnpm/Docker/Compose 及所需端口可用。执行前重查 dev HEAD，不覆盖他人的工作树或并行远程提交。

不变量：

1. 根 package 私有，workspace 范围仅 `apps/*`、`packages/*`，docs 永不成为 package。
2. 两端显式以 `workspace:*` 依赖同一个 `@guihua/contracts`，不通过跨包 src 相对路径或只在测试中伪造引用。
3. 开发和测试使用不同 MongoDB 服务、端口与数据目录；测试入口不读取通用 `.env`、开发或生产文件，不继承其数据库 URI。
4. 销毁测试库只影响本任务的专用测试服务；不接受任意 URI、不执行全局 Docker prune、不删除开发卷。
5. 示例仅有公开的本地非敏感样例值；实际本地环境文件、日志、dist、node_modules 不提交。应用不得因未实现认证而要求 OAuth/会话 secret。
6. 所有失败命令返回非零退出码并说明缺少的字段名或前置，不泄露字段值；数据库不可用不能静默改用内存/mock。
7. 本轮不实现任何业务资源 endpoint；共享业务类型不会生成未批准的业务行为。

## 4. 对外契约提案

### 4.1 目录、版本和包出口

新增根：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、TypeScript 基础配置、ESLint flat 配置、`.gitignore`、`.node-version`、`.env.example`、`.env.test.example`、`compose.yaml`；可增加少量根 scripts 负责启动编排/环境检查/测试隔离，不加入通用框架。

包名：`@guihua/web`、`@guihua/api`、`@guihua/contracts`，均 private。优先使用当前实测 Node 22.22.1 与 pnpm 11.5.2，根 `packageManager` 精确固定，Node 文件固定版本，engines 明确兼容范围；若所选依赖不兼容则先换兼容依赖并记录，不静默更改整机运行时。

API 可采用 CommonJS，web 使用 ESM。contracts 必须提供与两者相容的 `exports` 和声明文件（必要时 ESM/CJS 双构建）；真实 Node 加载和 Vite 生产构建均需通过，不以 TypeScript paths 掩盖运行时解析问题。根 build/typecheck/test 按 contracts → api/web 顺序运行；dev 在启动两端前构建/监听 contracts，源码变更可生效。

### 4.2 根 CLI

| 命令 | 可观察行为/失败语义 |
|---|---|
| `pnpm install --frozen-lockfile` | 锁文件一致时安装；缺锁/漂移时失败；初次实施生成锁文件，验收不可重新解算依赖 |
| `pnpm typecheck` | 覆盖三包，含 Vue SFC 和 API 测试类型；任一包失败整体非零 |
| `pnpm lint` | 三包及根脚本可重复检查；CI/验收不自动改文件 |
| `pnpm test` | 一次运行后退出的离线单元/契约/组件测试；不访问数据库，不 watch，不允许零测试假成功 |
| `pnpm test:integration` | 显式测试环境，只连接专用测试库；DB 缺失/错误非零，不跳过不 fallback |
| `pnpm build` | 依次产出 contracts 声明/运行时、api 可启动 JS、web 静态构建 |
| `pnpm dev` | 校验开发配置，启动 contracts watch + API + web；任一服务异常退出则整体报错并清理自己启动的子进程；Ctrl-C 关闭本组 |
| `pnpm start:api` | 从构建产物运行 API，验证包出口而非运行 TS 源码 |
| `pnpm db:dev:up` / `pnpm db:test:up` | 只启动对应 MongoDB，等待健康，有界超时并非零失败 |
| `pnpm db:dev:down` / `pnpm db:test:down` | 停止/移除对应容器网络；开发数据卷保留；重复调用安全 |
| `pnpm db:test:reset` | 仅销毁并重建测试实例/测试数据；重复执行安全，开发哨兵数据不变 |
| `pnpm smoke` | 前台完成构建产物 API + web 响应验证和健康请求，关闭自己启动的进程；失败非零 |

`dev` 本身不隐式销毁/重建数据库；环境文档列明先启动数据库。实现可使用第三方并发运行器或简洁 Node 编排器，必须满足退出/清理行为。不开与本任务无关的后台常驻服务。

### 4.3 配置输入、优先级与启动错误

根 `.env.example` 对应忽略的 `.env.development.local`；`.env.test.example` 对应忽略的 `.env.test.local`。命令显式定位根文件，改变 cwd 不切换到其他环境文件；不使用自动级联 dotenv 搜索。

| 运行模式 | 输入 | 基线值/约束 |
|---|---|---|
| 开发 API | `NODE_ENV=development`、`PORT`、`MONGODB_URI` | 端口默认 3000（合法整数 1–65535）；示例 URI `mongodb://127.0.0.1:27017/guihua_dev`；URI 必填，不给生产 fallback |
| 测试 API/集成入口 | 测试入口设置 `NODE_ENV=test`、`TEST_PORT`、`TEST_MONGODB_URI` | 测试默认端口 3001，进程内测试可用系统分配端口；URI 必填，只允许专用 loopback `27018`、库名 `guihua_test`；拒绝 SRV、非本地地址及其他库名/端口 |
| web | 同源相对 `/api` | Vite dev 代理至本地 API，默认 web 5173，strictPort；不把后端 URI/密钥注入 VITE_* |

开发配置可以由显式进程变量覆盖所选开发文件；测试只解析 TEST_* 配置，不读取 MONGODB_URI。测试环境提供缺失/恶意 TEST_MONGODB_URI 时必须立即拒绝，不能退回开发变量。测试代码可用隔离临时目录中的假生产配置做读文件回归，不触碰用户真实文件。

有效配置前不建立连接、不监听端口。缺 URI、非法端口/模式/URI 在启动前返回非零；stderr 只报告字段名/原因，例如 `TEST_MONGODB_URI: invalid_test_database`，不输出 URI 或密码。生产配置的完整部署约束留待发布阶段；本任务仅验证缺必要配置必失败、不加载本地测试样例冒充生产配置。

### 4.4 健康资源与状态转换

`GET /api/health`，匿名、只读，不含业务数据。

- 真实 ping 成功：HTTP `200`，JSON `{ "status": "ok", "checks": { "database": "up" } }`，`Cache-Control: no-store`。
- 连接中、断开、ping 超时/失败：HTTP `503`，使用现有统一错误结构：`error.code=SERVICE_UNAVAILABLE`、稳定安全 message、`details=[]`、非空 requestId；不得返回数据库 URI、驱动错误或堆栈。
- 单次健康请求有界，目标 2 秒内结束。配置正确但数据库不可用时，API 仍能报告 503，不无限重试卡在启动阶段。连接与重试策略由 API 配置封装；测试必须覆盖真实数据库停止后的降级，恢复后可再次变为 200。
- 配置非法 → 启动失败；配置合法 → connecting/503 → ready/200；失联 → unavailable/503；恢复 → ready/200；SIGINT/SIGTERM → 关闭 HTTP、MongoDB 连接并退出。
- 只实现该运维资源及对应错误映射；其他业务路由不预建 mock、占位 handler。未知路由维持 404，并对 JSON 错误遵守现有统一结构。

共享 `HealthResponse`/运行时校验与错误类型由 API 构造、web 消费；web 最小页展示服务健康的加载、可用、不可用状态与可读标题。数据库失联时页面仍可渲染，显示不可用而非伪造书籍；不将运行时工具/数据库地址展示给普通用户。

### 4.5 MongoDB 编排、隔离和清理

根 Compose 定义开发与测试服务，使用固定 MongoDB 镜像版本（实现阶段记录实际 tag/digest）。开发仅绑定 `127.0.0.1:27017`，测试仅绑定 `127.0.0.1:27018`。开发用专用持久卷，测试用专用临时卷或 tmpfs；不共享容器、数据目录和 DB 名。不要用 `container_name` 抢占全机名称。

健康检查在容器内用 mongosh 执行 ping，设置 interval、timeout、retries、start_period。up 使用 Compose wait 和有限等待；镜像拉取失败、端口占用、Docker 不可用明确非零退出。清理使用固定项目/服务，禁止全局清理命令。开发 down 保留数据；开发卷删除不纳入日常命令。测试 reset 只能清理本任务的测试数据。

### 4.6 共享基础契约、安全、性能与兼容性

`packages/contracts/src/index.ts` 公开：`BookStatus=reading|finished`、现有 `ErrorCode`/统一错误形状、基础 `CommentInput {content:string}`、分页输入/输出类型、HTTP method/status 映射以及健康响应类型/校验。已批准基础约束可以测试；业务长短限制、分页上限、身份 schema 在对应任务冻结，不预建空业务 API。

两端都真实消费运行时健康契约，web 单元/组件测试与 API HTTP 测试分别验证解析；构建后的 Node/CJS 和 web/ESM 均真实解析出口。浏览器构建不包含 Nest、Mongoose、Node 内置模块、dotenv 或测试专用库。无既有调用方，无兼容别名/数据迁移。

只监听本地开发端口；不添加通配 CORS 或远程公网暴露。健康接口不返回内部拓扑。单元测试不依赖网络；真实 DB 测试串行操作专用服务，读写自有临时集合并清理；不做性能压测或设无证据吞吐指标。

## 5. 设计方案、关键决策和取舍

| 决策 | 理由 | 备选与代价 |
|---|---|---|
| 原生 pnpm workspace，contracts 先构建 | 三包依赖简单，可审查 | Nx/Turbo 额外工具和缓存语义，当前不需要 |
| 单独离线与集成命令 | 日常测试稳定，同时验收真实依赖 | 全部 mock 不能证明健康/隔离；全部依赖 DB 增加反馈成本 |
| 开发/测试双实例、双端口 | 清理与数据库停止测试不伤开发数据 | 同实例双库成本低，但生命周期/清理隔离弱 |
| 显式环境路径和 TEST_* | 防止测试读取开发/生产连接 | 自动 dotenv 级联方便但边界模糊 |
| 真实 ping + 稳定 503 | 覆盖 v1.2 健康语义 | 只测 TCP 或常量 ok 不能证明数据库可用 |
| 真实两端包加载测试 | 暴露 CJS/ESM 与 exports 问题 | tsconfig paths 与源码相对导入掩盖发布产物问题 |

新增 ADR 或更新 ADR 0001 记录精确版本、包模块格式与环境边界；不修改 v1.2 的业务决定。官方文档核对见第 10 节，精确依赖兼容性最终以实现时的安装/构建结果为准。

## 6. 依赖排序的实施步骤

1. **前置验收闭环**：只读审查 HSQL-7 最终 dev 提交、文档内容及命令证据。若有缺陷，仅交执行工程师修复文档并提交推送，再交原审查师复核；不得同时启动 HSQL-8 实现。保留原提交与修复提交的关系，不覆盖历史报告。
2. **规格入库与工具版本**：将本细化及根环境约定纳入 docs；新增 `docs/tasks/HSQL-8.md`，初始真实结果为未运行。核对 Node/pnpm、依赖版本、镜像，记录在 ADR 和 `docs/development.md`；锁定根 packageManager、engines 和 lockfile。
3. **最小测试运行能力**：根 workspace、基础 TS/lint/一次性测试配置。仅建立运行测试必要设施；先写下表 R1–R8 的契约用例，看到因目标行为未实现而失败。可分组循环，不要求一次编写所有业务实现；语法错误/缺测试运行器不算有效红测。
4. **配置与 contracts**：目标 `apps/api/src/config/`、`packages/contracts/src/`、根 `scripts/`；实现显式配置加载/校验、测试 URI 护栏、基础契约与 exports。先通过配置和两端消费测试；不连接真实业务库。
5. **最小 API**：目标 `apps/api/src/main.ts`、`app.module.ts`、`health/`、数据库连接模块及错误映射。设计入口 `bootstrap`、配置加载器、HealthController/Service 均为新增符号。实现真实 ping、503、关闭钩子；HTTP 测试断言响应而非私有方法调用次数。
6. **最小 web**：目标 `apps/web/index.html`、`src/main.ts`、`src/App.vue`、`vite.config.ts`。先写健康加载/200/503 行为测试，再实现可访问状态文本、同源代理、shared runtime 导入；不创建书库业务页面。
7. **Compose 和真实集成**：目标根 `compose.yaml`、db 脚本、API integration 测试。先实际运行错误/隔离测试，再让编排、断库/恢复、reset 和开发哨兵保存通过。只对专用测试容器做停启。
8. **全链命令/最小 CI**：完成根 typecheck/lint/test/integration/build/dev/start/smoke，CI 最少覆盖无生产凭据的安装、类型、lint、离线测试和构建；不等待外部 CI 轮询来替代本地验证。dev、构建产物运行和 browser smoke 均需采集实际结果。
9. **干净验收与交付**：新建一次性 checkout/目录，以冻结锁文件安装，执行第 8 节验收，清理本轮进程和测试容器。回填 docs/tasks/HSQL-8.md 的真实结果。执行工程师提交并优先 `hifox repo push --target-branch dev`；仅该命令明确失败才允许 git push 回退，禁止 force push。最终独立只读审查，阻塞项未闭环不能派发 HSQL-9。

无旧实现、无数据库迁移/回填或生产删除项。清理生成器的默认 Hello World endpoint、无关测试/README、临时日志和 throwaway 检查脚本；有用的 smoke/隔离回归测试保留在代码测试区，说明文档仅在 docs。

## 7. TDD 测试矩阵

下列为需先写并真实观察失败的行为测试设计，当前尚未创建/执行，不声称已红或已绿。

| ID/目标文件区域 | 首次失败断言 | 正常、边界、错误与回归 | 通过标准 |
|---|---|---|---|
| R1 API config/process 测试 | 缺 MONGODB_URI/TEST_MONGODB_URI 仍启动则失败 | 缺失/空白、非法模式/端口/URI；完整有效配置成功 | 非法配置启动非零且不开监听；错误含字段名、不含值；有效配置可进入启动 |
| R2 config 测试隔离 | 假生产 MONGODB_URI 或生产文件影响测试连接则失败 | cwd 变化、开发/生产哨兵文件、继承环境；TEST_URI 缺失、指向开发库/远程/SRV 时拒绝 | 测试只取显式测试文件的 TEST_*；先拒绝再连接，无网络/写入副作用 |
| R3 API HTTP/health | DB 未通仍 200、错误形状不符时失败 | 真 DB ping 200、启动连接中 503、停测试 DB 后 503、恢复 200 | HTTP/响应字段/2 秒内完成；不泄露 URI/堆栈；请求 ID 非空 |
| R4 shared 包消费 | web 或构建后 API 不能加载同一真实包时失败 | ESM/CJS runtime 导入、类型出口、Vite build；非法状态被 runtime 校验拒绝 | 两端构建/运行实测，不使用 src 相对路径和虚拟同名 mock |
| R5 web 组件行为 | 加载/可用/不可用状态不可观察时失败 | 等待响应、200、503、网络异常/非法响应；安全文案 | 标题和状态可访问，失败不显示健康；不调用业务 endpoint |
| R6 真实 DB integration | reset/测试写入影响开发哨兵则失败 | dev 写哨兵、test 读写临时集合、test reset 两次、检查 dev 哨兵、独立清理自有哨兵 | 数据/端口/卷不混用；测试 reset 清除测试数据且开发哨兵保持 |
| R7 根启动/构建 smoke | 构建产物不可启动、包缺失、端口占用仍报成功则失败 | 干净 checkout、contracts 顺序、web HTTP、健康、已用端口、子进程失败、Ctrl-C | 两端真实可用；错误整体非零；自己启动的子进程/连接退出，无残留 |
| R8 DB 编排/关闭回归 | up 未等健康或 down/reset 影响其他资源则失败 | up 两次、down 两次、Docker 不可用、端口占用、测试服务重启恢复 | 有界退出；仅专用资源变更；开发卷保留；失败不假报成功 |
| R9 统一错误与安全回归 | 503/404 返回默认堆栈或原始 DB 错误则失败 | 配置 stderr、HTTP JSON、web bundle 检查 | 错误形状稳定；无真实密钥；browser 不含服务端依赖/配置 |

使用适合各包的标准测试运行器；API 可用 Nest Testing + HTTP 请求工具，web 用组件测试工具，contracts 用运行时校验测试。工具精确版本由锁文件与实际兼容验证决定。测试不能仅断言源码文本、文件存在、对象复制、mock 回声或“不抛异常”；离线测试可替换网络边界，R3/R6/R8 最终证据必须使用真实专用 MongoDB。

红/绿证据每组记录同一条命令、退出码、关键断言与对应提交/变更阶段；修复后重跑相同测试。禁止用删断言、skip、允许零测试、吞异常或内存 fallback 得到绿测。

## 8. 验收标准、命令与交付清单

执行工程师从干净 checkout 按下面顺序验证，所有命令都记录退出码。命令是目标契约，当前尚不能运行；环境复制命令只在不存在本地文件时执行，禁止覆盖用户文件。

```sh
node --version
pnpm --version
docker compose version
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
pnpm db:test:reset
pnpm db:test:down
pnpm db:test:down
pnpm db:dev:down
pnpm db:dev:down
git diff --check
```

在集成测试前：从两份 example 分别创建对应忽略文件；tests 必须主动验证 URI 护栏。`pnpm dev` 在前台启动，实际访问 web 及 `/api/health`，编辑一次 shared/web/API 验证 watch，再 Ctrl-C；验证仅本轮子进程退出。`pnpm smoke` 还须覆盖 `pnpm start:api` 的构建产物解析。开发和测试的服务启停均至少重复两次，由脚本或人工记录验证幂等。禁止为采集证据停止用户原有服务。

验收判定：

- 三包根命令全部通过；干净 checkout 不依赖本地未跟踪脚本或提前生成 dist；安装不改 lockfile。
- 缺变量/无效 URI 明确失败；测试不读取生产/开发文件或继承的生产 URI；不把真实生产变量写入任何测试输入。
- 健康 200 和真实失联 503/恢复路径全部通过；web 可显示对应状态；不返回敏感值。
- 两端消费同一 contracts；构建后 Node 与 web bundle 实际运行可用。
- Compose 重复启停、test reset 和开发哨兵保存有真实证据；运行后清理本轮自有进程、临时集合、测试容器。
- docs/tasks/HSQL-8.md 记录规格版本、完整命令、退出状态、红/绿结果、环境版本、镜像、最终 SHA、远程分支确认、剩余风险。由于 SHA 自引用问题，文档可以引用被验收的实现提交和随后的证据提交，不能编造包含自身的提交 SHA。
- 独立审查给出无阻塞项结论后才能判为通过。CI 仅记录已知链接/状态，不轮询；本地验证不能用“CI 将通过”替代。

交付检查单（当前全部为待实现/待验收）：[ ] 锁定版本与干净安装；[ ] typecheck/lint；[ ] R1–R9 红/绿；[ ] DB 隔离/恢复/清理；[ ] build/start/dev/browser smoke；[ ] 文档与无密钥检查；[ ] dev 推送 SHA；[ ] 独立审查；[ ] 无阻塞才交接 HSQL-9。

## 9. 风险、回滚、发布检查与未决事项

| 风险 | 控制与停止条件 |
|---|---|
| 前置文档证据滞后、独立审查缺失 | 先闭环 HSQL-7；规划师的结构检查不能替代审查 |
| 工具存在但依赖不兼容，尤其生成器要求更高 Node | 不自动升级整机；选兼容依赖/手建最小入口，锁定并验证；范围变化先规划 |
| CJS/ESM 双环境解析差异 | 真实 API 构建产物运行 + web Vite build/smoke；exports 明确 |
| 生产/开发 URI 误入测试 | 显式测试文件、TEST_*、loopback/端口/库名护栏；先校验后连接；拒绝生产输入 |
| Docker 镜像不可拉取、端口被占用、浏览器不可用 | 原因/原命令/输出如实交付，不停止用户服务、不跳过验收；缺证据不得通过 |
| 断库测试误伤开发数据、清理范围过大 | 只操作测试服务和专用测试卷，dev 哨兵回归；不执行全局清理 |
| dev 并发提交与远程漂移 | 执行 checkout 前复查 dev；正常合并/衔接，不 force push |

回滚：未推送前保留可审查 diff；已推送以正常 revert 提交撤销 HSQL-8 变更，禁止重写 dev 历史。只停本轮专用容器和自己启动的 PID；开发卷默认保留，无数据库迁移，不清空任何生产/用户数据。回滚后 HSQL-7 文档基线仍可读取，应用命令可能不存在，应明确告知。

发布检查仅指本次 GitHub dev 交付：工作树、锁文件、示例环境、忽略规则、无真实 secret、无构建垃圾、命令退出码、commit SHA/远程 ref、审查结论。本任务不发布远程服务，不创建生产 OAuth/数据库资源。若用户需要保留本地服务，另做明确的持久服务交接；本轮默认验证后关闭。

未决事项分级：

- **当前阻塞**：HSQL-7 独立审查与仓库证据闭环。
- **执行前技术定版**：应用依赖/MongoDB 精确版本、模块构建配置、测试工具；属于既有范围内工程选择，依据实际结果写 ADR，不新增业务批准问题。
- **对应后续任务再定**：用户名/密码/邮箱归一化、管理员初始化、评论长度/管理策略、分页上限、头像、删除/草稿、部署资源；不阻塞本基线，不在本任务擅自实现。

## 10. 官方参考与适用限制

本轮查阅官方资料用于技术兼容性判断，不作为已安装/已验证的证据：

- [pnpm installation compatibility](https://pnpm.io/installation/)：Node 22 可用于 pnpm 11；固定现有版本可避免无意追随 latest。
- [Vite guide](https://vite.dev/guide/)：当前文档要求 Node 20.19+ 或 22.12+；本机版本满足该最低条件，但具体 Vite/plugin 组合仍需验证。
- [NestJS first steps](https://docs.nestjs.com/first-steps)：运行时与 CLI 生成器的最低 Node 要求可能不同；当前文档的 CLI 门槛高于本机 22.22.1，不能直接认定最新 nest new 可运行。
- [Compose up reference](https://github.com/docker/compose/blob/main/docs/reference/compose_up.md) 与 [services healthcheck](https://docs.docker.com/reference/compose-file/services/)：使用有界 wait/healthcheck；默认容器启动不等同依赖健康。

## 11. 版本、状态和变更记录

| 版本 | 状态 | 变更 | 批准/授权依据 |
|---|---|---|---|
| 上位 v1.2 | 已批准，继续有效 | 全项目 SDD/契约/TDD 及顺序执行 | HSQL-6 明确开发/派发授权；仓库已记录 |
| HSQL-8 细化 v1.0 | 待用户审核；前置审查门禁未闭环 | 以 52d0638 文档基线细化根命令、配置、健康、共享包、Compose、测试与验收 | 既有范围授权不撤销；新增/改变契约意见需版本化审核 |

用户修改本细化时建立 v1.1，记录变更并标记 v1.0 已废止，不覆盖历史。本轮只写本计划文档，未修改实现、未创建测试/实现提交、未推送代码，未启动 HSQL-8 执行工程师。当前工作交付的是审核材料，不是基线实现完成报告。
