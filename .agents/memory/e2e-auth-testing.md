---
name: E2E testing an OWNER_EMAIL-gated app
description: How to log in via testReplitAuth for the system-map app without hitting a users-upsert unique-email 500.
---

To e2e-test the auth-gated system-map app (`runTest({ testReplitAuth: true })`), the OIDC login claim must reuse the **existing owner user row**, not a fresh synthetic user.

**Why:** `requireAuth` enforces an `OWNER_EMAIL` allowlist (single-operator tool), so the login email must equal `OWNER_EMAIL`. The `users` table has a UNIQUE `email` constraint, and `upsertUser` does `onConflictDoUpdate` targeting `id` (the OIDC `sub`), NOT email. A synthetic `sub` + the owner email therefore attempts an INSERT that violates the unique-email constraint → `/api/callback` returns 500 → login blocked. This is a test-harness artifact, not an app bug (a real Replit account always presents the same `sub`).

**How to apply:**
- Read the allowlisted email from env: `OWNER_EMAIL` is a **shared env var** (readable via `viewEnvVars({ keys: ["OWNER_EMAIL"] })` → `.envVars.shared.OWNER_EMAIL`). Note: `process.env` is NOT available in the code_execution sandbox.
- Get the existing owner's `sub`: `SELECT id FROM users WHERE email = '<OWNER_EMAIL>'` (via `executeSql`). Pass that `id` as the OIDC `sub` claim and `OWNER_EMAIL` as the email → upsert hits the id-conflict → UPDATE → login succeeds.
- `/api/generations` (and all `/api` routes) sit behind `requireAuth`; container curl is blocked, so validate through the testing skill, not curl.
