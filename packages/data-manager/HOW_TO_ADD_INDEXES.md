# How to Add Database Indexes

## 🎯 Quick Guide

When you need to add indexes for performance, follow this TypeORM-first approach:

## ✅ Step-by-Step

### 1. Identify Slow Queries

Check your logs for slow queries:
```typescript
// In data-manager config, enable slow query logging:
maxQueryExecutionTime: 5000  // Logs queries over 5s
```

### 2. Add Index to Entity

Edit the entity file and add `@Index()` decorator:

```typescript
// Example: packages/data-manager/src/entities/AccountSnapshot.ts

import { Entity, Index, Column } from 'typeorm';

@Entity('account_snapshots')
@Index(['exchange', 'timestamp'])  // 👈 Composite index
@Index(['timestamp'])               // 👈 Single column index
export class AccountSnapshotEntity {
  @Column()
  exchange!: string;
  
  @Column()
  timestamp!: Date;
  
  // ... other columns
}
```

### 3. Sync to Database

```bash
cd packages/data-manager
npx tsx sync-scheme-to-db.ts
```

That's it! ✅ TypeORM will create the indexes automatically.

## 📝 Index Types

### Simple Index

```typescript
@Index(['columnName'])
```

### Composite Index (Multiple Columns)

```typescript
@Index(['column1', 'column2'])
```

### Unique Index

```typescript
@Index(['email'], { unique: true })
```

### Named Index

```typescript
@Index('idx_custom_name', ['column1', 'column2'])
```

### With Options

```typescript
@Index(['timestamp'], { 
  unique: false,
  where: '"deletedAt" IS NULL'  // Partial index
})
```

## 🎯 When to Add Indexes

Add indexes when you see:
- ✅ Slow queries (> 1 second)
- ✅ WHERE clauses on columns
- ✅ ORDER BY on columns
- ✅ JOIN conditions
- ✅ Foreign key relationships

**Don't over-index:**
- ❌ Columns with low cardinality (few unique values)
- ❌ Small tables (< 1000 rows)
- ❌ Columns rarely used in queries
- ❌ Write-heavy tables (indexes slow down writes)

## 📊 Common Patterns

### Time-Series Data

```typescript
@Entity('snapshots')
@Index(['exchange', 'timestamp'])  // Query by exchange + time
@Index(['timestamp'])               // Query all by time
export class SnapshotEntity { }
```

### User Data

```typescript
@Entity('orders')
@Index(['userId', 'status'])       // User's orders by status
@Index(['userId', 'createdAt'])    // User's recent orders
export class OrderEntity { }
```

### Search Queries

```typescript
@Entity('products')
@Index(['name'])                   // Search by name
@Index(['category', 'price'])      // Filter + sort
export class ProductEntity { }
```

## 🔍 Verify Indexes

After syncing, verify indexes were created:

```bash
# Check indexes on specific table
psql $DATABASE_URL -c "\d account_snapshots"

# List all indexes in database
psql $DATABASE_URL -c "\di"

# Check index usage (PostgreSQL)
psql $DATABASE_URL -c "
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
  ORDER BY idx_scan DESC;
"
```

## ⚠️ Important Notes

### Development
- Use `synchronize: true` in config
- Schema auto-syncs on app start
- Fast iteration

### Production
- Use `synchronize: false` in config  
- Manually run `sync-scheme-to-db.ts` for updates
- More control over schema changes

### Removing Indexes

Just remove the `@Index()` decorator and re-sync:

```typescript
// Before
@Index(['oldColumn'])  // 👈 Remove this

// After - sync script will drop the index
```

## 💡 Pro Tips

1. **Composite Index Order Matters**
   ```typescript
   @Index(['exchange', 'timestamp'])  // Good for: WHERE exchange=X AND timestamp>Y
   // Not optimal for: WHERE timestamp>Y (without exchange)
   ```

2. **Most Selective Column First**
   ```typescript
   @Index(['userId', 'status'])  // userId is more selective
   // Better than ['status', 'userId']
   ```

3. **Cover Your Query**
   ```typescript
   // Query: SELECT * FROM orders WHERE userId=X AND status=Y ORDER BY createdAt
   @Index(['userId', 'status', 'createdAt'])  // Covers entire query
   ```

4. **Use EXPLAIN to Verify**
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM account_snapshots 
   WHERE exchange='binance' AND timestamp > NOW() - INTERVAL '7 days';
   ```

## 📚 Learn More

- [TypeORM Indexes Documentation](https://typeorm.io/indices)
- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Use The Index, Luke!](https://use-the-index-luke.com/) - Great resource for SQL indexing

---

**Remember**: Keep it simple! Define schema in TypeScript, let TypeORM handle the SQL. 🚀

---

**Author**: xiaoweihsueh@gmail.com  
**Date**: October 11, 2025

