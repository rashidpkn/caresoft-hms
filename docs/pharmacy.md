# Pharmacy

Catalogue (`medicines`) is separate from stock (`medicine_batches`). MRP, GST, expiry, and quantity belong on the batch.

Receiving a purchase creates or increments a batch inside a transaction and writes `inventory_movements`.

A sale:

1. Locks each batch row
2. Rejects expired stock
3. Rejects insufficient quantity
4. Creates an invoice + items
5. Decrements stock
6. Writes a movement
7. Optionally records payment
8. Commits or rolls back as a unit

Returns restock the originating batch. Adjustments require a reason and cannot go negative.
