import React, { useState, useEffect, useMemo } from 'react';
import {
  type Tugboat,
  type Barge,
  type SaveRiverVoyagePayload,
  type BargeType,
} from '../types/rivercharter.js';
import { getApiUrl } from '../utils/apiConfig.js';
import {
  estimateFluvialVoyage,
  calculateMotorCost,
  calculateCargoCost,
  type FluvialEstimateResult,
  type DemurrageCostBreakdown,
} from '../services/fluvialEstimator.js';
import LockDemurrageModule, { type WaitingTimeEntry } from './LockDemurrageModule.js';

export interface ConvoyBuilderProps {
  initialTugboatId?: number | null;
  initialBargeIds?: number[];
  initialVoyageNumber?: string;
  initialRiverName?: string;
  initialOrigin?: string;
  initialDestination?: string;
  initialMinWaterLevel?: number;
  availableTugboats?: Tugboat[];
  availableBarges?: Barge[];
  onSave?: (payload: SaveRiverVoyagePayload) => void | Promise<void>;
  onConvoyChange?: (convoy: {
    tugboatId: number | null;
    bargeIds: number[];
    totalCapacityMt: number;
    maxDynamicDraftMeters: number;
  }) => void;
}

// Catálogo por defecto de remolcadores fluviales
const DEFAULT_TUGBOATS: Tugboat[] = [
  {
    id: 1,
    name: 'Río Paraná Star',
    motor: 'Caterpillar 3516B 2x2000 BHP',
    enginePowerHp: 4000,
    dailyOpex: 3400,
    mmsi: '740123456',
    bollardPullTons: 45,
    status: 'OPERATIONAL',
  },
  {
    id: 2,
    name: 'Empujador Hidrovía Master',
    motor: 'Wärtsilä 6L20 2x1600 BHP',
    enginePowerHp: 3200,
    dailyOpex: 2900,
    mmsi: '740654321',
    bollardPullTons: 38,
    status: 'OPERATIONAL',
  },
  {
    id: 3,
    name: 'Guaycurú Titan',
    motor: 'Cummins QSK60 2x2200 BHP',
    enginePowerHp: 4400,
    dailyOpex: 3800,
    mmsi: '740987654',
    bollardPullTons: 52,
    status: 'OPERATIONAL',
  },
  {
    id: 4,
    name: 'Remolcador San Lorenzo',
    motor: 'MTU 16V4000 2x1800 BHP',
    enginePowerHp: 3600,
    dailyOpex: 3100,
    mmsi: '740456789',
    bollardPullTons: 42,
    status: 'OPERATIONAL',
  },
];

// Catálogo por defecto de barcazas acoplables
const DEFAULT_BARGES: Barge[] = [
  {
    id: 101,
    name: 'Barcaza Tolva T-101',
    bargeNumber: 'B-PAR-101',
    bargeType: 'HOPPER',
    capacity: 1500,
    dynamicDraft: 2.7,
    iotTrackingId: 'IOT-BARGE-101',
    status: 'AVAILABLE',
  },
  {
    id: 102,
    name: 'Barcaza Tolva T-102',
    bargeNumber: 'B-PAR-102',
    bargeType: 'HOPPER',
    capacity: 1500,
    dynamicDraft: 2.8,
    iotTrackingId: 'IOT-BARGE-102',
    status: 'AVAILABLE',
  },
  {
    id: 103,
    name: 'Barcaza Tanque Líquidos Q-201',
    bargeNumber: 'B-PAR-201',
    bargeType: 'TANKER',
    capacity: 1800,
    dynamicDraft: 3.1,
    iotTrackingId: 'IOT-BARGE-201',
    status: 'AVAILABLE',
  },
  {
    id: 104,
    name: 'Barcaza Cubierta Plana Deck D-301',
    bargeNumber: 'B-PAR-301',
    bargeType: 'DECK',
    capacity: 1200,
    dynamicDraft: 2.4,
    iotTrackingId: 'IOT-BARGE-301',
    status: 'AVAILABLE',
  },
  {
    id: 105,
    name: 'Barcaza Portacontenedores C-401',
    bargeNumber: 'B-PAR-401',
    bargeType: 'CONTAINER_BARGE',
    capacity: 2000,
    dynamicDraft: 3.2,
    iotTrackingId: 'IOT-BARGE-401',
    status: 'AVAILABLE',
  },
  {
    id: 106,
    name: 'Barcaza Tolva T-103',
    bargeNumber: 'B-PAR-103',
    bargeType: 'HOPPER',
    capacity: 1600,
    dynamicDraft: 2.9,
    iotTrackingId: 'IOT-BARGE-103',
    status: 'AVAILABLE',
  },
];

const LOCAL_STORAGE_CONVOY_KEY = 'rivercharter_active_convoy';

export function ConvoyBuilder({
  initialTugboatId = 1,
  initialBargeIds = [101, 102],
  initialVoyageNumber = 'RV-2026-PAR-001',
  initialRiverName = 'Hidrovía Paraná-Paraguay',
  initialOrigin = 'Terminal San Lorenzo Km 445',
  initialDestination = 'Terminal Nueva Palmira Km 0',
  initialMinWaterLevel = 2.6,
  availableTugboats = DEFAULT_TUGBOATS,
  availableBarges = DEFAULT_BARGES,
  onSave,
  onConvoyChange,
}: ConvoyBuilderProps) {
  // --------------------------------------------------------------------------
  // ESTADO DEL FORMULARIO Y ENSAMBLAJE DE CONVOY
  // --------------------------------------------------------------------------
  const [tugboatId, setTugboatId] = useState<number | null>(() => {
    return initialTugboatId !== undefined ? initialTugboatId : (availableTugboats[0]?.id ?? null);
  });
  const [bargeIds, setBargeIds] = useState<number[]>(() => {
    return Array.isArray(initialBargeIds) ? initialBargeIds : [101, 102];
  });

  const [bargePool, setBargePool] = useState<Barge[]>(availableBarges);
  const [selectedBargeToAdd, setSelectedBargeToAdd] = useState<number | ''>('');

  // Parámetros del viaje fluvial
  const [voyageNumber, setVoyageNumber] = useState(initialVoyageNumber);
  const [riverName, setRiverName] = useState(initialRiverName);
  const [originTerminal, setOriginTerminal] = useState(initialOrigin);
  const [destinationTerminal, setDestinationTerminal] = useState(initialDestination);
  const [minWaterLevel, setMinWaterLevel] = useState(initialMinWaterLevel);
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  // Estado para modal / formulario de creación de barcaza personalizada
  const [showNewBargeModal, setShowNewBargeModal] = useState(false);
  const [newBargeName, setNewBargeName] = useState('');
  const [newBargeType, setNewBargeType] = useState<BargeType>('HOPPER');
  const [newBargeCapacity, setNewBargeCapacity] = useState('1500');
  const [newBargeDraft, setNewBargeDraft] = useState('2.8');

  // Feedback de UI
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Remolcador actualmente asignado
  const selectedTugboat = useMemo(() => {
    return availableTugboats.find((t) => t.id === Number(tugboatId)) || null;
  }, [availableTugboats, tugboatId]);

  // Lista de barcazas acopladas actualmente
  const coupledBarges = useMemo(() => {
    return bargeIds
      .map((id) => bargePool.find((b) => b.id === id))
      .filter((b): b is Barge => Boolean(b));
  }, [bargeIds, bargePool]);

  // Barcazas disponibles que aún no están acopladas
  const uncoupledBarges = useMemo(() => {
    return bargePool.filter((b) => !bargeIds.includes(b.id));
  }, [bargePool, bargeIds]);

  // Métricas agregadas del convoy
  const totalCapacityMt = useMemo(() => {
    return coupledBarges.reduce((sum, b) => sum + (Number(b.capacity) || 0), 0);
  }, [coupledBarges]);

  const heaviestBarge = useMemo(() => {
    if (coupledBarges.length === 0) return null;
    return [...coupledBarges].sort((a, b) => (Number(b.capacity) || 0) - (Number(a.capacity) || 0))[0];
  }, [coupledBarges]);

  const maxDynamicDraft = useMemo(() => {
    if (coupledBarges.length === 0) return 0;
    return Math.max(...coupledBarges.map((b) => Number(b.dynamicDraft) || 0));
  }, [coupledBarges]);

  const isDraftSafe = maxDynamicDraft <= Number(minWaterLevel);

  // Días de navegación estimados a partir de itinerario
  const navigationDays = useMemo(() => {
    try {
      const dep = new Date(departureDate).getTime();
      const arr = new Date(estimatedArrivalDate).getTime();
      if (!isNaN(dep) && !isNaN(arr) && arr > dep) {
        return Math.max(1, Math.round((arr - dep) / (1000 * 3600 * 24)));
      }
    } catch (_) {}
    return 7;
  }, [departureDate, estimatedArrivalDate]);

  // Estado del módulo de demoras en esclusas / aduanas (Demurrage)
  const [demurrageData, setDemurrageData] = useState<{
    waitingHours: number;
    demurrageCost: number;
    entries: WaitingTimeEntry[];
  }>({
    waitingHours: 12,
    demurrageCost: 2000,
    entries: [],
  });

  // Cálculo de OPEX Desacoplado: Vector Motor + Vector Carga + Demurrage
  const decoupledEstimate: FluvialEstimateResult | null = useMemo(() => {
    if (!selectedTugboat) return null;
    return estimateFluvialVoyage({
      tugboat: {
        id: selectedTugboat.id,
        name: selectedTugboat.name,
        motor: selectedTugboat.motor,
        dailyOpex: selectedTugboat.dailyOpex,
        enginePowerHp: selectedTugboat.enginePowerHp,
      },
      navigationDays,
      barges: coupledBarges.map((b) => ({
        id: b.id,
        name: b.name,
        bargeType: b.bargeType,
        capacity: Number(b.capacity) || 1500,
        dynamicDraft: Number(b.dynamicDraft) || 2.7,
        couplingDays: navigationDays,
      })),
      waitingHours: demurrageData.waitingHours,
    });
  }, [selectedTugboat, navigationDays, coupledBarges, demurrageData.waitingHours]);

  // Sincronización hacia callback padre
  useEffect(() => {
    onConvoyChange?.({
      tugboatId,
      bargeIds,
      totalCapacityMt,
      maxDynamicDraftMeters: maxDynamicDraft,
    });
  }, [tugboatId, bargeIds, totalCapacityMt, maxDynamicDraft, onConvoyChange]);

  // Manejadores del panel dinámico de barcazas
  const handleAddBarge = (idToAdd?: number) => {
    const id = idToAdd !== undefined ? idToAdd : Number(selectedBargeToAdd);
    if (!id || isNaN(id)) {
      setFeedback({ type: 'error', message: 'Selecciona una barcaza válida para acoplar.' });
      return;
    }
    if (bargeIds.includes(id)) {
      setFeedback({ type: 'error', message: 'Esta barcaza ya está acoplada al convoy.' });
      return;
    }
    setBargeIds((prev) => [...prev, id]);
    setSelectedBargeToAdd('');
    setFeedback({
      type: 'success',
      message: `Barcaza #${id} acoplada exitosamente al convoy fluvial.`,
    });
  };

  const handleRemoveBarge = (idToRemove: number) => {
    setBargeIds((prev) => prev.filter((id) => id !== idToRemove));
    setFeedback({
      type: 'info',
      message: `Barcaza #${idToRemove} desacoplada del convoy.`,
    });
  };

  const handleCreateCustomBarge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBargeName.trim()) {
      setFeedback({ type: 'error', message: 'Indica un nombre para la nueva barcaza.' });
      return;
    }
    const newId = Date.now();
    const created: Barge = {
      id: newId,
      name: newBargeName.trim(),
      bargeNumber: `B-NEW-${newId.toString().slice(-4)}`,
      bargeType: newBargeType,
      capacity: Number(newBargeCapacity) || 1500,
      dynamicDraft: Number(newBargeDraft) || 2.8,
      iotTrackingId: `IOT-BARGE-${newId.toString().slice(-4)}`,
      status: 'AVAILABLE',
    };
    setBargePool((prev) => [...prev, created]);
    setBargeIds((prev) => [...prev, newId]);
    setShowNewBargeModal(false);
    setNewBargeName('');
    setFeedback({
      type: 'success',
      message: `Barcaza "${created.name}" creada y acoplada automáticamente al convoy.`,
    });
  };

  // Guardar viaje y convoy con validación bloqueante de calado dinámico
  const handleSaveVoyage = async () => {
    if (!tugboatId) {
      setFeedback({
        type: 'error',
        message: 'Debes asignar un Remolcador (Tugboat) antes de guardar el viaje.',
      });
      return;
    }

    // Validador de Calado Dinámico (Draft Constraint):
    // Si el calado supera el nivel de agua disponible, debe devolver un error bloqueante y mostrar una alerta crítica en la UI.
    if (!isDraftSafe || maxDynamicDraft > Number(minWaterLevel)) {
      setFeedback({
        type: 'error',
        message: `Restricción Crítica de Calado Dinámico (Draft Constraint): El calado dinámico (${maxDynamicDraft.toFixed(2)} m) de la barcaza más pesada (${heaviestBarge?.name || 'Convoy'}) supera el nivel mínimo de estiaje disponible (${Number(minWaterLevel).toFixed(2)} m) en ${riverName}. Guardado bloqueado por riesgo inminente de varadura.`,
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    // Payload explícito con tugboat_id y array barge_ids
    const payload: SaveRiverVoyagePayload = {
      tugboat_id: Number(tugboatId),
      barge_ids: [...bargeIds],
      voyage_number: voyageNumber.trim() || `RV-${Date.now().toString().slice(-6)}`,
      river_name: riverName.trim(),
      origin_terminal: originTerminal.trim(),
      destination_terminal: destinationTerminal.trim(),
      min_water_level: Number(minWaterLevel),
      current_water_level: Number(minWaterLevel) + 0.3,
      departure_date: departureDate,
      estimated_arrival_date: estimatedArrivalDate,
      metadata: {
        totalCapacityMt,
        maxDynamicDraft,
        tugboatMotor: selectedTugboat?.motor,
        tugboatDailyOpex: selectedTugboat?.dailyOpex,
        bargeCount: bargeIds.length,
        barges: coupledBarges,
        financialEstimate: decoupledEstimate,
        demurrage: demurrageData,
      },
    };

    try {
      // 1. Guardar localmente
      try {
        localStorage.setItem(LOCAL_STORAGE_CONVOY_KEY, JSON.stringify(payload));
      } catch (_) {}

      // 2. Disparar callback prop si existe
      if (typeof onSave === 'function') {
        await onSave(payload);
      } else {
        // 3. Petición POST al endpoint de guardado de viajes fluviales con barcazas completas
        const endpoint = getApiUrl('/api/v1/river-voyages');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            barges: coupledBarges,
            max_dynamic_draft: maxDynamicDraft,
            waiting_hours: demurrageData.waitingHours,
            demurrage_cost: demurrageData.demurrageCost,
          }),
        });

        const resData = await res.json().catch(() => ({}));
        if (!res.ok || resData.success === false) {
          throw new Error(resData.error || resData.message || 'Error bloqueante al guardar el viaje fluvial en el servidor');
        }
      }

      // 4. Disparar evento global para sincronizar con mapa y otros módulos
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('rivercharter:convoy-saved', {
            detail: {
              ...payload,
              tugboat: selectedTugboat,
              barges: coupledBarges,
              financialEstimate: decoupledEstimate,
              demurrage: demurrageData,
            },
          })
        );
      }

      setFeedback({
        type: 'success',
        message: `Viaje fluvial ${payload.voyage_number} guardado con éxito. Remolcador #${payload.tugboat_id} y ${payload.barge_ids.length} barcazas acopladas. OPEX Total: $${decoupledEstimate?.totalVoyageCost.toLocaleString() || '0'} USD.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Error al guardar el viaje: ${err?.message || 'Error desconocido'}`,
      });
    } finally {
      setIsSaving(false);
    }
  };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-5 md:p-6 text-slate-200 font-sans max-w-6xl mx-auto space-y-6">
      {/* CABECERA: ENSAMBLAJE DE CONVOY */}
      <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-400 shadow-lg shadow-cyan-950/50">
            {/* Icono de Motor / Propulsión Fluvial */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-black text-white tracking-wide uppercase">
                Ensamblaje de Convoy Fluvial
              </h2>
              <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold uppercase">
                RiverCharter Convoy Builder
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Arquitectura modular push-convoy: asignación de remolcador y acople dinámico de barcazas
            </p>
          </div>
        </div>

        {/* Métricas rápidas del convoy */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Barcazas</span>
            <span className="text-sm font-mono font-bold text-cyan-300">{bargeIds.length}</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Capacidad Total</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{totalCapacityMt.toLocaleString()} MT</span>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-1.5 text-center">
            <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Calado Máx</span>
            <span className={`text-sm font-mono font-bold ${isDraftSafe ? 'text-cyan-300' : 'text-amber-400'}`}>
              {maxDynamicDraft.toFixed(2)} m
            </span>
          </div>
        </div>
      </div>

      {/* ALERTA CRÍTICA: RESTRICCIÓN DE CALADO DINÁMICO (DRAFT CONSTRAINT) */}
      {!isDraftSafe && (
        <div
          role="alert"
          id="draft-constraint-critical-alert"
          className="p-4 rounded-xl border-2 border-rose-500 bg-rose-950/90 text-rose-200 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-rose-900/60 border border-rose-500/60 rounded-xl text-rose-300 text-2xl shrink-0">
              🚨
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-black text-rose-400 text-xs sm:text-sm uppercase tracking-wider">
                  ALERTA CRÍTICA: Restricción de Calado Dinámico (Draft Constraint)
                </h4>
                <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded font-mono uppercase">
                  Despacho Fluvial Bloqueado
                </span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                El calado dinámico de la barcaza más pesada (
                <strong className="text-white underline">{heaviestBarge?.name || 'Barcaza'}</strong>
                : <strong className="text-rose-300 font-mono">{maxDynamicDraft.toFixed(2)} m</strong>)
                supera el nivel de estiaje disponible (
                <strong className="text-rose-300 font-mono">{Number(minWaterLevel).toFixed(2)} m</strong>)
                en la ruta <strong className="text-white">{riverName}</strong>.
                Exceso de calado crítico: <strong className="font-mono text-white">+{(maxDynamicDraft - Number(minWaterLevel)).toFixed(2)} m</strong>.
                Riesgo inminente de varadura en pasos críticos o fondos rocosos.
              </p>
            </div>
          </div>
          <div className="shrink-0 self-end sm:self-center">
            <span className="px-3 py-1.5 bg-rose-900 border border-rose-500/80 rounded-lg text-xs font-black text-white uppercase tracking-wider shadow-md inline-block">
              ⛔ Guardado No Permitido
            </span>
          </div>
        </div>
      )}

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          role="alert"
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 border transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA: SELECTOR PRINCIPAL DE TUGBOAT (4 cols) */}
        <section className="lg:col-span-5 bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                1. Remolcador / Empujador Asignado
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500 uppercase">Unidad Propulsora</span>
          </div>

          <div>
            <label htmlFor="convoy-tugboat-select" className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Selector Principal de Remolcador (Tugboat) *
            </label>
            <select
              id="convoy-tugboat-select"
              value={tugboatId ?? ''}
              onChange={(e) => setTugboatId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
            >
              <option value="">— Seleccionar Remolcador —</option>
              {availableTugboats.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.motor} ({t.enginePowerHp} HP) · OPEX ${t.dailyOpex}/d
                </option>
              ))}
            </select>
          </div>

          {/* TARJETA DE ESPECIFICACIONES DEL REMOLCADOR SELECCIONADO */}
          {selectedTugboat ? (
            <div className="bg-slate-900/90 border border-cyan-500/30 rounded-lg p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  {selectedTugboat.name}
                </div>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-600/40 px-2 py-0.5 rounded font-mono font-bold">
                  ID: #{selectedTugboat.id}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-start text-slate-300">
                  <span className="text-slate-500">Motor y Propulsión:</span>
                  <span className="font-mono font-bold text-cyan-300 text-right max-w-[220px] truncate" title={selectedTugboat.motor}>
                    {selectedTugboat.motor}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Potencia del Motor:</span>
                  <span className="font-mono font-bold text-white">{selectedTugboat.enginePowerHp?.toLocaleString()} BHP / HP</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Costo Operativo Diario (OPEX):</span>
                  <span className="font-mono font-bold text-emerald-400">${selectedTugboat.dailyOpex?.toLocaleString()} USD/día</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">MMSI (Telemetría AIS):</span>
                  <span className="font-mono font-bold text-slate-300">{selectedTugboat.mmsi || 'N/D'}</span>
                </div>
                {selectedTugboat.bollardPullTons && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Tiro a Punto Fijo (Bollard Pull):</span>
                    <span className="font-mono font-bold text-slate-300">{selectedTugboat.bollardPullTons} Tons</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500">Estado Operativo:</span>
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                    {selectedTugboat.status}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-500">
              No hay remolcador asignado. Selecciona un remolcador de la flota para propulsar el convoy.
            </div>
          )}

          {/* PARÁMETROS DEL VIAJE FLUVIAL */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Itinerario del Viaje
            </h4>

            <div>
              <label htmlFor="voyage-number-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">ID de Viaje</label>
              <input
                id="voyage-number-input"
                type="text"
                value={voyageNumber}
                onChange={(e) => setVoyageNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="origin-terminal-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Terminal Origen</label>
                <input
                  id="origin-terminal-input"
                  type="text"
                  value={originTerminal}
                  onChange={(e) => setOriginTerminal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="destination-terminal-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Terminal Destino</label>
                <input
                  id="destination-terminal-input"
                  type="text"
                  value={destinationTerminal}
                  onChange={(e) => setDestinationTerminal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="min-water-level-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                Nivel Mínimo de Estiaje Requerido (m)
              </label>
              <input
                id="min-water-level-input"
                type="number"
                step="0.1"
                value={minWaterLevel}
                onChange={(e) => setMinWaterLevel(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </section>

        {/* COLUMNA DERECHA: PANEL DINÁMICO DE BARCAZAS (7 cols) */}
        <section className="lg:col-span-7 bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🚢</span>
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  2. Panel Dinámico de Barcazas (Tren de Carga)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {bargeIds.length} Barcaza{bargeIds.length === 1 ? '' : 's'} Acoplada{bargeIds.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* BOTONES Y CONTROLES PARA AÑADIR BARCAZAS */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1">
                <select
                  id="barge-pool-select"
                  value={selectedBargeToAdd}
                  onChange={(e) => setSelectedBargeToAdd(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">— Seleccionar barcaza disponible —</option>
                  {uncoupledBarges.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} [{b.bargeType}] · {b.capacity} MT · Calado {b.dynamicDraft}m
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                id="btn-add-barge"
                onClick={() => handleAddBarge()}
                disabled={!selectedBargeToAdd}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded transition flex items-center justify-center gap-1.5 shrink-0"
              >
                <span>+ Acoplar Barcaza</span>
              </button>

              <button
                type="button"
                id="btn-new-custom-barge"
                onClick={() => setShowNewBargeModal((prev) => !prev)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded transition flex items-center justify-center gap-1 shrink-0"
              >
                <span>+ Nueva Barcaza</span>
              </button>
            </div>

            {/* FORMULARIO DESPLEGABLE PARA CREAR NUEVA BARCAZA PERSONALIZADA */}
            {showNewBargeModal && (
              <form onSubmit={handleCreateCustomBarge} className="bg-slate-900 border border-cyan-500/40 rounded-lg p-3 space-y-3">
                <div className="text-xs font-bold text-cyan-300 uppercase flex justify-between items-center">
                  <span>Registrar Nueva Barcaza en Flota</span>
                  <button type="button" onClick={() => setShowNewBargeModal(false)} className="text-slate-500 hover:text-white">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-slate-400 mb-0.5">Nombre / Matrícula</label>
                    <input
                      type="text"
                      value={newBargeName}
                      onChange={(e) => setNewBargeName(e.target.value)}
                      placeholder="Ej. Barcaza Tolva T-900"
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Tipo</label>
                    <select
                      value={newBargeType}
                      onChange={(e) => setNewBargeType(e.target.value as BargeType)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                    >
                      <option value="HOPPER">Tolva (Hopper)</option>
                      <option value="TANKER">Tanque Líquidos</option>
                      <option value="DECK">Cubierta Plana</option>
                      <option value="CONTAINER_BARGE">Portacontenedor</option>
                      <option value="BOX">Caja Cerrada</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">Capacidad (MT)</label>
                    <input
                      type="number"
                      value={newBargeCapacity}
                      onChange={(e) => setNewBargeCapacity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewBargeModal(false)}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold"
                  >
                    Crear y Acoplar
                  </button>
                </div>
              </form>
            )}

            {/* LISTA DINÁMICA DE BARCAZAS ASOCIADAS */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {coupledBarges.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-800 rounded-lg text-center space-y-2">
                  <div className="text-3xl">📦</div>
                  <p className="text-xs text-slate-400 font-semibold">
                    No hay barcazas asociadas a este viaje todavía.
                  </p>
                  <p className="text-[11px] text-slate-600 max-w-sm mx-auto">
                    Utiliza el selector superior o los botones rápidos para acoplar unidades de carga al remolcador.
                  </p>
                </div>
              ) : (
                coupledBarges.map((barge, index) => (
                  <div
                    key={barge.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{barge.name}</span>
                          <span className="text-[9px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded font-mono">
                            {barge.bargeType}
                          </span>
                          <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                            ACOPLADA
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-0.5">
                          <span><b>Capacidad:</b> {Number(barge.capacity).toLocaleString()} MT</span>
                          <span><b>Calado Dinámico:</b> {Number(barge.dynamicDraft).toFixed(2)} m</span>
                          {barge.iotTrackingId && (
                            <span className="text-cyan-400 font-mono text-[10px]">
                              📡 IoT: {barge.iotTrackingId}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveBarge(barge.id)}
                      className="self-end sm:self-center text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 px-2.5 py-1 rounded text-xs transition flex items-center gap-1.5"
                      title="Desacoplar barcaza del viaje"
                    >
                      <span>✕ Desacoplar</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RESUMEN DEL CONVOY Y BOTÓN DE GUARDAR */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Remolcador</span>
                <span className="font-bold text-white truncate block">
                  {selectedTugboat ? selectedTugboat.name : 'Sin asignar'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Barcazas Totales</span>
                <span className="font-mono font-bold text-cyan-300">{bargeIds.length} unidades</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Capacidad Agregada</span>
                <span className="font-mono font-bold text-emerald-400">{totalCapacityMt.toLocaleString()} MT</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Estado Hidrométrico</span>
                <span className={`font-bold text-[11px] ${isDraftSafe ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isDraftSafe ? '✓ Calado Seguro' : '⚠️ Riesgo de Estiaje'}
                </span>
              </div>
            </div>

            <button
              type="button"
              id="btn-save-river-voyage"
              onClick={handleSaveVoyage}
              disabled={isSaving || !tugboatId || !isDraftSafe}
              className={`w-full text-white text-xs font-black uppercase tracking-wider py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                !isDraftSafe
                  ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-200 cursor-not-allowed shadow-rose-950/40'
                  : 'bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 shadow-cyan-950/40'
              }`}
            >
              {!isDraftSafe ? (
                <span className="text-rose-200 flex items-center gap-1.5">
                  ⛔ Guardado Bloqueado: Calado ({maxDynamicDraft.toFixed(2)} m) &gt; Estiaje ({Number(minWaterLevel).toFixed(2)} m)
                </span>
              ) : isSaving ? (
                <span>Guardando Convoy Fluvial...</span>
              ) : (
                <>
                  <span>⚓ Guardar Viaje y Ensamblaje de Convoy</span>
                  <span className="text-[10px] font-mono text-cyan-200">
                    (tugboat_id: {tugboatId ?? 'null'} · {bargeIds.length} barge_ids)
                  </span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* SECCIÓN 3: CÁLCULO DE OPEX DESACOPLADO (MOTOR VS CARGA) */}
      <section
        id="decoupled-opex-section"
        className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs md:text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  3. Núcleo Financiero: Cálculo de OPEX Desacoplado
                </h3>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase">
                  Motor vs Carga
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Estimación de rentabilidad segregada: Costo de Propulsión / Motor y Costo de Barcazas / Carga
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Días Estimados del Viaje</span>
            <span className="text-sm font-mono font-black text-cyan-300">{navigationDays} días de navegación</span>
          </div>
        </div>

        {/* VECTORES DE COSTO DESACOPLADOS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* VECTOR 1: COSTO DEL MOTOR */}
          <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-cyan-300 uppercase flex items-center gap-1.5">
                <span>⚙️</span> Vector 1: Costo del Motor
              </span>
              <span className="text-[10px] font-mono bg-cyan-950 text-cyan-200 border border-cyan-500/30 px-1.5 py-0.5 rounded font-bold">
                Propulsión
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Días de Navegación × OPEX Diario:</span>
                <span className="font-mono font-bold text-white">
                  ${decoupledEstimate?.motorCost.opexTotalCost.toLocaleString() ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                {navigationDays} días × ${selectedTugboat?.dailyOpex?.toLocaleString() || 0}/día
              </p>
              <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Consumo de Combustible Estimado:</span>
                <span className="font-mono font-bold text-white">
                  ${decoupledEstimate?.motorCost.estimatedFuelCost.toLocaleString() ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                {decoupledEstimate?.motorCost.estimatedFuelTons} MT fuel @ ${decoupledEstimate?.motorCost.fuelPricePerTon}/MT
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-cyan-300 uppercase">Subtotal Motor:</span>
              <span className="text-base font-mono font-black text-cyan-300">
                ${decoupledEstimate?.motorCost.totalMotorCost.toLocaleString() ?? 0} USD
              </span>
            </div>
          </div>

          {/* VECTOR 2: COSTO DE CARGA */}
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-emerald-300 uppercase flex items-center gap-1.5">
                <span>📦</span> Vector 2: Costo de Carga
              </span>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-200 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                Barcazas
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Barcazas en Convoy:</span>
                <span className="font-mono font-bold text-white">
                  {coupledBarges.length} unidades
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Días Estimados de Acople:</span>
                <span className="font-mono font-bold text-white">
                  {navigationDays} días
                </span>
              </div>
              <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Alquiler o Amortización:</span>
                <span className="font-mono font-bold text-white">
                  ~${decoupledEstimate?.cargoCost.bargeCosts[0]?.dailyRate ?? 250}/día por barcaza
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                {coupledBarges.length} barcazas × {navigationDays} días acopladas
              </p>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-emerald-300 uppercase">Subtotal Carga:</span>
              <span className="text-base font-mono font-black text-emerald-300">
                ${decoupledEstimate?.cargoCost.totalCargoCost.toLocaleString() ?? 0} USD
              </span>
            </div>
          </div>

          {/* RESUMEN INTEGRADO BASE */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white uppercase flex items-center gap-1.5">
                  <span>📊</span> Gasto Base Operativo
                </span>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-bold">
                  Motor + Carga
                </span>
              </div>
              <div className="space-y-1.5 mt-2">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Subtotal Motor (Propulsión):</span>
                  <span className="font-mono text-cyan-300">
                    ${decoupledEstimate?.motorCost.totalMotorCost.toLocaleString() ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Subtotal Carga (Barcazas):</span>
                  <span className="font-mono text-emerald-300">
                    ${decoupledEstimate?.cargoCost.totalCargoCost.toLocaleString() ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">Costo Base por Tonelada:</span>
                  <span className="font-mono font-bold text-white">
                    {totalCapacityMt > 0 && decoupledEstimate
                      ? (decoupledEstimate.baseVoyageCost / totalCapacityMt).toFixed(2)
                      : '0.00'} USD/MT
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-xs font-bold text-white uppercase">Costo Base Total:</span>
              <span className="text-lg font-mono font-black text-white">
                ${decoupledEstimate?.baseVoyageCost.toLocaleString() ?? 0} USD
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECCIÓN 4: MÓDULO DE DEMORAS EN ESCLUSAS (DEMURRAGE) */}
      <section id="lock-demurrage-section">
        <LockDemurrageModule
          dailyOpex={selectedTugboat?.dailyOpex || 3400}
          tugboatName={selectedTugboat?.name || 'Remolcador Fluvial'}
          enginePowerHp={selectedTugboat?.enginePowerHp}
          baseVoyageCost={decoupledEstimate?.baseVoyageCost || 0}
          onDemurrageChange={(data) => {
            setDemurrageData({
              waitingHours: data.waitingHours,
              demurrageCost: data.demurrageCost,
              entries: data.entries,
            });
          }}
        />
      </section>
    </div>
  );
}

export default ConvoyBuilder;
