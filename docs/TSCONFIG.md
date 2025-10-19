# TSCONFIG

## Files

### 1️⃣ tsconfig.base.json (shared compiler settings)

```json
{
  "compilerOptions": {
    /* === Core compilation options === */
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,

    /* === Path aliases for IDE autocomplete === */
    "baseUrl": ".",
    "paths": {
      "@itrade/core": ["packages/core/src"],
      "@itrade/core/*": ["packages/core/src/*"],
      "@itrade/utils": ["packages/utils/src"],
      "@itrade/utils/*": ["packages/utils/src/*"],
      "@itrade/logger": ["packages/logger/src"],
      "@itrade/logger/*": ["packages/logger/src/*"],
      "@itrade/exchange-connectors": ["packages/exchange-connectors/src"],
      "@itrade/exchange-connectors/*": ["packages/exchange-connectors/src/*"],
      "@itrade/strategies": ["packages/strategies/src"],
      "@itrade/strategies/*": ["packages/strategies/src/*"],
      "@itrade/data-manager": ["packages/data-manager/src"],
      "@itrade/data-manager/*": ["packages/data-manager/src/*"],
      "@itrade/risk-manager": ["packages/risk-manager/src"],
      "@itrade/risk-manager/*": ["packages/risk-manager/src/*"],
      "@itrade/portfolio-manager": ["packages/portfolio-manager/src"],
      "@itrade/portfolio-manager/*": ["packages/portfolio-manager/src/*"]
    },

    /* === Output options === */
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  }
}
```

👉 Purpose: Shared base config for every package, for both IDE and local builds.

### 🧩 2️⃣ Root tsconfig.json (the build orchestrator)

````json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/utils" },
    { "path": "packages/logger" },
    { "path": "packages/exchange-connectors" },
    { "path": "packages/strategies" },
    { "path": "packages/data-manager" },
    { "path": "packages/risk-manager" },
    { "path": "packages/portfolio-manager" },
    { "path": "apps/console" },
    { "path": "apps/web" }
  ]
}


👉 Purpose: entry point for tsc --build.
When you run:
```bash
tsc --build
````

it will build everything in dependency order.

### 🧩 3️⃣ packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.spec.ts"]
}
```

✅ The cleanest simple package config possible.

### 🧩 4️⃣ packages/exchange-connectors/tsconfig.json (dev/IDE version)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.spec.ts"],
  "references": [{ "path": "../core" }, { "path": "../utils" }, { "path": "../logger" }]
}
```

✅ Works great for editor + type checking.
❌ But still uses paths from base config, which can confuse the compiler during builds.

🧩 5️⃣ packages/exchange-connectors/tsconfig.build.json (safe build version)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "paths": {}, // disable local alias resolution during build
    "rootDir": "src",
    "outDir": "dist"
  }
}
```

Then build this package alone safely:

```bash
tsc -p packages/exchange-connectors/tsconfig.build.json
```

✅ This ensures imports like @itrade/core are resolved through project references
and prevents the "File is not under rootDir" error completely.

🧰 Commands You’ll Use
Build everything

```bash
tsc --build
```

Clean all build outputs

```bash
tsc --build --clean
```

Build only one package safely

```bash
tsc -p packages/exchange-connectors/tsconfig.build.json
```

Watch mode (for dev)

```bash
tsc -p packages/exchange-connectors/tsconfig.json --watch
```

## ✅ Summary

| Purpose                     | File                                             | Notes                            |
| --------------------------- | ------------------------------------------------ | -------------------------------- |
| Shared compiler options     | tsconfig.base.json                               | Editor-friendly + shared aliases |
| Build orchestrator          | tsconfig.json                                    | Top-level references             |
| Core package                | packages/core/tsconfig.json                      | Simple and clean                 |
| Exchange connectors (dev)   | packages/exchange-connectors/tsconfig.json       | IDE + incremental build          |
| Exchange connectors (build) | packages/exchange-connectors/tsconfig.build.json | Safe build; no alias confusion   |
