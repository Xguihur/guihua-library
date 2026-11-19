# 桂花图书馆

一个面向多人分享阅读记录的小型社区，也是持续实践前后端开发、测试、部署和线上运维的个人项目。

访客可以浏览阅读记录、阅读状态、书评和评论。用户可注册、登录、管理资料和登录方式（M2）；发布自己的阅读记录并参与评论随 M3 开放，管理员维护内容与用户（M4）。

**当前状态（2026-11-18）：M1 保持通过；M2 账号、会话、资料、GitHub 登录/绑定/解绑及邮件验证已实现，本地完整回归与审查修复通过。真实 GitHub 直接登录及退出后重登已于 2026-11-20 验证；真实绑定/解绑等剩余外部验收仍待完成。交付分支为 `codex/m2-accounts`，尚无线上环境。证据见 [M2 §9–10](docs/specs/M2.md)。**

## 技术栈

Vue 3 + Vite、NestJS、MongoDB / Mongoose、pnpm workspace（`apps/web`、`apps/api`、`packages/contracts`）。

## 从干净 checkout 启动

前置：Node 22.22.1（见 `.nvmrc`）、pnpm 11.5.2、Docker Compose。

```bash
corepack enable
pnpm install --frozen-lockfile      # 按仓库内 pnpm-lock.yaml 精确安装
cp .env.example .env                # 本地配置，不入库
pnpm db:dev:up                      # 开发库 127.0.0.1:27017
pnpm db:migrate                     # 已有 M1 开发库先做冲突检查与索引迁移
pnpm db:seed                        # 幂等写入演示数据
pnpm dev                            # API http://127.0.0.1:3000/api ，页面 http://127.0.0.1:5173/books
```

停止：`pnpm db:dev:down`（只移除 mongo-dev 容器并保留数据卷，不影响 mongo-test）；测试库用 `pnpm db:test:down` 独立停止。

## 检查与验证

以下命令在 2026-11-18 的 M2 本地收尾中全部实际执行并退出 0；共 170 项单元/组件测试、100 项集成测试及浏览器 smoke，证据见 [M2 §9–10](docs/specs/M2.md)。

| 命令 | 作用 |
|---|---|
| `pnpm typecheck` | contracts/web/API 类型检查 |
| `pnpm lint` | ESLint（含 Vue） |
| `pnpm test` | 离线单元/契约/组件测试，一次退出 |
| `pnpm build` | 构建 contracts、API、web |
| `pnpm db:test:up` | 测试库 127.0.0.1:27018 |
| `pnpm test:integration` | 真实 MongoDB 集成测试，要求 `TEST_MONGODB_URI` |
| `pnpm smoke` | 构建后跑真实浏览器 → Vite preview → API → 测试库流程 |
| `pnpm db:test:reset` | 只 drop 专用测试库 |
| `pnpm verify:isolation` | 用 dev 哨兵验证测试库重置不影响开发库 |

浏览器 smoke 首次需要：`pnpm --filter @guihua/api exec playwright install chromium`。

## 当前 API

- `GET /api/books?status=reading|finished&page=1&pageSize=20`
- `GET /api/books/:bookId`
- `GET /api/books/:bookId/comments?page=1&pageSize=20`
- `GET /api/health/live`、`GET /api/health/ready`
- `POST /api/users`、`POST /api/sessions`、`GET/DELETE /api/sessions/current`
- `GET/PATCH /api/me`、`GET /api/me/login-methods`，GitHub 与邮箱验证端点见 [HTTP 契约](docs/contracts/restful-api.md)。
- `POST /api/books`、`POST /api/books/:bookId/comments`：匿名 `401`，有效会话 `403`（M3 才开放写入）。

GitHub OAuth App 与本地 Mailpit 配置见 [开发说明](docs/DEVELOPMENT.md)；缺配置时相关入口返回 503，其余功能可运行。

## 从这里读

- [项目总览](docs/PROJECT.md)：为什么做、做什么、如何实现。
- [路线图与进度](docs/ROADMAP.md)：五个里程碑与当前状态。
- [开发与环境](docs/DEVELOPMENT.md)：命令、数据库隔离、测试与发布规则。
- [M1 规格与证据](docs/specs/M1.md)：本阶段设计与实施记录。
- [RESTful API](docs/contracts/restful-api.md)、[错误语义](docs/contracts/errors.md)。

CI 配置位于 [verify.yml.example](docs/ci/verify.yml.example)。当前 GitHub 令牌缺少 `workflow` scope，服务端拒绝创建工作流，因此先保留模板；取得相应权限后移到 `.github/workflows/ci.yml` 才会启用远程 CI。本地验证已执行，远程 CI 尚未运行。
