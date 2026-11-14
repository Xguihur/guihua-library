# ADR 0001：技术栈与 monorepo workspace 边界

- **状态**：Accepted for the v1.2 engineering baseline
- **日期**：2026-11-14
- **依据**：`docs/plans/SDD-PLAN-v1.2.md`
- **范围**：工程目录、依赖边界和运行时职责；不实现业务功能

## 背景

仓库从空基线开始，需要让公共站点、HTTP API 和前后端共享契约可以独立演进，同时避免把数据库模型或服务端内部模块泄露给浏览器。v1.2 已确定 Vue 3、Vite、NestJS、MongoDB/Mongoose 和 pnpm workspace 方向。

## 决策

采用 pnpm workspace monorepo，目录边界如下：

```text
apps/
  web/                 # Vue 3 + Vite 浏览器应用
  api/                 # NestJS HTTP API 与服务端模块
packages/
  contracts/           # 前后端共享 DTO/schema、枚举和错误码
  config/              # 仅在配置重复且契约明确后抽取

docs/
  plans/               # SDD/TDD 方案
  contracts/           # RESTful HTTP 契约
  adr/                 # 架构/安全决策
  tasks/               # 任务规格与验收证据
```

### 职责与依赖

- `apps/web` 只消费 HTTP API 和 `packages/contracts`；不依赖 NestJS 内部模块、Mongoose schema、MongoDB driver 或数据库连接。
- `apps/api` 负责 NestJS controller、认证授权、输入校验、资源服务、Mongoose schema/repository 和统一错误映射；对外只暴露 `docs/contracts/` 定义的资源 DTO。
- `packages/contracts` 只包含可在浏览器安全消费的共享类型/schema、资源状态、分页和错误码；禁止放入数据库连接、密钥、服务端策略实现或 Mongoose 文档类型。
- MongoDB 是 API 的持久化边界；Mongoose 负责服务端 schema、索引和 repository 适配。MongoDB/Mongoose 依赖只能位于 `apps/api` 或服务端专用包。
- `docs/` 是仓库外部统一文档区，不属于任何 workspace package，也不承载 endpoint、mock 或业务实现。

### 工具链

- 包管理与 workspace 编排：pnpm。
- 浏览器应用：Vue 3 + Vite。
- HTTP 服务：NestJS。
- 持久化：MongoDB + Mongoose。
- Node、pnpm、MongoDB 和各依赖的可执行版本在阶段 0.2 的根配置和环境文档中固定；本 ADR 不凭空锁定尚未验证的版本号。

## 结果

**收益**：浏览器与数据库解耦；共享契约减少 API 漂移；web、api 和 contracts 可以分别测试、构建和发布；文档不会被应用目录的实现生命周期吞没。

**代价**：workspace 配置、跨包类型构建和 API DTO 映射增加初始工程成本；服务端必须显式把 Mongoose 文档转换为公开 DTO，不能直接序列化数据库对象。

## 约束与拒绝项

- 不创建动作式业务 endpoint；RESTful 资源、方法、状态码和错误结构以 `docs/contracts/` 为准。
- 不把真实环境变量、数据库 URI、OAuth secret 或会话 secret 放入 workspace 或文档。
- 不为未来需求预建空壳应用、mock endpoint、无效 fallback 或 TODO 实现。
- 若需改变 workspace 边界、引入 SSR、替换 MongoDB/Mongoose 或让 web 直接访问数据库，必须新增 ADR 并更新 v1.2 契约/计划。

## 未决项

Node/pnpm/MongoDB 的精确支持版本、部署平台、MongoDB 托管、头像存储、管理员初始化和备份策略在后续阶段确认。未决项不得被实现默认值悄悄固化。
