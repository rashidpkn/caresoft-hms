# Authorization

Permissions are strings such as `patient.view` and `pharmacy.sale.create` (see `src/server/auth/permissions.ts`).

Effective grants = role permissions plus optional per-user overrides (`user_permission_overrides`).

The API rejects missing permissions with HTTP 403 regardless of what the UI shows.

Notable separations:

- Pharmacist: dispense and pharmacy reports, not financial refunds or user admin.
- Lab attendant: collect samples, not enter/verify results.
- Lab technician: enter results, not verify their own result (service rule).
- Lab verifier: verify results entered by someone else.
- Security officer: audit and health, not clinical write or billing.
- Super admin: includes `backup.manage`; admin does not.
