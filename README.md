# ApiDouble

**API Mocking & Traffic Interception Tool for Developers**

A proxy tool with smart record-and-playback capabilities that eliminates "API not ready" and "backend is down" blockers during frontend development.

---

## The Problem

Frontend developers in large projects frequently face these obstacles:

- Backend APIs are not ready yet
- Test environments are unstable or unreachable
- Testing edge cases and error scenarios is difficult
- API changes break frontend development flow

**ApiDouble** removes these bottlenecks by letting you record real API responses and replay them offline, or define custom mock responses programmatically.

---

## Features

### Operating Modes

| Mode | Description |
|------|-------------|
| **Proxy (Record)** | Forwards requests to the real backend and records responses |
| **Mock (Playback)** | Returns recorded responses without needing the backend |
| **Intercept (Modify)** | Modifies responses before returning them to the client |

### Core Capabilities

- **Smart Request Matching** — Matches requests by URL patterns, recognizing IDs and UUIDs
- **Multiple Storage Options** — JSON-based (LowDB) or SQLite storage
- **Automatic CORS Handling** — Solves cross-origin issues automatically
- **Admin Endpoints** — Health checks, status, and mock management via HTTP
- **Programmatic API** — Full control via TypeScript/JavaScript
- **CLI Interface** — Easy command-line usage for quick setup
- **Chaos Engineering** — Simulate latency and random failures for resilience testing
- **Response Interception** — Modify responses on-the-fly with custom handlers

---

## Installation

```bash
# Global installation
npm install -g apidouble

# Or as a project dependency
npm install --save-dev apidouble
```

---

## Quick Start

### CLI Usage

```bash
# Start in proxy mode (records requests)
apidouble start --mode proxy --target https://api.example.com --port 3001

# Start in mock mode (replays recorded responses)
apidouble start --mode mock --port 3001

# List recorded mocks
apidouble list

# Export mocks to a file
apidouble export ./mocks-backup.json

# Import mocks from a file
apidouble import ./mocks-backup.json

# Clear all recorded mocks
apidouble clear
```

### Programmatic Usage

```typescript
import { ApiDouble } from 'apidouble';

const server = new ApiDouble({
  port: 3001,
  mode: 'proxy',
  target: 'https://api.example.com',
  storage: {
    type: 'lowdb',
    path: './mocks/db.json'
  }
});

// Define custom routes
server.route('GET', '/api/users', () => ({
  body: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ]
}));

server.route('GET', '/api/users/:id', (req) => ({
  body: {
    id: parseInt(req.params.id),
    name: `User ${req.params.id}`
  }
}));

server.route('POST', '/api/users', (req) => ({
  status: 201,
  body: { id: 100, ...req.body, created: true }
}));

await server.start();
console.log('Server running on http://localhost:3001');
```

### Configuration File

Create `apidouble.config.yml` in your project root:

```yaml
server:
  port: 3001
  mode: proxy

target:
  url: https://api.example.com

storage:
  type: lowdb
  path: ./mocks/db.json

cors:
  enabled: true
  origins:
    - http://localhost:3000
    - http://localhost:5173

matching:
  strategy: smart  # exact | smart | fuzzy
```

Then start with:

```bash
apidouble start --config apidouble.config.yml
```

---

## Admin Endpoints

When the server is running, these endpoints are available:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/__health` | GET | Health check |
| `/__status` | GET | Server status and mock count |
| `/__mocks` | GET | List all recorded mocks |
| `/__mocks` | DELETE | Clear all mocks |
| `/__mocks/:id` | DELETE | Delete a specific mock |
| `/__mode` | POST | Switch between modes |

Example:

```bash
# Check server health
curl http://localhost:3001/__health

# List all mocks
curl http://localhost:3001/__mocks

# Switch to mock mode
curl -X POST http://localhost:3001/__mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "mock"}'

# Switch to proxy mode with target
curl -X POST http://localhost:3001/__mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "proxy", "target": "https://api.example.com"}'
```

---

## Smart Request Matching

ApiDouble uses intelligent matching to find recorded responses:

1. **Exact Match** — Method + exact URL path
2. **Smart Match** — Recognizes dynamic segments like IDs, UUIDs, and MongoDB ObjectIds

For example, if you recorded `GET /api/users/123`, a request to `GET /api/users/456` will match and return the same response structure.

Supported patterns:
- Numeric IDs: `/users/123`, `/posts/456`
- UUIDs: `/items/550e8400-e29b-41d4-a716-446655440000`
- MongoDB ObjectIds: `/docs/507f1f77bcf86cd799439011`

---

## Intercept Mode

Intercept mode lets you modify responses from the real API before returning them to the client. This is useful for testing edge cases, injecting errors, or transforming data.

```typescript
import { ApiDouble, InterceptHelpers } from 'apidouble';

const server = new ApiDouble({
  port: 3001,
  mode: 'intercept',
  target: 'https://api.example.com'
});

await server.start();

// Modify specific endpoints
server.intercept('GET', '/api/users/:id', (response, context) => ({
  ...response,
  body: {
    ...response.body,
    intercepted: true,
    userId: context.params.id
  }
}));

// Simulate slow responses
server.intercept('GET', '/api/slow/*', InterceptHelpers.delay(2000));

// Change status codes
server.intercept('POST', '/api/items', InterceptHelpers.setStatus(201));

// Simulate errors
server.intercept('DELETE', '/api/protected/*',
  InterceptHelpers.simulateError(403, 'Access denied')
);

// Chain multiple modifications
server.intercept('GET', '/api/data', InterceptHelpers.chain(
  InterceptHelpers.delay(500),
  InterceptHelpers.setHeaders({ 'X-Modified': 'true' }),
  InterceptHelpers.modifyBody((body) => ({ ...body, modified: true }))
));
```

### Available Intercept Helpers

| Helper | Description |
|--------|-------------|
| `delay(ms)` | Add artificial latency |
| `replaceBody(newBody)` | Replace the entire response body |
| `modifyBody(fn)` | Transform the response body |
| `setStatus(code)` | Change the HTTP status code |
| `setHeaders(headers)` | Add or modify response headers |
| `simulateError(status, message)` | Return an error response |
| `chain(...handlers)` | Combine multiple handlers |

---

## Chaos Engineering

Test your application's resilience by simulating network issues and failures.

### Basic Usage

```typescript
import { ApiDouble, ChaosPresets } from 'apidouble';

// Using presets
const server = new ApiDouble({
  port: 3001,
  mode: 'mock',
  chaos: ChaosPresets.flaky() // 5% errors + 100-300ms latency
});

await server.start();

// Or configure manually
server.enableChaos();
server.setChaosLatency({ min: 100, max: 500 });
server.setChaosErrorRate(10); // 10% of requests fail
```

### Per-Route Chaos Rules

```typescript
// Add latency to specific routes
server.addChaosLatencyRule('GET', '/api/slow/*', { min: 1000, max: 3000 });

// Inject errors for specific endpoints
server.addChaosErrorRule('POST', '/api/payments/*', {
  rate: 20,       // 20% failure rate
  status: 503,
  message: 'Service temporarily unavailable'
});
```

### Chaos Presets

| Preset | Latency | Error Rate | Use Case |
|--------|---------|------------|----------|
| `slowNetwork()` | 100-500ms | 0% | Test loading states |
| `verySlowNetwork()` | 500-2000ms | 0% | Test timeout handling |
| `unreliable()` | 0ms | 10% | Test error recovery |
| `flaky()` | 100-300ms | 5% | Realistic unstable API |
| `stress()` | 200-1000ms | 20% | Stress testing |

### Error Presets

```typescript
import { ErrorPresets } from 'apidouble';

server.addChaosErrorRule('*', '/api/*', ErrorPresets.serverError(10));
server.addChaosErrorRule('*', '/api/*', ErrorPresets.rateLimited(5));
server.addChaosErrorRule('*', '/api/*', ErrorPresets.timeout(3));
```

### Monitoring Chaos

```typescript
const stats = server.getChaosStats();
console.log(stats);
// {
//   enabled: true,
//   requestsProcessed: 150,
//   errorsInjected: 15,
//   totalLatencyAdded: 45000,
//   averageLatency: 300
// }
```

---

## Storage Options

### LowDB (Default)

JSON file-based storage, ideal for development and small projects:

```typescript
const server = new ApiDouble({
  storage: {
    type: 'lowdb',
    path: './mocks/db.json'
  }
});
```

### SQLite

Better for larger datasets and concurrent access:

```typescript
const server = new ApiDouble({
  storage: {
    type: 'sqlite',
    path: './mocks/apidouble.db'
  }
});
```

SQLite storage provides additional query capabilities:

```typescript
import { SQLiteStorage } from 'apidouble';

const storage = new SQLiteStorage('./mocks/apidouble.db');
await storage.init();

// Search by method and path pattern
const results = await storage.search('GET', '/api/users/*');

// Get entries within a time range
const recent = await storage.getByTimeRange(
  Date.now() - 3600000, // 1 hour ago
  Date.now()
);

// Don't forget to close when done
storage.close();
```

---

## Use Cases

### 1. Offline Development

Record API responses once, then develop without network access:

```bash
# Record responses from real API
apidouble start --mode proxy --target https://api.prod.com --port 3001
# Make requests through proxy...

# Later, work offline with recorded responses
apidouble start --mode mock --port 3001
```

### 2. Frontend Testing

Create predictable test fixtures:

```typescript
const server = new ApiDouble({ port: 4000, mode: 'mock' });

server.route('GET', '/api/users', () => ({
  body: { users: [{ id: 1, name: 'Test User' }] }
}));

server.route('GET', '/api/error', () => ({
  status: 500,
  body: { error: 'Internal Server Error' }
}));

await server.start();
// Run your tests against http://localhost:4000
```

### 3. Demo Environments

Create stable demo environments that don't depend on backend availability:

```bash
# Export production-like data
apidouble export ./demo-data.json

# Import for demos
apidouble import ./demo-data.json
apidouble start --mode mock --port 3001
```

### 4. Resilience Testing

Test how your frontend handles failures and slow responses:

```typescript
import { ApiDouble, ChaosPresets, ErrorPresets } from 'apidouble';

const server = new ApiDouble({
  port: 3001,
  mode: 'mock',
  chaos: ChaosPresets.flaky()
});

await server.start();

// Test specific failure scenarios
server.addChaosErrorRule('POST', '/api/checkout', ErrorPresets.serverError(50));
server.addChaosLatencyRule('GET', '/api/products', { min: 2000, max: 5000 });

// Run your tests to verify:
// - Loading states appear correctly
// - Error messages are user-friendly
// - Retry logic works as expected
// - Timeouts are handled gracefully
```

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        ApiDouble Server                           │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│   │   Frontend  │───>│   Chaos     │───>│   Proxy     │──────┐   │
│   │   App       │<───│   Engine    │<───│   Engine    │<──┐  │   │
│   └─────────────┘    └─────────────┘    └──────┬──────┘   │  │   │
│                       (latency/errors)         │          │  │   │
│                                                │          │  │   │
│                      ┌─────────────┐    ┌──────▼──────┐   │  │   │
│                      │ Interceptor │    │   Backend   │───┘  │   │
│                      │  (modify)   │    │     API     │      │   │
│                      └──────┬──────┘    └─────────────┘      │   │
│                             │                                │   │
│                      ┌──────▼──────┐                         │   │
│                      │   Storage   │─────────────────────────┘   │
│                      │ LowDB/SQLite│                             │
│                      └─────────────┘                             │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
apidouble/
├── src/
│   ├── core/
│   │   ├── server.ts          # Main ApiDouble class
│   │   ├── proxy-engine.ts    # Request handling and forwarding
│   │   ├── matcher.ts         # Smart request matching
│   │   └── interceptor.ts     # Response interception
│   ├── storage/
│   │   ├── base.ts            # Storage interface
│   │   ├── lowdb.adapter.ts   # JSON-based storage
│   │   └── sqlite.adapter.ts  # SQLite storage
│   ├── chaos/
│   │   ├── index.ts           # Chaos engine
│   │   ├── latency.ts         # Latency simulation
│   │   └── error-injector.ts  # Error injection
│   ├── cli/
│   │   └── index.ts           # CLI entry point
│   ├── config/
│   │   └── loader.ts          # Configuration loading
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   └── index.ts               # Main export
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── scripts/
│   ├── demo.js                # Feature demo script
│   └── demo-proxy.js          # Proxy mode demo script
└── package.json
```

---

## Running the Demos

```bash
# Build the project first
npm run build

# Run the main demo (custom routes, admin endpoints, storage)
npm run demo

# Run the proxy demo (record and playback)
npm run demo:proxy
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js + TypeScript | Type safety and modern JS features |
| Server | Express.js | HTTP server and routing |
| Proxy | http-proxy-middleware | Request forwarding |
| Storage | LowDB / better-sqlite3 | JSON or SQLite persistence |
| CLI | Commander.js | Command-line interface |
| Testing | Vitest | Unit and integration tests |
| Build | tsup | Fast TypeScript bundling |

---

## Roadmap

### v1.0 — Core Features ✅
- [x] Proxy mode (record)
- [x] Mock mode (playback)
- [x] LowDB storage
- [x] CLI interface
- [x] Smart request matching
- [x] Admin endpoints
- [x] Configuration file support

### v1.1 — Advanced Features ✅
- [x] Intercept mode (response modification)
- [x] Chaos engine (latency + error injection)
- [x] SQLite storage option
- [x] Body-aware request matching

### v1.2 — Developer Experience
- [ ] Admin dashboard UI
- [ ] Faker.js integration for dynamic data
- [ ] Hot reload for routes
- [ ] Schema inference from recorded responses

### v2.0 — Enterprise Features
- [ ] WebSocket support
- [ ] GraphQL mocking
- [ ] Team sharing

---

## License

MIT License — see [LICENSE](LICENSE) for details.
