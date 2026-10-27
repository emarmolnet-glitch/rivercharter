/**
 * DataBridge API Service
 * Centralizes DataBridge endpoint routing and HTTP requests for RiverCharter.
 * Ensures all DataBridge endpoints (/.netlify/functions/databridge-master-stats, /.netlify/functions/databridge-connection-state, etc.)
 * point to the isolated DataBridge environment (https://calm-shortbread-55bcfc.netlify.app).
 */

export const DATA_BRIDGE_DEFAULT_ORIGIN = '';

// Base endpoints for DataBridge services (using native Netlify Functions prefix)
export const DATA_BRIDGE_CONNECTION_STATE_ENDPOINT = '/.netlify/functions/databridge-connection-state';
export const DATA_BRIDGE_MASTER_STATS_ENDPOINT = '/.netlify/functions/databridge-master-stats';
export const DATA_BRIDGE_CEREBRO_IA_ENDPOINT = '/.netlify/functions/cerebro-ia';
export const DATA_BRIDGE_VERIFY_ENDPOINT = '/.netlify/functions/verify-connection';
export const DATA_BRIDGE_RECEIVE_CORE_DATA_ENDPOINT = '/.netlify/functions/receive-core-data';

export function getDataBridgeBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_DATA_BRIDGE_API_URL) return process.env.VITE_DATA_BRIDGE_API_URL.replace(/\/+$/, '');
    if (process.env.VITE_DATA_BRIDGE_URL) return process.env.VITE_DATA_BRIDGE_URL.replace(/\/+$/, '');
    if (process.env.DATA_BRIDGE_API_URL) return process.env.DATA_BRIDGE_API_URL.replace(/\/+$/, '');
  }
  if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
    const env = (import.meta as any).env;
    if (env.VITE_DATA_BRIDGE_API_URL) return String(env.VITE_DATA_BRIDGE_API_URL).replace(/\/+$/, '');
    if (env.VITE_DATA_BRIDGE_URL) return String(env.VITE_DATA_BRIDGE_URL).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    if ((window as any).DATA_BRIDGE_API_URL) return String((window as any).DATA_BRIDGE_API_URL).replace(/\/+$/, '');
    if ((window as any).CORE_PRO_API_ORIGIN) return String((window as any).CORE_PRO_API_ORIGIN).replace(/\/+$/, '');
    if ((window as any).NETLIFY_PRODUCTION_ORIGIN) return String((window as any).NETLIFY_PRODUCTION_ORIGIN).replace(/\/+$/, '');
  }
  return DATA_BRIDGE_DEFAULT_ORIGIN;
}

export const DATA_BRIDGE_BASE_URL = getDataBridgeBaseUrl();
export const DATABRIDGE_API_URL = DATA_BRIDGE_BASE_URL;

/**
 * Resolves a DataBridge API endpoint.
 * Automatically converts legacy /api/ prefixes to native Netlify Functions prefix (/.netlify/functions/).
 * Example:
 * /api/databridge-connection-state -> https://calm-shortbread-55bcfc.netlify.app/.netlify/functions/databridge-connection-state
 */
export function resolveDataBridgeApiEndpoint(endpoint: string): string {
  if (!endpoint || typeof endpoint !== 'string') return endpoint;

  let path = endpoint;
  if (path.startsWith('/api/')) {
    path = path.replace(/^\/api\//, '/.netlify/functions/');
  } else if (!path.startsWith('/.netlify/functions/') && !path.startsWith('http://') && !path.startsWith('https://')) {
    path = `/.netlify/functions/${path.replace(/^\/+/, '')}`;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = getDataBridgeBaseUrl() || DATA_BRIDGE_DEFAULT_ORIGIN;
  return base ? `${base.replace(/\/+$/, '')}${path}` : path;
}

export function resolveDataBridgeUrl(path: string): string {
  return resolveDataBridgeApiEndpoint(path);
}

export async function fetchDataBridgeApi(
  apiPath: string,
  functionPath?: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = resolveDataBridgeApiEndpoint(apiPath);
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 404 && functionPath) {
    const fallbackUrl = resolveDataBridgeApiEndpoint(functionPath);
    response = await fetch(fallbackUrl, {
      ...options,
      headers,
    });
  }

  return response;
}

/**
 * Controller to monitor and verify DataBridge connection status.
 * Delivers real state to UI status indicators.
 */
export function createConnectionStatusController(onStateChange?: (state: any) => void) {
  let controller: AbortController | null = null;
  return {
    async checkConnection() {
      controller?.abort();
      controller = new AbortController();
      try {
        const url = resolveDataBridgeApiEndpoint(DATA_BRIDGE_CONNECTION_STATE_ENDPOINT);
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        const isConnected = res.ok && data?.connection?.connected === true;
        const result = { isConnected, data, status: res.status };
        if (typeof onStateChange === 'function') {
          onStateChange(result);
        }
        return result;
      } catch (err) {
        const result = { isConnected: false, error: err };
        if (typeof onStateChange === 'function') {
          onStateChange(result);
        }
        return result;
      }
    },
    abort() {
      controller?.abort();
    }
  };
}

if (typeof window !== 'undefined') {
  (window as any).resolveDataBridgeApiEndpoint = resolveDataBridgeApiEndpoint;
  (window as any).resolveDataBridgeUrl = resolveDataBridgeUrl;
  (window as any).createConnectionStatusController = createConnectionStatusController;
  (window as any).DATA_BRIDGE_CONNECTION_STATE_ENDPOINT = DATA_BRIDGE_CONNECTION_STATE_ENDPOINT;
  (window as any).DATA_BRIDGE_MASTER_STATS_ENDPOINT = DATA_BRIDGE_MASTER_STATS_ENDPOINT;
  (window as any).DATA_BRIDGE_CEREBRO_IA_ENDPOINT = DATA_BRIDGE_CEREBRO_IA_ENDPOINT;
}
