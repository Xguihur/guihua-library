# 文档导航

日常从[项目总览](PROJECT.md)进入，推进开发时只在[路线图](ROADMAP.md)维护里程碑状态。

| 文档 | 负责什么 |
|---|---|
| [PROJECT.md](PROJECT.md) | 产品定位、范围、架构和技术实践目标 |
| [ROADMAP.md](ROADMAP.md) | 任务拆分、交付标准、当前进度与简短验收记录 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发、测试、环境隔离、部署与交付规则 |
| [DECISIONS.md](DECISIONS.md) | 未决问题及解决时点 |
| [RESTful API](contracts/restful-api.md)、[错误语义](contracts/errors.md) | HTTP 与数据边界的唯一维护位置 |
| [M1 规格与证据](specs/M1.md) | 已交付公开书库的设计与验收记录 |
| [M2 规格与证据](specs/M2.md) | 账号与资料设计、CodeBuddy/Codex 执行协议与 A–E 批次真实证据（真实 GitHub/生产 SMTP 外部流程仍阻塞） |
| [技术栈 ADR](adr/0001-stack-and-workspace.md) | 已选技术栈和依赖边界 |

## 维护规则

- 产品范围只在 PROJECT 维护，进度只在 ROADMAP 维护，接口规则只在 contracts 维护。用户最新明确要求优先；业务规则冲突需先记录并解决。
- 接口、身份、权限、删除策略的实质变化更新相应契约与决定；无需为普通措辞修订生成一整套新方案。
- 文档统一放在根 docs，不在应用内复制。验收证据简短可复现，较大原始输出链接至 CI 或专项记录，不重复粘贴规范。
