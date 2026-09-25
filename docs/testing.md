# Testing

```bash
npm test                 # Vitest unit + integration + security
npm run test:e2e         # Playwright (needs a built server)
npm run test:concurrency # included in integration workflows
```

Integration tests reset `synapse_hms_test`, migrate, seed demo users, then exercise:

- login success/failure
- RBAC denials
- patient → appointment → encounter lock
- concurrent pharmacy sales (5 units, 8 buyers)
- parallel invoice numbers
- lab self-verify rejection

Playwright covers the login UI and a pharmacist hitting `GET /api/users` (403).
