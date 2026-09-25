# Billing

Invoices are the financial source of truth for consultation, pharmacy, laboratory, and other services.

- Numbers from the locked `invoice` sequence
- Integer cents only
- Partial payments allowed until `paid - refunded >= total`
- Refunds cannot exceed net paid
- Cancel requires net paid of zero (refund first)
- Every payment and refund is audited

Receipts can be printed from the invoice screen (`window.print` with print CSS).
