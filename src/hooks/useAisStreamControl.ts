import { useState, useEffect, useCallback } from 'react';
import {
  aisStreamClient,
  type AisStreamStatus,
  type AisStreamTelemetryDetail,
} from '../services/aisstreamClient';

export interface UseAisStreamControlReturn {
  status: AisStreamStatus;
  isConnected: boolean;
  isPaused: boolean;
  activeMmsis: string[];
  telemetryCount: number;
  lastTelemetry: AisStreamTelemetryDetail | null;
  toggleConnection: () => void;
  pause: () => void;
  resume: () => void;
  connect: () => void;
  disconnect: () => void;
  setActiveMmsis: (mmsis: string[]) => void;
}

/**
 * Hook controlador para activar, pausar y monitorear la conexión WebSocket AISStream.
 * Permite ahorrar consumo de datos y ancho de banda suspendiendo el streaming cuando
 * el usuario no está visualizando activamente el mapa cartográfico.
 */
export function useAisStreamControl(initialMmsis?: string[]): UseAisStreamControlReturn {
  const [status, setStatus] = useState<AisStreamStatus>(() => aisStreamClient.getStatus());
  const [activeMmsis, setMmsisState] = useState<string[]>(() =>
    initialMmsis && initialMmsis.length > 0 ? initialMmsis : aisStreamClient.getActiveMmsis()
  );
  const [lastTelemetry, setLastTelemetry] = useState<AisStreamTelemetryDetail | null>(null);
  const [telemetryCount, setTelemetryCount] = useState<number>(0);

  useEffect(() => {
    if (initialMmsis && initialMmsis.length > 0) {
      aisStreamClient.setActiveMmsis(initialMmsis);
      setMmsisState(aisStreamClient.getActiveMmsis());
    }
  }, [initialMmsis]);

  useEffect(() => {
    // Suscripción al estado del cliente
    const unsubStatus = aisStreamClient.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Suscripción a eventos de telemetría entrante
    const unsubTelemetry = aisStreamClient.onTelemetry((telemetry) => {
      setLastTelemetry(telemetry);
      setTelemetryCount((prev) => prev + 1);
    });

    // Escucha de eventos de ventana para sincronización entre componentes
    const handleWindowStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.status) {
        setStatus(detail.status as AisStreamStatus);
      }
      if (Array.isArray(detail.activeMmsis)) {
        setMmsisState(detail.activeMmsis);
      }
    };

    window.addEventListener('tracking:aisstream-status', handleWindowStatus);

    return () => {
      unsubStatus();
      unsubTelemetry();
      window.removeEventListener('tracking:aisstream-status', handleWindowStatus);
    };
  }, []);

  const toggleConnection = useCallback(() => {
    aisStreamClient.toggle();
  }, []);

  const pause = useCallback(() => {
    aisStreamClient.pause();
  }, []);

  const resume = useCallback(() => {
    aisStreamClient.resume();
  }, []);

  const connect = useCallback(() => {
    aisStreamClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    aisStreamClient.disconnect();
  }, []);

  const setActiveMmsis = useCallback((mmsis: string[]) => {
    aisStreamClient.setActiveMmsis(mmsis);
    setMmsisState(aisStreamClient.getActiveMmsis());
  }, []);

  return {
    status,
    isConnected: status === 'CONNECTED',
    isPaused: status === 'PAUSED',
    activeMmsis,
    telemetryCount,
    lastTelemetry,
    toggleConnection,
    pause,
    resume,
    connect,
    disconnect,
    setActiveMmsis,
  };
}

export default useAisStreamControl;
