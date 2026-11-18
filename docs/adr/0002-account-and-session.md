# ADR 0002：账号、密码与会话的安全取舍

- **状态**：Accepted（M2 批次 A 冻结；2026-11-18）
- **日期**：2026-11-18
- **依据**：[M2 实施规格](../specs/M2.md)、[项目总览](../PROJECT.md)、[RESTful 契约](../contracts/restful-api.md)、[错误语义](../contracts/errors.md)
- **范围**：站内身份规则、密码哈希、会话与 Cookie、请求防护、MongoDB 事务与本地迁移；GitHub OAuth 的协议细节仍以 [M2 §6](../specs/M2.md) 为准，本 ADR 只冻结其身份语义与复核限制
- **工具分工**：本仓库由 CodeBuddy Code 实施（本会话实际模型 Tencent Hunyuan Hy / Hy4 flash，hy4flash-free；不臆造版本号），Codex 独立只读审查并在用户授权后执行最终 Git 操作。用户已授权以 CodeBuddy 替换 WorkBuddy；本 ADR 与 [M2 §2](../specs/M2.md) 已取代原文中 OMP / WorkBuddy CLI 的名称要求，其余纪律（RED 先行、不伪造执行结论、不提交凭据）保持不变。前次 `acceptEdits` 导致 Bash 被拒的权限阻塞已由用户在本次会话显式解除。

## 背景

M1 只有公开读取与固定 401 写入占位，没有身份、会话或凭据。M2 要在同一站内 userId 上叠加邮箱密码与 GitHub 两种登录方式，并保证：用户名/邮箱唯一、凭据不可逆、会话可撤销、身份复核不可跳过、并发不产生零登录方式或双重归属。以下取舍必须在写实现前固定，避免同一错误随机切换状态码、参数或存储格式。

## 决策

### 1. 身份与输入规则（冻结）

- 注册严格接受 `{email, username, password}`；登录严格接受 `{identifier, password}`。未知字段一律 `400 VALIDATION_ERROR`；`roles`、`role`、`permission(s)`、`userId`、`passwordHash`、`ownerId`、`id`、`enabled`、`emailVerifiedAt` 等服务端字段属于敏感未知字段，同样拒绝，不静默忽略。
- 用户名：先 `trim`，再匹配 `^[A-Za-z][A-Za-z0-9_]{2,31}$`；展示保留原始大小写，唯一键 `usernameNormalized` 为其 ASCII 小写。用户名登录大小写不敏感。非法用户名固定返回 **`400 INVALID_USERNAME`**（在 400/422 之间明确选择 400），`details` 用 `{field:"username",reason:"invalid_username"}`；其他格式错误为 `400 VALIDATION_ERROR`。
- 邮箱：`trim` 后整体小写；合法邮箱格式、最长 254 字符；不做去点、去加号或任何供应商特有变换。邮箱登录使用同一归一化。
- 密码：按 Unicode 码点计 12–128 个，且 UTF-8 编码不超过 512 字节；不 `trim`、不截断、不做 Unicode 归一化、不强制字符种类。长度/字节数不满足为 `400 VALIDATION_ERROR`。
- 重复归一化用户名或邮箱固定 `409 IDENTITY_CONFLICT`，最终保证是数据库唯一索引与重复键映射，不依赖先查后写。
- 登录失败统一 `401 INVALID_CREDENTIALS`，不区分账号不存在、密码错误、用户禁用或无本地密码。账号不存在时也执行一次等价开销的哑哈希比较，避免可被统计的时序分支。
- 不接受客户端角色。新用户固定普通 `user`；M2 有效业务权限为 `[]`，角色/权限只在认证响应由服务端给出，M3/M4 再按实际能力扩展。
- 公共作者投影保持 M1 的 `{id, username, avatarUrl}`，不自动扩大；`UserPublic` 只含 `{id, username, gender, avatarUrl, signature, createdAt}`。

### 2. 密码哈希：Node 原生异步 scrypt

- 只用 `node:crypto` 的异步 `scrypt`（promisify 或 callback），**不用** `scryptSync` 或任何同步 KDF 阻塞请求线程；每个密码独立 `randomBytes(16)` 盐。
- 参数依据：OWASP Password Storage Cheat Sheet 给出 scrypt 的最低配置 **N=2^17 (131072)、r=8、p=1**；Node.js `crypto.scrypt` 文档给出默认值 N=16384、r=8、p=1、`maxmem` 32 MiB，并说明内存需求约 `128 × N × r` 字节，超过 `maxmem` 会报错而不是悄悄降低。据此本仓库固定：`N=131072, r=8, p=1, keylen=64, salt=16 bytes, maxmem=256×1024×1024（256 MiB，为 128 MiB 基线留余量）`。参数写进每条哈希记录，日后可提高成本而不破坏旧记录。
- 编码格式：`scrypt$N$r$p$<salt base64>$<derivedKey base64>`；比较用 `crypto.timingSafeEqual`，长度不等或格式异常直接返回 false，不做字符串 `===` 比较。
- 不自行设计密码算法，不引入第三方认证框架；不在日志、错误体或响应里出现密码、盐原文以外的哈希细节。
- 安全依据来源（脱敏引用，不含凭据）：OWASP Password Storage Cheat Sheet — scrypt 最低 N=2^17/r=8/p=1；Node.js API 文档 `crypto.scrypt` — 默认值、`128*N*r` 内存关系、`maxmem` 行为、服务端优先异步调用。
- **本机校验耗时**：由实施会话在真实机器执行哈希/校验基准并回填到 [M2 §9](../specs/M2.md)，不填写未实测的耗时或“通过”结论。参考量级来自公开资料（N=2^17 单次约数百毫秒），仅作预期，不冒充本机实测。

### 3. 数据模型与身份索引

- 扩展 `users`：`usernameNormalized`（唯一）、可空 `email`/`passwordHash`（支持 OAuth-only）、`emailVerifiedAt`（默认 null）、`gender`（`unspecified|male|female|other`，默认 unspecified）、`signature`（默认空串）、`avatarUrl`（默认 null）、`enabled`（默认 true）、`accountVersion`（并发串行化版本）、`createdAt`/`updatedAt`。
- 可空邮箱使用**只匹配字符串的 partial unique index**（`email != null`），让多个 OAuth-only 用户不因 null 冲突。
- 身份独立集合 `identities`：`{provider, subject}` 复合唯一并关联不可变 `userId`，另设 `{userId, provider}` 唯一索引，每个账号最多一个 GitHub 身份；身份删除后不留可登录映射。
- 会话独立集合 `sessions`：只存 token 的 SHA-256 摘要、`userId`、`createdAt`、`expiresAt`；TTL 索引用于清理，但每次受保护请求必须显式检查到期，不能依赖 TTL 及时删除。
- 不做按邮箱静默合并；GitHub 改名/换头像不建新账号、不覆盖站内资料。

### 4. 会话、Cookie 与请求防护（冻结）

- 浏览器持有至少 32 字节随机不透明 token；固定 7 天有效期，不滑动续期；URL 与响应 DTO 都不返回 token 或摘要。
- 注册/登录成功总是新建 token，替换浏览器旧 Cookie 并撤销旧 token（防会话固定）；退出撤销当前会话并清 Cookie，缺失/无效/过期 Cookie 退出仍 `204`，数据库异常返回脱敏 `503` 且不谎称撤销成功。
- 每次受保护请求从数据库检查会话、到期与用户 `enabled`，不缓存旧状态；禁用/删除用户后旧会话立即 `401`。M2 无管理禁用接口，用测试夹具验证。
- Cookie `guihua_session`：HttpOnly、SameSite=Lax、Path=/、无 Domain、Max-Age 与服务端期限一致；生产强制 Secure，本地 HTTP 明确允许非 Secure；清除时属性匹配。不使用 localStorage 存认证凭证。
- 浏览器同源 `/api`（Vite 代理），默认不开放跨源凭据 CORS。所有浏览器 JSON 写请求（注册、登录、退出、PATCH、绑定/复核等）要求配置的**精确 Origin 白名单**与 `application/json`：恶意/缺失/`null` Origin 拒绝 `403 FORBIDDEN`，错误 Content-Type 拒绝 `400 VALIDATION_ERROR`。白名单通过新增环境变量 `ALLOWED_ORIGINS` 配置，缺省只含本地开发源。
- 限流（单实例、有界且自动淘汰的内存存储，重启重置、多实例无共享）：注册每 IP 15 分钟 5 次；登录每 IP 15 分钟 30 次且每归一化 identifier 15 分钟 10 次；OAuth 入口每 IP 15 分钟 20 次；验证邮件每 IP/用户/目标邮箱每小时 10/5/5 次；提交与复核每会话 15 分钟 10 次。超限 `429 RATE_LIMITED` + `Retry-After`。只信任显式配置的代理，不直接信任任意 `X-Forwarded-For`。测试注入可控时钟，不真实等待窗口。多实例上线前必须改共享存储。

### 5. 错误语义（冻结）

- `INVALID_USERNAME` 固定 **400**（解决 [errors.md](../contracts/errors.md) 与 DECISIONS 中 400/422 的未决项）。
- `LAST_LOGIN_METHOD` 固定 **409**；敏感操作复核缺失/过期 `403 FORBIDDEN`；无效验证挑战 `400 VALIDATION_ERROR`。
- `401`/`403` 不互换；`409` 专用于唯一性冲突。所有错误沿用 `{error:{code,message,details,requestId}}`，`requestId` 同写 `x-request-id`，不泄露数据库/堆栈/凭据。

### 6. 事务与 dev/test 隔离（冻结）

- 用户创建、身份创建/消费、挑战消费与凭据变更用 **MongoDB 事务**保证一致；外部换 token、发邮件不放入长事务，先完成外部调用再用事务校验状态落库。
- dev 与 test 各自配置为**独立单节点 replica set**（不同容器、端口、数据卷与 replSetName），事务因此可用；不假设 standalone 支持事务，两个环境不共用副本集。CI 模板同样以单节点 RS 启动测试库。
- 事务冲突有界重试，重试耗尽返回稳定错误；失败不留孤儿身份或无法恢复的注册状态。

### 7. 迁移与回滚限制（冻结）

- 本地开发库迁移/回填必须可重复执行、只作用于已白名单的本地库。
- 第一步检查大小写归一化冲突；发现冲突即停止并输出脱敏摘要（不打印邮箱全值），不自动改用户名、不合并账号。
- 旧索引替换顺序：先建新索引（`usernameNormalized`、partial email、身份/会话索引）→ 校验唯一与冲突 → 再由维护者显式决定是否删除旧 `username`/`email` 唯一索引；脚本不得对未知数据自动 `syncIndexes()` 或 `dropDatabase()`。
- 回滚只撤销应用版本与本次新增索引/字段，不删除用户数据；不可逆操作需单独授权。
- **批次 E 实施记录（2026-11-18）**：用户明确授权本地开发方案后，迁移在预检归一化用户名/邮箱冲突、创建 string-only partial unique 索引后，按**精确名** `users_email_unique` 删除这一已知 M1 旧唯一索引（让多个 `email:null` 的 OAuth-only 用户可共存）；未知索引一律保留。回滚需先移除所有 null 邮箱用户，再手动重建 `users_email_unique`；脚本不 dropDatabase、不同步未知索引。

### 8. GitHub 复核与登录方式边界（冻结）

- 账号所有资料/内容归属不可变站内 userId；邮箱密码与 GitHub subject 都指向该用户。
- 不能宣称 GitHub 一定重新询问密码：上游可能已有登录会话。因此解绑必须另有已验证邮箱 + 有效密码作保底；添加密码必须一次性邮箱验证完成，不能单凭旧本站 Cookie。
- 每次身份变更（绑定、添加密码、解绑）成功后撤销其他会话、轮换当前 token 并清除复核证据；用户 `enabled` 与 `accountVersion` 在事务内重新检查。每个账号至少保留一种登录方式，删除最后一种返回 `409 LAST_LOGIN_METHOD`。
- 缺 GitHub client id/secret 或缺 SMTP 时，应用其余功能照常启动，相关入口明确不可用并返回脱敏 `503`；不提交真实凭据。
- **批次 E 实施记录（2026-11-18）**：上述 OAuth/复核/添加密码流程已实现并通过真实 HTTP/数据库与本地 Mailpit 实投验证；真实 GitHub 授权仍因缺少凭据未验证，集成测试的 GitHub 侧为明确标注的模拟替身，不能据此宣称真实外部流程通过。邮件限流按小时桶保存自身到期，不被 15 分钟清理误删。

## 结果

**收益**：错误码与状态码不再漂移；参数与凭据格式自描述、可平滑提高成本；会话可撤销且敏感写请求有 CSRF 边界；唯一性与并发由数据库保证；dev/test 事务与隔离同时成立。

**代价**：scrypt N=2^17 单次约百毫秒量级且占约 128 MiB 内存，需按机器评估并发；单节点 RS 增加启动初始化步骤；事务与幂等/重试让服务层更复杂；内存限流在重启后清零、多实例不共享。

## 约束与拒绝项

- 不静默合并同邮箱账号；不按 GitHub 邮箱查找或占用既有邮箱。
- 不把 M1 seed 的固定假哈希当作可登录凭据；登录夹具只在测试库生成真实哈希。
- 不为图省事改写或删除用户学习注释（当前版本见 `apps/api/src/books/books.service.ts` 的“桂花记录”段落）。
- 不新增 OAuth 配置以外的跨源凭据 CORS；不在 URL fragment 以外保存邮件验证 token。
- 不在本 ADR 固定生产部署平台、域名、真实 GitHub/OAuth 凭据或 SMTP 账号；这些留待 M5。

## 未决项（不阻塞 A/B）

- 本机 scrypt 耗时由实施会话实测并记录到 [M2 §9](../specs/M2.md)；真实 GitHub 授权/绑定/重新登录、真实 SMTP 投递、CI 远程启用仍在具备条件的会话中验证，未验证不得标为通过。
- M2b 的头像 URL 细则（HTTPS、禁止 userinfo/控制字符、no-referrer）与签名控制字符规则在实现批次 D 前写入契约；本 ADR 只冻结其不得代理抓取/上传的方向。
