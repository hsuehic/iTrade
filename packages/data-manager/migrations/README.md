# Database Schema Management

## ✨ TypeORM-First Approach

**All database schema is defined in TypeScript entity files.**  
No SQL migration files needed - TypeORM handles everything from the entity definitions!

## 🚀 Quick Start

### Sync Schema to Database

```bash
# Navigate to data-manager package
cd packages/data-manager

# Run the sync script (creates tables, indexes, etc.)
npx tsx sync-scheme-to-db.ts
```

This will:
- ✅ Create all tables from entity definitions
- ✅ Add all indexes defined with `@Index()` decorators
- ✅ Update existing tables if schema changed
- ✅ Create the `query-result-cache` table automatically (for TypeORM query caching)

### Verify Schema

```bash
# Check table structure
psql postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DB} -c "\d account_snapshots"

# Check all indexes
psql postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DB} -c "\di"
```

## 📝 How It Works

### 1. Define Schema in Entities

All schema is defined in TypeScript:

```typescript
// packages/data-manager/src/entities/AccountSnapshot.ts
@Entity('account_snapshots')
@Index(['exchange', 'timestamp'])  // Composite index
@Index(['timestamp'])               // Single column index
export class AccountSnapshotEntity {
  // ... columns
}
```

### 2. Run Sync Script

```bash
npx tsx sync-scheme-to-db.ts
```

TypeORM reads the entity definitions and:
- Creates/updates tables
- Adds indexes
- Handles relationships
- Creates cache tables

### 3. All Done! ✅

No SQL scripts needed - everything is maintained in TypeScript!

## 🎯 Benefits

✅ **Single Source of Truth** - Schema defined in TypeScript entities  
✅ **Type Safety** - Compiler checks your schema definitions  
✅ **No SQL Scripts** - TypeORM generates all SQL automatically  
✅ **Easy Updates** - Just update entity and re-run sync  
✅ **Version Control** - Entity changes tracked in Git  

## 📊 Performance Indexes

All performance indexes are defined in entity files:

| Entity | Indexes | Purpose |
|--------|---------|---------|
| `AccountSnapshotEntity` | `[exchange, timestamp]` | Fast time-series queries |
| `AccountSnapshotEntity` | `[timestamp]` | Time-range queries |
| `StrategyEntity` | `[user, name]` | Unique constraint + fast lookup |
| `OrderEntity` | `[symbol]`, `[status]` | Order filtering |

## ⚠️ Important Notes

### Development
```bash
# In development, you can use synchronize: true in config
# This auto-syncs schema on every app start
synchronize: true
```

### Production
```bash
# In production, manually run sync script when deploying schema changes
npx tsx sync-scheme-to-db.ts

# Or use TypeORM migrations for more control (advanced)
# See: https://typeorm.io/migrations
```

## 🔧 Troubleshooting

### Error: "query-result-cache" does not exist

This happens when database cache is enabled but the cache table wasn't created.

**Solution:**
```bash
# Re-run sync script (it has cache enabled)
cd packages/data-manager
npx tsx sync-scheme-to-db.ts
```

TypeORM will automatically create the `query-result-cache` table with proper indexes.

**Verify:**
```bash
psql $DATABASE_URL -c "\d \"query-result-cache\""
```

### Schema Not Updated?
```bash
# Re-run sync script
npx tsx sync-scheme-to-db.ts
```

### Need to Drop Everything?
```sql
-- Drop all tables (careful!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Then re-sync
npx tsx sync-scheme-to-db.ts
```

### Check Current Schema
```bash
# List all tables
psql $DATABASE_URL -c "\dt"

# List all indexes
psql $DATABASE_URL -c "\di"

# Describe specific table
psql $DATABASE_URL -c "\d account_snapshots"

# Check cache table
psql $DATABASE_URL -c "\d \"query-result-cache\""
```

---

**Author**: xiaoweihsueh@gmail.com  
**Date**: October 11, 2025

