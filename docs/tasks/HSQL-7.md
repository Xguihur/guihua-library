# HSQL-7：阶段 0.1 工程契约文档

- 计划版本：v1.2（已批准）
- 前置任务：HSQL-6 项目方案设计
- 执行分支：`dev`
- 状态：待审查（文档修复已提交，等待独立只读复核；复核通过前不宣称验收完成）
- 范围：纳入版本化方案、RESTful 契约、统一错误语义、技术栈 ADR 和任务规格规范；不创建业务实现。
- 非目标：不创建 `apps/web`、`apps/api`、`packages` 业务代码、mock endpoint、密钥、真实环境变量或生产数据。
- 契约映射：`docs/plans/SDD-PLAN-v1.2.md`、`docs/contracts/restful-api.md`、`docs/contracts/errors.md`、`docs/adr/0001-stack-and-workspace.md`

## TDD 测试矩阵

### 先失败

- 文档结构检查在缺少 `docs/plans/SDD-PLAN-v1.md` 时失败，记录为基线失败。
- 版本、批准状态、废止关系、RESTful 资源和统一错误码检查作为文档契约断言。
- 原 HSQL-7 验收命令（过度转义、分号串联）重放退出 1，作为命令修复前的失败基线；修复后同一矩阵必须退出 0 且失败可传播。

### 正常路径

- 三个版本化方案文件存在，v1.0/v1.1 标记为已废止，v1.2 标记为已批准。
- `docs/README.md`、`docs/contracts/`、`docs/adr/`、`docs/tasks/` 存在并声明文档区不属于 workspace 应用或共享包。
- RESTful 契约覆盖资源路径、HTTP 方法、分页/过滤和成功/错误状态码。
- 错误契约覆盖统一结构及 `400`、`401`、`403`、`404`、`409`、`422`、`429`、`500`、`503`。
- 验收命令逐项断言资源路径、HTTP 方法（`GET`/`POST`/`PATCH`/`PUT`/`DELETE`）、成功状态码 `200`/`201`/`204` 与错误状态码，并断言已批准计划的 `INVALID_USERNAME` 错误码存在。

### 边界、错误、重复调用与回滚

- 公开书籍不存在、不可见或隐藏资源统一使用 `404 NOT_FOUND`；非法状态和分页使用 `400 VALIDATION_ERROR`。
- 会话删除按 RESTful 契约幂等；唯一性冲突使用 `409`；限流使用 `429`。
- 验收命令使用 `set -eu` 与逐项 `|| fail`：任一断言失败即整体非 0 退出，不被后续 `git diff --check` 成功码掩盖；负向改写断言验证失败传播。
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

### 修订（HSQL-7 前置验收修复）

- 修改：`docs/tasks/HSQL-7.md`（TDD 矩阵补充、验收命令、真实结果、缺陷与未决项、验收结论）；`docs/contracts/errors.md`（补录 `INVALID_USERNAME` 及 400/422 ADR 冻结边界）。
- 未改：`docs/plans/*`、`docs/contracts/restful-api.md`、`docs/README.md`、`docs/adr/*`、`docs/tasks/README.md` 及任何应用/配置目录；不覆盖工作树中未跟踪的 `docs/plans/HSQL-8-SDD-v1.0.md`。

## 验收命令

在仓库根目录执行。下方命令块可直接复制为脚本运行；`set -eu` 配合逐项 `|| fail` 保证任一断言失败即以非 0 退出，不会被后续 `git diff --check` 的成功码掩盖；`grep -Fq` 用单引号或 `printf` 生成固定字符串，避免反引号被当作命令替换与过度转义。复现命令与退出码见「真实结果」。

```sh
set -eu
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

# 1) 文档结构：9 个文档 + 文档区目录
for f in \
  docs/plans/SDD-PLAN-v1.md docs/plans/SDD-PLAN-v1.1.md docs/plans/SDD-PLAN-v1.2.md \
  docs/README.md docs/contracts/restful-api.md docs/contracts/errors.md \
  docs/adr/0001-stack-and-workspace.md docs/tasks/README.md docs/tasks/HSQL-7.md; do
  test -f "$f" || fail "structure: missing $f"
done
test -d docs/contracts || fail 'structure: missing docs/contracts'
test -d docs/adr || fail 'structure: missing docs/adr'
printf 'structure: PASS\n'

# 2) 版本、批准状态、废止关系
grep -Fq -- '- **版本**：v1.2' docs/plans/SDD-PLAN-v1.2.md || fail 'approval: v1.2 version'
grep -Fq -- '- **状态**：已批准' docs/plans/SDD-PLAN-v1.2.md || fail 'approval: approved'
printf 'approval: PASS\n'
grep -Fq -- '| v1.0 | 已废止' docs/plans/SDD-PLAN-v1.md || fail 'supersession: v1.0'
grep -Fq -- '| v1.1 | 已废止' docs/plans/SDD-PLAN-v1.1.md || fail 'supersession: v1.1'
printf 'supersession: PASS\n'

# 3) RESTful 资源路径（复数名词资源、嵌套资源与管理资源）
for p in \
  '`/api/users`' '`/api/sessions`' '`/api/sessions/current`' \
  '`/api/books`' '`/api/books/{bookId}`' '`/api/books/{bookId}/comments`' \
  '`/api/comments/{commentId}`' '`/api/me`' '`/api/me/books`' \
  '`/api/admin/books`' '`/api/admin/users`' '`/api/admin/roles`'; do
  grep -Fq -- "$p" docs/contracts/restful-api.md || fail "restful-resource: $p"
done
printf 'restful-resources: PASS\n'

# 4) HTTP 方法（资源表中的 GET/POST/PATCH/DELETE + 通用约定中的 PUT）
for m in GET POST PATCH DELETE; do
  pat=$(printf '| `%s` |' "$m")
  grep -Fq -- "$pat" docs/contracts/restful-api.md || fail "restful-method: $m"
done
grep -Fq -- '`PUT`' docs/contracts/restful-api.md || fail 'restful-method: PUT'
printf 'restful-methods: PASS\n'

# 5) 成功状态码（restful-api.md 资源表 / 状态码约定）
for s in 200 201 204; do
  pat=$(printf '`%s`' "$s")
  grep -Fq -- "$pat" docs/contracts/restful-api.md || fail "restful-status: $s"
done
printf 'restful-status: PASS\n'

# 6) 错误状态码（errors.md；TDD 矩阵要求 400/401/403/404/409/422/429/500/503）
for s in 400 401 403 404 409 422 429 500 503; do
  pat=$(printf '`%s`' "$s")
  grep -Fq -- "$pat" docs/contracts/errors.md || fail "error-status: $s"
done
printf 'error-status: PASS\n'

# 7) 错误码名称（含已批准计划要求的 INVALID_USERNAME）与统一错误结构
for c in \
  VALIDATION_ERROR UNAUTHORIZED INVALID_CREDENTIALS FORBIDDEN NOT_FOUND \
  IDENTITY_CONFLICT RATE_LIMITED UNPROCESSABLE_ENTITY INTERNAL_ERROR \
  SERVICE_UNAVAILABLE INVALID_USERNAME; do
  pat=$(printf '`%s`' "$c")
  grep -Fq -- "$pat" docs/contracts/errors.md || fail "error-code: $c"
done
for k in '"code"' '"message"' '"details"' '"requestId"'; do
  grep -Fq -- "$k" docs/contracts/errors.md || fail "error-structure: $k"
done
printf 'error-contract: PASS\n'

# 8) 工作树空白检查
git diff --check || fail 'git diff --check'
printf 'diff-check: PASS\n'

printf 'documentation-contracts: PASS\n'
```

## 真实结果

环境与前提：`dev` 工作树根目录；`/bin/sh`；以下均为真实执行、未降级断言。独立审查锁定基线 `52d06386155384573ab1b3cb4d57b7b4b7408fdc`。

- 先失败基线（历史，HSQL-7 执行 run `e6ec7703-878e-4097-8049-8c6559a2f75f` seq 174）：复制文档前执行结构检查，输出 `missing: docs/plans/SDD-PLAN-v1.md`，退出 1；随后补齐文档。该历史基线不放进当前可重复验收块。
- 原验收命令重放（修复前，对基线提交 `52d0638` 中当时第 58–68 行的命令块）：`sed -n '58,68p' docs/tasks/HSQL-7.md | sh` 退出 1；stderr 为 `sh: line 12: VALIDATION_ERROR: command not found` 与 `grep: trailing backslash (\)`。逐行复核：原第 64 行（v1.2 批准断言）单独退出 1，原第 67 行把错误码当作命令执行。原命令块各检查以换行/`;` 串联且无 `set -e`：中间断言失败后末尾 `git diff --check` 仍以 0 结束，整体退出 0，失败被掩盖（修复前实测）。结论：原命令不可复现通过、失败不传播；修复后用 `set -e` 消除该掩盖。
- 修复后验收（本修订）：`sed -n '66,137p' docs/tasks/HSQL-7.md > /tmp/hsql7-verify.sh` 后运行 `sh /tmp/hsql7-verify.sh`，退出 0，逐项输出 `structure: PASS`、`approval: PASS`、`supersession: PASS`、`restful-resources: PASS`、`restful-methods: PASS`、`restful-status: PASS`、`error-status: PASS`、`error-contract: PASS`、`diff-check: PASS`、`documentation-contracts: PASS`。
- 失败传播负向验证：把提取脚本中一项资源断言的目标改为不存在的路径后运行，输出 `FAIL: restful-resource:` 且退出 1，证明 RESTful 断言真实生效、失败会传播，不会被后续 PASS 掩盖。
- `git diff --check`：退出 0，无空白错误。
- 远程推送证据（基线交付，HSQL-7 执行 run log seq 245–253）：
  - `hifox repo push --target-branch dev` 退出 1：`Error: 推送失败：the current directory is not a worktree managed by the repository cache ... repo push does not apply to this directory — use git push instead.`（该执行会话 cwd 非托管 worktree）。
  - 按「先 HiFox、明确失败后回退 Git」规则执行 `git push -u origin dev` 成功：`To https://github.com/Xguihur/guihua-library.git`、`* [new branch] dev -> dev`、`branch 'dev' set up to track 'origin/dev'.`
  - `git ls-remote --heads origin dev` / `git log -1 --decorate` 确认 `refs/heads/dev` = `52d06386155384573ab1b3cb4d57b7b4b7408fdc`（`52d0638 (HEAD -> dev, origin/dev) docs: add approved SDD and RESTful contracts`，根提交含 9 个 `docs/` 文件、1576 insertions，无应用/配置/mock 实现）。
  - 本修订（文档修复）的提交与推送真实结果在本小队会话报告，并由独立只读复核确认；复核通过前不宣称 HSQL-7 验收完成。

## 缺陷与未决项

- 托管推送回退原因（已闭环）：HSQL-7 首次交付时 `hifox repo push --target-branch dev` 因执行会话 cwd 非托管 worktree 而退出 1；按「先 HiFox、明确失败后回退 Git」规则改用 `git push -u origin dev` 成功，远程 `refs/heads/dev` 已确认指向 `52d06386155384573ab1b3cb4d57b7b4b7408fdc`。详见「真实结果」；无需对基线提交重复推送。
- 本修订推送：文档修复按同一优先级规则提交并推送，修复 SHA 与远程 `refs/heads/dev` 的真实结果在本小队会话报告，由独立只读复核确认。
- Node、pnpm、MongoDB 精确版本、管理员初始化、头像存储、删除策略和部署资源仍按 v1.2 标记为后续阶段未决项。
- `INVALID_USERNAME` 的 `400`/`422` 最终选择仍须在认证实现前由 ADR 冻结；本修订只补录已批准计划的错误码，不固定状态码、不新增业务规则。

### 独立审查发现与处理（审查消息 c43ca894-21d6-4fda-89bd-09923302badc）

| 分级 | 审查发现 | 本修订处理 | 验证 |
|---|---|---|---|
| P2／阻塞 | `docs/tasks/HSQL-7.md:64–67` 过度转义；第 64 行单独退出 1、第 67 行把错误码当命令；完整重放退出 1（`VALIDATION_ERROR: command not found`、`grep: trailing backslash`）；分号串联不保证失败传播；最终 PASS 未含 RESTful 路径断言 | 重写验收命令：`set -eu` + 逐项 `|| fail`；断言改用 `grep -Fq` 固定字符串，修正过度转义；补齐 RESTful 资源/方法/状态码断言；先重放原命令记录失败再修复重跑 | 原命令重放退出 1（已记录）；修复后退出 0 并输出全项 PASS；负向改写断言验证失败传播 |
| P2／阻塞 | `docs/tasks/HSQL-7.md:77–88` 验收/推送记录停留在推送前，按 `docs/tasks/README.md:37、47–49` 未闭环 | 回填真实校验结果、托管 push 失败原因与 git fallback 成功证据、基线 SHA `52d0638...`、本审查处理证据，并提交推送文档修订 | 「真实结果」逐项记录命令与退出码；`git diff --check` 退出 0 |
| P2／契约 | 已批准计划 `SDD-PLAN-v1.2.md` 的 `INVALID_USERNAME` 未进入 `docs/contracts/errors.md`，仅给通用 `VALIDATION_ERROR` | 在错误码表补录 `INVALID_USERNAME`，保留 `400`/`422` 在认证实现前由 ADR 冻结的待决边界，不静默退回通用错误、不新增业务规则 | 验收命令 `error-code` 循环断言 `INVALID_USERNAME` 存在，退出 0 |

审查锁定基线：`52d06386155384573ab1b3cb4d57b7b4b7408fdc`（远程 `dev`，9 个 `docs/` 文件，无业务实现）。审查未发现 P0/P1，结论为「需修改，HSQL-7 前置验收尚未闭环」。本修订仅处理上述三项，未改范围、未实现 HSQL-8 应用代码、未改任务归属。审查消息引用计划 `SDD-PLAN-v1.2.md:157` 的 `INVALID_USERNAME`，在当前文本中位于 §4.3 第 162 行（行号漂移，内容一致）。

## 验收结论

文档范围、契约映射与验收命令已修复并在仓库闭环：原命令重放失败、修复后逐项 PASS、失败传播负向验证、托管 push 失败后 git fallback 成功与基线 SHA `52d0638...` 均已记录；错误码表补录 `INVALID_USERNAME` 并保留 400/422 的 ADR 冻结边界。

状态仍为**待审查**：本修订提交已推送，等待独立代码审查师对该修复提交做独立只读复核。按 `docs/tasks/README.md` 状态判定，复核结论无阻塞项前不把 HSQL-7 标记为「通过」，也不启动 HSQL-8 实现。
