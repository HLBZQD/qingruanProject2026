# Design Review: detail_v1.md vs task_v1.md + 2_detailed_design_v3.md (§3.2.1-3.2.6, §3.4)

## Verdict: APPROVED

---

## 1. Request/Response Schema Comparison

### 1.1 POST /api/auth/register (§5.1 vs §3.2.1)

| Item | detail_v1.md | Design §3.2.1 | Match |
|------|-------------|---------------|-------|
| Request body | `{ username, password }` | `{ username, password }` | Yes |
| Success status | 201 | 201 | Yes |
| Success message | `'注册成功'` | `"注册成功"` | Yes |
| Response data shape | `{ token, role: 'user', user: { id, username, avatar: null } }` | `{ token, role: "user", user: { id, username, avatar: null } }` | Yes |
| 422 error code | `VALIDATION_ERROR` | `VALIDATION_ERROR` | Yes |
| 409 error code | `CONFLICT` | `CONFLICT` | Yes |
| 409 error message | `'用户名已存在'` | `"用户名已存在"` | Yes |
| 400 request body check | `throw new AppError(400, 'BAD_REQUEST', ...)` | BAD_REQUEST / 400 | Yes |

### 1.2 POST /api/auth/login (§5.2 vs §3.2.2)

| Item | detail_v1.md | Design §3.2.2 | Match |
|------|-------------|---------------|-------|
| Request body | `{ username, password }` | `{ username, password }` | Yes |
| Success status | 200 | 200 | Yes |
| Response data shape | `{ token, role, user: { id, username, avatar } }` | `{ token, role, user: { id, username, avatar } }` | Yes |
| `must_change_password` | Conditional on `role==='admin' && password_changed===0` | Conditional on `role='admin' && password_changed=0` | Yes |
| 401 error code | `AUTH_INVALID` | `AUTH_INVALID` | Yes |
| 401 error message | `'用户名或密码错误'` | `"用户名或密码错误"` | Yes |
| 422 validation | `validateLogin` → `VALIDATION_ERROR` | VALIDATION_ERROR / 422 | Yes |

### 1.3 POST /api/auth/logout (§5.3 vs §3.2.3)

| Item | detail_v1.md | Design §3.2.3 | Match |
|------|-------------|---------------|-------|
| Auth required | Yes (authMiddleware) | Yes | Yes |
| Success status | 200 | 200 | Yes |
| Success message | `'已登出'` | `"已登出"` | Yes |
| No request body | Yes | Yes | Yes |

### 1.4 GET /api/user/profile (§6.1 vs §3.2.4)

| Item | detail_v1.md | Design §3.2.4 | Match |
|------|-------------|---------------|-------|
| Auth required | Yes | Yes | Yes |
| Response fields | `{ id, username, avatar, role, created_at }` | `{ id, username, role, avatar, created_at }` | Yes (same set) |
| 404 behavior | `throw new AppError(404, 'NOT_FOUND', '用户不存在')` | NOT_FOUND / 404 | Yes |

### 1.5 PUT /api/user/profile (§6.2 vs §3.2.5)

| Item | detail_v1.md | Design §3.2.5 | Match |
|------|-------------|---------------|-------|
| Request body | `{ username?, avatar? }` | `{ username?: string, avatar?: string }` | Yes |
| Response fields | `{ id, username, avatar }` | `{ id, username, avatar }` | Yes |
| 409 username conflict | `error(res, 'CONFLICT', '用户名已存在', 409)` | CONFLICT / 409 | Yes |
| 422 validation | `error(res, 'VALIDATION_ERROR', ...)` | VALIDATION_ERROR / 422 | Yes |
| Dynamic SET clause | Implemented via updates array + params array | — | Yes (implementation detail) |
| Re-query after update | Yes (`SELECT id, username, avatar`) | — | Yes (ensures fresh data) |

### 1.6 PUT /api/user/password (§6.3 vs §3.2.6)

| Item | detail_v1.md | Design §3.2.6 | Match |
|------|-------------|---------------|-------|
| Request body | `{ old_password, new_password }` | `{ old_password, new_password }` | Yes |
| Admin first-login old_password optional | `!old_password && role==='admin' && password_changed===0` → skip | "允许仅传 new_password" | Yes |
| Normal user old_password required | `error(res, 'VALIDATION_ERROR', '当前密码不能为空', 422)` | old_password 必填 | Yes |
| Wrong old_password error | `error(res, 'AUTH_INVALID', '当前密码错误', 401)` | AUTH_INVALID / 401 | Yes (design says 401 for wrong credentials) |
| new_password validation | `validatePassword(new_password)` | "8位以上, 含字母和数字" | Yes |
| password_changed update | Set to `1` unconditionally | Set to `1` | Yes |
| Success response | `success(res, null, '密码修改成功', 200)` | `{ success: true, message: "密码修改成功" }` | Yes |

---

## 2. Error Code Comparison

All 12 error scenarios in detail_v1.md §8 matched against design §3.4:

| Scenario | detail_v1.md Code | detail_v1.md HTTP | Design Code | Design HTTP | Match |
|----------|-------------------|-------------------|-------------|-------------|-------|
| Invalid request body | BAD_REQUEST | 400 | BAD_REQUEST | 400 | Yes |
| Validation failure | VALIDATION_ERROR | 422 | VALIDATION_ERROR | 422 | Yes |
| Register username exists | CONFLICT | 409 | CONFLICT | 409 | Yes |
| Profile username exists | CONFLICT | 409 | CONFLICT | 409 | Yes |
| Login credentials wrong | AUTH_INVALID | 401 | AUTH_INVALID | 401 | Yes |
| Wrong old password | AUTH_INVALID | 401 | AUTH_INVALID | 401 | Yes |
| Missing token | AUTH_REQUIRED | 401 | AUTH_REQUIRED | 401 | Yes |
| Invalid/expired token | AUTH_REQUIRED | 401 | AUTH_REQUIRED | 401 | Yes |
| Non-admin access admin | FORBIDDEN | 403 | FORBIDDEN | 403 | Yes |
| User not found | NOT_FOUND | 404 | NOT_FOUND | 404 | Yes |
| Uncaught exception | INTERNAL_ERROR | 500 | INTERNAL_ERROR | 500 | Yes |

All 11 error scenarios match exactly. No missing codes, no wrong codes.

---

## 3. JWT Payload Check

| Item | detail_v1.md | Design Reference | Match |
|------|-------------|-----------------|-------|
| Payload fields | `{ id, username, role }` | authStore.login() stores `role`; middleware needs id+username+role for `req.user` | Yes |
| Algorithm | HS256 (jsonwebtoken default) | jsonwebtoken 9.x (tech stack §1.3) | Yes |
| Secret | `process.env.JWT_SECRET` | `.env` (tech stack dotenv) | Yes |
| Expiry | `'7d'` | — (not specified, standard) | Yes |
| `iss` claim | Not set (simplified) | — | Yes (no requirement) |
| Register role | `'user'` (always) | §3.2.1 response shows `role: "user"` | Yes |
| Login role | `user.role` (from DB) | §3.2.2 response shows `role: "user"/"admin"` | Yes |
| Middleware extraction | `{ id: decoded.id, username: decoded.username, role: decoded.role }` | authStore needs token+role; `req.user` pattern is standard | Yes |
| Token transport | `Authorization: Bearer <token>` | §3.1: "需在请求头携带 Authorization: Bearer <JWT_TOKEN>" | Yes |
| Token error handling | TokenExpiredError / JsonWebTokenError → AUTH_REQUIRED / 401 | §3.4 AUTH_REQUIRED / 401 | Yes |

---

## 4. bcrypt Usage Check

| Item | detail_v1.md | Design / Seed Reference | Match |
|------|-------------|------------------------|-------|
| Library | `bcryptjs` (import) | bcryptjs 2.x (§1.3 tech stack) | Yes |
| Hash method | `bcrypt.hashSync(password, 10)` | `bcrypt.hash('admin123', 10)` (seed.sql §2.4) | Yes |
| Salt rounds | 10 (fixed) | 10 (seed.sql) | Yes |
| Compare method | `bcrypt.compareSync(plain, hashed)` | Standard bcryptjs API | Yes |
| Registration flow | hashSync → INSERT with hashedPassword | — | Yes |
| Login flow | compareSync(password, user.password) | — | Yes |
| Password change | hashSync(new_password, 10) then UPDATE | — | Yes |

---

## 5. SQL Statement Validation

All 11 SQL statements in detail_v1.md §9 checked against DDL in design §2.2 (`users` table):
- All column names (`id`, `username`, `password`, `avatar`, `role`, `password_changed`, `created_at`, `updated_at`) match DDL.
- All tables referenced (`users`) exist in DDL.
- `datetime('now','localtime')` function is valid SQLite syntax.
- Register INSERT correctly omits `role` (DDL default is `'user'`).
- Login SELECT correctly includes `password`, `role`, `password_changed`, `avatar` columns.
- Profile PUT uniqueness check `WHERE username = ? AND id != ?` correctly excludes self.

---

## 6. Middleware Validation

### auth.js middleware (§3)
- Correctly extracts `Authorization: Bearer <token>` header.
- Token missing → `AUTH_REQUIRED` / 401 (matches §3.4).
- Token expired → `AUTH_REQUIRED` / 401 with specific message (matches §3.4).
- Token invalid → `AUTH_REQUIRED` / 401 with specific message (matches §3.4).
- Sets `req.user = { id, username, role }` from JWT decoded payload.

### admin.js middleware (§4)
- Defensive `!req.user` check → `AUTH_REQUIRED` / 401.
- Role check `!== 'admin'` → `FORBIDDEN` / 403 (matches §3.4).
- Correctly documented as requiring prior `authMiddleware`.

---

## 7. Minor Observations (non-blocking)

1. **`message` field in success responses**: The `success()` function always emits `message` (default `'操作成功'`). Design §3.2.2 and §3.2.4 show success responses without `message`. However, `ApiResponse<T>` (§3.8.1) declares `message?: string` (optional), so including it is compliant with the contract.

2. **`data: null` in logout/password responses**: The `success()` function always includes `data: null` when no data exists. Design §3.2.3 and §3.2.6 omit `data` from example responses. Not a contract violation — `ApiResponse<T>` always carries `data: T`.

3. **LoginUser type in design §3.8.2 includes `role` field**: The TypeScript `LoginUser` interface includes `role`, but the actual response examples in §3.2.1-3.2.2 show `role` at the top level (not nested in `user`). This is a minor inconsistency within the design document itself, not in detail_v1.md, which correctly follows the §3.2.1-3.2.2 response examples.

---

## Summary

All four checks pass:
- **Request/response schemas**: All 6 endpoints have correct schemas matching §3.2.1-3.2.6.
- **Error codes**: All 11 error scenarios match §3.4 exactly.
- **JWT payload**: `{ id, username, role }` is correct; algorithm (HS256), secret (JWT_SECRET), expiry (7d), and token transport (Bearer header) all align with the design.
- **bcrypt usage**: `hashSync(password, 10)` and `compareSync(plain, hashed)` match the seed script and tech stack.

**Verdict: APPROVED**
