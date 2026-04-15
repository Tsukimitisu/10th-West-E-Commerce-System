# Knex Migration Guide

This project uses Knex migrations for schema changes.

## Commands

- Apply pending migrations:
  npm run migrate
- Roll back the latest batch:
  npm run migrate:down
- Show migration status:
  npm run migrate:status
- Create a new migration file:
  npm run migrate:make <name>

## Conventions

- Keep each migration focused on one concern.
- Always implement both up and down.
- Use deterministic names for indexes and constraints.
- Prefer additive changes; avoid destructive changes unless needed.
- Seed data that affects behavior should be in migrations only when it must exist in every environment.
- Treat enum-like values as a contract: if you add/change a role, status, or method in DB constraints, update backend constants in src/constants/schemaEnums.js in the same PR.
- Normalize legacy values before tightening constraints to keep migrations idempotent and rollback-safe.

## Notes

- Legacy scripts in src/database are kept for fallback only.
- New schema changes should be added under this folder.
