# Authentication

- Identifier: unique `username` (staff should also have a unique `employee_id`).
- Secret: Argon2id password hash. Policy: 10+ characters with upper, lower, and digit.
- Session: random 32-byte token, SHA-256 stored in `sessions`. Cookie is HTTP-only, `SameSite=Lax`.
- CSRF: `X-CSRF-Token` must match the session CSRF value on POST/PATCH/PUT/DELETE.
- Lockout: `LOGIN_MAX_ATTEMPTS` (default 8) then `LOGIN_LOCK_MINUTES`.
- Idle timeout: `IDLE_TIMEOUT_MINUTES` (default 45) based on `sessions.last_seen_at`.
- Disable: `users.is_active = false` revokes sessions.
- Must-change-password: new accounts cannot call clinical/admin APIs until they rotate credentials.

There are no shared “doctor” or “pharmacy” generic accounts in normal operation. Seed demo users exist only when `npm run db:seed -- --demo` is used in non-production setups.
