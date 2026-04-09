---
name: TypeORM Circular Dependencies
description: How to resolve cyclic dependencies in TypeORM entities, especially in Next.js production builds.
---

# TypeORM Circular Dependencies in Production

When using TypeORM in a Next.js or monorepo environment, you may encounter circular dependency issues during production builds or at runtime (e.g. `Cyclic dependency: "d"` or similar errors). These errors differ from dev mode where circular references might be tolerated by the dev server's module loader.

## The Problem

Circular dependencies occur when two entities reference each other biddingly through `@OneToMany` and `@ManyToOne` using imported class references, or when string-based relationships fail to initialize properly in a minified production bundle.

## The Solution

To resolve this issue, you must use **unidirectional references**.

1. **Keep the `@ManyToOne` on the child entity:**
   Use the arrow function syntax to reference the parent class rather than string lookups (e.g. `() => ParentEntity`). Do NOT provide the inverse property (the second argument).

   ```typescript
   // Correct (Unidirectional)
   @ManyToOne(() => ParentEntity, { onDelete: 'CASCADE' })
   parent!: ParentEntity;
   ```

2. **Remove the `@OneToMany` array from the parent entity:**
   If you remove the inverse property from the parent, TypeORM will no longer initialize a circular link. Simply remove the `@OneToMany` decorator and the property from the parent entity.

   ```typescript
   // Removed from ParentEntity:
   // @OneToMany(() => ChildEntity, (child) => child.parent)
   // children!: ChildEntity[];
   ```

3. **Fallback to satisfying Interfaces (if needed):**
   If the parent entity implements an interface that explicitly requires the children array property (e.g. `children: ChildInterface[]`), define the property without any TypeORM decorators so the TypeScript compiler is satisfied, but TypeORM ignores it.

   ```typescript
   // Satisfies the interface without TypeORM tracking it as a cyclical relation
   children!: any[];
   ```

4. **Update Repositories and Queries:**
   Because you removed the `@OneToMany` property, you can no longer use `relations.push('children')` conceptually from the parent repository. Update your data fetching to retrieve the parent and children via separate focused queries (which is often a better practice anyway to avoid large Cartesian products).
