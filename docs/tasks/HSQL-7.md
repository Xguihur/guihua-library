# HSQL-7：阶段 0.1 工程契约文档

- 计划版本：v1.2（已批准）
- 前置任务：HSQL-6 项目方案设计
- 执行分支：`dev`
- 状态：待审查
- 范围：纳入版本化方案、RESTful 契约、统一错误语义、技术栈 ADR 和任务规格规范；不创建业务实现。
- 非目标：不创建 `apps/web`、`apps/api`、`packages` 业务代码、mock endpoint、密钥、真实环境变量或生产数据。
- 契约映射：`docs/plans/SDD-PLAN-v1.2.md`、`docs/contracts/restful-api.md`、`docs/contracts/errors.md`、`docs/adr/0001-stack-and-workspace.md`

## TDD 测试矩阵

### 先失败

- 文档结构检查在缺少 `docs/plans/SDD-PLAN-v1.md` 时失败，记录为基线失败。
- 版本、批准状态、废止关系、RESTful 资源和统一错误码检查作为文档契约断言。

### 正常路径

- 三个版本化方案文件存在，v1.0/v1.1 标记为已废止，v1.2 标记为已批准。
- `docs/README.md`、`docs/contracts/`、`docs/adr/`、`docs/tasks/` 存在并声明文档区不属于 workspace 应用或共享包。
- RESTful 契约覆盖资源路径、HTTP 方法、分页/过滤和成功/错误状态码。
- 错误契约覆盖统一结构及 `400`、`401`、`403`、`404`、`409`、`422`、`429`、`500`、`503`。

### 边界、错误、重复调用与回滚

- 公开书籍不存在、不可见或隐藏资源统一使用 `404 NOT_FOUND`；非法状态和分页使用 `400 VALIDATION_ERROR`。
- 会话删除按 RESTful 契约幂等；唯一性冲突使用 `409`；限流使用 `429`。
- 本任务仅修改文档；无数据库迁移、写接口、回滚脚本或运行时状态转换。

### 安全/兼容性

- 文档明确禁止提交密钥、真实环境变量、数据库 URI、OAuth secret、会话 secret 和生产数据。
- 文档明确 web 不依赖 NestJS/Mongoose/MongoDB 内部实现；MongoDB/Mongoose 仅属于 API 服务端边界。
- 文档明确业务 API 禁止动作式 URL，破坏性契约变更必须版本化或提供迁移说明。

## 实现与变更范围

新增：

- `docs/plans/SDD-PLAN-v1.md`
- `docs/plans/SDD-PLAN-v1.1.md`
- `docs/plans/SDD-PLAN-v1.2.md`
- `docs/README.md`
- `docs/contracts/restful-api.md`
- `docs/contracts/errors.md`
- `docs/adr/0001-stack-and-workspace.md`
- `docs/tasks/README.md`
- `docs/tasks/HSQL-7.md`

未修改：`apps/`、`packages/` 及业务实现目录；这些目录当前不存在于空仓库基线。

## 验收命令

在仓库根目录执行：

```sh
# 先失败基线（复制文档前执行）
for f in docs/plans/SDD-PLAN-v1.md docs/plans/SDD-PLAN-v1.1.md docs/plans/SDD-PLAN-v1.2.md; do test -f "$f" || { printf 'missing: %s\\n' "$f"; exit 1; }; done

# 文档结构与契约检查
for f in docs/plans/SDD-PLAN-v1.md docs/plans/SDD-PLAN-v1.1.md docs/plans/SDD-PLAN-v1.2.md docs/README.md docs/contracts/restful-api.md docs/contracts/errors.md docs/adr/0001-stack-and-workspace.md docs/tasks/README.md; do test -f "$f" || exit 1; done
test -d docs/contracts && test -d docs/adr
awk '/\\*\\*版本\\*\\*：v1.2/{found=1} /\\*\\*状态\\*\\*：已批准/{approved=1} END{exit !(found && approved)}' docs/plans/SDD-PLAN-v1.2.md
awk '/\\| v1.0 \\| 已废止/{found=1} END{exit !found}' docs/plans/SDD-PLAN-v1.md
awk '/\\| v1.1 \\| 已废止/{found=1} END{exit !found}' docs/plans/SDD-PLAN-v1.1.md
for code in VALIDATION_ERROR UNAUTHORIZED FORBIDDEN NOT_FOUND RATE_LIMITED; do grep -q "\\`$code\\`" docs/contracts/errors.md || exit 1; done
git diff --check
```

## 真实结果

- 先失败基线：失败，输出 `missing: docs/plans/SDD-PLAN-v1.md`；随后补齐文档。
- 文档结构检查：通过，输出 `structure: PASS`。
- v1.2 批准状态检查：通过，输出 `approval: PASS`。
- v1.0/v1.1 废止关系检查：通过，输出 `supersession: PASS`。
- RESTful/错误契约检查：错误码检查通过，输出 `error-contract: PASS`；RESTful 检查命令的路径匹配仍需用最终复核命令验证，不能据此单独声明完成。
- `git diff --check`：待提交前运行并记录。
- 远程推送：待提交后运行并记录。

## 缺陷与未决项

- 远程仓库原始状态无可用 refs；已在本地初始化 `dev` 分支。远程分支创建和推送结果必须以 `hifox repo push --target-branch dev` 的真实输出为准。
- Node、pnpm、MongoDB 精确版本、管理员初始化、头像存储、删除策略和部署资源仍按 v1.2 标记为后续阶段未决项。

## 验收结论

文档范围已实现，等待 `git diff --check`、提交和 `dev` 分支推送证据后交付独立代码审查。
