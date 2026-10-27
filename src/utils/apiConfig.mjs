/**
 * Absolute API and Environment Configuration for RiverCharter / DataBridge.
 * Resolves local file:// and Electron calls to the absolute Netlify production endpoint
 * while preserving relative paths for web browser deployments on Netlify.
 */

const getEnvDataBridgeUrl = () => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_DATA_BRIDGE_API_URL) return process.env.VITE_DATA_BRIDGE_API_URL;
    if (process.env.VITE_DATA_BRIDGE_URL) return process.env.VITE_DATA_BRIDGE_URL;
    if (process.env.DATA_BRIDGE_API_URL) return process.env.DATA_BRIDGE_API_URL;
  }
  if (typeof import.meta !== 'undefined' && import.meta?.env) {
    if (import.meta.env.VITE_DATA_BRIDGE_API_URL) return import.meta.env.VITE_DATA_BRIDGE_API_URL;
    if (import.meta.env.VITE_DATA_BRIDGE_URL) return import.meta.env.VITE_DATA_BRIDGE_URL;
  }
  if (typeof window !== 'undefined') {
    if (window.DATA_BRIDGE_API_URL) return window.DATA_BRIDGE_API_URL;
    if (window.CORE_PRO_API_ORIGIN) return window.CORE_PRO_API_ORIGIN;
  }
  return '';
};

export const DATA_BRIDGE_DEFAULT_ORIGIN = 'https://calm-shortbread-55bcfc.netlify.app';
export const DATA_BRIDGE_BASE_URL = (getEnvDataBridgeUrl() || DATA_BRIDGE_DEFAULT_ORIGIN).replace(/\/+$/, '');
export const DATABRIDGE_API_URL = DATA_BRIDGE_BASE_URL;
export const DATABRIDGE_BASE_URL = DATA_BRIDGE_BASE_URL;

export const NETLIFY_PRODUCTION_ORIGIN = DATA_BRIDGE_BASE_URL;

export function isLocalOrFileProtocol() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.location.protocol === 'file:' ||
    window.location.origin === 'file://' ||
    window.location.origin === 'null' ||
    (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) ||
    (typeof process !== 'undefined' && process.versions && Boolean(process.versions.electron))
  );
}

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.NETLIFY_API_BASE_URL) {
    return window.NETLIFY_API_BASE_URL;
  }
  return isLocalOrFileProtocol() ? NETLIFY_PRODUCTION_ORIGIN : '';
}

export function resolveApiUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export const getApiUrl = resolveApiUrl;

export function installFetchInterceptor() {
  if (typeof window === 'undefined') return;

  const base = getApiBaseUrl();
  window.NETLIFY_PRODUCTION_ORIGIN = NETLIFY_PRODUCTION_ORIGIN;
  window.NETLIFY_API_BASE_URL = base;
  window.DATA_BRIDGE_API_URL = DATA_BRIDGE_BASE_URL;
  window.DATA_BRIDGE_BASE_URL = DATA_BRIDGE_BASE_URL;
  window.getAbsoluteApiUrl = resolveApiUrl;
  window.getApiUrl = getApiUrl;

  // Intercept window.fetch if executing under file: or Electron
  if (base && typeof window.fetch === 'function' && !window.__fetchInterceptorInstalled) {
    window.__fetchInterceptorInstalled = true;
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/') || input.startsWith('/.netlify/functions/')) {
          input = `${base}${input}`;
        } else if (input.startsWith('file://')) {
          const match = input.match(/(\/(?:api|\.netlify\/functions)\/.*)$/);
          if (match) {
            input = `${base}${match[1]}`;
          }
        }
      } else if (typeof Request !== 'undefined' && input instanceof Request) {
        const url = input.url;
        if (url.startsWith('/api/') || url.startsWith('/.netlify/functions/')) {
          input = new Request(`${base}${url}`, input);
        } else if (url.startsWith('file://')) {
          const match = url.match(/(\/(?:api|\.netlify\/functions)\/.*)$/);
          if (match) {
            input = new Request(`${base}${match[1]}`, input);
          }
        }
      }
      return nativeFetch.call(this, input, init);
    };
  }

  // Intercept XMLHttpRequest
  if (base && typeof window.XMLHttpRequest === 'function' && !window.__xhrInterceptorInstalled) {
    window.__xhrInterceptorInstalled = true;
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (typeof url === 'string') {
        if (url.startsWith('/api/') || url.startsWith('/.netlify/functions/')) {
          url = `${base}${url}`;
        } else if (url.startsWith('file://')) {
          const match = url.match(/(\/(?:api|\.netlify\/functions)\/.*)$/);
          if (match) {
            url = `${base}${match[1]}`;
          }
        }
      }
      return nativeOpen.call(this, method, url, ...rest);
    };
  }
}

if (typeof window !== 'undefined') {
  installFetchInterceptor();
}
