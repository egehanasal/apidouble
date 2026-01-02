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

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ApiDouble Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Frontend  │───>│   Proxy     │───>│   Backend   │    │
│   │   App       │<───│   Engine    │<───│   API       │    │
│   └─────────────┘    └──────┬──────┘    └─────────────┘    │
│                             │                               │
│                      ┌──────▼──────┐                        │
│                      │   Storage   │                        │
│                      │   Layer     │                        │
│                      └─────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
apidouble/
├── src/
│   ├── core/
│   │   ├── server.ts          # Main ApiDouble class
│   │   ├── proxy-engine.ts    # Request handling and forwarding
│   │   └── matcher.ts         # Smart request matching
│   ├── storage/
│   │   ├── base.ts            # Storage interface
│   │   └── lowdb.adapter.ts   # JSON-based storage
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   └── commands.ts        # CLI command definitions
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
| Storage | LowDB | JSON-based persistence |
| CLI | Commander.js | Command-line interface |

---

## Roadmap

### v1.0 — Core Features (Complete)
- [x] Proxy mode (record)
- [x] Mock mode (playback)
- [x] LowDB storage
- [x] CLI interface
- [x] Smart request matching
- [x] Admin endpoints
- [x] Configuration file support

### v1.1 — Advanced Features
- [ ] Intercept mode (response modification)
- [ ] Chaos engine (latency simulation)
- [ ] SQLite storage option
- [ ] Body-aware request matching

### v1.2 — Developer Experience
- [ ] Admin dashboard UI
- [ ] Faker.js integration for dynamic data
- [ ] Hot reload for routes

### v2.0 — Enterprise Features
- [ ] WebSocket support
- [ ] GraphQL mocking
- [ ] Team sharing

---

## License

MIT License — see [LICENSE](LICENSE) for details.
