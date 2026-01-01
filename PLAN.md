# ApiDouble Implementation Plan

**Scope:** Full v1.x (v1.0 + v1.1 + v1.2)
**Package Manager:** npm
**Testing:** Vitest
**Structure:** Single package

---

## Phase 1: Project Foundation

### 1.1 Initialize Project
- `npm init` with appropriate package.json configuration
- Configure as ES Module (`"type": "module"`)
- Set up entry points for CLI and programmatic usage

### 1.2 TypeScript Configuration
```
tsconfig.json with:
- target: ES2022
- module: NodeNext
- moduleResolution: NodeNext
- strict: true
- outDir: dist/
```

### 1.3 Development Tooling
- ESLint with TypeScript plugin
- Prettier for formatting
- Vitest for testing
- tsup for building (fast, zero-config bundler)

### 1.4 Directory Structure
```
apidouble/
├── src/
│   ├── index.ts              # Main export (ApiDouble class)
│   ├── types/                # TypeScript interfaces
│   │   └── index.ts
│   ├── core/
│   │   ├── server.ts         # Express server wrapper
│   │   ├── proxy-engine.ts   # Request forwarding & recording
│   │   ├── matcher.ts        # Request matching logic
│   │   └── interceptor.ts    # Response modification
│   ├── storage/
│   │   ├── base.ts           # Storage interface
│   │   ├── lowdb.adapter.ts  # JSON-based storage
│   │   └── sqlite.adapter.ts # SQLite storage
│   ├── generators/
│   │   ├── faker.service.ts  # Dynamic data generation
│   │   └── schema-inferrer.ts
│   ├── chaos/
│   │   ├── index.ts
│   │   ├── latency.ts        # Delay simulation
│   │   └── error-injector.ts # Error injection
│   ├── cli/
│   │   ├── index.ts          # CLI entry point
│   │   └── commands.ts       # Command definitions
│   ├── dashboard/            # React admin UI (v1.2)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── components/
│   └── config/
│       ├── loader.ts         # Config file loader
│       └── defaults.ts       # Default configuration
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── apidouble.config.yml      # Example config
```

---

## Phase 2: v1.0 Core Features

### 2.1 Type Definitions (`src/types/index.ts`)
- `ApiDoubleConfig` - Main configuration interface
- `RequestRecord` - Stored request data
- `ResponseRecord` - Stored response data
- `MatchingStrategy` - exact | smart | fuzzy
- `ServerMode` - proxy | mock | intercept

### 2.2 Storage Layer (`src/storage/`)
**Interface (`base.ts`):**
```typescript
interface Storage {
  save(request: RequestRecord, response: ResponseRecord): Promise<void>
  find(request: RequestRecord): Promise<ResponseRecord | null>
  list(): Promise<RecordedEntry[]>
  clear(): Promise<void>
}
```

**LowDB Adapter (`lowdb.adapter.ts`):**
- JSON file-based storage
- Uses lowdb with JSONFile adapter
- Stores in `./mocks/` directory by default

### 2.3 Request Matcher (`src/core/matcher.ts`)
- Match by method + URL path
- Basic query parameter matching
- Configurable ignored headers (e.g., Authorization)

### 2.4 Proxy Engine (`src/core/proxy-engine.ts`)
- Express middleware using `http-proxy-middleware`
- Intercepts requests before forwarding
- Records request/response pairs to storage
- Handles proxy errors gracefully

### 2.5 Server (`src/core/server.ts`)
- Express server wrapper
- Mode switching (proxy/mock)
- CORS middleware with configuration
- Route registration API

### 2.6 Main Class (`src/index.ts`)
```typescript
class ApiDouble {
  constructor(config: ApiDoubleConfig)
  start(): Promise<void>
  stop(): Promise<void>
  route(method, path, handler): void
}
```

### 2.7 CLI (`src/cli/`)
- `apidouble start` - Start server with options
- `apidouble list` - List recorded mocks
- `apidouble clear` - Clear stored mocks
- Options: `--mode`, `--port`, `--target`, `--config`

### 2.8 Config Loader (`src/config/`)
- Load from `apidouble.config.yml`
- Merge with CLI arguments
- Provide sensible defaults

---

## Phase 3: v1.1 Advanced Features

### 3.1 Intercept Mode (`src/core/interceptor.ts`)
- Response modification hooks
- `server.intercept(method, path, modifyFn)`
- Modify status, headers, body before returning

### 3.2 Chaos Engine (`src/chaos/`)
**Latency (`latency.ts`):**
- Configurable min/max delay
- Random delay within range
- Per-route latency rules

**Error Injector (`error-injector.ts`):**
- Configurable error rate (0-100%)
- Random 500 errors
- Custom error responses

### 3.3 SQLite Storage (`src/storage/sqlite.adapter.ts`)
- better-sqlite3 for sync operations
- Schema: requests, responses tables
- Indexed by method + URL for fast lookups

### 3.4 Smart Request Matching
- Body-aware matching (hash comparison)
- Header matching (configurable subset)
- Query parameter normalization
- Fuzzy URL matching option

---

## Phase 4: v1.2 Developer Experience

### 4.1 Faker.js Integration (`src/generators/faker.service.ts`)
- Template syntax in route handlers: `{{faker.person.fullName}}`
- Context-aware data (e.g., consistent IDs)
- Seed support for reproducible data

### 4.2 Schema Inference (`src/generators/schema-inferrer.ts`)
- Analyze recorded responses
- Generate TypeScript interfaces
- Suggest Faker mappings for fields

### 4.3 Hot Reload
- Watch `apidouble.config.yml` for changes
- Reload routes without restart
- File watcher using chokidar

### 4.4 Admin Dashboard (`src/dashboard/`)
- Separate Vite build embedded in server
- Served at `/__admin` endpoint

**Features:**
- List all recorded mocks
- View request/response details
- Enable/disable specific mocks
- Real-time traffic monitor
- Mode switching UI
- Chaos settings panel

**Tech:**
- React 18 + TypeScript
- Vite for dev/build
- TailwindCSS for styling
- REST API endpoints for admin operations

---

## Phase 5: Testing Strategy

### Unit Tests
- Matcher logic
- Storage adapters
- Chaos functions
- Config loader

### Integration Tests
- Full proxy flow
- Mock playback
- Intercept mode
- CLI commands

### E2E Tests
- Dashboard interactions (if time permits)

---

## Implementation Order

1. **Foundation** - Project setup, tooling, structure
2. **Types** - Define all interfaces
3. **Storage** - LowDB adapter first
4. **Matcher** - Basic matching
5. **Proxy Engine** - Core proxy functionality
6. **Server** - Express wrapper, modes
7. **Main Class** - Public API
8. **CLI** - Commander.js commands
9. **Config** - YAML loader
10. **Tests** - Unit + integration for v1.0
11. **Intercept Mode** - Response modification
12. **Chaos Engine** - Latency + errors
13. **SQLite** - Alternative storage
14. **Smart Matching** - Enhanced matching
15. **Faker Integration** - Dynamic data
16. **Schema Inferrer** - Type generation
17. **Hot Reload** - Config watching
18. **Dashboard** - React admin UI

---

## Key Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.x",
    "http-proxy-middleware": "^3.x",
    "lowdb": "^7.x",
    "better-sqlite3": "^11.x",
    "commander": "^12.x",
    "@faker-js/faker": "^9.x",
    "yaml": "^2.x",
    "chokidar": "^4.x",
    "cors": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^2.x",
    "tsup": "^8.x",
    "eslint": "^9.x",
    "@types/express": "^4.x",
    "@types/better-sqlite3": "^7.x",
    "react": "^18.x",
    "vite": "^6.x",
    "tailwindcss": "^3.x"
  }
}
```

---

## Files to Create (Priority Order)

### Phase 1 (Foundation)
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.eslintrc.cjs`
- `.prettierrc`
- `.gitignore`

### Phase 2 (v1.0 Core)
- `src/types/index.ts`
- `src/storage/base.ts`
- `src/storage/lowdb.adapter.ts`
- `src/core/matcher.ts`
- `src/core/proxy-engine.ts`
- `src/core/server.ts`
- `src/index.ts`
- `src/cli/index.ts`
- `src/cli/commands.ts`
- `src/config/defaults.ts`
- `src/config/loader.ts`

### Phase 3 (v1.1 Advanced)
- `src/core/interceptor.ts`
- `src/chaos/index.ts`
- `src/chaos/latency.ts`
- `src/chaos/error-injector.ts`
- `src/storage/sqlite.adapter.ts`

### Phase 4 (v1.2 DX)
- `src/generators/faker.service.ts`
- `src/generators/schema-inferrer.ts`
- `src/dashboard/*` (React app)
