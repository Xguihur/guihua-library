# 项目文档

本目录是桂花图书馆的统一工程文档区，随 monorepo 版本管理。它**不属于** `apps/web`、`apps/api` 或 `packages`，不放置前端、后端或共享包的业务实现。

## 文档结构

- `plans/`：版本化 SDD/TDD 实施方案。当前执行依据是 `SDD-PLAN-v1.2.md`；v1.0、v1.1 仅保留历史记录，均已废止。
- `contracts/`：前后端共同遵守的 RESTful HTTP、资源、状态码、查询参数和错误语义。实现应以这里的契约和共享 schema 为准，不能以控制器偶然返回值替代。
- `adr/`：架构决策记录，说明已选择的边界、取舍和未决事项。
- `tasks/`：各阶段任务规格、TDD 测试矩阵、验收命令、真实结果、缺陷和结论。

## 约束

1. 方案、契约、ADR 和任务验收证据统一放在本目录，不复制到 `apps/web`、`apps/api` 或 `packages` 的内部文档目录。
2. 业务实现仍只能位于对应应用或共享包；本目录不创建 endpoint、mock endpoint、脚手架或临时 fallback。
3. 破坏性契约变更必须递增契约版本或附迁移说明；不能静默改变字段、状态码或权限含义。
4. 文档中的未决项必须明确标注，不能写成已验证事实。实现任务完成后，必须补充可复现命令和真实输出摘要。
5. 不提交密钥、真实环境变量、OAuth secret、数据库 URI、会话 secret 或生产数据。

## 当前入口

- 执行方案：[`plans/SDD-PLAN-v1.2.md`](plans/SDD-PLAN-v1.2.md)
- RESTful 资源契约：[`contracts/restful-api.md`](contracts/restful-api.md)
- 统一错误语义：[`contracts/errors.md`](contracts/errors.md)
- 技术栈与 workspace ADR：[`adr/0001-stack-and-workspace.md`](adr/0001-stack-and-workspace.md)
- 任务规格规范：[`tasks/README.md`](tasks/README.md)
