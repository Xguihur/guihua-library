# Agent 交接说明

- 交接版本：v1.0；日期：2026-11-15（Asia/Shanghai）。
- 当前目标：将 HSQL-7 至 HSQL-15 的实施方案交给其他 Agent，当前分支只交付文档。
- 执行授权：SDD v1.2 范围已有用户批准，不要求重复批准已有范围。需求、身份/权限规则或契约的实质变化仍须版本化并获得批准。
- 当前开始点：先闭环 HSQL-7 的两项已复现审查发现，再启动 HSQL-8；不可把有文档等同于有可用应用。

## 1. 已核验事实、历史报告和推断

### 当前仓库事实

- 远程仓库：`https://github.com/Xguihur/guihua-library.git`；本次从远程 `dev` 克隆成功。
- 本次导出基线：`c19e1b5e75102c6530a27f8e2e0f519fba579b8a`，直接父提交 `52d06386155384573ab1b3cb4d57b7b4b7408fdc`。
- 基线只有 9 个 `docs/` 文件，无根 package.json、lockfile、apps、packages、应用入口或测试。没有既有应用符号、调用方、数据迁移和运行时回归测试可引用。
- 现有真实文档入口：`docs/plans/SDD-PLAN-v1.2.md`、`docs/contracts/restful-api.md`、`docs/contracts/errors.md`、`docs/adr/0001-stack-and-workspace.md` 和 `docs/tasks/HSQL-7.md`。
- HSQL-7 仍为进行中；HSQL-8 至 HSQL-15 均为待开始。HSQL-8 单独会话存在细化文档及最新独立审查，不应只读取父任务会话。
- 本合集保留原任务描述，新增规格中列出的未来模块都是目标路径，并非现存代码事实。

### 跨会话历史报告

HSQL-8 会话在 2026-11-14 15:00:43 UTC 返回独立审查，锁定 `c19e1b5`，结论为“需修改，HSQL-7 暂不能闭环”。历史命令/退出码来自该审查及执行回报，并不是本次重新执行的 API 或构建测试。

已入库的 [HSQL-8 细化方案](../../plans/HSQL-8-SDD-v1.0.md) 原由附件 `01a1da62-7777-71bf-8a57-298be17a8e8d` 提供。其“尚未收到独立审查”等段落是生成时快照，已经被本节较新审查取代；保留原件用于追溯，不据此重复申请 v1.2 批准。

### 推断与未验证

基于文档基线可从头搭建工程；这不证明当前机器或其他 Agent 的 Node、pnpm、Docker、镜像、端口、GitHub OAuth 凭据可用。工具版本探测记录仅是历史环境，接手者应再次核对。

## 2. 必须先处理的审查发现

| 编号 | 已复现问题与证据 | 接手修复步骤 | 通过标准 |
|---|---|---|---|
| B1 | `docs/contracts/errors.md` 的 INVALID_USERNAME 行把“唯一性”纳入 400/422；同表及 SDD §4.3 要求重复用户名为 409 IDENTITY_CONFLICT | 先写冲突断言，再仅纠正文档语义：INVALID_USERNAME 处理格式/ASCII/长度，重复用户名保持 409；非法用户名的 400/422 待 ADR 冻结 | 计划、错误表和规格一致，重复身份不被映射为非法格式；独立复核无阻塞 |
| B2 | `docs/tasks/HSQL-7.md` 分别查找路径/方法/状态，未检查三者对应；历史临时副本把 POST /api/users 改为 GET 后仍全项 PASS | 先在临时副本复现；新增联合断言 POST /api/users→201、GET /api/books→200、POST /api/books→201；错误码与状态也逐行联合检查；不能只 grep 全文是否出现 | 原始正确表通过；只改方法、只改状态、改错错误映射均使检查非零；负向副本自动清理；不修改原始失败证据 |

这是已有批准契约的一致性修复，不是创建新业务规则。接手执行 Agent 可在既有授权内处理，记录红/绿证据、提交与推送，再交给另一个 Agent 只读复核。规划师/审查师不代替执行者修改应用实现。

本交接分支保留基线 errors.md 和 HSQL-7 历史记录，尚未执行上述修复；本次文档链接/完整性检查通过不能解除 B1/B2。

## 3. 新 Agent 的第一轮操作

1. 克隆并选择交接分支，确认工作树干净；读取当前目录 README、已批准 v1.2、两份契约、ADR、HSQL-7 原验收记录和本节阻塞。
2. 用 `git log`、`git status`、`git ls-remote` 核验实际远程 refs；若已有后续修复，先审查其证据，避免重复修复或覆盖他人工作。
3. 在自己的实现分支处理 B1/B2，保存失败与成功命令及输出，更新 `docs/tasks/HSQL-7.md`，独立复核通过后再开始 HSQL-8。
4. HSQL-8 按已有细化及本合集运行首轮 TDD，创建实际验收记录 `docs/tasks/HSQL-8.md`；不得把规格里的目标命令复制成“已通过”。
5. 依赖顺序推进 HSQL-9、10、11；阶段 1 审查通过后再进入 HSQL-12、13、14、15。遇到未决规则先定位 DECISIONS，不影响的工作可以继续。

## 4. Git 分支与交付

```sh
git clone --branch task/hsql-6-agent-handoff https://github.com/Xguihur/guihua-library.git
cd guihua-library
git status --short --branch
git log -3 --oneline
git switch -c task/hsql-7-doc-review-fixes
```

分支名是交接建议，接手者可采用自己的规范。每个任务基于前置已验证提交创建分支，或者沿用户认可的连续分支持续提交；每次回报 SHA、前置 SHA、远程分支和测试证据。用户要求的当前交接分支不自动合并到 dev，不授权 force push 或生产发布。若接手环境使用 HiFox，优先 `hifox repo checkout` / `hifox repo push`；其他环境使用其正常 Git 工作流。

## 5. 可直接交给其他 Agent 的执行指令

> 阅读 docs/tasks/collection/README.md、HANDOFF.md、EXECUTION.md、DECISIONS.md、当前 HSQL-N.md 与 docs/plans/SDD-PLAN-v1.2.md。沿 HSQL-7→HSQL-15 顺序，在已有批准范围内先测试后实现。先处理 HANDOFF 中 B1/B2，HSQL-7 复核通过后再做 HSQL-8。保留所有历史证据，每个任务在 docs/tasks/HSQL-N.md 写实际红/绿命令、结果、SHA、推送和未验证项。只有前置验收通过才启动后续；在 HSQL-11 和 HSQL-15 做独立只读审查。不要擅自决定删除/管理员初始化/OAuth 身份合并/外部评论等未决业务规则，不要把环境探测或文档检查当作应用测试通过。本轮交接材料不要求你访问 HiFox，任务 ID 仅用于追溯。

## 6. 版本与交接状态

v1.0：导出原任务、保留 v1.2 批准事实及 HSQL-8 原细化，记录远程 dev 基线和最新两项审查发现。交接材料完成不代表 HSQL-7 实现验收通过，平台任务状态不在本次自动修改。
