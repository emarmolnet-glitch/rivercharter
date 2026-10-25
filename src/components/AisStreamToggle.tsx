import React from 'react';
import { useAisStreamControl } from '../hooks/useAisStreamControl';

interface AisStreamToggleProps {
  className?: string;
  compact?: boolean;
}

export const AisStreamToggle: React.FC<AisStreamToggleProps> = ({
  className = '',
  compact = false,
}) => {
  const { status, isConnected, isPaused, toggleConnection, activeMmsis, telemetryCount } = useAisStreamControl();

  const isStreaming = isConnected;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleConnection}
        title={
          isStreaming
            ? 'AISStream En Vivo activo. Clic para pausar y ahorrar datos/ancho de banda.'
            : isPaused
            ? 'AISStream en pausa (Ahorro de datos activado). Clic para reanudar telemetría.'
            : 'AISStream inactivo. Clic para conectar remolcadores.'
        }
        aria-label="Alternar telemetría WebSocket AIS remolcadores"
        aria-pressed={isStreaming}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold transition-all border shadow-xs cursor-pointer ${
          isStreaming
            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900/90 hover:border-emerald-400'
            : isPaused
            ? 'bg-amber-950/80 text-amber-400 border-amber-500/40 hover:bg-amber-900/90 hover:border-amber-400'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
        } ${className}`}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isStreaming
              ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]'
              : isPaused
              ? 'bg-amber-400'
              : 'bg-slate-500'
          }`}
        />
        <span>{isStreaming ? 'AIS EN VIVO' : isPaused ? 'AIS PAUSADO' : 'AIS INACTIVO'}</span>
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 p-1.5 px-3 rounded-lg border backdrop-blur-md transition-all shadow-sm ${
        isStreaming
          ? 'bg-emerald-950/70 border-emerald-500/30 text-emerald-200'
          : isPaused
          ? 'bg-amber-950/70 border-amber-500/30 text-amber-200'
          : 'bg-slate-900/80 border-slate-700 text-slate-300'
      } ${className}`}
      role="region"
      aria-label="Controlador de telemetría fluvial AIS"
    >
      {/* Indicador de estado */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {isStreaming && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isStreaming ? 'bg-emerald-400' : isPaused ? 'bg-amber-400' : 'bg-slate-500'
            }`}
          />
        </span>
        <div className="flex flex-col text-left">
          <span className="text-[10px] font-mono uppercase tracking-wider font-bold leading-none">
            {isStreaming ? 'AIS En Vivo' : isPaused ? 'AIS Pausado' : 'AIS Offline'}
          </span>
          <span className="text-[9px] text-slate-400 leading-tight">
            {isStreaming
              ? `${activeMmsis.length} remolcadores (${telemetryCount} msgs)`
              : isPaused
              ? 'Ahorro de datos activo'
              : `${activeMmsis.length} remolcadores en espera`}
          </span>
        </div>
      </div>

      {/* Botón de alternancia Activar / Pausar */}
      <button
        type="button"
        onClick={toggleConnection}
        className={`ml-1 px-2.5 py-1 rounded text-[11px] font-semibold tracking-wide transition-all border cursor-pointer ${
          isStreaming
            ? 'bg-emerald-900/60 hover:bg-amber-900/80 hover:text-amber-200 border-emerald-500/40 text-emerald-100 hover:border-amber-500/50'
            : isPaused
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 font-bold shadow-xs'
            : 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400 font-bold shadow-xs'
        }`}
        title={
          isStreaming
            ? 'Pausar conexión para ahorrar consumo de red y ancho de banda'
            : 'Activar conexión WebSocket para recibir telemetría en tiempo real'
        }
        aria-label={isStreaming ? 'Pausar telemetría WebSocket' : 'Activar telemetría WebSocket'}
      >
        {isStreaming ? 'Pausar' : 'Activar'}
      </button>
    </div>
  );
};

export default AisStreamToggle;
