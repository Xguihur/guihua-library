# RESTful HTTP 契约

- **契约版本**：v1
- **依据**：[项目总览](../PROJECT.md)
- **状态**：初稿；M1 共享包和后续实现必须以此为边界，通过 schema/契约测试冻结细节

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

统一站内 userId，邮箱密码与 GitHub subject 都指向同一用户，不按邮箱静默合并。精确规则见 [ADR 0002](../adr/0002-account-and-session.md) 与 [M2 规格](../specs/M2.md)。

| 方法 | 路径 | 认证 | 输入 | 成功 |
|---|---|---|---|---|
| `POST` | `/api/users` | 否 | 严格 `{email, username, password}` | `201 UserPublic`，设置 `guihua_session` Cookie 并自动创建会话 |
| `POST` | `/api/sessions` | 否 | 严格 `{identifier, password}` | `201 SessionCurrent`，设置新 Cookie 并撤销旧 token |
| `GET` | `/api/sessions/current` | 是 | 无 | `200 SessionCurrent`；缺失/过期/撤销/禁用均 `401 UNAUTHORIZED` |
| `DELETE` | `/api/sessions/current` | 否/幂等 | 无业务字段 | `204`，无响应体；撤销当前会话并清 Cookie，无会话仍 `204` |
| `GET` | `/api/me` | 是 | 无 | `200 UserPublic` |
| `PATCH` | `/api/me` | 是 | `username/gender/avatarUrl/signature` 的非空子集 | `200` 更新后的 `UserPublic` |
| `GET` | `/api/oauth/github/authorization` | 否 | 无 | 重定向；生成并保存 state/PKCE（M2c） |
| `GET` | `/api/oauth/github/callback` | 否 | `code/state` | 校验后跳转站内并清除查询串（M2c） |

**精确 DTO**（运行时 schema、共享类型和 HTTP 断言保持一致）：
- `UserPublic` = `{id, username, gender, avatarUrl, signature, createdAt}`；`id` 为字符串，`createdAt` 为 ISO 时间。公共作者投影保持 M1 的 `{id, username, avatarUrl}`，不自动扩大。
- `SessionCurrent` = `{user: UserPublic, roles: string[], permissions: string[], expiresAt: string}`；角色/权限只在认证响应出现，M2 有效权限为 `[]`。不得包含 session token/摘要、邮箱、密码哈希、OAuth subject/token 或内部字段。

注册用户名 `trim` 后须匹配 `^[A-Za-z][A-Za-z0-9_]{2,31}$`；非法固定 `400 INVALID_USERNAME`，中文名被拒；唯一键为 ASCII 小写 `usernameNormalized`，登录大小写不敏感。邮箱 `trim` 后整体小写、合法格式且 ≤254 字符，不做去点/去加号。密码 12–128 个 Unicode 码点且 UTF-8 ≤512 字节，不 trim/截断/归一化。重复归一化用户名或邮箱返回 `409 IDENTITY_CONFLICT`（由唯一索引与重复键映射最终保证，并发注册仅一个成功）；错误凭据统一 `401 INVALID_CREDENTIALS`，不区分不存在/密码错/禁用/无本地密码，不存在账号也做等价哈希工作。不接受客户端角色，新用户固定普通 `user`。

**请求防护与会话边界**：
- 浏览器 JSON 写请求（含注册/登录/退出/PATCH）要求配置的精确 `Origin` 白名单和 `application/json`：恶意/缺失/`null` Origin `403 FORBIDDEN`，错误 Content-Type `400 VALIDATION_ERROR`。默认不开跨源凭据 CORS；OAuth GET 回调按 state/PKCE 单独保护。
- Cookie `guihua_session`：HttpOnly、SameSite=Lax、Path=/、无 Domain、Max-Age 与 7 天服务端期限一致；生产强制 Secure，本地 HTTP 允许非 Secure；清除时属性匹配。token 至少 32 字节随机，库里只存 SHA-256 摘要、userId、createdAt、expiresAt；TTL 仅用于清理，鉴权必须显式检查到期。不在 localStorage、URL 或响应 DTO 放 token。
- 限流（单实例有界内存、重启重置、多实例不共享）：注册每 IP 15 分钟 5 次；登录每 IP 15 分钟 30 次且每归一化 identifier 15 分钟 10 次；OAuth 每 IP 15 分钟 20 次。超限 `429 RATE_LIMITED` 带 `Retry-After`。计数器容量硬上限 1024 个不同 key：只淘汰已过期桶，全部仍活跃时对新增 key 直接返回 429（失败关闭），绝不驱逐活跃条目来绕过限流。登录的 IP 计数在严格白名单校验之前完成，未知字段等被拒请求同样计入。
- 资料写入：`signature` 最长 200 个 Unicode 码点（按码点而非 UTF-16 单元计），拒绝 C0 控制字符（允许换行与制表符）和 DEL，按纯文本渲染；`avatarUrl` 为 null 或 ≤2048 字符的 HTTPS 绝对 URL，禁止 userinfo/控制字符，前端以 `no-referrer` 加载并在失败时显示占位，服务端不抓取、不上传。`gender` 仅接受 `unspecified|male|female|other`；空对象与未知字段 `400 VALIDATION_ERROR`，归一化用户名冲突 `409 IDENTITY_CONFLICT`。

**事务与隔离**：用户/身份/挑战/凭据变更用 MongoDB 事务保持一致；dev 与 test 分别是独立单节点 replica set（不同容器、端口、卷与 replSetName），不假设 standalone 支持事务；外部发信/换 token 不放入长事务。迁移与回滚限制见 ADR 0002 §7。

### 登录方式管理（批次 E 已实现本地验证；真实 GitHub 外部流程阻塞）

统一站内 userId，GitHub 可直接注册登录，也可绑定已登录账号；首次 GitHub 登录自动生成合法唯一用户名，可在资料中修改。不根据邮箱自动合并用户，账号合并不在范围内。精确流程与安全规则见 [M2 §6](../specs/M2.md)。

| 方法 | 路径 | 认证/输入 | 成功 |
|---|---|---|---|
| GET | `/api/me/login-methods` | 当前会话 | 200，本人登录方式与本地邮箱状态 |
| POST | `/api/me/identities/github/authorizations` | 会话、近期复核；空 JSON | 201 `{authorizationUrl}`，绑定目的由服务端绑定到原会话 |
| DELETE | `/api/me/identities/github` | 会话、近期复核；保留已验证邮箱密码方式 | 204；最后方式返回 409 LAST_LOGIN_METHOD |
| POST | `/api/sessions/current/reauthentications` | 会话；`{password}` | 204，记录会话绑定的近期复核 |
| POST | `/api/sessions/current/github/authorizations` | 会话；空 JSON | 201 `{authorizationUrl}`，回调仅接受当前账号已绑定的 subject |
| POST | `/api/me/password-credentials/verifications` | 会话、近期复核；`{email}` | 202 固定消息，邮件发送验证链接 |
| POST | `/api/me/password-credentials` | 会话、近期复核；`{token,password}`，已存在本地密码且仅验证原邮箱时为 `{token}` | 204，原子消费挑战并添加凭据或标记原邮箱 verified |

邮箱密码注册不强制验证；GitHub 用户添加密码方式必须验证邮箱。已存在邮箱密码时，只能验证原邮箱，不更换邮箱或覆盖密码。OAuth login/link/reauth 共享既有 callback，purpose、userId、原 session 由服务端 state 记录决定，不能由客户端覆盖。绑定冲突 409 IDENTITY_CONFLICT；复核缺失/过期 403 FORBIDDEN；无效验证挑战 400 VALIDATION_ERROR。身份方式变更后撤销其他会话并轮换当前 Cookie，公共 DTO 不暴露登录方式或邮箱。

批次 E 已按本节实现上述端点并通过本地真实 HTTP/数据库与 Mailpit 实投验证（见 [M2 §9](../specs/M2.md)）。浏览器回调默认 302 到固定结果页并清除 code/state 查询串；带 `Accept: application/json` 的回调返回契约错误状态（绑定冲突 409）。真实 GitHub 授权/重新登录与生产 SMTP 投递仍未验证，不能据此宣称外部流程可用。

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

## M1 实现状态（2026-11-15）

M1 只实现公开读取与健康检查；账号、发布、管理资源仍未实现。以下为已落地行为，与上文字段/状态码约定一致。

| 方法 | 路径 | 已实现行为 |
|---|---|---|
| `GET` | `/api/books` | 仅 `visibility=published`；`status=reading\|finished` 可选；`page` 默认 1，`pageSize` 默认 20、上限 100；排序 `createdAt` 降序 + `_id` 降序；越界页返回空 `items` 与真实 `total` |
| `GET` | `/api/books/:bookId` | 公开详情（含 `review`）；非 24 位十六进制 id → `400 VALIDATION_ERROR`；不存在与 `hidden` 均 `404 NOT_FOUND` 且消息一致 |
| `GET` | `/api/books/:bookId/comments` | 先校验父书籍公开性，隐藏/不存在 404；仅返回 `visibility=published` 评论；分页与排序规则同上 |
| `POST` | `/api/books`、`/api/books/:bookId/comments` | M1 无会话，固定 `401 UNAUTHORIZED`，不创建数据 |
| `GET` | `/api/health/live` | `200 {"status":"ok"}` |
| `GET` | `/api/health/ready` | DB ping 成功 `200`；不可用 `503 SERVICE_UNAVAILABLE`，不回显连接信息 |

补充约束：

- 查询参数严格校验：未知参数、重复参数、非十进制正整数、`pageSize > 100`、非法 `status`、超出 `Number.MAX_SAFE_INTEGER` 的 `page`，以及 `(page - 1) * pageSize` 溢出安全整数，一律 `400 VALIDATION_ERROR`，`details` 给出 `field` 与 `reason`（分页越界为 `{field:"page",reason:"out_of_range"}`）。
- 列表 DTO：`id,slug,title,author,coverUrl,status,summary,owner,createdAt,updatedAt`；详情增加 `review`；评论 DTO：`id,bookId,content,author,createdAt,updatedAt`。`owner`/`author` 仅 `id,username,avatarUrl`，日期为 ISO 字符串，`coverUrl` 仅接受 http(s)，否则输出 `null`。
- 统一错误体 `{error:{code,message,details,requestId}}`；`requestId` 同时写入 `x-request-id` 响应头。
- 索引：`books_slug_unique(slug)`、`books_public_list(visibility,status,createdAt,_id)`、`books_owner_recent(ownerId,createdAt)`、`comments_public_list(bookId,visibility,createdAt,_id)`。
- 浏览器只请求同源 `/api`，由 Vite 代理到本地 API，不启用全域 CORS。

尚未实现（按里程碑）：书籍/评论写入与维护、`/api/comments/{commentId}`、`/api/admin/*`。注册、登录、当前会话、退出、`GET`/`PATCH /api/me` 已在 M2a/M2b 实现并有真实 HTTP 与浏览器证据；M2c 的 GitHub/登录方式/邮件验证端点已在批次 E 实现并以真实 HTTP/数据库与 Mailpit 实投验证（真实 GitHub 外部流程仍阻塞）。

## 非目标与冻结门槛

本契约包含 M2 为添加密码/安全解绑提供的邮箱归属验证，不加入密码找回、邮箱变更、验证码、富文本评论、嵌套评论、点赞或未批准的 GitHub 外部评论嵌入。GitHub OAuth 是身份提供方，不等于 GitHub 评论存储；外部评论产品必须另行 ADR。删除/软删除、草稿审核、头像来源、管理员初始化、精确用户名正则和 `400`/`422` 细分在对应实现前必须形成决策和测试，不能静默改变本契约。
