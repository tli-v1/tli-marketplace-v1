# Law Firm Application Integration Test

This folder contains a guarded integration test for the public law firm application Data Connect write path.

Run it against production only when you intentionally want to create a real test application row:

```sh
ALLOW_PROD_APPLICATION_TEST_WRITE=1 npm run test:integration:application
```

The test creates one valid application and child rows for state, practice area, and case preference. There is no delete mutation for these records, so test submissions remain in the database and are labeled with `TLI Integration Test Firm`.

The test also verifies common rejected paths:

- missing required application field
- invalid enum value
- malformed UUID for child inserts
- invalid state code foreign key
