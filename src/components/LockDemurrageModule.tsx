import React, { useState, useMemo, useEffect } from 'react';
import {
  calculateDemurrageCost,
  DEFAULT_BUNKER_PRICE_USD_TON,
  DEFAULT_IDLE_FUEL_TONS_PER_HOUR,
  type DemurrageCostBreakdown,
} from '../services/fluvialEstimator.js';

export interface WaitingTimeEntry {
  id: string;
  reason: string;
  location: string;
  waitingHours: number;
  timestamp: string;
  notes?: string;
  estimatedCost?: number;
}

export interface LockDemurrageModuleProps {
  dailyOpex: number;
  tugboatName?: string;
  enginePowerHp?: number | null;
  baseVoyageCost?: number; // Costo base (Motor + Carga)
  fuelPricePerTon?: number;
  initialEntries?: WaitingTimeEntry[];
  onDemurrageChange?: (data: {
    waitingHours: number;
    demurrageCost: number;
    breakdown: DemurrageCostBreakdown;
    entries: WaitingTimeEntry[];
    recalculatedTotalVoyageCost: number;
  }) => void;
}

const COMMON_REASONS = [
  'Tráfico / Congestión en Esclusa',
  'Espera de Giro / Inspección de Aduana',
  'Mantenimiento de Compuerta / Vía Fluvial',
  'Control de Prefectura Naval',
  'Niebla / Restricción de Visibilidad',
  'Fondeadero / Espera de Muelle Terminal',
  'Otros Tiempos de Espera',
];

export function LockDemurrageModule({
  dailyOpex = 3400,
  tugboatName = 'Remolcador Activo',
  enginePowerHp = 4000,
  baseVoyageCost = 0,
  fuelPricePerTon = DEFAULT_BUNKER_PRICE_USD_TON,
  initialEntries,
  onDemurrageChange,
}: LockDemurrageModuleProps) {
  const [entries, setEntries] = useState<WaitingTimeEntry[]>(() => {
    if (initialEntries && initialEntries.length > 0) return initialEntries;
    return [
      {
        id: 'DEM-001',
        reason: 'Tráfico / Congestión en Esclusa',
        location: 'Esclusa San Martín Km 420',
        waitingHours: 12,
        timestamp: new Date().toISOString().slice(0, 10),
        notes: 'Congestión fluvial por convoy de bajada preferencial',
      },
    ];
  });

  // Estado del formulario de nuevo tiempo de espera
  const [reason, setReason] = useState(COMMON_REASONS[0]);
  const [location, setLocation] = useState('');
  const [waitingHoursInput, setWaitingHoursInput] = useState<string>('6');
  const [notes, setNotes] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Horas acumuladas de espera
  const totalWaitingHours = useMemo(() => {
    return entries.reduce((acc, item) => acc + (Number(item.waitingHours) || 0), 0);
  }, [entries]);

  // Recálculo automático del sobrecosto operativo en ralentí
  const demurrageBreakdown: DemurrageCostBreakdown = useMemo(() => {
    return calculateDemurrageCost({
      waitingHours: totalWaitingHours,
      dailyOpex: Number(dailyOpex) || 0,
      idleFuelTonsPerHour: DEFAULT_IDLE_FUEL_TONS_PER_HOUR,
      fuelPricePerTon: Number(fuelPricePerTon) || DEFAULT_BUNKER_PRICE_USD_TON,
    });
  }, [totalWaitingHours, dailyOpex, fuelPricePerTon]);

  // Gasto total del viaje sumando el sobrecosto de demoras
  const recalculatedTotalVoyageCost = useMemo(() => {
    const base = Number(baseVoyageCost) || 0;
    return Number((base + demurrageBreakdown.totalDemurrageCost).toFixed(2));
  }, [baseVoyageCost, demurrageBreakdown.totalDemurrageCost]);

  // Notificar al componente padre cuando cambien los datos
  useEffect(() => {
    onDemurrageChange?.({
      waitingHours: totalWaitingHours,
      demurrageCost: demurrageBreakdown.totalDemurrageCost,
      breakdown: demurrageBreakdown,
      entries,
      recalculatedTotalVoyageCost,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('rivercharter:demurrage-updated', {
          detail: {
            waitingHours: totalWaitingHours,
            demurrageCost: demurrageBreakdown.totalDemurrageCost,
            breakdown: demurrageBreakdown,
            entries,
            recalculatedTotalVoyageCost,
          },
        })
      );
    }
  }, [totalWaitingHours, demurrageBreakdown, entries, recalculatedTotalVoyageCost, onDemurrageChange]);

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(waitingHoursInput);
    if (isNaN(hours) || hours <= 0) return;

    const newEntry: WaitingTimeEntry = {
      id: `DEM-${Date.now().toString().slice(-4)}`,
      reason,
      location: location.trim() || 'Punto Fluvial No Especificado',
      waitingHours: hours,
      timestamp: new Date().toISOString().slice(0, 10),
      notes: notes.trim(),
    };

    setEntries((prev) => [...prev, newEntry]);
    setLocation('');
    setNotes('');
    setWaitingHoursInput('4');
    setIsFormOpen(false);
  };

  const handleRemoveEntry = (idToRemove: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  return (
    <div
      id="lock-demurrage-module"
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-200 space-y-4 shadow-xl"
    >
      {/* CABECERA DEL MÓDULO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs md:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Demoras en Esclusas y Aduanas · Sobrecosto en Ralentí (Demurrage)
            </h3>
            <p className="text-[11px] text-slate-400">
              Registro de tiempos muertos operativos para {tugboatName} (OPEX ${Number(dailyOpex).toLocaleString()}/día)
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-toggle-demurrage-form"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
        >
          <span>{isFormOpen ? '✕ Cerrar' : '+ Registrar Tiempo de Espera'}</span>
        </button>
      </div>

      {/* TARJETAS RESUMEN DE IMPACTO FINANCIERO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="block text-[10px] uppercase font-bold text-slate-500">Horas en Espera</span>
          <span className="text-lg font-mono font-black text-amber-400">
            {totalWaitingHours.toFixed(1)} h
          </span>
          <span className="block text-[10px] text-slate-500 mt-0.5">
            {(totalWaitingHours / 24).toFixed(2)} días en ralentí
          </span>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="block text-[10px] uppercase font-bold text-slate-500">Tarifa Ralentí / Hora</span>
          <span className="text-lg font-mono font-bold text-cyan-300">
            ${demurrageBreakdown.hourlyIdleTotalRate.toFixed(2)}
          </span>
          <span className="block text-[10px] text-slate-500 mt-0.5">
            OPEX ${demurrageBreakdown.hourlyOpexRate}/h + Fuel
          </span>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3">
          <span className="block text-[10px] uppercase font-bold text-slate-500">Sobrecosto Remolcador</span>
          <span className="text-lg font-mono font-black text-rose-400">
            ${demurrageBreakdown.totalDemurrageCost.toLocaleString()}
          </span>
          <span className="block text-[10px] text-rose-300/70 mt-0.5">
            Fuel Ralentí: ${demurrageBreakdown.idleFuelCost.toLocaleString()}
          </span>
        </div>

        <div className="bg-slate-950/80 border border-amber-500/30 rounded-lg p-3 bg-gradient-to-br from-slate-950 to-amber-950/20">
          <span className="block text-[10px] uppercase font-bold text-amber-300">Gasto Total del Viaje</span>
          <span className="text-lg font-mono font-black text-white">
            ${recalculatedTotalVoyageCost.toLocaleString()}
          </span>
          <span className="block text-[10px] text-slate-400 mt-0.5">
            Base: ${Number(baseVoyageCost).toLocaleString()} + Demoras
          </span>
        </div>
      </div>

      {/* FORMULARIO DE REGISTRO DE TIEMPO DE ESPERA */}
      {isFormOpen && (
        <form
          onSubmit={handleAddEntry}
          className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-4 space-y-3 transition-all"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-amber-300 uppercase">
              Nuevo Registro de Tiempo Muerto / Espera
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Recálculo automático al guardar
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label htmlFor="demurrage-reason-select" className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                Motivo de la Espera *
              </label>
              <select
                id="demurrage-reason-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
              >
                {COMMON_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="demurrage-location-input" className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                Ubicación / Esclusa / Aduana *
              </label>
              <input
                id="demurrage-location-input"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej. Esclusa Yacyretá Km 1465"
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
                required
              />
            </div>

            <div>
              <label htmlFor="demurrage-hours-input" className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                Tiempo de Espera (Horas) *
              </label>
              <input
                id="demurrage-hours-input"
                type="number"
                step="0.5"
                min="0.5"
                value={waitingHoursInput}
                onChange={(e) => setWaitingHoursInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs font-mono font-bold focus:outline-none focus:border-amber-400"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="demurrage-notes-input" className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
              Notas u Observaciones del Capitán / Operador
            </label>
            <input
              id="demurrage-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Orden de fondeo emitida por control de tráfico debido a cola de 5 convoyes"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-save-demurrage-entry"
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold shadow-md transition"
            >
              Guardar y Recalcular OPEX
            </button>
          </div>
        </form>
      )}

      {/* LISTADO DE DEMORAS REGISTRADAS */}
      <div className="space-y-2">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Registros de Espera Activos ({entries.length})
        </span>

        {entries.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-500">
            Sin demoras registradas. La navegación avanza en régimen normal sin sobrecostos de ralentí.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {entries.map((item) => {
              const itemCost = Number(
                (item.waitingHours * demurrageBreakdown.hourlyIdleTotalRate).toFixed(2)
              );
              return (
                <div
                  key={item.id}
                  className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg p-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-500/30 rounded text-[10px] font-mono font-bold shrink-0">
                      {item.waitingHours} h
                    </span>
                    <div className="min-w-0 truncate">
                      <div className="font-bold text-white truncate flex items-center gap-2">
                        <span>{item.reason}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          · {item.location}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-bold text-rose-300 text-xs">
                      +${itemCost.toLocaleString()} USD
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEntry(item.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 text-xs"
                      title="Eliminar registro de demora"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FORMULA Y EXPLICACIÓN DE RECALCULO */}
      <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <span className="font-mono text-[10px] text-slate-400">
          ⚙️ Algoritmo: {demurrageBreakdown.formula}
        </span>
        <span className="text-amber-400 font-semibold text-[10px] uppercase">
          Sobrecosto sumado automáticamente al gasto total
        </span>
      </div>
    </div>
  );
}

export default LockDemurrageModule;
