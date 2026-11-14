# RESTful HTTP 契约

- **契约版本**：v1.2
- **依据**：`docs/plans/SDD-PLAN-v1.2.md`
- **状态**：初稿；阶段 0.2 共享包和后续实现必须以此为边界，通过 schema/契约测试冻结细节

## 通用约定

- Base URL：`/api`。
- 请求和成功响应使用 JSON UTF-8；成功响应返回明确的公开/管理 DTO，不直接返回 Mongoose 文档。
- 业务资源使用复数名词：`books`、`comments`、`users`、`sessions`、`roles`。禁止 `/getBooks`、`/createBook`、`/updateUser` 等动作式业务路径。
- `GET` 只读；`POST` 创建集合成员；`PATCH` 局部更新；`PUT` 仅在完整替换确有必要时启用；`DELETE` 删除或软删除。
- 列表响应形状为 `{ items, page, pageSize, total }`；`page` 从 `1` 开始，`pageSize` 由服务端限制最大值。
- 统一错误结构见 [`errors.md`](errors.md)。生产响应不得泄露堆栈、数据库错误、密码、OAuth token 或 secret。
- 除 OAuth 协议授权/回调端点外，不新增动作式 URL。

## 资源清单

### 认证与会话

| 方法 | 路径 | 认证 | 成功 | 说明 |
|---|---|---|---:|---|
| `POST` | `/api/users` | 否 | `201` | 邮箱注册；输入 `email`、`password`、`username`；创建会话并返回 `UserPublic` |
| `POST` | `/api/sessions` | 否 | `201` | 使用邮箱或用户名 + 密码创建会话；凭证通过批准的 HttpOnly Cookie 建立 |
| `GET` | `/api/sessions/current` | 是 | `200` | 返回当前会话和非敏感用户资料、角色及有效权限 |
| `DELETE` | `/api/sessions/current` | 否/幂等 | `204` | 撤销当前会话；无会话时仍为 `204` |
| `GET` | `/api/oauth/github/authorization` | 否 | 重定向 | OAuth 协议入口；生成并保存 state/PKCE |
| `GET` | `/api/oauth/github/callback` | 否 | 重定向/协议结果 | 校验 state/PKCE；已有 provider subject 登录，新用户进入唯一用户名设置流程 |

注册用户名必须是合法 ASCII 标识且唯一；中文用户名被拒绝。重复邮箱、用户名或 provider subject 返回 `409 IDENTITY_CONFLICT`。错误凭据统一返回 `401 INVALID_CREDENTIALS`，不得进行账号枚举。GitHub 邮箱与既有邮箱账号不得静默合并；显式关联必须由已登录用户发起。

### 当前用户

| 方法 | 路径 | 认证 | 成功 | 说明 |
|---|---|---|---:|---|
| `GET` | `/api/me` | 是 | `200` | 返回 `UserPublic`：id、username、gender、avatarUrl、signature、公开创建时间 |
| `PATCH` | `/api/me` | 是 | `200` | 仅更新 username、gender、avatarUrl、signature |
| `GET` | `/api/me/books` | 是 | `200` | 使用 `status=reading|finished&page=1&pageSize=20` 查询当前用户书籍 |

`PATCH /api/me` 不接受 `id`、`email`、`roles`、`ownerId`、密码哈希或其他服务端字段。用户名重新执行 ASCII、长度和唯一性校验；头像 URL、签名和性别执行批准的长度/协议/控制字符规则。

### 公开书籍

| 方法 | 路径 | 认证 | 成功 | 说明 |
|---|---|---|---:|---|
| `GET` | `/api/books` | 否 | `200` | 仅返回 `visibility=published`；支持 `status=reading|finished` 和分页 |
| `GET` | `/api/books/{bookId}` | 否 | `200` | 返回公开详情、发布者公开资料和评论入口信息 |
| `GET` | `/api/books/{bookId}/comments` | 否 | `200` | 仅返回已发布书籍的公开原生评论；支持分页 |

不存在、未发布或不可见的书籍统一返回 `404 NOT_FOUND`，不得通过差异化消息泄露资源存在性。公开 DTO 不含邮箱、密码哈希、OAuth subject、角色内部字段或会话 secret。

### 登录用户书籍与评论

| 方法 | 路径 | 认证/权限 | 成功 | 说明 |
|---|---|---|---:|---|
| `POST` | `/api/books` | `book:create` | `201` | 创建书籍；请求体不得带 `ownerId`，服务端从会话取得；当前提案为创建即 published |
| `PATCH` | `/api/books/{bookId}` | 所有者或管理员 | `200` | 局部更新；普通用户不能改变 ownerId、受保护 visibility 或审计字段 |
| `DELETE` | `/api/books/{bookId}` | 所有者或管理员 | `204` | 删除策略待最终 ADR；在确认前不提供不可恢复物理删除 |
| `POST` | `/api/books/{bookId}/comments` | `comment:create` | `201` | 创建纯文本评论；请求体仅含 content，不含 authorId 或审核状态 |
| `GET` | `/api/comments/{commentId}` | 按公开性 | `200` | 隐藏评论不得被普通访客按 ID 读取 |
| `PATCH` | `/api/comments/{commentId}` | 作者或管理员 | `200` | 更新评论；仍须经过纯文本校验 |
| `DELETE` | `/api/comments/{commentId}` | 作者或管理员 | `204` | 删除/软删除按最终契约处理 |

未认证写入统一 `401 UNAUTHORIZED`；已认证但非所有者且无管理员权限统一 `403 FORBIDDEN`。评论只能关联存在且公开的书籍，隐藏/删除评论不出现在公开列表。

### 管理资源

| 方法 | 路径 | 权限 | 成功 | 说明 |
|---|---|---|---:|---|
| `GET` | `/api/admin/books` | `book:read:admin` | `200` | 支持 `ownerId` 与 `status=reading|finished` 组合筛选、分页、白名单排序；服务端执行过滤 |
| `GET` | `/api/admin/users` | `user:read:admin` | `200` | 返回按权限脱敏的用户列表；不返回密码哈希 |
| `PATCH` | `/api/admin/users/{userId}` | `user:write:admin` | `200` | 启停账号、角色绑定等操作；必须审计 |
| `GET` | `/api/admin/roles` | 管理权限 | `200` | 返回角色及服务端白名单权限 |
| `POST` | `/api/admin/roles` | 管理权限 | `201` | 创建角色；权限只能来自服务端白名单 |
| `PATCH` | `/api/admin/roles/{roleId}` | 管理权限 | `200` | 更新角色；危险变更须按权限矩阵和审计规则处理 |

普通用户直接请求管理资源返回 `403 FORBIDDEN`。管理响应不得返回密码哈希、OAuth secret、会话 secret 或未授权敏感字段。

## 状态码约定

| 场景 | 状态 |
|---|---:|
| 创建资源 | `201 Created`，返回资源 DTO，可带 `Location` |
| 读取集合/资源 | `200 OK` |
| 局部更新 | `200 OK`，返回更新后 DTO |
| 删除或软删除 | `204 No Content` |
| 请求格式/查询参数错误 | `400 VALIDATION_ERROR` |
| 未认证 | `401 UNAUTHORIZED` 或 `INVALID_CREDENTIALS` |
| 无权限/非所有者 | `403 FORBIDDEN` |
| 不存在或不可见 | `404 NOT_FOUND` |
| 唯一性冲突 | `409 IDENTITY_CONFLICT` 或资源对应冲突码 |
| 业务规则不满足 | `422 UNPROCESSABLE_ENTITY`，是否采用需在实现 ADR 固化 |
| 超过限流 | `429 RATE_LIMITED` |

## 非目标与冻结门槛

本契约不加入密码找回、邮箱变更、验证码、富文本评论、嵌套评论、点赞或未批准的 GitHub 外部评论嵌入。GitHub OAuth 是身份提供方，不等于 GitHub 评论存储；外部评论产品必须另行 ADR。删除/软删除、草稿审核、头像来源、管理员初始化、精确用户名正则和 `400`/`422` 细分在对应实现前必须形成决策和测试，不能静默改变本契约。
