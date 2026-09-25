# Role modules

Every role gets its own working screens. The sidebar is built from the signed-in user's permissions, and each API call re-checks them, so a hidden link is never the only barrier.

## Dashboard

`GET /api/dashboard` returns a role-shaped payload: metric cards plus only the sections the role may see. A doctor gets their own queue, a receptionist gets today's board, pharmacy gets stock alerts, lab gets pipeline counts. Collections and audit-failure counts appear only with `reports.financial` / `audit.view`.

## Reception (`/appointments`)

- Patient search, then doctor selection
- Free slots computed from `doctor_schedules` minus booked appointments (`GET /api/appointments/slots`)
- Booking rejects a taken slot (409) and a time outside working hours (400)
- Check-in issues the next token for that doctor and day
- Cancel with a reason, and "Bill fee" raises the consultation invoice from the doctor's configured fee

## Doctor (`/consultations`)

- "My clinic" lists only the signed-in doctor's waiting tokens and unfinalized encounters
- Call patient, start consultation from the queue, or open a walk-in encounter
- Encounter workspace: symptoms, examination, diagnoses (first line is primary), treatment plan, follow-up date
- Vitals with plausibility limits (for example pulse 20–250, diastolic must be below systolic)
- Multi-line prescription with route and quantity, medicine names autocompleted from the catalogue
- Lab tests ordered straight from the encounter (billed automatically)
- Finalize locks the record; further vitals or prescriptions are rejected

## Pharmacy (`/pharmacy`)

- Stock search over name, generic and SKU; expired batches are never listed
- Stock is ordered expiry-first (FEFO) so the oldest usable batch is dispensed
- Cart with per-line quantity capped at available stock, discount, GST, and payable total
- Completing a sale records the invoice, stock movement and payment in one transaction
- Returns are limited to what was dispensed on that bill, and cash is refunded only up to what was paid

Stock receiving and purchases stay on `/inventory` for the store manager.

## Laboratory (`/lab`)

- Worklist tabs: to collect, in processing, awaiting verification, completed
- Attendant collects samples; technician receives and enters results; verifier releases them
- The verify button is disabled for whoever entered the result, and the API rejects self-verification
- Report printing is only offered once every test is verified

## Permission boundaries proven by tests

- Pharmacist: no `billing.refund`, no `user.create`, `GET /api/users` returns 403, no Staff accounts or Audit log links
- Lab attendant: `lab.sample.collect` only; `POST /api/lab/results` returns 403
- Receptionist: no doctor queue section and no collections card
