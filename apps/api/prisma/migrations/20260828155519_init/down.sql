-- Rollback for migration 20260828155519_init.
--
-- Prisma Migrate does not generate down-migrations automatically; this file
-- is maintained by hand. For an "init" migration, reverting means dropping
-- everything this migration created — simplest and safest as a full schema
-- reset rather than an exhaustive DROP TABLE/DROP TYPE list.
DROP SCHEMA "public" CASCADE;
CREATE SCHEMA "public";
