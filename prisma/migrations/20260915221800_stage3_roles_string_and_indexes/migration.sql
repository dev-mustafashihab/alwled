-- Stage 3: role names become plain strings (custom roles), system roles keep isSystem protection.
-- Data-preserving migration: no column is dropped, no row is deleted.

-- 1) roles.name : enum -> text (values preserved)
ALTER TABLE "roles" ALTER COLUMN "name" TYPE TEXT USING "name"::text;

-- 2) new/modified defaults
ALTER TABLE "roles" ALTER COLUMN "is_system" SET DEFAULT false;

-- 3) drop the now-unused enum type
DROP TYPE IF EXISTS "RoleName";

-- 4) new indexes
CREATE UNIQUE INDEX IF NOT EXISTS "roles_name_key" ON "roles"("name");
CREATE INDEX IF NOT EXISTS "roles_is_system_idx" ON "roles"("is_system");
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE INDEX IF NOT EXISTS "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
