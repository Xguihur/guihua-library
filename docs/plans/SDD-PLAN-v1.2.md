# 桂花图书馆实施计划（SDD/TDD）

- **版本**：v1.2
- **状态**：已批准
- **适用仓库**：`https://github.com/Xguihur/guihua-library.git`
- **前序版本**：v1.0、v1.1（均已废止）
- **批准依据**：用户明确要求“先做前面几个阶段”“让项目先开发起来”“开始创建多个任务，按顺序派发给专项开发小队”。
- **执行门禁**：已解除；专项执行工程师可以按本版本先测试后实现。独立代码审查师必须在实现完成后进行只读审查。
- **本版本变更**：所有业务 API 统一采用资源导向的 RESTful 设计；补充 HTTP 方法、状态码、过滤和错误语义。数据库环境与部署讨论不写入本计划，另在会话中说明。

## 1. 背景、问题、目标与范围

### 1.1 背景与问题

GitHub 仓库当前为空，没有既有应用、接口、数据模型、测试、CI 或部署配置。目标是渐进式建设一个个人书籍展示与社区系统：访客浏览已发布书籍和评论；注册/登录用户发布书籍、发表评论、维护个人资料；授权管理员在后台管理用户和书籍，并按发布用户、阅读状态筛选。

### 1.2 已确认需求

1. 未登录用户只能读取公开的已发布书籍及其公开评论；评论和发布书籍必须登录。
2. 登录入口包括 GitHub OAuth 和邮箱注册/登录；当前不实现 CAPTCHA、短信验证码、邮箱验证码或强制邮箱验证流程。
3. 账号标识必须唯一；注册用户名不得包含中文。
4. 登录用户可以修改用户名、性别、头像和个性签名。
5. 管理后台至少提供书籍列表和用户列表；书籍可按发布用户、`reading`（正在读）和 `finished`（已读完）筛选。
6. API 规范统一采用 RESTful；资源路径使用名词、HTTP 方法表达操作，不使用 `createBook`、`getBookList` 等动作式路径。

### 1.3 目标

1. 建立 Vue 3 + NestJS + MongoDB monorepo 基线。
2. 先交付访客可用的公开书库、详情和评论读取，再交付认证、用户发布、个人资料和管理后台。
3. 形成明确的身份唯一性、书籍归属、评论权限和后台筛选契约。
4. 以共享契约和 TDD 测试保证前后端边界、RESTful HTTP 语义、认证授权边界、数据约束和状态筛选。
5. 将方案、接口契约、测试策略和验收证据纳入仓库版本管理。

### 1.4 非目标（本版本不做）

- 不实现复杂推荐、社交关系、私信、支付、订阅、全文搜索和多租户。
- 不实现 CAPTCHA、短信验证码、邮箱验证码或强制邮箱验证；注册、登录、OAuth、发布和评论仍必须限流。
- 不自动把 GitHub OAuth 身份与已有邮箱账号按邮箱地址静默合并；账号关联必须由已登录用户显式完成。
- 不实现评论点赞、嵌套评论、实时通知、富文本/HTML 评论和复杂审核工作流；评论先使用纯文本。
- 不在未确认供应商前锁定图片对象存储、部署平台或域名。
- 不承诺 SSR、PWA、原生客户端或 SEO 指标；渲染目标在发布阶段确认。
- 不把“动画效果好”解释为不可测试的主观指标；动画必须服从可访问性和内容可达性。

### 1.5 范围边界与阶段

- **阶段 0：工程基线**：monorepo、开发命令、环境变量校验、健康检查、共享契约、CI 最小检查。
- **阶段 1：公开书库与原生评论读取**：书籍/评论模型、公开列表与详情 API、图册页、状态筛选、评论读取、加载/空态/错误态。
- **阶段 2：身份认证与个人资料**：邮箱注册/登录、GitHub OAuth、会话、唯一用户名校验、个人资料读取和更新。
- **阶段 3：用户发布与评论写入**：登录用户发布书籍、查看/修改自己的书籍、发表评论及维护自己的评论；管理员权限作为服务端边界。
- **阶段 4：管理后台**：管理员书籍/用户列表、发布用户与阅读状态筛选、RBAC 和审计。
- **阶段 5：外部评论可选集成与发布准备**：确认 GitHub 外部评论产品后再评估接入；完成安全、可观测性、部署、备份、迁移、回滚和性能检查。

## 2. 现状与证据

### 2.1 仓库事实

- `git ls-remote https://github.com/Xguihur/guihua-library.git` 无输出，远程仓库没有可用 refs。
- 本地克隆成功并报告仓库为空；原始 `guihua-library/` 没有源码、测试、README、构建配置或入口文件。
- 因无既有代码，当前不存在可迁移的调用方、模块依赖、数据迁移、兼容接口或回归测试。
- 已生成 `docs/plans/SDD-PLAN-v1.md` 和 `docs/plans/SDD-PLAN-v1.1.md`；两个版本均已废止。本文件 v1.2 是当前执行基线。

### 2.2 用户需求事实

- 访客查看已发布书籍和公开评论。
- 评论和发布书籍需要登录。
- 支持 GitHub OAuth 与邮箱注册/登录；当前不做其他验证码。
- 账号标识唯一；用户名禁止中文。
- 用户可修改用户名、性别、头像、个性签名。
- 管理后台有书籍列表、用户列表；书籍可按发布用户和 `reading`/`finished` 筛选。
- 接口规范使用 RESTful。

### 2.3 当前不存在的证据

以下事项没有仓库事实，必须由批准后的契约、ADR 或后续产品决策确定：部署平台、域名、管理员初始化方式、头像存储、密码找回、邮箱验证、评论删除/审核细则、书籍删除/草稿规则、GitHub OAuth 应用配置、GitHub 外部评论产品、备份策略和正式性能目标。

## 3. 术语、前置条件与不变量

### 3.1 术语

- **公开书籍**：`visibility=published` 的书籍；只有公开书籍可出现在访客 API。
- **发布者/所有者**：书籍 `ownerId` 对应的用户；创建后不能由普通用户通过客户端字段改变。
- **原生评论**：本系统 `comments` 集合中的评论，发布必须通过认证 API。
- **GitHub 评论**：可选的外部评论/嵌入产品，不等同于原生评论。
- **身份标识**：用户名、归一化邮箱、GitHub provider subject；在各自命名空间内唯一。
- **RESTful 资源**：书籍、评论、用户、会话、角色等名词资源；使用 HTTP 方法表达创建、读取、更新、删除及集合过滤。
- **权限**：如 `book:create`、`book:update:own`、`book:read:admin`、`user:read:admin`、`comment:create`、`comment:moderate` 的服务端操作标识。

### 3.2 前置条件

- Node.js、pnpm、MongoDB 支持版本在阶段 0 ADR 固化；默认使用 pnpm workspace、NestJS/Mongoose、Vue 3/Vite。
- 开发环境提供独立测试数据库；测试不得读取生产数据。
- GitHub OAuth 应用提供 client ID、client secret、回调地址和最小 scope；密钥只进环境变量。
- 邮箱注册使用邮箱 + 密码；v1.2 不发送验证码、不强制邮箱验证。
- 头像 URL 的来源、是否允许任意 HTTPS 域名、是否改为对象存储，在实现头像更新前由安全 ADR 固化。

### 3.3 不变量

1. 未认证请求不能创建书籍或评论；前端隐藏按钮不构成授权。
2. 未认证请求只能读取已发布书籍和公开评论；草稿/隐藏资源返回统一 404 或等价不可枚举响应。
3. 后端从会话身份取得 `ownerId`，不信任客户端提供的所有者或角色字段。
4. 用户名必须通过 ASCII/中文禁用规则、长度和唯一性校验；归一化后唯一索引是最终约束。
5. 邮箱归一化后唯一；GitHub provider subject 唯一；邮箱匹配不能静默完成账号合并。
6. 公开 DTO 不包含邮箱、密码哈希、会话、角色内部字段或数据库错误。
7. 书籍状态严格为 `reading` 或 `finished`；非法状态不能写入数据库；公开和后台筛选使用同一枚举。
8. 评论属于一个已存在的书籍和作者；公开评论必须关联公开书籍；删除/隐藏后的评论不能从公开 API 读取。
9. 所有写操作校验输入、记录 `createdAt`/`updatedAt`；错误结构稳定，不返回堆栈或密钥。
10. 密码只存不可逆哈希；OAuth secret、会话密钥和数据库 URI 只来自环境变量，不进仓库或日志。
11. 无验证码不等于无限尝试：注册、登录、OAuth 回调、评论和发布接口必须有可配置限流或等价缓解措施。
12. 头像、签名和评论中的 URL/文本不能造成脚本注入；原始 HTML 默认拒绝或转义。
13. 动画不可阻断键盘操作、焦点可见性、文本阅读和 `prefers-reduced-motion` 用户的使用。
14. 业务 API 使用资源导向路径；除 OAuth 协议回调和必要的认证协议入口外，不使用动作式 URL。

## 4. RESTful 对外契约（v1.2 提案）

契约以 `packages/contracts` 中的共享 schema/类型和 `docs/contracts/` 中的版本化说明为准；实现不得以控制器当前返回值替代契约。

### 4.1 统一 HTTP 约定

- Base URL：`/api`；JSON UTF-8；成功响应返回明确资源 DTO，不返回 Mongoose 文档对象。
- 资源路径使用复数名词：`/books`、`/comments`、`/users`、`/sessions`、`/roles`；禁止 `/getBooks`、`/createBook`、`/updateUser` 等动作式业务路径。
- `GET` 只读且可安全重试；`POST` 创建集合成员；`PATCH` 局部更新；`PUT` 仅在需要完整替换资源时启用；`DELETE` 删除或执行契约定义的软删除。
- 列表默认分页：`page` 从 1 开始，`pageSize` 由服务端限制最大值；过滤、排序和搜索只能通过白名单查询参数表达。
- 统一错误结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "可展示给客户端的稳定消息",
    "details": [{ "field": "username", "reason": "contains_disallowed_characters" }],
    "requestId": "string"
  }
}
```

`details` 可为空；生产响应不能包含堆栈、MongoDB 错误文本、密码、OAuth token 或密钥。

### 4.2 HTTP 方法与状态码

| 场景 | 方法 | 成功状态 | 典型错误 |
|---|---|---:|---|
| 创建集合资源 | `POST /api/{resources}` | `201 Created`，返回资源 DTO；可带 `Location` | `400`、`401`、`403`、`409`、`422`、`429` |
| 获取集合 | `GET /api/{resources}` | `200 OK`，返回分页集合 | `400`、`401`、`403` |
| 获取单个资源 | `GET /api/{resources}/{id}` | `200 OK` | `401`、`403`、`404` |
| 局部更新 | `PATCH /api/{resources}/{id}` | `200 OK`，返回更新后 DTO | `400`、`401`、`403`、`404`、`409`、`422` |
| 完整替换（仅明确需要时） | `PUT /api/{resources}/{id}` | `200 OK` | 同上 |
| 删除/软删除 | `DELETE /api/{resources}/{id}` | `204 No Content` | `401`、`403`、`404` |
| 未认证 | 任意受保护资源 | — | `401 Unauthorized` |
| 已认证但无权限 | 任意受保护资源 | — | `403 Forbidden` |
| 触发限流 | 任意受限资源 | — | `429 Too Many Requests` |

`409 Conflict` 用于用户名、邮箱、slug、OAuth provider subject 等唯一约束冲突；`422 Unprocessable Content` 用于语法合法但业务规则不满足的输入（具体采用 `400` 还是 `422` 必须在 ADR 固化，不能同一错误随机切换）。

### 4.3 认证资源

登录和登出使用会话资源，不使用动作式 `/login`、`/logout` 业务路径：

- `POST /api/users`
  - 创建邮箱注册用户。
  - 输入：`email`、`password`、`username`。
  - 成功：`201 Created`，创建用户和邮箱身份，建立会话，返回 `UserPublic`；不返回密码或 token 明文。
  - 重复邮箱/用户名：`409 Conflict` / `IDENTITY_CONFLICT`；中文或非法用户名：`400` 或 `422` / `INVALID_USERNAME`；格式错误：`400 VALIDATION_ERROR`。
- `POST /api/sessions`
  - 创建邮箱/用户名 + 密码会话。
  - 成功：`201 Created`，返回会话状态和 `UserPublic`；会话凭证使用批准的 HttpOnly Cookie。
  - 错误凭据统一为 `401 INVALID_CREDENTIALS`，不得区分用户不存在、邮箱未注册或密码错误。
- `GET /api/sessions/current`
  - 读取当前会话及当前用户非敏感资料、角色和有效权限。
  - 未登录：`401 UNAUTHORIZED`。
- `DELETE /api/sessions/current`
  - 撤销当前会话；重复调用按幂等设计，返回 `204 No Content` 或无会话时仍返回 `204`。
- `GET /api/oauth/github/authorization`
  - OAuth 协议入口，生成 state/PKCE 并重定向到 GitHub；这是第三方协议需要的授权入口，不是业务 CRUD 动作接口。
- `GET /api/oauth/github/callback`
  - OAuth 协议回调，校验 state/PKCE；已有 provider subject 登录，新用户进入一次性唯一用户名设置流程。
  - 新 GitHub 用户不得自动使用可能含中文/冲突的显示名作为系统用户名；完成合法用户名设置前不能发布书籍或评论。
  - 与已有邮箱相同不自动合并；已登录用户必须显式关联 GitHub 身份。

> 说明：认证会话仍以 RESTful 资源 `/sessions` 表达。OAuth authorization/callback 是 OAuth 协议规定的浏览器重定向端点，保留协议语义，不伪造为资源创建动作；除这两个协议端点外，业务 API 不使用动作式路径。

### 4.4 用户资料资源

- `GET /api/me`
  - 返回当前用户 `UserPublic`：`id`、`username`、`gender`、`avatarUrl`、`signature`、公开创建时间；不返回邮箱、密码哈希、OAuth subject 或会话 secret。
- `PATCH /api/me`
  - 更新 `username`、`gender`、`avatarUrl`、`signature`；不接受 `id`、`email`、`roles`、`ownerId`、密码哈希等服务端字段。
  - 用户名变更重新执行 ASCII/唯一性校验；头像 URL 仅允许批准协议/来源；签名/性别限制长度并拒绝控制字符。
- `GET /api/me/books?status=reading|finished&page=1&pageSize=20`
  - 获取当前用户拥有的书籍；资源过滤通过 query 参数表达。
- `PATCH /api/users/{userId}`、`GET /api/users/{userId}`
  - 仅在批准的管理员用户资源契约中启用；普通用户不因此获得他人敏感资料。

密码变更、密码找回、邮箱变更不属于已确认需求；若实现前需要，必须新增契约和安全 ADR，不得隐式加入。

### 4.5 书籍资源

- `GET /api/books?status=reading|finished&page=1&pageSize=20`
  - 访客可调用；只返回 `visibility=published`；`200`：`{ items: PublicBook[], page, pageSize, total }`。
- `POST /api/books`
  - 需要认证和 `book:create`；请求体不含 `ownerId`，服务端从会话写入所有者。
  - 最小字段：`slug`、`title`、`author`、`coverUrl`、`status`、`summary`、`review`；创建即 `published` 是当前设计提案。
  - 成功 `201 Created`；重复 slug 返回 `409 Conflict`。
- `GET /api/books/{bookId}`
  - 返回公开书籍详情：`id`、`slug`、`title`、`author`、`coverUrl`、`status`、`summary`、`review`、发布者公开资料、时间字段和评论入口信息。
  - 书籍不存在、未发布或不可见统一 `404 Not Found`，不泄露资源存在性。
- `PATCH /api/books/{bookId}`
  - 仅所有者或管理员可更新；普通用户不能修改 `ownerId`、visibility 的受保护部分或审计字段。
- `DELETE /api/books/{bookId}`
  - 删除策略尚未最终确认；确认前不开放不可恢复的物理删除，建议采用所有者/管理员软删除并从公开接口隐藏。

### 4.6 评论资源

- `GET /api/books/{bookId}/comments?page=1&pageSize=20`
  - 访客可读取已发布书籍的公开评论；返回评论正文、作者公开用户名/头像、创建和更新时间；不返回作者邮箱或权限。
- `POST /api/books/{bookId}/comments`
  - 需要认证和 `comment:create`；请求体为纯文本 `content`，不接受 HTML、作者 ID 或审核状态；成功 `201 Created`。
  - 只能关联存在的书籍；书籍未发布时普通用户不能通过公开评论集合写入。
- `GET /api/comments/{commentId}`
  - 仅按批准的公开性返回；普通访客不得通过 ID 读取隐藏评论。
- `PATCH /api/comments/{commentId}`、`DELETE /api/comments/{commentId}`
  - 仅评论作者或具有管理权限者可操作；公开列表不展示已隐藏/软删除评论。

### 4.7 管理资源与筛选

- `GET /api/admin/books?ownerId={userId}&status=reading|finished&page=1&pageSize=20`
  - 需要 `book:read:admin`；`ownerId` 与 `status` 可组合；默认按 `createdAt` 降序；后台可看到已发布及后续定义的隐藏/草稿记录。
  - 返回书籍字段、内部 `ownerId`、作者公开资料、visibility 和审计时间；不返回密码/会话/OAuth secret。
  - 过滤必须由服务端执行，不得只在前端筛选。
- `GET /api/admin/users?page=1&pageSize=20`
  - 需要 `user:read:admin`；返回用户 ID、用户名、邮箱脱敏/按批准权限展示、头像、性别、签名、角色、启用状态和创建时间；不返回密码哈希。
- `PATCH /api/admin/users/{userId}`
  - 需要 `user:write:admin`；启停账号、角色绑定等操作必须有权限矩阵和审计记录。
- `GET /api/admin/roles`、`POST /api/admin/roles`、`PATCH /api/admin/roles/{roleId}`
  - 权限标识必须来自服务端白名单；禁止通过请求体扩展任意权限。

### 4.8 查询参数与错误语义

- `status` 只能取 `reading|finished`；`ownerId` 必须是合法资源 ID；`page`、`pageSize` 有明确范围；非法组合返回 `400 VALIDATION_ERROR`。
- `UNAUTHORIZED`：未建立有效会话；`FORBIDDEN`：已登录但无权限；`IDENTITY_CONFLICT`：账号标识冲突；`INVALID_CREDENTIALS`：凭据不正确；`NOT_FOUND`：资源不可见或不存在；`RATE_LIMITED`：触发限流。
- 破坏性变更必须递增契约版本或提供迁移说明，不允许静默改字段语义。
- 书籍/评论列表必须有上限和索引支持；本地基准数据集下书籍列表 API p95 目标小于 300 ms，正式阈值在部署环境确认后固化。
- 注册、会话、GitHub OAuth、评论和发布接口的限流阈值由安全 ADR 配置，不写死在前端。

## 5. 数据模型与设计方案

### 5.1 Monorepo 目录

```text
apps/
  web/                 # Vue 3 + Vite 公共站点、登录和管理路由
  api/                 # NestJS HTTP API、认证、书籍、评论、管理模块
packages/
  contracts/           # DTO/schema、状态、错误码、前后端共享类型
  config/              # 真实重复出现后再抽取的配置
docs/
  plans/               # 版本化实施计划
  contracts/           # RESTful API/数据契约
  adr/                 # 架构和安全决策记录
```

`apps/web` 不直接依赖 NestJS 内部模块或 MongoDB 模型；前后端通过 HTTP 契约和共享 schema 解耦。

### 5.2 集合与唯一索引

- `users`：`_id`、`username`、`normalizedUsername`、`email`/`normalizedEmail`（邮箱注册用户）、`gender`、`avatarUrl`、`signature`、`status`、角色引用、`createdAt`、`updatedAt`。
- `auth_identities`：`userId`、`provider`（`email`/`github`）、`providerSubject`、密码哈希（仅 email provider）、时间字段；唯一索引 `(provider, providerSubject)`。
- `books`：`_id`、`slug`（唯一）、`ownerId`（索引）、`title`、`author`、`coverUrl`、`status`、`visibility`、`summary`、`review`、时间字段；组合索引 `(ownerId, status, createdAt)` 和 `(visibility, status, createdAt)`。
- `comments`：`_id`、`bookId`（索引）、`authorId`（索引）、纯文本 `content`、`visibility`/删除标记、时间字段；公开查询按 `(bookId, visibility, createdAt)`。
- `sessions`：不可预测 session ID 的哈希、`userId`、过期时间 TTL、撤销时间和时间字段；不把明文 session secret 写日志。
- `roles`：角色名称、权限白名单、时间字段；权限集合不能由客户端任意扩展。

邮箱和用户名归一化规则必须在 ADR 固化。数据库唯一索引是最终一致性边界，业务层的“先查询再写入”不能替代它。

### 5.3 认证、授权与账号关联

后端使用认证 guard + 权限策略；普通用户资源操作还需 owner policy。GitHub OAuth 首次登录如果没有合法的系统用户名，进入一次性用户名设置流程；设置完成前不允许发布书籍或评论。已有邮箱用户若想关联 GitHub，必须在登录后显式执行关联操作并完成 OAuth state 校验。

邮箱注册采用邮箱 + 密码 + 唯一用户名；本版不做验证码和强制邮箱验证，但须防止登录枚举、暴力尝试和重复提交。用户名修改不改变历史资源的 `ownerId`，只改变展示名称。

### 5.4 前端路由与状态

- 公开：`/books`、`/books/:bookId`、评论读取。
- 认证：`/login`、`/register`、`/auth/github/callback`、`/profile`。
- 用户资源：`/my/books`、`/my/books/new`、`/my/books/:id/edit`、评论编辑入口。
- 管理：`/admin/books`、`/admin/users`、`/admin/roles`，由当前会话能力决定。

前端只负责路由体验和界面显示；每个写 API 都必须由后端重新认证、校验权限和所有权。

### 5.5 评论与 GitHub 集成边界

本版原生评论由 API 和 MongoDB 负责，满足“登录后才能评论”。GitHub OAuth 只作为登录身份提供方，不自动意味着评论存储在 GitHub。原始需求的 GitHub 评论集成需要另行选择 giscus、GitHub Discussions、utterances 或其他产品，并确认评论是否与原生评论并存；未确认前不将第三方 iframe/script 写入核心详情页，也不把第三方失败当作书籍详情失败。

## 6. 关键决策、备选方案与取舍

1. **RESTful 资源路径**：业务资源使用名词路径和 HTTP 方法，便于 OpenAPI、缓存、权限矩阵和客户端理解；OAuth 回调保留协议端点。备选是所有接口采用动作式路径，但会造成资源语义和方法语义重复。
2. **会话资源而非登录动作**：`POST /sessions` 创建会话、`DELETE /sessions/current` 撤销会话；比 `/login`、`/logout` 更符合资源生命周期。代价是 OAuth 浏览器协议仍需单独端点。
3. **原生评论优先**：直接满足登录评论和访客读评论；GitHub 外部评论作为后续适配器，避免邮箱注册用户无法自然评论。
4. **身份与用户资料拆分**：`auth_identities` 处理登录来源，`users` 处理可编辑资料；避免修改用户名时破坏 OAuth 唯一键。代价是增加关联查询和显式合并流程。
5. **邮箱/用户名双唯一**：方便用户登录，代价是必须明确定义归一化和冲突错误；最终以数据库唯一索引兜底。
6. **无验证码但保留限流**：符合当前需求，降低首版接入成本；风险是垃圾注册/评论增加，因此必须配置速率限制、日志和管理员禁用能力。
7. **创建即公开提案**：简化首版发布流程；代价是没有草稿审核。若需要发布前编辑/审核，应切换为 draft → published 状态机并新增契约和测试。
8. **头像先 URL 后上传**：避免在存储供应商未确定时锁死实现；代价是首版依赖外部头像 URL，需 CSP 和协议校验。

## 7. 依赖排序的实施步骤

所有步骤遵循“先写失败测试/契约，再实现，再运行验证”；执行 Agent 不得跳过失败测试，不得用快照替代行为断言。

1. **阶段 0.1：计划与 ADR**
   - 目标：`docs/adr/0001-stack-and-workspace.md`、认证安全 ADR、`docs/contracts/errors.md`、RESTful 资源/状态码/查询参数契约。
   - 固化：Node/pnpm/MongoDB 版本、环境变量、用户名归一化、密码策略、会话 Cookie、限流配置、OAuth 回调和唯一索引规则。
   - 无业务实现；先验证文档中的命令和环境变量缺失行为。
2. **阶段 0.2：Monorepo 基线**
   - 目标：根 `package.json`、`pnpm-workspace.yaml`、TypeScript/ESLint/测试配置、`apps/web`、`apps/api`、`packages/contracts`。
   - 测试：安装、类型检查、单元测试、API 健康检查、前端启动。
3. **阶段 1.1：书籍/评论公开 RESTful 契约与数据层**
   - 先在 `packages/contracts` 写非法状态、分页、公开 DTO、错误结构、HTTP 方法/状态码的失败测试。
   - 在 `apps/api/src/books`、`apps/api/src/comments` 增加 schema、索引、repository/service；实现只读公开集合/资源和嵌套评论集合接口。
   - 确认公开接口过滤 `visibility=published`，不暴露 owner 的敏感字段。
4. **阶段 1.2：公共站点**
   - 在 `apps/web/src` 实现书库、状态筛选、详情、评论读取和加载/空态/错误态。
   - 先写组件/路由行为测试，再实现键盘导航、响应式布局、封面失败和 `prefers-reduced-motion`。
5. **阶段 2.1：邮箱身份与个人资料**
   - 先写 `POST /users`、`POST /sessions`、`GET/PATCH /me`、`GET/DELETE /sessions/current` 的失败测试：重复邮箱/用户名、中文用户名、统一凭据错误、会话失效。
   - 在 `apps/api/src/auth`、`users`、`sessions` 实现；在 web 实现登录、注册和个人资料页面。
6. **阶段 2.2：GitHub OAuth**
   - 先写 OAuth state/回调失败、重复 provider subject、用户名选择、邮箱不自动合并和未完成身份不可发布的契约测试。
   - 实现 OAuth 协议端点、身份关联和前端登录流程；密钥和回调地址只来自环境变量。
7. **阶段 3.1：用户发布书籍**
   - 先写 `POST /books` 未认证、无 `ownerId`、状态非法、重复 slug、所有权越权和发布后公开读取测试。
   - 实现书籍资源创建、`GET /me/books`、`PATCH/DELETE /books/{id}` 所有者策略及书籍表单；创建即发布只在用户批准该提案后落地。
8. **阶段 3.2：原生评论写入与维护**
   - 先写嵌套 `POST /books/{id}/comments` 访客拒绝、认证用户创建、HTML 注入拒绝、作者/管理员修改删除、隐藏评论不公开、限流测试。
   - 实现评论表单、评论列表刷新、作者操作和后台可审计的隐藏/删除策略。
9. **阶段 4.1：管理后台**
   - 先写管理员/非管理员权限矩阵、`GET /admin/books?ownerId=&status=` 组合筛选、分页、空结果、禁用用户影响和敏感字段脱敏测试。
   - 实现 `apps/api/src/admin` 的书籍/用户/角色资源接口和 `apps/web/src/features/admin` 页面；后台过滤不能只在前端执行。
10. **阶段 5.1：GitHub 外部评论评估**
    - 先记录产品选择 ADR；若批准接入，定义独立适配器、配置、CSP、隐私文案、禁用和第三方失败降级测试。
    - 若不批准，保留原生评论，不创建无效第三方占位代码。
11. **阶段 5.2：发布准备**
    - 补充 Docker/部署配置（目标确认后）、备份/恢复、迁移、日志脱敏、健康检查、限流告警、CI、发布和回滚清单。

当前无旧实现、兼容别名或迁移调用方；阶段 0 后若出现临时脚手架，必须在对应验收前删除，不保留空壳 endpoint、mock fallback 或 TODO 实现。

## 8. TDD 测试矩阵

| 领域 | 先写的失败测试 | 正常路径 | 边界/错误/回归 | 通过标准 |
|---|---|---|---|---|
| RESTful 契约 | 动作式路径、错误方法、错误状态码、无上限列表被拒绝 | 资源路径、HTTP 方法、状态码和 Location 符合契约 | 重复 POST、PATCH 幂等边界、DELETE 重复调用、错误结构 | OpenAPI/schema 与实现一致 |
| 工程基线 | 缺少环境变量、数据库不可用、命令未配置时失败 | 安装、类型检查、测试、启动成功 | 测试配置不读取生产数据库 | 根命令可重复执行，失败有明确退出码 |
| 身份唯一性 | 中文用户名、重复归一化用户名、重复邮箱/provider subject 被拒绝 | ASCII 用户名和邮箱注册成功 | 大小写、前后空格、并发注册、GitHub 无邮箱 | schema、唯一索引和 API 错误一致 |
| 邮箱会话 | 错误凭据、未登录 current session、无效会话失败 | 创建用户→创建 session→读取 current→删除 session | 不枚举账号、密码不进日志、限流、禁用用户 | REST 状态码和错误码稳定 |
| GitHub OAuth | state 错误、回调重复、provider 冲突、用户名不合法失败 | 新用户选择用户名并登录，老用户复用身份 | 邮箱相同不自动合并、OAuth 取消、secret 缺失 | 身份关联可审计且不可越权 |
| 个人资料 | 未登录修改失败、非法用户名/头像/控制字符失败 | 修改用户名、性别、头像、签名并读取 | 重名、空值、长度上限、历史 ownerId 不变 | 只允许资料字段，服务端字段不可篡改 |
| 书籍契约 | 缺 title/status/owner、非法 status/slug 被拒绝 | 合法资源解析、创建即公开（若批准） | 重复 slug、长文本、未知字段、并发更新 | DTO、HTTP 语义与数据库约束一致 |
| 公开书籍 | 未实现集合/资源路由时失败 | 访客读取 published 列表/详情、reading/finished 筛选 | 草稿/隐藏统一 404、空结果、DB 错误脱敏 | 未登录不能读取隐藏资源或写入 |
| 书籍所有权 | 客户端伪造 ownerId、非所有者更新/删除失败 | 所有者维护自己的书籍 | 管理员操作、禁用用户、并发更新 | 后端 session identity + policy 生效 |
| 原生评论 | 访客 POST、空文本、HTML 注入失败 | 认证用户发表评论，访客读取 | 隐藏/删除、作者与管理员权限、分页、限流 | 评论与公开书籍绑定，敏感资料不泄露 |
| 管理书籍 | 无权限、非法 ownerId/status、越权筛选失败 | 管理员列表、按作者+状态组合筛选 | 空结果、分页上限、索引查询、脱敏 | 服务端过滤有效，不依赖前端筛选 |
| 管理用户/RBAC | 非管理员访问、未知权限、危险角色变更失败 | 管理员查看用户、启停账号、角色权限 | 最后管理员保护（确认后）、审计、禁用立即生效 | 权限矩阵逐项通过 |
| 公共 UI | loading/error/empty/404 状态测试先失败 | 卡片、详情、评论、筛选、登录后操作 | 键盘焦点、移动宽度、减少动画、封面失败 | 主要用户流程可观察且可访问 |
| GitHub 外部适配器 | 未配置/脚本失败时安全降级失败 | 仅批准方案正确渲染 | CSP、隐私、禁用、第三方不可用 | 原生书籍/评论不被第三方阻断 |
| 契约回归 | schema/OpenAPI 与实现不一致时失败 | web/api 共享契约通过 | 破坏性变更需版本/迁移说明 | CI 阻止契约漂移和类型错误 |

永久测试只断言消费者可观察行为、边界、状态转换和安全不变量；不测试对象复制、按钮数量、源码文本、mock 回声或单纯“不抛异常”。

## 9. 验收标准

### 9.1 阶段 0

- 从干净工作树执行安装、类型检查、测试和启动命令，结果确定且可重复。
- API 健康检查能区分服务可用与数据库不可用；敏感配置缺失时启动失败且消息可操作。
- `packages/contracts` 被 web 与 api 共同引用，至少包含身份错误、书籍状态、评论输入、分页、HTTP 方法和状态码约束。

### 9.2 阶段 1：访客读取

- 未登录用户可以查看已发布书籍卡片、详情和公开评论。
- 访客可按 `reading`/`finished` 查看书籍；不存在、未发布或隐藏书籍不会通过差异化错误泄露。
- 访客不能成功调用 `POST /api/books` 或 `POST /api/books/{id}/comments`；API 不依赖前端隐藏按钮保护。
- 加载、空数据、网络错误、404、封面失败均有明确界面；键盘、移动端和减少动画设置下主要浏览流程仍可用。

### 9.3 阶段 2：认证和资料

- 用户可使用邮箱 + 密码通过 `POST /api/users` 注册并通过 `POST /api/sessions` 登录；重复邮箱/用户名被拒绝；中文用户名被拒绝；无验证码流程不会被误实现成验证码依赖。
- 用户可使用 GitHub OAuth 登录；首次登录能完成合法唯一用户名设置；相同邮箱不会静默合并已有账号。
- 登录用户可修改用户名、性别、头像和签名；修改后公开资料按契约更新，历史书籍归属不改变。
- `DELETE /api/sessions/current` 后，受保护页面和写 API 均不可访问。

### 9.4 阶段 3：发布和评论

- 登录用户能通过 `POST /api/books` 发布书籍，服务端记录其 `ownerId`；请求体不能伪造归属。
- 认证用户能通过嵌套评论资源发表评论，访客可通过 `GET` 读取；评论纯文本，非法/注入内容和超限内容被拒绝。
- 普通用户不能修改其他用户的书籍或评论；所有者和管理员权限按批准契约生效。
- 无 CAPTCHA 仍有注册/会话/发布/评论限流，触发时返回稳定 `429 RATE_LIMITED`。

### 9.5 阶段 4：管理后台

- 管理员可看到书籍列表和用户列表；非管理员不能通过直接 HTTP 请求访问。
- 管理员可通过 `GET /api/admin/books?ownerId=&status=` 按发布用户、`reading`、`finished` 单独或组合筛选书籍；分页、空结果和错误状态可观察。
- 管理响应不包含密码哈希、OAuth secret、会话 secret 或未授权的敏感字段。
- 后台权限变更、账号禁用和资源操作有审计证据；禁用账号不能继续创建书籍/评论。

### 9.6 阶段 5：发布

- CI 执行 RESTful 契约、单元、集成、前端行为、类型检查和 lint；契约漂移失败。
- 完成密钥、CORS/CSP、Cookie、限流、日志脱敏、索引、备份恢复、迁移、健康检查和回滚检查。
- 运行真实本地端到端 smoke：访客浏览 → 注册或 GitHub 登录 → 修改资料 → 发布书籍 → 发表评论 → 管理员按作者/状态筛选 → 删除 session → 越权请求被拒绝。
- GitHub 外部评论若未批准/未配置，原生评论和书籍详情仍完整可用；若批准接入，第三方失败不阻断核心页面。

## 10. 风险、回滚、发布检查与未决问题

### 10.1 风险

- 无验证码/邮箱验证会提高垃圾注册、暴力破解和垃圾评论风险；必须以限流、账号禁用、日志审计和纯文本约束缓解。
- GitHub OAuth 与邮箱身份关联错误可能造成账号接管；禁止按同邮箱静默合并，OAuth state/PKCE 和显式关联是门槛。
- “中文注册”只明确禁止中文用户名，邮箱/签名/书评是否允许中文是不同规则；实现不能把限制扩大到全部内容。
- 创建即公开没有审核窗口；若需要草稿或管理员审核，必须切换状态机，不得用隐藏字段临时拼接。
- 头像 URL 外链可能造成跟踪、CSP 或内容安全问题；上传/来源规则需单独 ADR。
- 原生评论与 GitHub 评论产品职责可能重叠；必须在外部集成前明确数据归属、审核、删除和隐私。
- RESTful 约束若未形成共享契约，容易出现路径、方法和状态码漂移；必须由契约测试和 OpenAPI 检查阻止。

### 10.2 回滚策略

- 每阶段使用可独立运行的提交；破坏性 API 变更先版本化契约。
- 数据库变更先备份并在测试库回放；唯一索引、回填和状态迁移必须有可重复执行或明确不可逆说明。
- 发布失败优先回滚应用版本；仅在 schema 向后兼容且已验证时回滚数据库 schema。
- 评论外部集成可通过配置关闭，不得阻断原生书籍/评论核心功能。
- 禁止使用无审计的生产数据删除作为回滚手段。

### 10.3 发布检查

契约版本、RESTful 路径/方法/状态码、环境变量、OAuth 回调、密钥来源、Cookie 属性、CORS/CSP、限流、日志脱敏、用户名/邮箱索引、评论/书籍索引、备份恢复、健康检查、监控告警、迁移记录、回滚命令和真实 smoke 均必须有证据；未验证项不得标记完成。

### 10.4 最小未决问题

以下问题不会阻止 v1.2 执行，但会阻止对应实现阶段的最终契约冻结；如果用户未明确，执行前必须采用默认提案并记录 ADR，不能悄悄扩大规则：

1. **评论含义**：本版默认“评论”是系统原生评论；此前 GitHub 评论为可选外部集成。是否接受两者分离，还是只需要 GitHub 评论。
2. **用户名格式**：本版提案为 3–32 个 ASCII 字符，首字符字母/数字/下划线，后续允许 `-`；是否需要调整长度或符号。
3. **邮箱验证与密码找回**：当前默认都不做；是否接受邮箱 + 密码无验证注册，还是仅暂不做验证码但需要验证邮件。
4. **书籍生命周期**：本版默认创建即发布，普通用户可维护自己的书籍；是否需要草稿、管理员审核、软删除或禁止用户修改已发布书籍。
5. **评论管理**：本版提案为作者可维护、管理员可隐藏/删除；是否需要举报、审核队列、嵌套回复或点赞。
6. **账号登录标识**：本版支持邮箱或用户名登录；是否只允许邮箱登录。
7. **GitHub OAuth 资料**：GitHub 首次登录无合法 ASCII 用户名时，是否接受一次性选择系统用户名。
8. **管理员初始化**：首个管理员通过 CLI 一次性创建、环境变量初始化还是人工导入。
9. **部署与资源**：目标平台、MongoDB 托管、头像存储、域名、备份保留周期和隐私说明。

## 11. 版本记录与批准规则

| 版本 | 状态 | 变更 | 依据 |
|---|---|---|---|
| v1.0 | 已废止 | 空仓库基线的公开书库、认证授权、管理后台和 GitHub 评论规划 | HSQL-6 初始需求 |
| v1.1 | 已废止 | 增加原生评论登录门槛、邮箱/GitHub 双登录、唯一 ASCII 用户名、个人资料、用户发布与所有权、后台作者/状态筛选；拆分原生评论和 GitHub 外部集成边界 | HSQL-6 追加需求 |
| v1.2 | 已批准 | 在 v1.1 基础上统一 RESTful 资源路径、HTTP 方法、状态码、查询过滤和契约测试；数据库环境问题仅作会话讨论，不纳入方案文档 | HSQL-6 最新需求与用户批准执行指令 |

**批准记录**：用户在 HSQL-6 会话中明确要求“先做前面几个阶段”“让项目先开发起来”“开始创建多个任务，按顺序派发给专项开发小队”；该消息作为 v1.2 执行批准依据。前置未决项仍须在对应实现阶段冻结，不得扩大范围。

**执行规则**：v1.2 已批准，专项执行工程师可以按本版本先测试后实现；独立代码审查师必须在实现完成后进行只读审查。用户若修改范围、契约、状态机、身份规则或阶段顺序，必须生成 v1.3（或更高版本），记录变更并废止 v1.2；在 v1.3 获得批准前，不执行受影响的变更。
