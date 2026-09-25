# Laboratory

Workflow:

1. Clinician or permitted user creates a lab order (optionally bills immediately).
2. Lab attendant collects a sample (`lab.sample.collect`).
3. Technician receives the sample and enters results (`lab.result.enter`).
4. A different user with `lab.result.verify` verifies.
5. Order completes when items are verified.
6. Report can be printed.

Verified results cannot be edited. Self-verification is rejected.
