# RESTful 错误语义

- **契约版本**：v1
- **适用范围**：`/api` 业务资源
- **状态**：与 [项目总览](../PROJECT.md) 一致；实现阶段必须通过共享 schema 和契约测试固化

## 响应结构

所有 JSON 错误使用同一顶层结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "可展示给客户端的稳定消息",
    "details": [
      { "field": "username", "reason": "contains_disallowed_characters" }
    ],
    "requestId": "request-id"
  }
}
```

- `code` 是机器可读、稳定的错误码。
- `message` 是可展示消息，不得泄露数据库、认证供应商或内部堆栈细节。
- `details` 可为空；只提供消费者需要的字段和原因，不回显密码、token 或 secret。
- `requestId` 用于日志关联；不能包含会话 secret。
- 生产响应不得包含堆栈、MongoDB 原始错误、密码、OAuth token、OAuth secret、数据库 URI 或会话密钥。

## 错误码与 HTTP 状态

| 错误码 | HTTP | 语义 |
|---|---:|---|
| `VALIDATION_ERROR` | `400` | 请求语法、字段格式、未知字段、分页或查询参数不符合契约 |
| `INVALID_USERNAME` | `400` | 注册或 `PATCH /api/me` 时用户名在 `trim` 后不匹配 `^[A-Za-z][A-Za-z0-9_]{2,31}$`，返回 `INVALID_USERNAME`，`details` 为 `{field:"username",reason:"invalid_username"}`；不得静默退回 `VALIDATION_ERROR`。400/422 已由 [ADR 0002](../adr/0002-account-and-session.md) 冻结为 400，不得随机切换 |
| `UNAUTHORIZED` | `401` | 没有有效会话或受保护资源的认证已失效 |
| `INVALID_CREDENTIALS` | `401` | 登录凭据不正确；不得区分账号不存在、邮箱未注册或密码错误 |
| `FORBIDDEN` | `403` | 已认证，但不具备所需角色、权限或资源所有权 |
| `NOT_FOUND` | `404` | 资源不存在、不可见或被隐藏；公开接口不得据此枚举隐藏资源 |
| `IDENTITY_CONFLICT` | `409` | 用户名、归一化邮箱、slug 或 OAuth provider subject 已存在 |
| `LAST_LOGIN_METHOD` | `409` | 解绑会使账号失去最后一种可用登录方式；必须先建立并验证备用方式。状态已由 [ADR 0002](../adr/0002-account-and-session.md) 冻结 |
| `RATE_LIMITED` | `429` | 触发注册、会话、OAuth、发布或评论限流 |
| `UNPROCESSABLE_ENTITY` | `422` | 语法合法，但业务规则不满足；具体资源是否采用 400 或 422 必须在实现前固定，不能随机切换 |
| `INTERNAL_ERROR` | `500` | 未预期服务端错误；客户端只接收稳定消息，详细原因仅进脱敏日志 |
| `SERVICE_UNAVAILABLE` | `503` | 依赖暂不可用，例如数据库健康检查失败；不返回依赖原始错误 |

`409` 专用于唯一性冲突。`401` 和 `403` 不得互换：前者表示没有有效身份，后者表示身份存在但无权操作。删除当前会话是幂等操作，没有会话时仍返回 `204`，不返回 `401`。

- `INVALID_USERNAME`（固定 `400`）与 `UNPROCESSABLE_ENTITY`（仅语法合法但业务规则不满足的资源使用）的细分已由 [ADR 0002](../adr/0002-account-and-session.md) 冻结：非法用户名一律 400 + `INVALID_USERNAME`，不静默并入 `VALIDATION_ERROR`；`UNPROCESSABLE_ENTITY` 不在 M2a 使用，后续资源启用时须在实现前固定。状态机不得按请求随机切换。本表错误码同步到共享 contracts、`docs/contracts/restful-api.md`、测试与任务验收记录。

## 资源规则

- `GET`：只读、可安全重试。
- `POST`：创建集合成员，成功返回 `201 Created`；必要时返回 `Location`。
- `PATCH`：局部更新，成功返回更新后的资源 DTO 和 `200 OK`。
- `PUT`：只在明确需要完整替换时使用，不能用来伪装局部更新。
- `DELETE`：删除或契约定义的软删除，成功返回 `204 No Content`。
- 列表统一使用从 `1` 开始的 `page`，`pageSize` 有服务端最大值；非法值返回 `400 VALIDATION_ERROR`。
- 书籍公开筛选的 `status` 只能是 `reading` 或 `finished`；`ownerId` 只能是合法资源 ID。

## 安全与可观察性

错误消息不能暴露用户是否存在、隐藏书籍是否存在、密码是否正确、OAuth 身份详情或数据库结构。服务端应记录 `requestId`、错误分类和必要的审计字段，但必须脱敏。所有错误码和字段变更都要同步 `docs/contracts/restful-api.md`、共享 contracts、测试和任务验收记录。
