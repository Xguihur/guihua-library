# 桂花图书馆

Vue 3 + NestJS + MongoDB 的 pnpm monorepo 项目，目前仅有规划与契约文档，尚无应用实现。

## 接手入口

1. 阅读 [任务合集](docs/tasks/collection/README.md)，查看 HSQL-7 至 HSQL-15 的范围与顺序。
2. 阅读 [Agent 交接说明](docs/tasks/collection/HANDOFF.md)，先处理 HSQL-7 已有审查阻塞。
3. 按 [执行手册](docs/tasks/collection/EXECUTION.md) 完成先测试、后实现、验证和独立审查。

已批准业务基线为 [SDD v1.2](docs/plans/SDD-PLAN-v1.2.md)。所有规格、契约和验收记录统一放在根 `docs/`，不放进 `apps/` 或 `packages/`。

本分支是任务交接文档分支，文档齐全不代表功能已实现或应用测试已通过。
