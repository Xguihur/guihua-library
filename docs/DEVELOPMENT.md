# 开发、测试与环境

更新日期：2026-11-15。M1 已在本地完成安装、类型、lint、离线测试、构建、真实 MongoDB 集成与浏览器 smoke 验证；交付分支为 `dev`，仍无线上环境。

## 开发节奏

1. 从 ROADMAP 选择当前清单项，读取相关契约，先解决会影响该实现的待决问题。
2. 对业务规则和安全边界先写能表达预期行为的失败测试，再实现、重构并复跑；不以安装失败代替行为失败。
3. 使用真实独立 MongoDB 做持久化和索引集成验证；外部 OAuth 可以做边界模拟，但真实登录另记结果。
4. 跑与改动有关的检查，里程碑验收补完整核心流程及独立只读审查；发现阻塞则修复复核。
5. 在 ROADMAP 简记真实证据。提交与推送按当前用户授权和工作流执行。

测试断言消费者可观察行为、边界和安全，不把源码存在、mock 回声或单纯“不抛异常”当成功。保留数据校验、越权、脱敏、会话撤销、并发唯一性与限流检查。

## 固定版本

| 工具 | 版本 | 说明 |
|---|---|---|
| Node | 22.22.1 | `.nvmrc`、根 `engines` |
| pnpm | 11.5.2 | 根 `packageManager`，使用 workspace |
| MongoDB | 7.0 | `docker compose` 镜像 |
| Docker Compose | v5.1.2 | dev/test 两个 service |

依赖版本在 `package.json` 中约束，实际解析结果以已提交的 `pnpm-lock.yaml` 为准。从干净 checkout 安装用 `pnpm install --frozen-lockfile`；只有明确升级依赖时才用普通 `pnpm install` 更新 lockfile，CI 同样使用 `--frozen-lockfile`。

## 环境划分

| 环境 | 用途 | 隔离要求 |
|---|---|---|
| local development | 本地调试与演示 | `guihua_library`，端口 27017，演示数据可重建 |
| local test / CI | 自动化验证 | `guihua_library_test`，端口 27018，独立数据卷 |
| staging | 线上部署验证与流程回归 | 独立域名、数据库、密钥和 OAuth 回调；未建立 |
| production | 对外提供服务 | 独立凭据，受控发布、备份、监控与回滚；未建立 |

开发库与测试库使用不同 Compose service、端口和数据卷，端口只绑定 `127.0.0.1`，容器与卷统一 `guihua-library-*` 前缀，避免影响其他项目。`db:dev:down` 与 `db:test:down` 只移除各自的容器并保留数据卷，不会停止另一个环境。

配置只提供无密钥 `.env.example`。API 与 CLI 入口从仓库根目录读取 `.env`（cwd 在仓库内即可，不要求等于仓库根），并用 zod 校验 `MONGODB_URI`、`PORT`、`NODE_ENV`：`PORT` 必须是 1–65535 的十进制整数，`MONGODB_URI` 必须是带主机和库名的 `mongodb://` URI；缺失或非法直接失败。错误只列字段名，不回显 URI、凭据或堆栈。

## 数据库安全规则

- `NODE_ENV=test` 时 `MONGODB_URI` 必须是本地白名单主机 + 测试端口 + `guihua_library_test`，否则启动失败。
- `db:test:reset` 只读取 `TEST_MONGODB_URI`，不回落 `MONGODB_URI`；drop 前校验主机、端口与库名。
- `db:seed` 只写本地 `guihua_library`，拒绝 `NODE_ENV=production`，重复运行幂等（固定 `_id` upsert）。
- 集成测试与 smoke 同样先校验测试库，用后清理自有夹具。
- `verify:isolation` 在 dev 写入一个哨兵，drop 测试库后确认哨兵仍在，最后只删除本次哨兵。
- seed/reset/smoke/isolation 的失败输出只给固定脱敏消息，底层 Mongo 错误与连接串不落日志。

## 命令

| 命令 | 职责 |
|---|---|
| `pnpm dev` | 同时启动 API（:3000）与 Vite（:5173，strictPort：端口被占用即失败，不改用其他端口），`/api` 走 Vite 代理 |
| `pnpm typecheck` | 构建 contracts 后检查 web/API/contracts 类型 |
| `pnpm lint` | ESLint 9 flat config，含 Vue SFC |
| `pnpm test` | contracts、API 单元测试、Web 组件测试；一次运行退出 |
| `pnpm build` | contracts → API（tsc）→ web（vue-tsc + vite build） |
| `pnpm test:integration` | 真实 MongoDB 集成测试，数据库不可用即失败 |
| `pnpm smoke` | 构建后启动自有 API（:3100）/preview（:4173）进程，启动前先确认端口空闲，Playwright 跑公开浏览流程 |
| `pnpm db:dev:up` / `db:dev:down` | 开发库生命周期；down 只移除 mongo-dev 并保留卷 |
| `pnpm db:test:up` / `db:test:reset` / `db:test:down` | 测试库生命周期；down 只移除 mongo-test 并保留卷 |
| `pnpm db:seed` | 写入演示夹具 |
| `pnpm verify:isolation` | dev 哨兵隔离验证 |

## 测试分层

- 离线：contracts 的查询/分页/错误契约，API 的 DTO 白名单映射、错误过滤、配置与库名校验、健康检查失败路径，Web 的请求构造、筛选/分页、过期响应保护、错误重试、404、评论分页与转义。
- 集成：真实 NestJS 应用 + 真实 MongoDB，覆盖 published 过滤、组合分页排序、隐藏/不存在一致 404、匿名单写 401 且数据不变、父资源校验、索引与唯一约束。
- smoke：真实构建产物 + 浏览器，覆盖列表、筛选、详情、评论、返回、隐藏书 404 与匿名 POST 401。

浏览器自动化使用 Playwright。日志只保留摘要与 `smoke-artifacts/` 路径；截图、trace、`node_modules`、`.env` 不入库。

CI（`.github/workflows/ci.yml`）顺序：frozen install → typecheck → lint → 离线测试 → build → 真实 Mongo 集成 → Chromium → smoke；任一步非零即失败。

## 发布与技术实验

CI 至少覆盖类型、lint、行为测试、构建和数据库集成；浏览器核心流程在里程碑和发布前执行。接口方法、路径、状态码及 DTO 应联合验证，防止契约漂移。

发布前验证 Cookie、CORS/CSP、限流、日志、索引、健康检查；备份需做恢复演练，回滚需区分应用版本与数据库变化。生产部署目标、凭据和操作授权未明确前，只做本地或已授权环境准备。

缓存、队列等学习实验放在对应功能之后，记录目的、方案、可复现验证和结果，必要时新增一份 ADR；没有采纳的实验不进入生产主流程。不预建微服务、消息队列或缓存空壳。

CI 配置位于 [verify.yml.example](ci/verify.yml.example)。当前 GitHub 令牌缺少 `workflow` scope，服务端拒绝创建工作流，因此先保留模板；取得相应权限后移到 `.github/workflows/ci.yml` 才会启用远程 CI。本地验证已执行，远程 CI 尚未运行。
