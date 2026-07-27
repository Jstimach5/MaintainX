/**
 * Runs before each test file (vitest setupFiles): point the shared db module
 * at the test database BEFORE any test imports it.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://cmms:cmms_dev_password@localhost:5432/cmms_test";
