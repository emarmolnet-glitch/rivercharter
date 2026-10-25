import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { AisStreamToggle } from './AisStreamToggle';

// ============================================================================
// TIPOS Y DEFINICIONES DE TELEMETRÍA FLUVIAL
// ============================================================================

export interface VesselMarkerData {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
  unit_type?: 'tugboat' | 'barge' | 'vessel' | 'convoy';
  isTugboat?: boolean;
  isBarge?: boolean;
  motor?: string;
  enginePowerHp?: number;
  dailyOpex?: number;
  mmsi?: string;
  capacity?: number;
  dynamicDraft?: number;
  iotTrackingId?: string;
  status?: string;
  isCoupled?: boolean;
  speedKnots?: number;
  heading?: number;
}

export interface GlobeMapProps {
  containerId: string;
  globeKey?: string;
  vessels?: VesselMarkerData[];
  onVesselClick?: (vessel: VesselMarkerData) => void;
}

interface GlobalFleetGlobeApi {
  mount?: (options: { containerId: string; key: string }) => unknown;
  destroy?: (key?: string) => void;
  resize?: (key?: string) => void;
  getGlobe?: (key?: string) => any;
}

interface GlobeWindow extends Window {
  GlobalFleetGlobe?: GlobalFleetGlobeApi;
}

export function MapSkeletonFallback() {
  return (
    <div
      className="w-full h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-900 text-slate-100"
      style={{ backgroundColor: '#0f172a', color: '#f1f5f9' }}
    >
      {/* Efecto Radar / Spinner */}
      <div className="relative flex items-center justify-center mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-cyan-500/30 animate-ping"></div>
        <div className="h-16 w-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"></div>
        <div className="absolute h-3 w-3 rounded-full bg-cyan-400"></div>
      </div>

      {/* Textos */}
      <h2 className="text-2xl font-bold tracking-wide text-white">RiverCharter</h2>
      <p className="mt-3 text-sm text-cyan-400 animate-pulse font-medium">
        Iniciando motor cartográfico 3D y telemetría AIS/IoT de convoyes...
      </p>

      {/* Barra de progreso */}
      <div className="mt-8 w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-cyan-500 w-full animate-pulse"></div>
      </div>
    </div>
  );
}

// ============================================================================
// MARCADOR DE REMOLCADOR (TUGBOAT) - OPTIMIZADO CON REACT.MEMO Y USEREF
// Icono de motor destacado, propulsión activa y coordenadas reactivas
// ============================================================================

interface MarkerProps {
  vessel: VesselMarkerData;
  onClick?: (vessel: VesselMarkerData) => void;
}

export const TugboatMarker = memo(function TugboatMarker({ vessel, onClick }: MarkerProps) {
  // Gestión de coordenadas dinámicas con useRef para telemetría continua (AIS/IoT)
  // Permite actualizar posiciones en tiempo real sin disparar un re-render del globo 3D
  const coordsRef = useRef({
    lat: Number(vessel.latitude ?? 0),
    lng: Number(vessel.longitude ?? 0),
    speed: Number(vessel.speedKnots ?? 0),
    heading: Number(vessel.heading ?? 0),
  });

  const markerRef = useRef<HTMLDivElement>(null);
  const coordsLabelRef = useRef<HTMLElement>(null);
  const speedLabelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Sincronizar referencia base
    coordsRef.current = {
      lat: Number(vessel.latitude ?? 0),
      lng: Number(vessel.longitude ?? 0),
      speed: Number(vessel.speedKnots ?? 0),
      heading: Number(vessel.heading ?? 0),
    };
  }, [vessel.latitude, vessel.longitude, vessel.speedKnots, vessel.heading]);

  useEffect(() => {
    // Escucha de telemetría de alta frecuencia (AISStream / IoT)
    const handleTelemetryUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const targetId = String(detail.id || detail.mmsi || detail.name || '').trim();
      const myId = String(vessel.id || vessel.mmsi || vessel.name || '').trim();

      if (targetId && myId && targetId === myId) {
        const nextLat = Number(detail.latitude ?? detail.lat ?? coordsRef.current.lat);
        const nextLng = Number(detail.longitude ?? detail.lng ?? coordsRef.current.lng);
        const nextSpeed = Number(detail.speedKnots ?? detail.speed ?? coordsRef.current.speed);
        const nextHeading = Number(detail.heading ?? coordsRef.current.heading);

        // Actualizar valores en useRef sin re-render de React
        coordsRef.current = {
          lat: nextLat,
          lng: nextLng,
          speed: nextSpeed,
          heading: nextHeading,
        };

        // Mutación directa del DOM para máximo rendimiento de telemetría
        if (coordsLabelRef.current) {
          coordsLabelRef.current.textContent = `${nextLat.toFixed(4)}, ${nextLng.toFixed(4)}`;
        }
        if (speedLabelRef.current && nextSpeed > 0) {
          speedLabelRef.current.textContent = `${nextSpeed.toFixed(1)} kn`;
        }
        if (markerRef.current && Number.isFinite(nextHeading)) {
          markerRef.current.style.setProperty('--vessel-heading', `${nextHeading}deg`);
        }
      }
    };

    window.addEventListener('tracking:aisstream-update', handleTelemetryUpdate);
    window.addEventListener('rivercharter:telemetry-update', handleTelemetryUpdate);
    return () => {
      window.removeEventListener('tracking:aisstream-update', handleTelemetryUpdate);
      window.removeEventListener('rivercharter:telemetry-update', handleTelemetryUpdate);
    };
  }, [vessel.id, vessel.mmsi, vessel.name]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.({
        ...vessel,
        latitude: coordsRef.current.lat,
        longitude: coordsRef.current.lng,
        speedKnots: coordsRef.current.speed,
      });
    },
    [vessel, onClick]
  );

  return (
    <div
      ref={markerRef}
      className="river-marker-tugboat group select-none pointer-events-auto"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Remolcador ${vessel.name}`}
    >
      <div className="relative flex flex-col items-center">
        {/* ICONO DE MOTOR PARA EL REMOLCADOR (Diferenciación visual principal) */}
        <div className="relative p-1.5 rounded-full bg-cyan-950/90 border-2 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.7)] group-hover:scale-110 group-hover:border-cyan-300 transition-transform">
          <svg className="w-6 h-6 motor-icon animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            {/* Bloque de motor con engranaje propulsor */}
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
          </svg>
          {/* Indicador de propulsión activa */}
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-900" />
        </div>

        {/* Etiqueta flotante del remolcador */}
        <div className="mt-1 px-2 py-0.5 rounded bg-slate-950/90 border border-cyan-500/40 text-[10px] font-bold text-cyan-200 tracking-tight whitespace-nowrap shadow-md">
          ⚙️ {vessel.name}
        </div>

        {/* Tooltip táctico del Remolcador */}
        <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-2 z-50 w-52 p-2.5 rounded-lg bg-slate-950/95 border border-cyan-500/40 text-left text-xs shadow-xl transition-opacity">
          <div className="font-extrabold text-white text-[11px] truncate flex items-center justify-between">
            <span>{vessel.name}</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-500/30 px-1 rounded">MOTOR</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-300 space-y-0.5">
            <div><b>Motor:</b> {vessel.motor || 'Caterpillar 3516B'}</div>
            <div><b>Potencia:</b> {vessel.enginePowerHp || 4000} BHP</div>
            <div><b>OPEX Diario:</b> ${vessel.dailyOpex || 3400}/d</div>
            <div>
              <b>Posición:</b>{' '}
              <code ref={coordsLabelRef} className="text-cyan-300">
                {coordsRef.current.lat.toFixed(4)}, {coordsRef.current.lng.toFixed(4)}
              </code>
            </div>
            {vessel.mmsi && <div><b>MMSI AIS:</b> {vessel.mmsi}</div>}
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// MARCADOR DE BARCAZA (BARGE) - OPTIMIZADO CON REACT.MEMO Y USEREF
// Pines secundarios, visualmente diferenciados y preparados para el desenganche
// ============================================================================

export const BargeMarker = memo(function BargeMarker({ vessel, onClick }: MarkerProps) {
  // Gestión de coordenadas dinámicas con useRef para telemetría individual de barcaza (IoT)
  const coordsRef = useRef({
    lat: Number(vessel.latitude ?? 0),
    lng: Number(vessel.longitude ?? 0),
  });

  const markerRef = useRef<HTMLDivElement>(null);
  const coordsLabelRef = useRef<HTMLElement>(null);

  const isCoupled = vessel.status === 'COUPLED' || vessel.isCoupled !== false;

  useEffect(() => {
    coordsRef.current = {
      lat: Number(vessel.latitude ?? 0),
      lng: Number(vessel.longitude ?? 0),
    };
  }, [vessel.latitude, vessel.longitude]);

  useEffect(() => {
    // Escucha de telemetría IoT de la barcaza (preparada para cuando se desengancha)
    const handleBargeTelemetry = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const targetId = String(detail.id || detail.iotTrackingId || detail.bargeId || '').trim();
      const myId = String(vessel.id || vessel.iotTrackingId || '').trim();

      if (targetId && myId && targetId === myId) {
        const nextLat = Number(detail.latitude ?? detail.lat ?? coordsRef.current.lat);
        const nextLng = Number(detail.longitude ?? detail.lng ?? coordsRef.current.lng);

        coordsRef.current = { lat: nextLat, lng: nextLng };

        if (coordsLabelRef.current) {
          coordsLabelRef.current.textContent = `${nextLat.toFixed(4)}, ${nextLng.toFixed(4)}`;
        }
      }
    };

    window.addEventListener('rivercharter:barge-telemetry', handleBargeTelemetry);
    return () => {
      window.removeEventListener('rivercharter:barge-telemetry', handleBargeTelemetry);
    };
  }, [vessel.id, vessel.iotTrackingId]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.({
        ...vessel,
        latitude: coordsRef.current.lat,
        longitude: coordsRef.current.lng,
      });
    },
    [vessel, onClick]
  );

  return (
    <div
      ref={markerRef}
      className={`river-marker-barge group select-none pointer-events-auto ${
        isCoupled ? 'is-coupled' : 'is-decoupled'
      }`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Barcaza ${vessel.name}`}
    >
      <div className="relative flex flex-col items-center">
        {/* PIN SECUNDARIO (Diseño compacto y rectangular tipo barcaza / contenedor) */}
        <div
          className={`p-1 rounded-md border text-xs shadow-md transition-transform group-hover:scale-110 ${
            isCoupled
              ? 'bg-slate-900/90 border-sky-400 text-sky-300'
              : 'bg-amber-950/90 border-amber-400 text-amber-300 border-dashed'
          }`}
        >
          {/* Silueta compacta de barcaza tolva / tanque */}
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM3 16a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-1z" />
          </svg>
        </div>

        {/* Etiqueta secundaria */}
        <div className="mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/80 border border-slate-700 text-[9px] font-mono text-slate-300 whitespace-nowrap">
          {vessel.name}
        </div>

        {/* Tooltip de la Barcaza (con estado acoplado/desacoplado) */}
        <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-1.5 z-50 w-48 p-2 rounded-lg bg-slate-950/95 border border-slate-700 text-left text-xs shadow-xl transition-opacity">
          <div className="font-bold text-white text-[11px] truncate flex items-center justify-between">
            <span>{vessel.name}</span>
            <span
              className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold ${
                isCoupled
                  ? 'bg-sky-950 text-sky-300 border border-sky-600/30'
                  : 'bg-amber-950 text-amber-300 border border-amber-600/30'
              }`}
            >
              {isCoupled ? 'ACOPLADA' : 'DESACOPLADA'}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-slate-300 space-y-0.5">
            <div><b>Capacidad:</b> {Number(vessel.capacity || 1500).toLocaleString()} MT</div>
            <div><b>Calado dinámico:</b> {Number(vessel.dynamicDraft || 2.8).toFixed(2)} m</div>
            {vessel.iotTrackingId && (
              <div><b>Sensor IoT:</b> <span className="font-mono text-cyan-300">{vessel.iotTrackingId}</span></div>
            )}
            <div>
              <b>Posición:</b>{' '}
              <code ref={coordsLabelRef} className="text-slate-200">
                {coordsRef.current.lat.toFixed(4)}, {coordsRef.current.lng.toFixed(4)}
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// ENVOLTORIO GENERAL: VESSEL MARKER (REACT.MEMO)
// ============================================================================

export const VesselMarker = memo(function VesselMarker({ vessel, onClick }: MarkerProps) {
  const isTug =
    vessel.unit_type === 'tugboat' ||
    vessel.isTugboat === true ||
    Boolean(vessel.motor && !vessel.capacity);

  if (isTug) {
    return <TugboatMarker vessel={vessel} onClick={onClick} />;
  }
  return <BargeMarker vessel={vessel} onClick={onClick} />;
});

// ============================================================================
// CAPA SUPERPUESTA DE MARCADORES (CONVOY MARKERS OVERLAY)
// ============================================================================

interface ConvoyOverlayProps {
  vessels?: VesselMarkerData[];
  onVesselClick?: (vessel: VesselMarkerData) => void;
}

export const ConvoyMarkersOverlay = memo(function ConvoyMarkersOverlay({
  vessels = [],
  onVesselClick,
}: ConvoyOverlayProps) {
  if (!Array.isArray(vessels) || vessels.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      aria-label="Capa de marcadores de convoy fluvial"
    >
      {vessels.map((vessel) => (
        <VesselMarker key={vessel.id} vessel={vessel} onClick={onVesselClick} />
      ))}
    </div>
  );
});

// ============================================================================
// COMPONENTE PRINCIPAL DEL GLOBO 3D (LAZYGLOBEMAP)
// ============================================================================

const GlobeCanvasContent = memo(function GlobeCanvasContent({
  containerId,
  globeKey = 'main',
  vessels = [],
  onVesselClick,
}: GlobeMapProps) {
  useEffect(() => {
    const globeWindow = window as GlobeWindow;
    let cancelled = false;
    let mountTimerId: number | undefined;
    let resizeFrameId: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const scheduleResize = () => {
      if (resizeFrameId !== undefined) window.cancelAnimationFrame(resizeFrameId);
      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = undefined;
        globeWindow.GlobalFleetGlobe?.resize?.(globeKey);
      });
    };

    void import('../map-cartography-loader')
      .then(({ ensureGlobalFleetGlobeLoaded }) => ensureGlobalFleetGlobeLoaded())
      .then((globeApi) => {
        if (cancelled) return;
        mountTimerId = window.setTimeout(() => {
          if (cancelled) return;
          globeApi.mount?.({ containerId, key: globeKey });
          const container = document.getElementById(containerId);
          if (container && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleResize);
            resizeObserver.observe(container);
          }
        }, 0);
      })
      .catch((error) => console.error('[LazyGlobeMap] No se pudo cargar el módulo cartográfico.', error));

    return () => {
      cancelled = true;
      if (mountTimerId !== undefined) window.clearTimeout(mountTimerId);
      if (resizeFrameId !== undefined) window.cancelAnimationFrame(resizeFrameId);
      resizeObserver?.disconnect();
      globeWindow.GlobalFleetGlobe?.destroy?.(globeKey);
    };
  }, [containerId, globeKey]);

  return (
    <div className="relative w-full h-full min-h-[600px] overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <div id={containerId} className="density-globe-canvas h-full w-full" />
      {/* Superposición optimizada de marcadores de embarcaciones */}
      <ConvoyMarkersOverlay vessels={vessels} onVesselClick={onVesselClick} />
      {/* Controlador de estado WebSocket AISStream para ahorro de datos */}
      <div className="absolute top-3 right-3 z-30 pointer-events-auto">
        <AisStreamToggle />
      </div>
    </div>
  );
});

export const LazyGlobeMap = memo(function LazyGlobeMap({
  containerId,
  globeKey = 'main',
  vessels = [],
  onVesselClick,
}: GlobeMapProps) {
  const [showGlobe, setShowGlobe] = useState(false);

  useEffect(() => {
    let idleCallbackId: number | undefined;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleCallbackId = window.requestIdleCallback(() => setShowGlobe(true), { timeout: 1000 });
      } else {
        setShowGlobe(true);
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
      if (idleCallbackId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, []);

  if (!showGlobe) return <MapSkeletonFallback />;
  return (
    <GlobeCanvasContent
      containerId={containerId}
      globeKey={globeKey}
      vessels={vessels}
      onVesselClick={onVesselClick}
    />
  );
});

export default LazyGlobeMap;
