#!/bin/bash
#
# ApiDouble CLI Demo Script
#
# This script demonstrates CLI usage
# Run with: bash scripts/demo-cli.sh
#

set -e

CLI="node dist/cli/index.js"
PORT=3700
MOCKS_FILE="./demo-cli-mocks.json"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

section() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

run_cmd() {
    echo -e "${YELLOW}$ $1${NC}"
    eval "$1"
    echo ""
}

cleanup() {
    rm -f "$MOCKS_FILE" 2>/dev/null || true
    rm -rf ./demo-cli 2>/dev/null || true
    # Kill any running servers on our port
    lsof -ti:$PORT | xargs kill 2>/dev/null || true
}

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║                  ApiDouble CLI Demo                       ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Cleanup before starting
cleanup

# ============================================================
section "1. CLI Help"
# ============================================================

run_cmd "$CLI --help"

# ============================================================
section "2. Start Command Help"
# ============================================================

run_cmd "$CLI start --help"

# ============================================================
section "3. Start Server in Mock Mode (Background)"
# ============================================================

echo "Starting server in background..."
$CLI start --port $PORT --mode mock --storage $MOCKS_FILE &
SERVER_PID=$!
sleep 2
echo -e "${GREEN}✓ Server started with PID $SERVER_PID${NC}"
echo ""

# ============================================================
section "4. Check Server Health"
# ============================================================

run_cmd "curl -s http://localhost:$PORT/__health | jq"

# ============================================================
section "5. Check Server Status"
# ============================================================

run_cmd "curl -s http://localhost:$PORT/__status | jq"

# ============================================================
section "6. List Mocks (Empty)"
# ============================================================

run_cmd "$CLI list --storage $MOCKS_FILE"

# ============================================================
section "7. Add Some Test Data via API"
# ============================================================

echo "Adding mock data directly via storage..."

# We need to add data programmatically, so let's use a small node script
node -e "
import { LowDBStorage } from './dist/storage/lowdb.adapter.js';

const storage = new LowDBStorage('$MOCKS_FILE');
await storage.init();

await storage.save(
  { id: '1', method: 'GET', url: '/api/users', path: '/api/users', query: {}, headers: {}, timestamp: Date.now() },
  { status: 200, headers: {}, body: { users: [{id: 1, name: 'Alice'}] }, timestamp: Date.now() }
);

await storage.save(
  { id: '2', method: 'GET', url: '/api/posts', path: '/api/posts', query: {}, headers: {}, timestamp: Date.now() },
  { status: 200, headers: {}, body: { posts: [{id: 1, title: 'Hello World'}] }, timestamp: Date.now() }
);

await storage.save(
  { id: '3', method: 'POST', url: '/api/users', path: '/api/users', query: {}, headers: {}, body: {name: 'Bob'}, timestamp: Date.now() },
  { status: 201, headers: {}, body: { id: 2, name: 'Bob', created: true }, timestamp: Date.now() }
);

console.log('✓ Added 3 mock entries');
"

echo ""

# ============================================================
section "8. List Mocks (Now Has Data)"
# ============================================================

run_cmd "$CLI list --storage $MOCKS_FILE"

# ============================================================
section "9. Test Mock Responses"
# ============================================================

echo "GET /api/users"
run_cmd "curl -s http://localhost:$PORT/api/users | jq"

echo "GET /api/posts"
run_cmd "curl -s http://localhost:$PORT/api/posts | jq"

# ============================================================
section "10. Export Mocks"
# ============================================================

run_cmd "$CLI export ./exported-mocks.json --storage $MOCKS_FILE"
run_cmd "cat ./exported-mocks.json | jq '.entries | length'"
echo "Exported entries count shown above"

# ============================================================
section "11. Delete One Mock"
# ============================================================

# Get first mock ID
MOCK_ID=$(node -e "
import { LowDBStorage } from './dist/storage/lowdb.adapter.js';
const storage = new LowDBStorage('$MOCKS_FILE');
await storage.init();
const entries = await storage.list();
console.log(entries[0]?.id || '');
")

if [ -n "$MOCK_ID" ]; then
    echo "Deleting mock with ID: $MOCK_ID"
    run_cmd "$CLI delete $MOCK_ID --storage $MOCKS_FILE"
    run_cmd "$CLI list --storage $MOCKS_FILE"
fi

# ============================================================
section "12. Clear All Mocks"
# ============================================================

run_cmd "$CLI clear --storage $MOCKS_FILE --yes"
run_cmd "$CLI list --storage $MOCKS_FILE"

# ============================================================
section "13. Import Mocks Back"
# ============================================================

run_cmd "$CLI import ./exported-mocks.json --storage $MOCKS_FILE"
run_cmd "$CLI list --storage $MOCKS_FILE"

# ============================================================
section "14. Stop Server"
# ============================================================

echo "Stopping server (PID: $SERVER_PID)..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo -e "${GREEN}✓ Server stopped${NC}"

# ============================================================
section "CLEANUP"
# ============================================================

cleanup
rm -f ./exported-mocks.json
echo -e "${GREEN}✓ Cleaned up demo files${NC}"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║                  CLI Demo Complete! ✓                     ║"
echo "║                                                           ║"
echo "║  Commands demonstrated:                                   ║"
echo "║  • apidouble start --port --mode --storage                ║"
echo "║  • apidouble list --storage                               ║"
echo "║  • apidouble export <file> --storage                      ║"
echo "║  • apidouble import <file> --storage                      ║"
echo "║  • apidouble delete <id> --storage                        ║"
echo "║  • apidouble clear --storage --yes                        ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
