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
| `INVALID_USERNAME` | `400` 或 `422` | 注册或用户名变更时用户名不满足 ASCII、长度或中文禁用规则，返回 `INVALID_USERNAME`，不得静默退回 `VALIDATION_ERROR`；具体采用 400 还是 422 必须在认证实现前由 ADR 冻结，不能随机切换 |
| `UNAUTHORIZED` | `401` | 没有有效会话或受保护资源的认证已失效 |
| `INVALID_CREDENTIALS` | `401` | 登录凭据不正确；不得区分账号不存在、邮箱未注册或密码错误 |
| `FORBIDDEN` | `403` | 已认证，但不具备所需角色、权限或资源所有权 |
| `NOT_FOUND` | `404` | 资源不存在、不可见或被隐藏；公开接口不得据此枚举隐藏资源 |
| `IDENTITY_CONFLICT` | `409` | 用户名、归一化邮箱、slug 或 OAuth provider subject 已存在 |
| `RATE_LIMITED` | `429` | 触发注册、会话、OAuth、发布或评论限流 |
| `UNPROCESSABLE_ENTITY` | `422` | 语法合法，但业务规则不满足；具体资源是否采用 400 或 422 必须在实现前固定，不能随机切换 |
| `INTERNAL_ERROR` | `500` | 未预期服务端错误；客户端只接收稳定消息，详细原因仅进脱敏日志 |
| `SERVICE_UNAVAILABLE` | `503` | 依赖暂不可用，例如数据库健康检查失败；不返回依赖原始错误 |

`409` 专用于唯一性冲突。`401` 和 `403` 不得互换：前者表示没有有效身份，后者表示身份存在但无权操作。删除当前会话是幂等操作，没有会话时仍返回 `204`，不返回 `401`。

- `INVALID_USERNAME` 与 `UNPROCESSABLE_ENTITY` 的 `400`/`422` 细分属于[待决事项](../DECISIONS.md)中保留的边界：最终选择必须在认证实现前由 ADR 冻结，冻结前不得把非法用户名静默并入 `VALIDATION_ERROR`，也不得在同一错误上随机切换状态码。本表列出约定的错误码，不固定状态码、不新增业务规则。

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
