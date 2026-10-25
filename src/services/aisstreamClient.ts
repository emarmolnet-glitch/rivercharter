/**
 * RiverCharter Fluvial DataBridge - AISStream WebSocket Client
 * 
 * Gestiona una conexión WebSocket estable y resiliente a wss://stream.aisstream.io/v0/stream.
 * Filtra mensajes telemétricos entrantes por el MMSI de los remolcadores activos y
 * despacha un CustomEvent global "tracking:aisstream-update" para actualizar directamente
 * las coordenadas y velocidad en el DOM sin recargas de página.
 */

export type AisStreamStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'PAUSED' | 'ERROR';

export interface AisStreamTelemetryDetail {
  id: string;
  mmsi: string;
  latitude: number;
  lat: number;
  longitude: number;
  lng: number;
  speedKnots: number;
  speed: number;
  heading: number;
  cog: number;
  shipName: string;
  timestamp: number;
  source: 'aisstreamClient';
  vessel: {
    id: string;
    mmsi: string;
    MMSI: string;
    name: string;
    latitude: number;
    longitude: number;
    speedKnots: number;
    speed: number;
    heading: number;
    positionSource: 'AISSTREAM_CLIENT';
  };
}

export interface AisStreamClientOptions {
  apiKey?: string;
  endpoint?: string;
  activeMmsis?: string[];
  boundingBoxes?: number[][][];
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  autoReconnect?: boolean;
}

// Catálogo por defecto de remolcadores fluviales activos (Río Paraná / Hidrovía)
export const DEFAULT_ACTIVE_TUGBOATS_MMSI = [
  '740123456', // Río Paraná Star
  '740654321', // Empujador Hidrovía Master
  '740987654', // Guaycurú Titan
  '740456789', // Remolcador San Lorenzo
];

const DEFAULT_ENDPOINT = 'wss://stream.aisstream.io/v0/stream';
const DEFAULT_BOUNDING_BOXES: number[][][] = [[[-90, -180], [90, 180]]];

export class AisStreamClient {
  private ws: WebSocket | null = null;
  private endpoint: string = DEFAULT_ENDPOINT;
  private apiKey: string = '';
  private activeMmsis: Set<string> = new Set(DEFAULT_ACTIVE_TUGBOATS_MMSI);
  private boundingBoxes: number[][][] = DEFAULT_BOUNDING_BOXES;
  private status: AisStreamStatus = 'DISCONNECTED';
  private autoReconnect: boolean = true;
  private reconnectDelay: number = 3000;
  private maxReconnectDelay: number = 30000;
  private currentReconnectDelay: number = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private userPaused: boolean = false;
  private statusListeners: Set<(status: AisStreamStatus) => void> = new Set();
  private telemetryListeners: Set<(data: AisStreamTelemetryDetail) => void> = new Set();

  constructor(options?: AisStreamClientOptions) {
    if (options) {
      this.configure(options);
    }
  }

  /**
   * Configura las opciones del cliente
   */
  public configure(options: AisStreamClientOptions): void {
    if (options.endpoint) this.endpoint = options.endpoint;
    if (options.apiKey !== undefined) this.apiKey = options.apiKey;
    if (options.reconnectDelay) this.reconnectDelay = options.reconnectDelay;
    if (options.maxReconnectDelay) this.maxReconnectDelay = options.maxReconnectDelay;
    if (options.autoReconnect !== undefined) this.autoReconnect = options.autoReconnect;
    if (options.boundingBoxes) this.boundingBoxes = options.boundingBoxes;

    if (options.activeMmsis) {
      this.setActiveMmsis(options.activeMmsis);
    }
  }

  /**
   * Obtiene la API Key configurada o almacenada en entorno/localStorage
   */
  public getApiKey(): string {
    if (this.apiKey) return this.apiKey;

    if (typeof window !== 'undefined') {
      const win = window as unknown as Record<string, unknown>;
      const explicit = (win.AISSTREAM_API_KEY || win.aisstreamApiKey || '') as string;
      if (explicit) return explicit.trim();

      try {
        const stored = localStorage.getItem('aisstream_api_key');
        if (stored) return stored.trim();
      } catch (_) {}
    }

    try {
      const envKey = (import.meta as unknown as { env?: Record<string, string> })?.env?.VITE_AISSTREAM_API_KEY;
      if (envKey) return envKey.trim();
    } catch (_) {}

    return '';
  }

  /**
   * Define la API Key explícita
   */
  public setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  /**
   * Actualiza el listado de MMSIs de remolcadores activos a monitorear
   */
  public setActiveMmsis(mmsis: string[]): void {
    this.activeMmsis.clear();
    for (const m of mmsis) {
      const clean = String(m || '').replace(/\D/g, '').trim();
      if (clean) this.activeMmsis.add(clean);
    }

    // Si ya está conectado, actualiza la suscripción en el socket
    if (this.isConnected()) {
      this.sendSubscriptionPayload();
    }
  }

  /**
   * Añade un MMSI de remolcador al filtro de monitoreo
   */
  public addActiveMmsi(mmsi: string): void {
    const clean = String(mmsi || '').replace(/\D/g, '').trim();
    if (clean) {
      this.activeMmsis.add(clean);
      if (this.isConnected()) {
        this.sendSubscriptionPayload();
      }
    }
  }

  /**
   * Elimina un MMSI del filtro de remolcadores
   */
  public removeActiveMmsi(mmsi: string): void {
    const clean = String(mmsi || '').replace(/\D/g, '').trim();
    if (clean && this.activeMmsis.delete(clean)) {
      if (this.isConnected()) {
        this.sendSubscriptionPayload();
      }
    }
  }

  /**
   * Retorna el conjunto actual de remolcadores activos
   */
  public getActiveMmsis(): string[] {
    return Array.from(this.activeMmsis);
  }

  /**
   * Retorna el estado actual del cliente
   */
  public getStatus(): AisStreamStatus {
    return this.status;
  }

  /**
   * Indica si la conexión WebSocket está abierta y activa
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.status === 'CONNECTED';
  }

  /**
   * Indica si el cliente ha sido pausado manualmente por el usuario
   */
  public isPaused(): boolean {
    return this.userPaused || this.status === 'PAUSED';
  }

  /**
   * Inicia la conexión WebSocket a aisstream.io
   */
  public connect(options?: AisStreamClientOptions): void {
    if (options) {
      this.configure(options);
    }

    this.userPaused = false;
    this.clearReconnectTimer();

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendSubscriptionPayload();
        this.setStatus('CONNECTED');
      }
      return;
    }

    if (typeof WebSocket === 'undefined') {
      console.warn('[AisStreamClient] WebSocket no está disponible en este entorno.');
      this.setStatus('ERROR');
      return;
    }

    this.setStatus('CONNECTING');

    try {
      this.ws = new WebSocket(this.endpoint);

      this.ws.onopen = () => {
        this.currentReconnectDelay = this.reconnectDelay;
        this.setStatus('CONNECTED');
        this.sendSubscriptionPayload();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('[AisStreamClient] Error en conexión WebSocket:', err);
        this.setStatus('ERROR');
      };

      this.ws.onclose = (event) => {
        this.ws = null;
        if (this.userPaused) {
          this.setStatus('PAUSED');
          return;
        }

        this.setStatus('DISCONNECTED');

        if (this.autoReconnect && !this.userPaused) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[AisStreamClient] Error al instanciar WebSocket:', error);
      this.setStatus('ERROR');
      if (this.autoReconnect && !this.userPaused) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Pausa deliberada por el usuario para ahorrar datos y ancho de banda
   */
  public pause(): void {
    this.userPaused = true;
    this.clearReconnectTimer();

    if (this.ws) {
      try {
        this.ws.close(1000, 'User paused telemetry to save bandwidth');
      } catch (_) {}
      this.ws = null;
    }

    this.setStatus('PAUSED');
  }

  /**
   * Reanuda la conexión activa de telemetría
   */
  public resume(): void {
    this.userPaused = false;
    this.connect();
  }

  /**
   * Alterna entre conectado y pausado
   */
  public toggle(): void {
    if (this.isConnected() || this.status === 'CONNECTING') {
      this.pause();
    } else {
      this.resume();
    }
  }

  /**
   * Desconecta totalmente el cliente
   */
  public disconnect(): void {
    this.userPaused = false;
    this.clearReconnectTimer();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnected');
      } catch (_) {}
      this.ws = null;
    }

    this.setStatus('DISCONNECTED');
  }

  /**
   * Suscribe un callback a cambios de estado
   */
  public onStatusChange(callback: (status: AisStreamStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  /**
   * Suscribe un callback directo a actualizaciones de telemetría
   */
  public onTelemetry(callback: (data: AisStreamTelemetryDetail) => void): () => void {
    this.telemetryListeners.add(callback);
    return () => this.telemetryListeners.delete(callback);
  }

  /**
   * Envía el payload de suscripción según las especificaciones de aisstream.io
   */
  private sendSubscriptionPayload(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const key = this.getApiKey();
    const filterMmsis = Array.from(this.activeMmsis);

    const payload: Record<string, unknown> = {
      APIKey: key || 'CLIENT_FREE_DEMO',
      BoundingBoxes: this.boundingBoxes,
      FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'],
    };

    if (filterMmsis.length > 0) {
      payload.FiltersShipMMSI = filterMmsis;
    }

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn('[AisStreamClient] No se pudo enviar el payload de suscripción:', err);
    }
  }

  /**
   * Procesa los mensajes entrantes y filtra por remolcadores activos
   */
  public handleMessage(rawMessage: string | ArrayBuffer | unknown): AisStreamTelemetryDetail | null {
    if (typeof rawMessage !== 'string') return null;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawMessage);
    } catch (_) {
      return null;
    }

    if (!data || typeof data !== 'object') return null;

    const messageType = String(data.MessageType || data.messageType || '');
    const meta = (data.MetaData || data.metaData || data.metadata || {}) as Record<string, unknown>;
    const message = (data.Message || data.message || {}) as Record<string, unknown>;

    // Reporte de posición (Class A o Class B)
    const posReport = (message.PositionReport ||
      message.StandardClassBPositionReport ||
      message.ExtendedClassBPositionReport ||
      message.positionReport ||
      message) as Record<string, unknown>;

    // Extracción normalizada de MMSI
    const rawMmsi =
      meta.MMSI ??
      meta.mmsi ??
      posReport.UserID ??
      posReport.userId ??
      posReport.mmsi ??
      data.mmsi ??
      '';
    const mmsi = String(rawMmsi).replace(/\D/g, '').trim();

    if (!mmsi) return null;

    // FILTRADO ESTRICTO POR REMOLCADORES ACTIVOS
    // Si hay remolcadores configurados en activeMmsis, descartamos cualquier otro buque
    if (this.activeMmsis.size > 0 && !this.activeMmsis.has(mmsi)) {
      return null;
    }

    // Extracción de coordenadas geográficas
    const latCandidate = posReport.Latitude ?? posReport.latitude ?? meta.latitude ?? meta.Latitude;
    const lngCandidate = posReport.Longitude ?? posReport.longitude ?? meta.longitude ?? meta.Longitude;

    const latitude = Number(latCandidate);
    const longitude = Number(lngCandidate);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    // Extracción de velocidad (SOG en nudos) y rumbo (COG / TrueHeading)
    const speed = Number(posReport.Sog ?? posReport.sog ?? posReport.speedKnots ?? posReport.speed ?? 0);
    const heading = Number(
      posReport.TrueHeading ?? posReport.trueHeading ?? posReport.Cog ?? posReport.cog ?? posReport.heading ?? 0
    );
    const shipName = String(meta.ShipName ?? meta.shipName ?? meta.name ?? `Remolcador #${mmsi}`).trim();

    const detail: AisStreamTelemetryDetail = {
      id: mmsi,
      mmsi,
      latitude,
      lat: latitude,
      longitude,
      lng: longitude,
      speedKnots: speed,
      speed,
      heading,
      cog: heading,
      shipName,
      timestamp: Date.now(),
      source: 'aisstreamClient',
      vessel: {
        id: mmsi,
        mmsi,
        MMSI: mmsi,
        name: shipName,
        latitude,
        longitude,
        speedKnots: speed,
        speed,
        heading,
        positionSource: 'AISSTREAM_CLIENT',
      },
    };

    // 1. Notificación a los listeners registrados
    for (const listener of this.telemetryListeners) {
      try {
        listener(detail);
      } catch (e) {
        console.error('[AisStreamClient] Error en telemetryListener:', e);
      }
    }

    // 2. Despacho global del CustomEvent "tracking:aisstream-update" para inyección directa al DOM
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('tracking:aisstream-update', { detail }));
        // Despacho complementario para interoperabilidad total con LazyGlobeMap y capas reactivas
        window.dispatchEvent(new CustomEvent('rivercharter:telemetry-update', { detail }));
      } catch (e) {
        console.error('[AisStreamClient] Error al despachar CustomEvent:', e);
      }
    }

    return detail;
  }

  private setStatus(newStatus: AisStreamStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;

    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (e) {
        console.error('[AisStreamClient] Error en statusListener:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('tracking:aisstream-status', {
            detail: {
              status: newStatus,
              isPaused: this.isPaused(),
              isConnected: this.isConnected(),
              activeMmsis: Array.from(this.activeMmsis),
            },
          })
        );
      } catch (_) {}
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.userPaused && this.autoReconnect) {
        this.currentReconnectDelay = Math.min(this.currentReconnectDelay * 1.5, this.maxReconnectDelay);
        this.connect();
      }
    }, this.currentReconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton global exportado para consumo centralizado en la UI y el mapa
export const aisStreamClient = new AisStreamClient();

if (typeof window !== 'undefined') {
  (window as unknown as { AisStreamClient?: typeof AisStreamClient; aisStreamClient?: AisStreamClient }).AisStreamClient = AisStreamClient;
  (window as unknown as { aisStreamClient?: AisStreamClient }).aisStreamClient = aisStreamClient;
}

export default aisStreamClient;
