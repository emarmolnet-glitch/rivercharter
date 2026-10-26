import React, { useState, useEffect, useMemo, useRef } from 'react';
// @ts-ignore
import { getApiUrl } from './src/utils/apiConfig.js';
import {
  type Tugboat,
  type Barge,
  type RiverVoyage,
  type VoyageBarge,
  type SaveRiverVoyagePayload,
  type BargeType,
} from './src/types/rivercharter.js';
import ConvoyBuilder from './src/components/ConvoyBuilder.js';

const STORAGE_KEY = 'rivercharter_v2_convoy_session';

export type { Tugboat, Barge, RiverVoyage, VoyageBarge, SaveRiverVoyagePayload };

// Interfaz modular para unidades fluviales (remolcadores, barcazas y convoyes)
export interface FluvialFleetUnit {
  id?: number;
  vessel_name: string;
  dwt?: number;
  capacity?: number;
  loa?: string;
  draft?: string;
  dynamic_draft?: number;
  spd_ballast?: number;
  spd_laden?: number;
  cons_sea?: number;
  cons_port?: number;
  unit_type?: 'tugboat' | 'barge' | 'convoy';
  motor?: string;
  daily_opex?: number;
  mmsi?: string;
  iot_tracking_id?: string;
  tugboat_id?: number | null;
  barge_ids?: number[];
}

const DEFAULT_AVAILABLE_TUGBOATS: Tugboat[] = [
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

const DEFAULT_AVAILABLE_BARGES: Barge[] = [
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
    name: 'Barcaza Cubierta Deck D-301',
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

export function ShipComparison() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --------------------------------------------------------------------------
  // ESTADO DEL FORMULARIO DE CONVOY FLUVIAL (Fase 2)
  // Reemplaza el selector de buque oceánico único con tugboat_id y barge_ids
  // --------------------------------------------------------------------------
  const [tugboat_id, setTugboatId] = useState<number | null>(1);
  const [barge_ids, setBargeIds] = useState<number[]>([101, 102]);

  const [availableTugboats, setAvailableTugboats] = useState<Tugboat[]>(DEFAULT_AVAILABLE_TUGBOATS);
  const [availableBarges, setAvailableBarges] = useState<Barge[]>(DEFAULT_AVAILABLE_BARGES);
  const [selectedBargeToAdd, setSelectedBargeToAdd] = useState<number | ''>('');

  // Itinerario y metadatos del viaje fluvial
  const [voyageNumber, setVoyageNumber] = useState<string>('RV-2026-PAR-001');
  const [riverName, setRiverName] = useState<string>('Hidrovía Paraná-Paraguay');
  const [originTerminal, setOriginTerminal] = useState<string>('Terminal San Lorenzo Km 445');
  const [destinationTerminal, setDestinationTerminal] = useState<string>('Terminal Nueva Palmira Km 0');
  const [minWaterLevel, setMinWaterLevel] = useState<number>(2.6);

  // Lista de convoyes / unidades guardadas en biblioteca local
  const [savedConvoys, setSavedConvoys] = useState<FluvialFleetUnit[]>([]);

  // Feedback de UI y estado de carga
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Remolcador actualmente asignado
  const selectedTugboat = useMemo(() => {
    return availableTugboats.find((t) => t.id === Number(tugboat_id)) || null;
  }, [availableTugboats, tugboat_id]);

  // Barcazas acopladas actualmente
  const coupledBarges = useMemo(() => {
    return barge_ids
      .map((id) => availableBarges.find((b) => b.id === id))
      .filter((b): b is Barge => Boolean(b));
  }, [barge_ids, availableBarges]);

  // Barcazas aún no acopladas
  const uncoupledBarges = useMemo(() => {
    return availableBarges.filter((b) => !barge_ids.includes(b.id));
  }, [availableBarges, barge_ids]);

  // Métricas dinámicas del convoy
  const totalCapacityMt = useMemo(() => {
    return coupledBarges.reduce((sum, b) => sum + (Number(b.capacity) || 0), 0);
  }, [coupledBarges]);

  const maxDynamicDraft = useMemo(() => {
    if (coupledBarges.length === 0) return 0;
    return Math.max(...coupledBarges.map((b) => Number(b.dynamicDraft) || 0));
  }, [coupledBarges]);

  const isDraftSafe = maxDynamicDraft <= minWaterLevel;

  // Notificaciones
  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => {
      setMessage(null);
    }, 5000);
  };

  // Limpieza de sesión
  const cleanSession = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // Acciones en el panel dinámico de barcazas
  const handleAddBarge = (id?: number) => {
    const idToAdd = id !== undefined ? id : Number(selectedBargeToAdd);
    if (!idToAdd || isNaN(idToAdd)) {
      showNotification('error', 'Selecciona una barcaza válida para acoplar al convoy.');
      return;
    }
    if (barge_ids.includes(idToAdd)) {
      showNotification('error', 'Esta barcaza ya está acoplada al convoy.');
      return;
    }
    setBargeIds((prev) => [...prev, idToAdd]);
    setSelectedBargeToAdd('');
    showNotification('success', `Barcaza #${idToAdd} acoplada al convoy.`);
  };

  const handleRemoveBarge = (idToRemove: number) => {
    setBargeIds((prev) => prev.filter((id) => id !== idToRemove));
    showNotification('info', `Barcaza #${idToRemove} desacoplada del convoy.`);
  };

  // Exportar a CSV para compatibilidad
  const exportToCSV = (data: any) => {
    const jsonString = JSON.stringify(data);
    const csvContent = 'data:text/csv;charset=utf-8,json_data\n' + btoa(unescape(encodeURIComponent(jsonString)));
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const rawFilename = `convoy_${data.voyage_number || data.vessel_name || 'sesion'}.csv`;
    const safeFilename = rawFilename.replace(/[:\\/*?"<>|]/g, '_');
    link.setAttribute('download', safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Guardar Sesión CSV
  const handleSaveSession = () => {
    const currentPayload: SaveRiverVoyagePayload = {
      tugboat_id: Number(tugboat_id),
      barge_ids: [...barge_ids],
      voyage_number: voyageNumber,
      river_name: riverName,
      origin_terminal: originTerminal,
      destination_terminal: destinationTerminal,
      min_water_level: minWaterLevel,
    };
    exportToCSV(currentPayload);
    showNotification('success', 'Sesión de convoy exportada exitosamente.');
  };

  // Cargar Sesión
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        if (!result || !result.trim()) throw new Error('Archivo vacío');
        const lines = result.split('\n');
        const text = lines[1]?.trim();
        if (!text) throw new Error('Sin datos');
        const decodeBase64 = (str: string) => {
          return decodeURIComponent(
            atob(str)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
        };
        const parsed = JSON.parse(decodeBase64(text));
        if (parsed.tugboat_id !== undefined) setTugboatId(parsed.tugboat_id);
        if (Array.isArray(parsed.barge_ids)) setBargeIds(parsed.barge_ids);
        if (parsed.voyage_number) setVoyageNumber(parsed.voyage_number);
        showNotification('success', 'Sesión de convoy cargada con éxito.');
      } catch (_) {
        alert('Error al leer archivo de sesión.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExit = () => {
    window.location.href = '/';
  };

  // --------------------------------------------------------------------------
  // GUARDAR CONVOY FLUVIAL (Payload explícito con tugboat_id y barge_ids)
  // --------------------------------------------------------------------------
  const handleGuardarConvoy = async () => {
    if (!tugboat_id) {
      showNotification('error', 'Por favor, asigna un Remolcador (Tugboat) antes de guardar el viaje.');
      return;
    }

    // Validador de Calado Dinámico (Draft Constraint):
    // Compara el dynamic_draft del convoy contra el min_water_level de la ruta antes de guardar.
    if (maxDynamicDraft > Number(minWaterLevel)) {
      showNotification(
        'error',
        `Restricción Crítica de Calado Dinámico (Draft Constraint): El calado dinámico (${maxDynamicDraft.toFixed(2)} m) supera el nivel mínimo de estiaje (${Number(minWaterLevel).toFixed(2)} m) en ${riverName}. Guardado bloqueado por seguridad fluvial.`
      );
      return;
    }

    setIsLoading(true);

    // Payload requerido por la especificación de Fase 2
    const payload: SaveRiverVoyagePayload = {
      tugboat_id: Number(tugboat_id),
      barge_ids: [...barge_ids],
      voyage_number: voyageNumber.trim() || `RV-${Date.now().toString().slice(-6)}`,
      river_name: riverName.trim(),
      origin_terminal: originTerminal.trim(),
      destination_terminal: destinationTerminal.trim(),
      min_water_level: Number(minWaterLevel),
      metadata: {
        totalCapacityMt,
        maxDynamicDraft,
        tugboatMotor: selectedTugboat?.motor,
        tugboatDailyOpex: selectedTugboat?.dailyOpex,
        bargeCount: barge_ids.length,
      },
    };

    // Unidad para registrar en la lista de flota fluvial
    const newConvoyUnit: FluvialFleetUnit = {
      id: Date.now(),
      vessel_name: `${selectedTugboat?.name || 'Convoy'} + ${barge_ids.length} barcazas (${payload.voyage_number})`,
      dwt: totalCapacityMt,
      capacity: totalCapacityMt,
      draft: `${maxDynamicDraft.toFixed(2)}m`,
      dynamic_draft: maxDynamicDraft,
      unit_type: 'convoy',
      motor: selectedTugboat?.motor,
      daily_opex: selectedTugboat?.dailyOpex,
      mmsi: selectedTugboat?.mmsi ?? undefined,
      tugboat_id: Number(tugboat_id),
      barge_ids: [...barge_ids],
    };

    try {
      // 1. Guardar en API backend si está disponible
      const endpoint = getApiUrl('/api/v1/river-voyages');
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => {
        console.warn('[ShipComparison] API save fallback to local state:', e);
      });

      // 2. Persistir localmente en biblioteca
      const updatedList = [
        ...savedConvoys.filter((c) => c.vessel_name !== newConvoyUnit.vessel_name),
        newConvoyUnit,
      ];
      localStorage.setItem('rodahmar_saved_vessels', JSON.stringify(updatedList, null, 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSavedConvoys(updatedList);

      // 3. Notificar a través de evento global
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('rivercharter:convoy-saved', {
            detail: {
              ...payload,
              tugboat: selectedTugboat,
              barges: coupledBarges,
            },
          })
        );
      }

      showNotification(
        'success',
        `⚓ Convoy fluvial "${payload.voyage_number}" guardado: Remolcador #${payload.tugboat_id} y [${payload.barge_ids.join(', ')}] barcazas.`
      );
    } catch (error) {
      showNotification('error', 'Error al guardar el viaje de convoy.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEliminarConvoy = (indexToDelete: number) => {
    const updated = savedConvoys.filter((_, idx) => idx !== indexToDelete);
    localStorage.setItem('rodahmar_saved_vessels', JSON.stringify(updated, null, 2));
    setSavedConvoys(updated);
    showNotification('info', 'Convoy eliminado de la biblioteca.');
  };

  // Carga inicial y sincronización con localStorage
  useEffect(() => {
    const stored = localStorage.getItem('rodahmar_saved_vessels');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSavedConvoys(parsed);
      } catch (_) {}
    }
    const savedSession = localStorage.getItem(STORAGE_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.tugboat_id) setTugboatId(parsed.tugboat_id);
        if (Array.isArray(parsed.barge_ids)) setBargeIds(parsed.barge_ids);
        if (parsed.voyage_number) setVoyageNumber(parsed.voyage_number);
      } catch (_) {}
    }
    setIsInitialized(true);
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-300 font-sans max-w-6xl mx-auto space-y-6">
      {/* CABECERA */}
      <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/60 border border-cyan-500/40 rounded-lg text-cyan-400">
            {/* Icono de Motor / Propulsión */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide uppercase">
              Creador de Viajes Fluviales · Ensamblaje de Convoy
            </h2>
            <p className="text-xs text-slate-500">
              Arquitectura modular RiverCharter: desacoplamiento de motor (Tugboat) y carga (Barges)
            </p>
          </div>
        </div>

        {/* Acciones de Sesión */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button
            onClick={handleSaveSession}
            className="h-9 w-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center justify-center cursor-pointer"
            title="Guardar Sesión CSV"
            aria-label="Guardar Sesión CSV"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-9 w-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center justify-center cursor-pointer"
            title="Cargar Sesión CSV"
            aria-label="Cargar Sesión CSV"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={handleExit}
            className="h-9 w-9 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center justify-center cursor-pointer"
            title="Salir"
            aria-label="Salir"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* ALERTA CRÍTICA: RESTRICCIÓN DE CALADO DINÁMICO (DRAFT CONSTRAINT) */}
      {maxDynamicDraft > Number(minWaterLevel) && (
        <div
          role="alert"
          className="p-4 rounded-xl border-2 border-rose-500 bg-rose-950/90 text-rose-200 shadow-2xl flex items-start gap-3.5 animate-pulse"
        >
          <span className="text-2xl shrink-0">🚨</span>
          <div className="space-y-1">
            <h4 className="font-black text-rose-400 text-xs sm:text-sm uppercase tracking-wider">
              ALERTA CRÍTICA: Restricción de Calado Dinámico (Draft Constraint)
            </h4>
            <p className="text-xs text-rose-200">
              El calado dinámico del convoy (<b>{maxDynamicDraft.toFixed(2)} m</b>) supera el nivel mínimo de estiaje disponible (<b>{Number(minWaterLevel).toFixed(2)} m</b>) en <b>{riverName}</b>.
              Operación fluvial bloqueada por riesgo inminente de varadura.
            </p>
          </div>
        </div>
      )}

      {/* Notificación de feedback */}
      {message && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-all ${
            message.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : message.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
          }`}
        >
          <span>{message.text}</span>
        </div>
      )}

      {/* GRID PRINCIPAL: ENSAMBLAJE DE CONVOY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PANEL IZQUIERDO: SELECTOR DE TUGBOAT (1 col) */}
        <div className="md:col-span-1 bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Asignación de Remolcador (Tugboat)
            </h3>
            <p className="text-[10px] text-slate-500">Unidad propulsora activa</p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="tugboat-select-main" className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Remolcador Asignado *
              </label>
              <select
                id="tugboat-select-main"
                value={tugboat_id ?? ''}
                onChange={(e) => setTugboatId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-2 text-xs text-white font-bold focus:outline-none focus:border-cyan-500"
              >
                <option value="">— Seleccionar Remolcador —</option>
                {availableTugboats.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.enginePowerHp} HP)
                  </option>
                ))}
              </select>
            </div>

            {selectedTugboat && (
              <div className="bg-slate-900/90 border border-cyan-500/30 rounded p-3 text-xs space-y-1.5 shadow-sm">
                <div className="font-bold text-white flex items-center justify-between">
                  <span>{selectedTugboat.name}</span>
                  <span className="text-[10px] text-cyan-400 font-mono">ID: #{selectedTugboat.id}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-500">Motor:</span> <strong className="text-slate-200">{selectedTugboat.motor}</strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-500">Potencia:</span> <span className="font-mono text-cyan-300">{selectedTugboat.enginePowerHp} HP</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-500">OPEX Diario:</span> <span className="font-mono text-emerald-400">${selectedTugboat.dailyOpex?.toLocaleString()} USD/d</span>
                </div>
                {selectedTugboat.mmsi && (
                  <div className="text-[11px] text-slate-400">
                    <span className="text-slate-500">MMSI AIS:</span> <span className="font-mono text-slate-300">{selectedTugboat.mmsi}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">ID de Viaje</label>
                <input
                  type="text"
                  value={voyageNumber}
                  onChange={(e) => setVoyageNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Corredor Fluvial</label>
                <input
                  type="text"
                  value={riverName}
                  onChange={(e) => setRiverName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Origen</label>
                  <input
                    type="text"
                    value={originTerminal}
                    onChange={(e) => setOriginTerminal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Destino</label>
                  <input
                    type="text"
                    value={destinationTerminal}
                    onChange={(e) => setDestinationTerminal(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white truncate focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                  Estiaje Mínimo (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={minWaterLevel}
                  onChange={(e) => setMinWaterLevel(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              type="button"
              id="btn-guardar-convoy"
              onClick={handleGuardarConvoy}
              disabled={isLoading || !tugboat_id}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold py-2.5 px-3 rounded transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-950/20 cursor-pointer"
            >
              <span>⚓ Guardar Convoy Fluvial</span>
            </button>
          </div>
        </div>

        {/* PANEL DERECHO: PANEL DINÁMICO DE BARCAZAS (2 cols) */}
        <div className="md:col-span-2 bg-slate-950/40 border border-slate-800 rounded-lg p-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Panel Dinámico de Barcazas Acopladas
              </h3>
              <span className="text-[10px] font-mono text-cyan-400">
                {barge_ids.length} barcaza{barge_ids.length === 1 ? '' : 's'} · {totalCapacityMt.toLocaleString()} MT
              </span>
            </div>

            {/* BARRA DE AÑADIR BARCAZA */}
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <select
                value={selectedBargeToAdd}
                onChange={(e) => setSelectedBargeToAdd(e.target.value ? Number(e.target.value) : '')}
                className="w-full sm:flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option value="">— Seleccionar barcaza disponible para acoplar —</option>
                {uncoupledBarges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} [{b.bargeType}] · {b.capacity} MT · Calado {b.dynamicDraft}m
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleAddBarge()}
                disabled={!selectedBargeToAdd}
                className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-bold px-3 py-1.5 rounded transition whitespace-nowrap cursor-pointer"
              >
                + Añadir Barcaza
              </button>
            </div>

            {/* LISTA DE BARCAZAS ACOPLADAS */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {coupledBarges.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  No hay barcazas acopladas a este viaje. Selecciona una barcaza arriba para incorporarla al convoy.
                </div>
              ) : (
                coupledBarges.map((barge, index) => (
                  <div
                    key={barge.id}
                    className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{barge.name}</span>
                          <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                            {barge.bargeType}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>Capacidad: <b className="text-slate-200">{Number(barge.capacity).toLocaleString()} MT</b></span>
                          <span>•</span>
                          <span>Calado: <b className="text-slate-200">{Number(barge.dynamicDraft).toFixed(2)}m</b></span>
                          {barge.iotTrackingId && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-400 font-mono">IoT: {barge.iotTrackingId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveBarge(barge.id)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-slate-800 transition cursor-pointer"
                      title="Desacoplar Barcaza"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* TABLA DE CONVOYES / FLOTA GUARDADA */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Biblioteca de Convoyes y Flota Guardada</span>
              <span className="font-mono text-slate-600">{savedConvoys.length} registros</span>
            </h4>

            <div className="max-h-[140px] overflow-y-auto">
              {savedConvoys.length === 0 ? (
                <p className="text-[11px] text-slate-600 italic">No hay convoyes guardados en la biblioteca local.</p>
              ) : (
                <div className="divide-y divide-slate-800/80 text-xs">
                  {savedConvoys.map((c, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between group">
                      <div>
                        <span className="font-bold text-white text-[11px]">{c.vessel_name}</span>
                        <span className="text-[10px] text-slate-400 ml-2 font-mono">
                          {c.capacity || c.dwt} MT · Calado: {c.draft}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEliminarConvoy(idx)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ConvoyBuilder };
export default ShipComparison;
