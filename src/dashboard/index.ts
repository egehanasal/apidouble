/**
 * Admin Dashboard - Lightweight web UI for ApiDouble
 */

import type { RequestHandler, Request, Response } from 'express';

/**
 * Generate the dashboard HTML
 */
function generateDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ApiDouble Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
    }
    header h1 { font-size: 24px; font-weight: 600; }
    header p { opacity: 0.9; font-size: 14px; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #555;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #666; }
    .stat-value { font-weight: 600; color: #333; }
    .status-ok { color: #22c55e; }
    .status-warn { color: #f59e0b; }
    .status-error { color: #ef4444; }
    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    button:hover { background: #5a67d8; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    button.danger { background: #ef4444; }
    button.danger:hover { background: #dc2626; }
    button.secondary { background: #6b7280; }
    button.secondary:hover { background: #4b5563; }
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
    select, input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      width: 100%;
      margin-bottom: 10px;
    }
    .form-row { display: flex; gap: 10px; align-items: center; }
    .form-row select, .form-row input { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; }
    th { background: #f9fafb; font-weight: 600; color: #555; }
    tr:hover { background: #f9fafb; }
    .method {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .method-GET { background: #dbeafe; color: #1d4ed8; }
    .method-POST { background: #dcfce7; color: #166534; }
    .method-PUT { background: #fef3c7; color: #92400e; }
    .method-PATCH { background: #e0e7ff; color: #4338ca; }
    .method-DELETE { background: #fee2e2; color: #991b1b; }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      animation: slideIn 0.3s ease;
    }
    .toast.success { background: #22c55e; }
    .toast.error { background: #ef4444; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .empty { color: #999; text-align: center; padding: 40px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-enabled { background: #dcfce7; color: #166534; }
    .badge-disabled { background: #f3f4f6; color: #6b7280; }
    .toggle { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
    .toggle-switch {
      position: relative;
      width: 50px;
      height: 26px;
      background: #ccc;
      border-radius: 13px;
      cursor: pointer;
      transition: background 0.3s;
    }
    .toggle-switch.active { background: #22c55e; }
    .toggle-switch::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      background: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: transform 0.3s;
    }
    .toggle-switch.active::after { transform: translateX(24px); }
    #refresh-btn { position: absolute; top: 20px; right: 20px; }
    .relative { position: relative; }
  </style>
</head>
<body>
  <div class="container">
    <header class="relative">
      <h1>ApiDouble Dashboard</h1>
      <p>API Mocking & Traffic Interception</p>
      <button id="refresh-btn" onclick="refreshAll()">Refresh</button>
    </header>

    <div class="grid">
      <!-- Status Card -->
      <div class="card">
        <h2>Server Status</h2>
        <div id="status-content">Loading...</div>
      </div>

      <!-- Mode Card -->
      <div class="card">
        <h2>Mode Control</h2>
        <div class="form-row">
          <select id="mode-select">
            <option value="proxy">Proxy (Record)</option>
            <option value="mock">Mock (Playback)</option>
            <option value="intercept">Intercept (Modify)</option>
          </select>
          <button onclick="changeMode()">Apply</button>
        </div>
        <div class="form-row" style="margin-top: 10px;">
          <input type="text" id="target-input" placeholder="Target URL (for proxy/intercept)">
        </div>
      </div>

      <!-- Chaos Card -->
      <div class="card">
        <h2>Chaos Engineering</h2>
        <div class="toggle">
          <div id="chaos-toggle" class="toggle-switch" onclick="toggleChaos()"></div>
          <span id="chaos-status">Disabled</span>
        </div>
        <div id="chaos-stats"></div>
      </div>

      <!-- Quick Actions -->
      <div class="card">
        <h2>Quick Actions</h2>
        <div class="btn-group">
          <button onclick="clearMocks()" class="danger">Clear All Mocks</button>
          <button onclick="exportMocks()" class="secondary">Export Mocks</button>
        </div>
      </div>
    </div>

    <!-- Mocks Table -->
    <div class="card" style="margin-top: 20px;">
      <h2>Recorded Mocks <span id="mock-count" style="font-weight: normal; color: #999;"></span></h2>
      <div id="mocks-content">Loading...</div>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;
    let toastTimeout;

    function showToast(message, type = 'info') {
      const existing = document.querySelector('.toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      document.body.appendChild(toast);

      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => toast.remove(), 3000);
    }

    async function fetchAPI(endpoint, options = {}) {
      try {
        const res = await fetch(API_BASE + endpoint, {
          ...options,
          headers: { 'Content-Type': 'application/json', ...options.headers }
        });
        return await res.json();
      } catch (error) {
        showToast('API Error: ' + error.message, 'error');
        throw error;
      }
    }

    async function loadStatus() {
      try {
        const [health, status] = await Promise.all([
          fetchAPI('/__health'),
          fetchAPI('/__status')
        ]);

        document.getElementById('status-content').innerHTML = \`
          <div class="stat">
            <span class="stat-label">Status</span>
            <span class="stat-value status-ok">\${health.status}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Mode</span>
            <span class="stat-value">\${status.mode}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Target</span>
            <span class="stat-value">\${status.target || 'N/A'}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Recorded Entries</span>
            <span class="stat-value">\${status.recordedEntries}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Port</span>
            <span class="stat-value">\${status.port}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Uptime</span>
            <span class="stat-value">\${Math.floor(health.uptime)}s</span>
          </div>
        \`;

        document.getElementById('mode-select').value = status.mode;
        if (status.target) {
          document.getElementById('target-input').value = status.target;
        }
      } catch (e) {
        document.getElementById('status-content').innerHTML = '<div class="empty">Failed to load status</div>';
      }
    }

    async function loadMocks() {
      try {
        const data = await fetchAPI('/__mocks');
        document.getElementById('mock-count').textContent = '(' + data.count + ')';

        if (data.count === 0) {
          document.getElementById('mocks-content').innerHTML = '<div class="empty">No mocks recorded yet</div>';
          return;
        }

        const rows = data.entries.map(e => \`
          <tr>
            <td><span class="method method-\${e.method}">\${e.method}</span></td>
            <td>\${e.path}</td>
            <td>\${e.status}</td>
            <td>\${new Date(e.createdAt).toLocaleString()}</td>
            <td><button onclick="deleteMock('\${e.id}')" class="danger" style="padding: 4px 8px; font-size: 12px;">Delete</button></td>
          </tr>
        \`).join('');

        document.getElementById('mocks-content').innerHTML = \`
          <table>
            <thead>
              <tr><th>Method</th><th>Path</th><th>Status</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>
        \`;
      } catch (e) {
        document.getElementById('mocks-content').innerHTML = '<div class="empty">Failed to load mocks</div>';
      }
    }

    async function loadChaos() {
      try {
        const data = await fetchAPI('/__chaos');
        const toggle = document.getElementById('chaos-toggle');
        const status = document.getElementById('chaos-status');

        if (data.enabled) {
          toggle.classList.add('active');
          status.textContent = 'Enabled';
        } else {
          toggle.classList.remove('active');
          status.textContent = 'Disabled';
        }

        document.getElementById('chaos-stats').innerHTML = \`
          <div class="stat">
            <span class="stat-label">Requests Processed</span>
            <span class="stat-value">\${data.requestsProcessed}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Errors Injected</span>
            <span class="stat-value">\${data.errorsInjected}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Avg Latency Added</span>
            <span class="stat-value">\${data.averageLatency}ms</span>
          </div>
        \`;
      } catch (e) {
        document.getElementById('chaos-stats').innerHTML = '<div class="stat"><span class="stat-label">Chaos stats not available</span></div>';
      }
    }

    async function changeMode() {
      const mode = document.getElementById('mode-select').value;
      const target = document.getElementById('target-input').value;

      try {
        await fetchAPI('/__mode', {
          method: 'POST',
          body: JSON.stringify({ mode, target: target || undefined })
        });
        showToast('Mode changed to ' + mode, 'success');
        loadStatus();
      } catch (e) {
        showToast('Failed to change mode', 'error');
      }
    }

    async function toggleChaos() {
      const toggle = document.getElementById('chaos-toggle');
      const enable = !toggle.classList.contains('active');

      try {
        await fetchAPI('/__chaos', {
          method: 'POST',
          body: JSON.stringify({ enabled: enable })
        });
        showToast('Chaos ' + (enable ? 'enabled' : 'disabled'), 'success');
        loadChaos();
      } catch (e) {
        showToast('Failed to toggle chaos', 'error');
      }
    }

    async function clearMocks() {
      if (!confirm('Are you sure you want to delete all mocks?')) return;

      try {
        await fetchAPI('/__mocks', { method: 'DELETE' });
        showToast('All mocks cleared', 'success');
        loadMocks();
        loadStatus();
      } catch (e) {
        showToast('Failed to clear mocks', 'error');
      }
    }

    async function deleteMock(id) {
      try {
        await fetchAPI('/__mocks/' + id, { method: 'DELETE' });
        showToast('Mock deleted', 'success');
        loadMocks();
        loadStatus();
      } catch (e) {
        showToast('Failed to delete mock', 'error');
      }
    }

    function exportMocks() {
      window.open(API_BASE + '/__mocks', '_blank');
    }

    function refreshAll() {
      loadStatus();
      loadMocks();
      loadChaos();
      showToast('Refreshed', 'success');
    }

    // Initial load
    loadStatus();
    loadMocks();
    loadChaos();

    // Auto-refresh every 10 seconds
    setInterval(() => {
      loadStatus();
      loadChaos();
    }, 10000);
  </script>
</body>
</html>`;
}

/**
 * Create dashboard middleware
 */
export function createDashboardMiddleware(): RequestHandler {
  const html = generateDashboardHTML();

  return (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  };
}

/**
 * Create chaos API endpoints middleware
 */
export function createChaosApiMiddleware(
  getChaosStats: () => { enabled: boolean; requestsProcessed: number; errorsInjected: number; averageLatency: number },
  setChaosEnabled: (enabled: boolean) => void
): {
  get: RequestHandler;
  post: RequestHandler;
} {
  return {
    get: (_req: Request, res: Response) => {
      res.json(getChaosStats());
    },
    post: (req: Request, res: Response) => {
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled === 'boolean') {
        setChaosEnabled(enabled);
        res.json({ success: true, enabled });
      } else {
        res.status(400).json({ error: 'enabled must be a boolean' });
      }
    },
  };
}
