/**
 * DataBridge API Service
 * Centralizes DataBridge endpoint routing and HTTP requests for RiverCharter.
 * Ensures all DataBridge endpoints (/api/databridge-master-stats, /api/databridge-connection-state, etc.)
 * point to the isolated DataBridge environment (https://calm-shortbread-55bcfc.netlify.app).
 */

export const DATA_BRIDGE_DEFAULT_ORIGIN = 'https://calm-shortbread-55bcfc.netlify.app';

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
  }
  return DATA_BRIDGE_DEFAULT_ORIGIN;
}

export const DATA_BRIDGE_BASE_URL = getDataBridgeBaseUrl();
export const DATABRIDGE_API_URL = DATA_BRIDGE_BASE_URL;

export function resolveDataBridgeUrl(path: string): string {
  if (!path || typeof path !== 'string') return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = getDataBridgeBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export async function fetchDataBridgeApi(
  apiPath: string,
  functionPath?: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = resolveDataBridgeUrl(apiPath);
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 404 && functionPath) {
    const fallbackUrl = resolveDataBridgeUrl(functionPath);
    response = await fetch(fallbackUrl, {
      ...options,
      headers,
    });
  }

  return response;
}
