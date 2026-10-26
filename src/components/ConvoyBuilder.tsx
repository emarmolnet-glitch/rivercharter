import React, { useState, useEffect, useMemo } from 'react';
import {
  type Tugboat,
  type Barge,
  type SaveRiverVoyagePayload,
  type BargeType,
  type TugboatOpexBreakdown,
  type FluvialBunkers,
  type FluvialPdaExpenses,
  type FluvialDelays,
  type FluvialExecutiveMetrics,
} from '../types/rivercharter.js';
import { getApiUrl } from '../utils/apiConfig.js';
import {
  estimateFluvialVoyage,
  calculateFluvialPda,
  calculateDefaultBargeRate,
  type FluvialEstimateResult,
} from '../services/fluvialEstimator.js';
import {
  DATABRIDGE_FLUVIAL_STANDARDS,
  type FluvialBargeStandard,
} from '../services/databridgeFluvialService.js';
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
  initialMode?: 'tech' | 'exec';
  mode?: 'tech' | 'exec';
  onModeChange?: (mode: 'tech' | 'exec') => void;
  onSave?: (payload: SaveRiverVoyagePayload) => void | Promise<void>;
  onConvoyChange?: (convoy: {
    tugboatId: number | null;
    bargeIds: number[];
    totalCapacityMt: number;
    maxDynamicDraftMeters: number;
    estimate?: FluvialEstimateResult | null;
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
    linearMeters: 660,
    truckCount: 40,
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
    linearMeters: 660,
    truckCount: 40,
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
    linearMeters: 750,
    truckCount: 45,
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
    linearMeters: 580,
    truckCount: 35,
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
    linearMeters: 850,
    truckCount: 52,
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
    linearMeters: 700,
    truckCount: 42,
    iotTrackingId: 'IOT-BARGE-103',
    status: 'AVAILABLE',
  },
  {
    id: 107,
    name: 'Barcaza Ro-Ro Carretera Flotante R-501',
    bargeNumber: 'B-PAR-501',
    bargeType: 'RORO_BARGE',
    capacity: 1800,
    dynamicDraft: 2.2,
    linearMeters: 800,
    truckCount: 48,
    iotTrackingId: 'IOT-BARGE-501',
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
  initialMode = 'tech',
  mode: controlledMode,
  onModeChange,
  onSave,
  onConvoyChange,
}: ConvoyBuilderProps) {
  // --------------------------------------------------------------------------
  // CONTROL DE VISTA (MODO TÉCNICO VS VISTA EJECUTIVA RESUMEN)
  // --------------------------------------------------------------------------
  const [internalMode, setInternalMode] = useState<'tech' | 'exec'>(initialMode);
  const activeMode = controlledMode || internalMode;

  const handleSwitchMode = (newMode: 'tech' | 'exec') => {
    setInternalMode(newMode);
    onModeChange?.(newMode);
    if (typeof window !== 'undefined' && typeof (window as any).setCalculatorMode === 'function') {
      try {
        (window as any).setCalculatorMode(newMode);
      } catch (_) {}
    }
  };

  // --------------------------------------------------------------------------
  // 1. ENSAMBLADOR DE CONVOY (ESTADO Y SELECCIÓN)
  // --------------------------------------------------------------------------
  const [tugboatId, setTugboatId] = useState<number | null>(() => {
    return initialTugboatId !== undefined ? initialTugboatId : (availableTugboats[0]?.id ?? null);
  });
  const [bargeIds, setBargeIds] = useState<number[]>(() => {
    return Array.isArray(initialBargeIds) ? initialBargeIds : [101, 102];
  });

  const [bargePool, setBargePool] = useState<Barge[]>(availableBarges);
  const [selectedBargeToAdd, setSelectedBargeToAdd] = useState<number | ''>('');

  // Parámetros de ruta e itinerario
  const [voyageNumber, setVoyageNumber] = useState(initialVoyageNumber);
  const [riverName, setRiverName] = useState(initialRiverName);
  const [originTerminal, setOriginTerminal] = useState(initialOrigin);
  const [destinationTerminal, setDestinationTerminal] = useState(initialDestination);
  const [minWaterLevel, setMinWaterLevel] = useState<number>(initialMinWaterLevel);
  const [departureDate, setDepartureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  // Tipo de operación: Granel vs Ro-Ro / Carretera Flotante
  const [operationType, setOperationType] = useState<'BULK' | 'RORO'>('BULK');

  // Alertas RIS (Servicios de Información Fluvial)
  const [risSandbarsActive, setRisSandbarsActive] = useState<boolean>(false);
  const [risStrongCurrentsActive, setRisStrongCurrentsActive] = useState<boolean>(false);

  // Submódulo de Transferencia Intermodal y Ahorros Terrestres Sincro-modales
  const [directTransshipmentTariff, setDirectTransshipmentTariff] = useState<number>(1800);
  const [estimatedLandSavings, setEstimatedLandSavings] = useState<number>(3600);

  // Modal para registrar nueva barcaza en flota
  const [showNewBargeModal, setShowNewBargeModal] = useState(false);
  const [newBargeName, setNewBargeName] = useState('');
  const [newBargeType, setNewBargeType] = useState<BargeType>('HOPPER');
  const [newBargeCapacity, setNewBargeCapacity] = useState('1500');
  const [newBargeDraft, setNewBargeDraft] = useState('2.8');
  const [newBargeLinearMeters, setNewBargeLinearMeters] = useState('800');
  const [newBargeTruckCount, setNewBargeTruckCount] = useState('48');

  // Sincronización del tipo de operación con eventos externos de la UI host
  useEffect(() => {
    const handleOpChange = (e: any) => {
      if (e.detail?.type === 'RORO' || e.detail?.type === 'BULK') {
        setOperationType(e.detail.type);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('fluvial-operation-type-changed', handleOpChange);
      return () => window.removeEventListener('fluvial-operation-type-changed', handleOpChange);
    }
  }, []);

  const handleSwitchOperationType = (type: 'BULK' | 'RORO') => {
    setOperationType(type);
    if (typeof window !== 'undefined') {
      (window as any).activeFluvialOperationType = type;
      const btnBulk = document.getElementById('btn-fluvial-bulk');
      const btnRoro = document.getElementById('btn-fluvial-roro');
      const roroPanel = document.getElementById('fluvial-roro-capacity-panel');
      const labelOp = document.getElementById('label-active-operation-type');
      if (type === 'RORO') {
        if (btnRoro) btnRoro.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-emerald-700 shadow-sm border border-slate-200 transition';
        if (btnBulk) btnBulk.className = 'px-3 py-1.5 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition';
        if (labelOp) labelOp.textContent = '🚛 Ro-Ro / Carretera Flotante (Metros lineales y camiones)';
        if (roroPanel) roroPanel.classList.remove('hidden');
      } else {
        if (btnBulk) btnBulk.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-blue-700 shadow-sm border border-slate-200 transition';
        if (btnRoro) btnRoro.className = 'px-3 py-1.5 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition';
        if (labelOp) labelOp.textContent = '📦 Carga a Granel (Toneladas Métricas)';
        if (roroPanel) roroPanel.classList.add('hidden');
      }
    }
  };

  // --------------------------------------------------------------------------
  // TOGGLE RÁPIDO ESTÁNDAR DATABRIDGE (MISISIPI JUMBO VS LATAM SÚPER JUMBO)
  // --------------------------------------------------------------------------
  const [activeBargeStandard, setActiveBargeStandard] = useState<'mississippi_jumbo' | 'latam_super_jumbo' | null>(null);

  const handleApplyBargeStandard = (standardKey: 'mississippi_jumbo' | 'latam_super_jumbo') => {
    setActiveBargeStandard(standardKey);
    const std = DATABRIDGE_FLUVIAL_STANDARDS[standardKey];
    if (!std) return;

    // Crea barcazas estandarizadas importadas de DataBridge
    const standardBarges: Barge[] = Array.from({ length: std.defaultBargeCount }).map((_, idx) => {
      const id = standardKey === 'mississippi_jumbo' ? 701 + idx : 801 + idx;
      const prefix = standardKey === 'mississippi_jumbo' ? 'Jumbo Misisipi' : 'Súper Jumbo LatAm';
      const code = standardKey === 'mississippi_jumbo' ? `B-MS-${idx + 1}` : `B-HP-${idx + 1}`;
      return {
        id,
        name: `${prefix} #${idx + 1}`,
        bargeNumber: code,
        bargeType: std.bargeType,
        capacity: std.capacityMt,
        dynamicDraft: std.dynamicDraftMeters,
        linearMeters: Math.round(std.capacityMt * 0.44),
        truckCount: Math.round(std.capacityMt / 25),
        iotTrackingId: `IOT-${code}`,
      };
    });

    setBargePool((prevPool) => {
      const existingIds = new Set(prevPool.map((b) => b.id));
      const toAdd = standardBarges.filter((b) => !existingIds.has(b.id));
      return [...prevPool, ...toAdd];
    });

    const newBargeIds = standardBarges.map((b) => b.id);
    setBargeIds(newBargeIds);

    setBargeDailyRates((prev) => {
      const updated = { ...prev };
      newBargeIds.forEach((id) => {
        updated[id] = std.dailyRateUsd;
      });
      return updated;
    });

    if (typeof window !== 'undefined') {
      (window as any).activeBargeStandard = standardKey;
      (window as any).activeBargeStandardData = std;
      window.dispatchEvent(new CustomEvent('rivercharter:standard-applied', {
        detail: {
          standard: standardKey,
          bargeCount: std.defaultBargeCount,
          capacityPerBarge: std.capacityMt,
          totalCapacity: std.capacityMt * std.defaultBargeCount,
          dynamicDraft: std.dynamicDraftMeters,
          dimensions: std.dimensions,
        }
      }));
      if (typeof (window as any).updateFluvialCalculations === 'function') {
        setTimeout(() => (window as any).updateFluvialCalculations(), 10);
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).applyFluvialBargeStandard = handleApplyBargeStandard;
      const handleExternalStandard = (e: any) => {
        const std = e.detail?.standard;
        if (std === 'mississippi_jumbo' || std === 'latam_super_jumbo') {
          handleApplyBargeStandard(std);
        }
      };
      window.addEventListener('rivercharter:set-standard', handleExternalStandard);
      return () => {
        window.removeEventListener('rivercharter:set-standard', handleExternalStandard);
      };
    }
  }, []);

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

  // Métricas de calado e hidrometría
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

  const isRoro = operationType === 'RORO';

  // Metros lineales y camiones totales
  const totalLinearMeters = useMemo(() => {
    return coupledBarges.reduce((sum, b) => sum + (Number(b.linearMeters) || Math.round(Number(b.capacity) * 0.44)), 0);
  }, [coupledBarges]);

  const totalTruckCount = useMemo(() => {
    return coupledBarges.reduce((sum, b) => sum + (Number(b.truckCount) || Math.round(Number(b.capacity) / 25)), 0);
  }, [coupledBarges]);

  // Si Ro-Ro está activo, el calado no depende del peso muerto
  // Si bancos de arena activos, se reduce el margen de calado admisible (-0.40m)
  const effectiveWaterLevel = risSandbarsActive ? Math.max(0.5, Number(minWaterLevel) - 0.4) : Number(minWaterLevel);
  const isDraftSafe = isRoro ? true : (maxDynamicDraft <= effectiveWaterLevel);
  const groundingRiskState: 'SAFE' | 'WARNING' | 'CRITICAL' = isRoro
    ? 'SAFE'
    : (maxDynamicDraft > effectiveWaterLevel
        ? 'CRITICAL'
        : (risSandbarsActive || maxDynamicDraft >= (effectiveWaterLevel - 0.2) ? 'WARNING' : 'SAFE'));

  // --------------------------------------------------------------------------
  // 2. ESTRUCTURA DE COSTES: OPEX DEL REMOLCADOR & CAPEX DE BARCAZAS
  // --------------------------------------------------------------------------
  // Sub-campos de OPEX del remolcador (tripulación, seguros, mantenimiento, otros)
  const baseTugDailyOpex = selectedTugboat?.dailyOpex || 3400;
  const [crewDaily, setCrewDaily] = useState<number>(() => Math.round(baseTugDailyOpex * 0.45));
  const [insuranceDaily, setInsuranceDaily] = useState<number>(() => Math.round(baseTugDailyOpex * 0.25));
  const [maintenanceDaily, setMaintenanceDaily] = useState<number>(() => Math.round(baseTugDailyOpex * 0.20));
  const [otherDaily, setOtherDaily] = useState<number>(() => Math.round(baseTugDailyOpex * 0.10));

  // Al cambiar de remolcador, re-proporcionar los campos de OPEX
  useEffect(() => {
    if (selectedTugboat?.dailyOpex) {
      const opex = selectedTugboat.dailyOpex;
      setCrewDaily(Math.round(opex * 0.45));
      setInsuranceDaily(Math.round(opex * 0.25));
      setMaintenanceDaily(Math.round(opex * 0.20));
      setOtherDaily(Math.round(opex * 0.10));
    }
  }, [selectedTugboat?.id]);

  const calculatedDailyOpex = useMemo(() => {
    return Math.max(0, Number(crewDaily) + Number(insuranceDaily) + Number(maintenanceDaily) + Number(otherDaily));
  }, [crewDaily, insuranceDaily, maintenanceDaily, otherDaily]);

  // CAPEX o costo de alquiler/amortización diario por cada barcaza acoplada
  const [bargeDailyRates, setBargeDailyRates] = useState<Record<number, number>>({
    101: 250,
    102: 250,
    103: 320,
    104: 220,
    105: 300,
    106: 250,
  });

  const handleBargeRateChange = (bargeId: number, rate: number) => {
    setBargeDailyRates((prev) => ({
      ...prev,
      [bargeId]: Math.max(0, rate),
    }));
  };

  // --------------------------------------------------------------------------
  // 3. MÓDULO DE COMBUSTIBLE FLUVIAL (BUNKERS EXCLUSIVO REMOLCADOR)
  // --------------------------------------------------------------------------
  const [fuelPricePerTon, setFuelPricePerTon] = useState<number>(680);
  const [sailingFuelTonsPerDay, setSailingFuelTonsPerDay] = useState<number>(() => {
    const hp = selectedTugboat?.enginePowerHp || 4000;
    return Number(((hp * 0.75 * 185 * 24) / 1_000_000).toFixed(2)) || 4.2;
  });
  const [idleFuelTonsPerDay, setIdleFuelTonsPerDay] = useState<number>(0.8); // Consumo ralentí en esclusas/aduanas

  useEffect(() => {
    if (selectedTugboat?.enginePowerHp) {
      const hp = selectedTugboat.enginePowerHp;
      const cons = Number(((hp * 0.75 * 185 * 24) / 1_000_000).toFixed(2));
      setSailingFuelTonsPerDay(cons > 0 ? cons : 4.2);
    }
  }, [selectedTugboat?.id]);

  // --------------------------------------------------------------------------
  // 4. GASTOS PORTUARIOS Y DE CANAL (PDAs FLUVIALES)
  // --------------------------------------------------------------------------
  const [loadPortTariff, setLoadPortTariff] = useState<number>(2400); // Tarifa puerto carga
  const [dischargePortTariff, setDischargePortTariff] = useState<number>(2200); // Tarifa puerto descarga
  const [waterwayTolls, setWaterwayTolls] = useState<number>(3500); // Peajes de hidrovía
  const [lockDues, setLockDues] = useState<number>(1800); // Derechos de esclusas
  const [riverPilotage, setRiverPilotage] = useState<number>(1400); // Practicaje fluvial
  const [crossBorderTariffs, setCrossBorderTariffs] = useState<number>(1600); // Aranceles transfronterizos

  const fluvialPdaExpenses: FluvialPdaExpenses = useMemo(() => ({
    loadPortTariff,
    dischargePortTariff,
    waterwayTolls,
    lockDues,
    riverPilotage,
    crossBorderTariffs,
  }), [loadPortTariff, dischargePortTariff, waterwayTolls, lockDues, riverPilotage, crossBorderTariffs]);

  const pdaBreakdown = useMemo(() => {
    return calculateFluvialPda(fluvialPdaExpenses);
  }, [fluvialPdaExpenses]);

  // --------------------------------------------------------------------------
  // 5. GESTIÓN DE TIEMPOS Y DEMORAS
  // --------------------------------------------------------------------------
  const [navigationDays, setNavigationDays] = useState<number>(7);
  const [lockWaitDays, setLockWaitDays] = useState<number>(1.5); // Tiempos de espera en esclusas
  const [customsDelayDays, setCustomsDelayDays] = useState<number>(1.0); // Demoras aduaneras

  // Días extra totales por demoras
  const totalDelayDays = useMemo(() => {
    return Number((Number(lockWaitDays) + Number(customsDelayDays)).toFixed(2));
  }, [lockWaitDays, customsDelayDays]);

  // Días de operación totales
  const totalOperationalDays = useMemo(() => {
    return Number((Number(navigationDays) + totalDelayDays).toFixed(2));
  }, [navigationDays, totalDelayDays]);

  // --------------------------------------------------------------------------
  // PARÁMETROS COMERCIALES (FLETE PARA VISTA EJECUTIVA)
  // --------------------------------------------------------------------------
  const [freightRatePerTon, setFreightRatePerTon] = useState<number>(28.5);

  // Feedback y estado de guardado
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // --------------------------------------------------------------------------
  // CÁLCULO FINANCIERO INTEGRADO (ESTIMACIÓN GLOBAL)
  // --------------------------------------------------------------------------
  const decoupledEstimate: FluvialEstimateResult | null = useMemo(() => {
    if (!selectedTugboat) return null;

    const bargesInput = coupledBarges.map((b) => ({
      id: b.id,
      name: b.name,
      bargeType: b.bargeType,
      capacity: Number(b.capacity) || 1500,
      dynamicDraft: Number(b.dynamicDraft) || 2.7,
      couplingDays: totalOperationalDays,
      dailyRate: bargeDailyRates[b.id] ?? calculateDefaultBargeRate(b.bargeType, b.capacity),
    }));

    return estimateFluvialVoyage({
      tugboat: {
        id: selectedTugboat.id,
        name: selectedTugboat.name,
        motor: selectedTugboat.motor,
        dailyOpex: calculatedDailyOpex,
        enginePowerHp: selectedTugboat.enginePowerHp,
      },
      navigationDays: Number(navigationDays) || 1,
      sailingFuelTonsPerDay: Number(sailingFuelTonsPerDay) || 0,
      idleFuelTonsPerDay: Number(idleFuelTonsPerDay) || 0,
      fuelPricePerTon: Number(fuelPricePerTon) || 680,
      barges: bargesInput,
      defaultCouplingDays: totalOperationalDays,
      lockWaitDays: Number(lockWaitDays) || 0,
      customsDelayDays: Number(customsDelayDays) || 0,
      pda: fluvialPdaExpenses,
      freightRatePerTon: Number(freightRatePerTon) || 0,
      totalCargoTons: isRoro ? (totalTruckCount * 25) : totalCapacityMt,
      operationType,
      totalLinearMeters,
      totalTruckCount,
      directTransshipmentTariff: Number(directTransshipmentTariff) || 0,
      estimatedLandSavings: Number(estimatedLandSavings) || 0,
      risAlerts: {
        sandbarsActive: risSandbarsActive,
        strongCurrents: risStrongCurrentsActive,
      },
      minWaterLevel: effectiveWaterLevel,
    });
  }, [
    selectedTugboat,
    calculatedDailyOpex,
    navigationDays,
    sailingFuelTonsPerDay,
    idleFuelTonsPerDay,
    fuelPricePerTon,
    coupledBarges,
    totalOperationalDays,
    bargeDailyRates,
    lockWaitDays,
    customsDelayDays,
    fluvialPdaExpenses,
    freightRatePerTon,
    totalCapacityMt,
    operationType,
    totalLinearMeters,
    totalTruckCount,
    directTransshipmentTariff,
    estimatedLandSavings,
    risSandbarsActive,
    risStrongCurrentsActive,
    effectiveWaterLevel,
    isRoro,
  ]);

  // Sincronización continua hacia componentes o scripts externos
  useEffect(() => {
    const stdName = (typeof window !== 'undefined' && (window as any).activeBargeStandardData?.name) || (standardKey === 'mississippi_jumbo' ? 'Misisipi Jumbo' : 'Súper Jumbo');
    const convoyDesc = isRoro
      ? `Convoy Ro-Ro (${totalTruckCount} Camiones)`
      : `${stdName} - ${bargeIds.length} Barcazas`;

    if (typeof window !== 'undefined') {
      (window as any).activeBargeCount = bargeIds.length;
    }

    onConvoyChange?.({
      tugboatId,
      tugboatName: selectedTugboat?.name || 'Remolcador Guaraní F / Convoy',
      bargeIds,
      bargeCount: bargeIds.length,
      convoyDescription: convoyDesc,
      totalCapacityMt: isRoro ? (totalTruckCount * 25) : totalCapacityMt,
      maxDynamicDraftMeters: maxDynamicDraft,
      min_water_level: effectiveWaterLevel,
      minWaterLevelMeters: effectiveWaterLevel,
      operationType,
      totalLinearMeters,
      totalTruckCount,
      risSandbarsActive,
      risStrongCurrentsActive,
      directTransshipmentTariff,
      estimatedLandSavings,
      sustainabilityText: decoupledEstimate?.sustainability?.formattedMetric,
      estimate: decoupledEstimate,
    } as any);
  }, [
    tugboatId,
    selectedTugboat,
    bargeIds,
    standardKey,
    effectiveWaterLevel,
    totalCapacityMt,
    maxDynamicDraft,
    operationType,
    totalLinearMeters,
    totalTruckCount,
    risSandbarsActive,
    risStrongCurrentsActive,
    directTransshipmentTariff,
    estimatedLandSavings,
    decoupledEstimate,
    onConvoyChange,
    isRoro,
  ]);

  // --------------------------------------------------------------------------
  // MANEJADORES DE BARCAZAS
  // --------------------------------------------------------------------------
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
    const isCustomRoro = isRoro || newBargeType === 'RORO_BARGE';
    const parsedTrucks = Number(newBargeTruckCount) || 40;
    const parsedLinear = Number(newBargeLinearMeters) || 660;
    const created: Barge = {
      id: newId,
      name: newBargeName.trim(),
      bargeNumber: `B-NEW-${newId.toString().slice(-4)}`,
      bargeType: newBargeType,
      capacity: isCustomRoro ? (parsedTrucks * 25) : (Number(newBargeCapacity) || 1500),
      dynamicDraft: isCustomRoro ? 2.2 : (Number(newBargeDraft) || 2.8),
      linearMeters: parsedLinear,
      truckCount: parsedTrucks,
      operationType: isCustomRoro ? 'RORO' : 'BULK',
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

  // --------------------------------------------------------------------------
  // GUARDAR VIAJE FLUVIAL CON BLOQUEO DE CALADO DINÁMICO
  // --------------------------------------------------------------------------
  const handleSaveVoyage = async () => {
    if (!tugboatId) {
      setFeedback({
        type: 'error',
        message: 'Debes asignar un Remolcador (Tugboat) antes de guardar el viaje.',
      });
      return;
    }

    // Validador de Calado Dinámico (Draft Constraint):
    // Bloquea el guardado si el calado dinámico de la barcaza más pesada supera min_water_level
    if (!isDraftSafe || maxDynamicDraft > Number(minWaterLevel)) {
      setFeedback({
        type: 'error',
        message: `Restricción Crítica de Calado Dinámico (Draft Constraint): El calado dinámico (${maxDynamicDraft.toFixed(2)} m) de la barcaza más pesada (${heaviestBarge?.name || 'Convoy'}) supera el nivel mínimo de estiaje disponible (${Number(minWaterLevel).toFixed(2)} m) en ${riverName}. Guardado bloqueado por riesgo inminente de varadura.`,
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

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
        tugboatDailyOpex: calculatedDailyOpex,
        bargeCount: bargeIds.length,
        barges: coupledBarges,
        financialEstimate: decoupledEstimate,
        delays: {
          navigationDays,
          lockWaitDays,
          customsDelayDays,
          totalDelayDays,
          totalOperationalDays,
        },
        pda: pdaBreakdown,
      },
    };

    try {
      try {
        localStorage.setItem(LOCAL_STORAGE_CONVOY_KEY, JSON.stringify(payload));
      } catch (_) {}

      if (typeof onSave === 'function') {
        await onSave(payload);
      } else {
        const endpoint = getApiUrl('/api/v1/river-voyages');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            barges: coupledBarges,
            max_dynamic_draft: maxDynamicDraft,
            waiting_hours: totalDelayDays * 24,
            demurrage_cost: decoupledEstimate?.demurrageCost?.totalDemurrageCost || 0,
          }),
        });

        const resData = await res.json().catch(() => ({}));
        if (!res.ok || resData.success === false) {
          throw new Error(resData.error || resData.message || 'Error bloqueante al guardar el viaje fluvial en el servidor');
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('rivercharter:convoy-saved', {
            detail: {
              ...payload,
              tugboat: selectedTugboat,
              barges: coupledBarges,
              financialEstimate: decoupledEstimate,
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

  // ==========================================================================
  // RENDERIZADO: MODO TÉCNICO & VISTA EJECUTIVA
  // ==========================================================================
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 md:p-6 text-slate-800 font-sans max-w-6xl mx-auto space-y-6">
      
      {/* -------------------------------------------------------------------- */}
      {/* HEADER DE CONTROL: TÍTULO Y SELECTOR DE VISTA                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-wide uppercase">
                {activeMode === 'tech' ? 'Modo Técnico Fluvial' : 'Vista Ejecutiva Fluvial'}
              </h2>
              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold uppercase">
                RiverCharter Logistics
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeMode === 'tech'
                ? 'Calculadora técnica de convoy: motor, barcazas, OPEX/CAPEX, bunkers y demoras'
                : 'Dashboard consolidado de solo lectura: beneficio neto, costo por tonelada y TCE diario'}
            </p>
          </div>
        </div>

        {/* SELECTOR DE MODO: TÉCNICO VS VISTA EJECUTIVA */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 inline-flex items-center shadow-inner">
            <button
              type="button"
              id="convoy-btn-mode-tech"
              onClick={() => handleSwitchMode('tech')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeMode === 'tech'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>⚙️</span> Modo Técnico
            </button>
            <button
              type="button"
              id="convoy-btn-mode-exec"
              onClick={() => handleSwitchMode('exec')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                activeMode === 'exec'
                  ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>💼</span> Vista Ejecutiva
            </button>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* ALERTA CRÍTICA: RESTRICCIÓN DE CALADO DINÁMICO (DRAFT CONSTRAINT)     */}
      {/* -------------------------------------------------------------------- */}
      {!isDraftSafe && (
        <div
          role="alert"
          id="draft-constraint-critical-alert"
          className="p-4 rounded-xl border-2 border-red-500 bg-red-50 text-red-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse"
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-red-100 border border-red-200 rounded-lg text-red-600 text-2xl shrink-0">
              🚨
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-black text-red-800 text-xs sm:text-sm uppercase tracking-wider">
                  ALERTA CRÍTICA: Restricción de Calado Dinámico (Draft Constraint)
                </h4>
                <span className="bg-red-600 text-slate-900 text-[10px] font-black px-2 py-0.5 rounded font-mono uppercase">
                  Despacho Fluvial Bloqueado
                </span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                El calado dinámico de la barcaza más pesada (
                <strong className="text-slate-900 underline">{heaviestBarge?.name || 'Barcaza'}</strong>
                : <strong className="text-rose-300 font-mono">{maxDynamicDraft.toFixed(2)} m</strong>)
                supera el nivel de estiaje disponible (
                <strong className="text-rose-300 font-mono">{Number(minWaterLevel).toFixed(2)} m</strong>)
                en la ruta <strong className="text-slate-900">{riverName}</strong>.
                Exceso de calado crítico: <strong className="font-mono text-slate-900">+{(maxDynamicDraft - Number(minWaterLevel)).toFixed(2)} m</strong>.
                Riesgo inminente de varadura en pasos críticos o fondos rocosos.
              </p>
            </div>
          </div>
          <div className="shrink-0 self-end sm:self-center">
            <span className="px-3 py-1.5 bg-rose-900 border border-rose-500/80 rounded-lg text-xs font-black text-slate-900 uppercase tracking-wider shadow-md inline-block">
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
              ? 'bg-emerald-950/40 border-emerald-200 bg-emerald-50/70 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : 'bg-blue-50/40 border-blue-200 text-blue-700'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-600 hover:text-slate-900 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VISTA 1: MODO TÉCNICO INTERACTIVO                                     */}
      {/* ==================================================================== */}
      {activeMode === 'tech' && (
        <div className="space-y-6">
          
          {/* ------------------------------------------------------------------ */}
          {/* 1. ENSAMBLADOR DE CONVOY: TUGBOAT + ARREGLO DINÁMICO DE BARGES    */}
          {/* ------------------------------------------------------------------ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* SELECCIÓN DE REMOLCADOR (MOTOR) */}
            <section className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚙️</span>
                  <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider font-bold">
                    1. Remolcador / Empujador (Motor)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-500 uppercase">Unidad Propulsora</span>
              </div>

              <div>
                <label htmlFor="convoy-tugboat-select" className="block text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Selector Principal de Remolcador (Tugboat) *
                </label>
                <select
                  id="convoy-tugboat-select"
                  value={tugboatId ?? ''}
                  onChange={(e) => setTugboatId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-cyan-500/30"
                >
                  <option value="">— Seleccionar Remolcador —</option>
                  {availableTugboats.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.motor} ({t.enginePowerHp} HP)
                    </option>
                  ))}
                </select>
              </div>

              {selectedTugboat ? (
                <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2.5 shadow-sm text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
                      {selectedTugboat.name}
                    </div>
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-mono font-bold">
                      ID: #{selectedTugboat.id}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-800">
                    <span className="text-slate-500">Motor y Propulsión:</span>
                    <span className="font-mono font-bold text-blue-700 text-right max-w-[200px] truncate" title={selectedTugboat.motor}>
                      {selectedTugboat.motor}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span className="text-slate-500">Potencia de Empuje:</span>
                    <span className="font-mono font-bold text-slate-900">{selectedTugboat.enginePowerHp?.toLocaleString()} BHP</span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span className="text-slate-500">MMSI AIS:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedTugboat.mmsi || 'N/D'}</span>
                  </div>
                  <div className="flex justify-between text-slate-800">
                    <span className="text-slate-500">Tiro a Punto Fijo:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedTugboat.bollardPullTons || 45} Tons</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  Selecciona un remolcador de la flota para propulsar el convoy.
                </div>
              )}

              {/* RUTA Y NIVEL DE ESTIAJE */}
              <div className="pt-2 border-t border-slate-200 space-y-3 text-xs">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Itinerario e Hidrometría Fluvial
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="origin-terminal-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">POL (Origen)</label>
                    <input
                      id="origin-terminal-input"
                      type="text"
                      value={originTerminal}
                      onChange={(e) => setOriginTerminal(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 truncate focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="destination-terminal-input" className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">POD (Destino)</label>
                    <input
                      id="destination-terminal-input"
                      type="text"
                      value={destinationTerminal}
                      onChange={(e) => setDestinationTerminal(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 truncate focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="min-water-level-input" className="block text-[10px] font-bold text-cyan-400 uppercase mb-1 flex items-center justify-between">
                    <span>Nivel Mínimo de Estiaje / Water Level (min_water_level)</span>
                    <span className="text-slate-500 font-mono text-[9px]">Restricción Hidrográfica</span>
                  </label>
                  <div className="relative">
                    <input
                      id="min-water-level-input"
                      type="number"
                      step="0.05"
                      min="0.5"
                      value={minWaterLevel}
                      onChange={(e) => setMinWaterLevel(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-blue-400"
                    />
                    <span className="absolute right-3 top-2 text-xs font-mono text-slate-500">metros</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Bloquea el despacho del convoy si alguna barcaza supera este calado disponible.
                  </p>
                </div>

                {/* PANEL VISUAL RIS (SERVICIOS DE INFORMACIÓN FLUVIAL) */}
                <div className="mt-3 bg-white border border-sky-200 rounded-lg p-3 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-[11px] font-bold text-sky-900 uppercase flex items-center gap-1.5">
                      <i className="fa-solid fa-satellite-dish text-sky-600"></i>
                      Servicios de Información Fluvial (RIS)
                    </span>
                    <span className="text-[9px] font-mono bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded font-bold uppercase">
                      Telemetría en Vivo
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-800 hover:text-slate-900">
                      <input
                        type="checkbox"
                        id="convoy-ris-sandbars"
                        checked={risSandbarsActive}
                        onChange={(e) => setRisSandbarsActive(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <span className="font-semibold block text-[11px] text-slate-900">Bancos de arena activos</span>
                        <span className="text-[10px] text-slate-500 block leading-tight">
                          Simula restricción de paso crítico (-0.40m estiaje). Ajusta riesgo de varadura.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-800 hover:text-slate-900">
                      <input
                        type="checkbox"
                        id="convoy-ris-currents"
                        checked={risStrongCurrentsActive}
                        onChange={(e) => setRisStrongCurrentsActive(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <span className="font-semibold block text-[11px] text-slate-900">Corrientes fuertes</span>
                        <span className="text-[10px] text-slate-500 block leading-tight">
                          Resistencia hidrodinámica: ajusta consumo de combustible (+25%) y empuje.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Indicador reactivo de riesgo de varadura y consumo */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-600">Riesgo de Varadura:</span>
                    <span className={`font-bold px-1.5 py-0.5 rounded ${
                      groundingRiskState === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : groundingRiskState === 'WARNING'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      {groundingRiskState === 'CRITICAL' ? '⚠️ CRÍTICO' : groundingRiskState === 'WARNING' ? '⚡ ELEVADO' : '✓ SEGURO'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* ARREGLO DINÁMICO DE BARCAZAS (CARGA) */}
            <section className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚢</span>
                    <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider font-bold">
                      2. Arreglo Dinámico de Barcazas (Carga)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-blue-700 font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    {coupledBarges.length} Barcazas Acopladas ({isRoro ? `${totalLinearMeters} m lin · ${totalTruckCount} camiones` : `${totalCapacityMt.toLocaleString()} MT`})
                  </span>
                </div>

                {/* SELECTOR DE TIPO DE OPERACIÓN: GRANEL VS RO-RO */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Tipo de Operación Fluvial
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      {isRoro ? '🚗 Ro-Ro / Carretera Flotante' : '📦 Carga a Granel (Toneladas Métricas)'}
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                    <button
                      type="button"
                      id="btn-op-bulk"
                      onClick={() => handleSwitchOperationType('BULK')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        !isRoro
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Carga a Granel (TM)
                    </button>
                    <button
                      type="button"
                      id="btn-op-roro"
                      onClick={() => handleSwitchOperationType('RORO')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        isRoro
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Ro-Ro / Carretera Flotante
                    </button>
                  </div>
                </div>

                {/* TOGGLE RÁPIDO ESTÁNDAR DATABRIDGE FLUVIAL */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Estándar de Convoy (DataBridge)
                      </span>
                      <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                        Importación Automática
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-900 block mt-0.5">
                      {activeBargeStandard === 'mississippi_jumbo'
                        ? 'Estándar Misisipi (Jumbo) · 1,500 TM/barcaza · 59.4m × 10.7m · Calado 2.74m'
                        : activeBargeStandard === 'latam_super_jumbo'
                        ? 'Estándar LatAm (Súper Jumbo) · 2,500 TM/barcaza · 61.0m × 16.5m · Calado 3.20m'
                        : 'Importar capacidades y dimensiones estándar desde DataBridge'}
                    </span>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 shrink-0">
                    <button
                      type="button"
                      id="btn-toggle-standard-mississippi"
                      onClick={() => handleApplyBargeStandard('mississippi_jumbo')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        activeBargeStandard === 'mississippi_jumbo'
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Estándar Misisipi (Jumbo)
                    </button>
                    <button
                      type="button"
                      id="btn-toggle-standard-latam"
                      onClick={() => handleApplyBargeStandard('latam_super_jumbo')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        activeBargeStandard === 'latam_super_jumbo'
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Estándar LatAm (Súper Jumbo)
                    </button>
                  </div>
                </div>

                {/* CONTROLES PARA ACOPLAR BARCAZAS */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1">
                    <select
                      id="barge-pool-select"
                      value={selectedBargeToAdd}
                      onChange={(e) => setSelectedBargeToAdd(e.target.value ? Number(e.target.value) : '')}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-400"
                    >
                      <option value="">— Seleccionar barcaza disponible en puerto —</option>
                      {uncoupledBarges.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} [{b.bargeType}] {isRoro ? `· ${b.linearMeters || Math.round(b.capacity * 0.44)} m lin · ${b.truckCount || Math.round(b.capacity / 25)} camiones` : `· ${b.capacity} MT · Calado ${b.dynamicDraft}m`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    id="btn-add-barge"
                    onClick={() => handleAddBarge()}
                    disabled={!selectedBargeToAdd}
                    className="bg-blue-600 hover:bg-cyan-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 py-2 rounded transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span>+ Acoplar Barcaza</span>
                  </button>

                  <button
                    type="button"
                    id="btn-new-custom-barge"
                    onClick={() => setShowNewBargeModal((prev) => !prev)}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold px-3 py-2 rounded transition flex items-center justify-center gap-1 shrink-0"
                  >
                    <span>+ Nueva Barcaza</span>
                  </button>
                </div>

                {/* FORMULARIO PARA CREAR NUEVA BARCAZA */}
                {showNewBargeModal && (
                  <form onSubmit={handleCreateCustomBarge} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                    <div className="text-xs font-bold text-blue-700 uppercase flex justify-between items-center">
                      <span>Registrar Nueva Barcaza en Flota ({isRoro ? 'Modalidad Ro-Ro' : 'Modalidad Granel'})</span>
                      <button type="button" onClick={() => setShowNewBargeModal(false)} className="text-slate-500 hover:text-slate-900">✕</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-600 mb-0.5">Nombre / Matrícula</label>
                        <input
                          type="text"
                          value={newBargeName}
                          onChange={(e) => setNewBargeName(e.target.value)}
                          placeholder={isRoro ? "Ej. Barcaza Ro-Ro R-900" : "Ej. Barcaza Tolva T-900"}
                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-600 mb-0.5">Tipo</label>
                        <select
                          value={newBargeType}
                          onChange={(e) => setNewBargeType(e.target.value as BargeType)}
                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs"
                        >
                          {isRoro ? (
                            <>
                              <option value="RORO_BARGE">Ro-Ro Carretera Flotante</option>
                              <option value="DECK">Cubierta Plana (Deck)</option>
                            </>
                          ) : (
                            <>
                              <option value="HOPPER">Tolva (Hopper)</option>
                              <option value="TANKER">Tanque Líquidos</option>
                              <option value="DECK">Cubierta Plana</option>
                              <option value="CONTAINER_BARGE">Portacontenedor</option>
                              <option value="BOX">Caja Cerrada</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* En modo Ro-Ro: Metros Lineales y Cantidad de Semirremolques/Camiones */}
                      {isRoro ? (
                        <>
                          <div>
                            <label className="block text-[10px] text-slate-600 mb-0.5">Metros Lineales (m)</label>
                            <input
                              type="number"
                              value={newBargeLinearMeters}
                              onChange={(e) => setNewBargeLinearMeters(e.target.value)}
                              placeholder="Ej. 800"
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs font-mono"
                              required
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] text-slate-600 mb-0.5">Semirremolques / Camiones</label>
                            <input
                              type="number"
                              value={newBargeTruckCount}
                              onChange={(e) => setNewBargeTruckCount(e.target.value)}
                              placeholder="Ej. 48"
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs font-mono"
                              required
                            />
                          </div>
                        </>
                      ) : (
                        /* En modo Granel: Capacidad MT y Calado por peso muerto */
                        <>
                          <div>
                            <label className="block text-[10px] text-slate-600 mb-0.5">Capacidad (MT)</label>
                            <input
                              type="number"
                              value={newBargeCapacity}
                              onChange={(e) => setNewBargeCapacity(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-600 mb-0.5">Calado por peso muerto (m)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={newBargeDraft}
                              onChange={(e) => setNewBargeDraft(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs font-mono"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowNewBargeModal(false)}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-blue-600 hover:bg-cyan-500 text-white rounded text-xs font-bold"
                      >
                        Crear y Acoplar
                      </button>
                    </div>
                  </form>
                )}

                {/* LISTA DINÁMICA DE BARCAZAS ACOPLADAS */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {coupledBarges.length === 0 ? (
                    <div className="p-6 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500">
                      No hay barcazas acopladas al remolcador. Selecciona unidades de carga arriba.
                    </div>
                  ) : (
                    coupledBarges.map((barge, index) => {
                      const bargeLinear = barge.linearMeters || Math.round((Number(barge.capacity) || 1500) * 0.44);
                      const bargeTrucks = barge.truckCount || Math.round((Number(barge.capacity) || 1500) / 25);
                      return (
                        <div
                          key={barge.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-white border border-slate-300 hover:border-slate-200 rounded-lg transition"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">{barge.name}</span>
                                <span className="text-[9px] bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
                                  {isRoro ? 'Ro-Ro Fluvial' : barge.bargeType}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600 flex items-center gap-3 mt-0.5">
                                {isRoro ? (
                                  <>
                                    <span>Metros Lineales: <b className="text-blue-700">{bargeLinear} m</b></span>
                                    <span>Capacidad: <b className="text-emerald-700">{bargeTrucks} Camiones / Semirremolques</b></span>
                                  </>
                                ) : (
                                  <>
                                    <span>Capacidad: <b>{Number(barge.capacity).toLocaleString()} MT</b></span>
                                    <span>Calado Dinámico: <b className={Number(barge.dynamicDraft) > effectiveWaterLevel ? 'text-rose-500 font-bold' : 'text-blue-700'}>{Number(barge.dynamicDraft).toFixed(2)} m</b></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveBarge(barge.id)}
                            className="self-end sm:self-center text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-300 px-2.5 py-1 rounded text-xs transition flex items-center gap-1.5"
                            title="Desacoplar barcaza del viaje"
                          >
                            <span>✕ Desacoplar</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* BARRA DE RESUMEN HIDROMÉTRICO Y BOTÓN GUARDAR */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">
                      {isRoro ? 'Capacidad Ro-Ro' : 'Capacidad Convoy'}
                    </span>
                    <span className="font-mono font-bold text-emerald-700">
                      {isRoro ? `${totalLinearMeters} m (${totalTruckCount} camiones)` : `${totalCapacityMt.toLocaleString()} MT`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">
                      {isRoro ? 'Calado Operativo' : 'Calado Máx'}
                    </span>
                    <span className="font-mono font-bold text-blue-700">
                      {isRoro ? '2.20 m (Deck Ligero)' : `${maxDynamicDraft.toFixed(2)} m`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Estiaje Mínimo</span>
                    <span className="font-mono font-bold text-slate-900">
                      {effectiveWaterLevel.toFixed(2)} m {risSandbarsActive && <span className="text-[9px] text-amber-600 font-normal">(-0.4m RIS)</span>}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-save-river-voyage"
                  onClick={handleSaveVoyage}
                  disabled={isSaving || !tugboatId || !isDraftSafe}
                  className={`w-full text-slate-900 text-xs font-black uppercase tracking-wider py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                    !isDraftSafe
                      ? 'bg-rose-950/80 border-2 border-rose-500 text-rose-200 cursor-not-allowed shadow-rose-950/40'
                      : 'bg-blue-600 hover:bg-cyan-500 disabled:bg-slate-200 disabled:text-slate-400 shadow-sm'
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

          {/* ------------------------------------------------------------------ */}
          {/* 2. ESTRUCTURA DE COSTES (OPEX Y CAPEX DESACOPLADOS)                */}
          {/* ------------------------------------------------------------------ */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">💵</span>
                <h3 className="text-xs md:text-sm font-bold text-emerald-700 uppercase tracking-wider">
                  Estructura de Costes: OPEX del Remolcador y CAPEX de Barcazas
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold uppercase">
                Finanzas Desacopladas
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* OPEX DEL REMOLCADOR (TRIPULACIÓN, SEGUROS, MANTENIMIENTO) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-blue-700 uppercase">
                    OPEX Operativo del Remolcador ({selectedTugboat?.name || 'Tugboat'})
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-700">
                    Total: ${calculatedDailyOpex.toLocaleString()} / día
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-1">Tripulación ($/día)</label>
                    <input
                      type="number"
                      value={crewDaily}
                      onChange={(e) => setCrewDaily(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-1">Seguros Marítimos ($/día)</label>
                    <input
                      type="number"
                      value={insuranceDaily}
                      onChange={(e) => setInsuranceDaily(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-1">Mantenimiento ($/día)</label>
                    <input
                      type="number"
                      value={maintenanceDaily}
                      onChange={(e) => setMaintenanceDaily(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 mb-1">Otros Insumos ($/día)</label>
                    <input
                      type="number"
                      value={otherDaily}
                      onChange={(e) => setOtherDaily(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 italic">
                  Costo fijo del remolcador: aplica durante los {navigationDays} días de navegación más los {totalDelayDays} días de demora.
                </p>
              </div>

              {/* CAPEX O COSTO DE ALQUILER / AMORTIZACIÓN POR BARCAZA */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-emerald-300 uppercase">
                    CAPEX / Alquiler Diario por Barcaza Acoplada
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-700">
                    Total Carga: ${decoupledEstimate?.cargoCost?.totalCargoCost?.toLocaleString() ?? 0} USD
                  </span>
                </div>

                <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1 text-xs">
                  {coupledBarges.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No hay barcazas acopladas para calcular CAPEX.</p>
                  ) : (
                    coupledBarges.map((barge) => {
                      const currentRate = bargeDailyRates[barge.id] ?? calculateDefaultBargeRate(barge.bargeType, barge.capacity);
                      return (
                        <div key={barge.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200">
                          <div className="truncate flex-1">
                            <span className="font-semibold text-slate-900 block truncate">{barge.name}</span>
                            <span className="text-[10px] text-slate-600 font-mono">{barge.capacity} MT · {barge.bargeType}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-mono">$</span>
                            <input
                              type="number"
                              value={currentRate}
                              onChange={(e) => handleBargeRateChange(barge.id, Number(e.target.value))}
                              className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 font-mono text-right"
                            />
                            <span className="text-[10px] text-slate-600 font-mono">/d</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[10px] text-slate-500 italic">
                  Costo de capital o chartering de barcazas por {totalOperationalDays} días de operación acoplada.
                </p>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* 3. MÓDULO DE COMBUSTIBLE FLUVIAL (BUNKERS DEL REMOLCADOR)           */}
          {/* ------------------------------------------------------------------ */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⛽</span>
                <h3 className="text-xs md:text-sm font-bold text-amber-400 uppercase tracking-wider">
                  Módulo de Combustible Fluvial (Bunkers Exclusivo Remolcador)
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold uppercase">
                Consumo Motor
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                <label className="block text-[10px] font-bold text-slate-600 uppercase">Precio Combustible Fluvial ($/MT)</label>
                <input
                  type="number"
                  value={fuelPricePerTon}
                  onChange={(e) => setFuelPricePerTon(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-500">MGO / Gasoil Fluvial Estándar</span>
              </div>

              <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-1 shadow-sm">
                <label className="block text-[10px] font-bold text-blue-700 uppercase">Consumo Navegando (MT/día)</label>
                <input
                  type="number"
                  step="0.1"
                  value={sailingFuelTonsPerDay}
                  onChange={(e) => setSailingFuelTonsPerDay(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-600">Empujando convoy a régimen crucero ({navigationDays} días)</span>
              </div>

              <div className="bg-white border border-amber-300 rounded-lg p-3 space-y-1 shadow-sm">
                <label className="block text-[10px] font-bold text-amber-300 uppercase">Consumo en Ralentí / Espera (MT/día)</label>
                <input
                  type="number"
                  step="0.05"
                  value={idleFuelTonsPerDay}
                  onChange={(e) => setIdleFuelTonsPerDay(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-600">Modo espera en esclusas y aduanas ({totalDelayDays} días)</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-600 block uppercase">Combustible en Navegación</span>
                <span className="font-mono font-bold text-blue-700">
                  ${(navigationDays * sailingFuelTonsPerDay * fuelPricePerTon).toLocaleString()} USD
                </span>
                <span className="text-[10px] text-slate-500 block">({(navigationDays * sailingFuelTonsPerDay).toFixed(1)} MT)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block uppercase">Combustible en Ralentí (Demoras)</span>
                <span className="font-mono font-bold text-amber-300">
                  ${(totalDelayDays * idleFuelTonsPerDay * fuelPricePerTon).toLocaleString()} USD
                </span>
                <span className="text-[10px] text-slate-500 block">({(totalDelayDays * idleFuelTonsPerDay).toFixed(1)} MT)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block uppercase">Costo Total Bunkers Fluviales</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  ${((navigationDays * sailingFuelTonsPerDay + totalDelayDays * idleFuelTonsPerDay) * fuelPricePerTon).toLocaleString()} USD
                </span>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* 4. GASTOS PORTUARIOS Y DE CANAL (PDAs FLUVIALES)                  */}
          {/* ------------------------------------------------------------------ */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏛️</span>
                <h3 className="text-xs md:text-sm font-bold text-sky-400 uppercase tracking-wider">
                  Gastos Portuarios y de Canal (PDAs Fluviales de Hidrovía)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-700">
                Total PDA: ${pdaBreakdown.totalPdaCost.toLocaleString()} USD
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Tarifa Puerto Carga ($)</label>
                <input
                  type="number"
                  value={loadPortTariff}
                  onChange={(e) => setLoadPortTariff(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Tarifa Puerto Descarga ($)</label>
                <input
                  type="number"
                  value={dischargePortTariff}
                  onChange={(e) => setDischargePortTariff(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Peajes de Hidrovía ($)</label>
                <input
                  type="number"
                  value={waterwayTolls}
                  onChange={(e) => setWaterwayTolls(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Derechos de Esclusas ($)</label>
                <input
                  type="number"
                  value={lockDues}
                  onChange={(e) => setLockDues(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Practicaje Fluvial ($)</label>
                <input
                  type="number"
                  value={riverPilotage}
                  onChange={(e) => setRiverPilotage(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-600 mb-1">Aranceles Transfronterizos ($)</label>
                <input
                  type="number"
                  value={crossBorderTariffs}
                  onChange={(e) => setCrossBorderTariffs(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* 5. SUBMÓDULO DE TRANSFERENCIA INTERMODAL (SINCRO-MODALIDAD)        */}
          {/* ------------------------------------------------------------------ */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <h3 className="text-xs md:text-sm font-bold text-teal-800 uppercase tracking-wider">
                  Transferencia Intermodal y Sincro-modalidad
                </h3>
              </div>
              <span className="text-[10px] font-mono bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-bold uppercase">
                Submódulo Costes Sincro-modales
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1 shadow-sm">
                <label className="block text-[10px] font-bold text-slate-700 uppercase">
                  Tarifas de Transbordo Directo (Barcaza a Camión/Tren) ($)
                </label>
                <input
                  type="number"
                  value={directTransshipmentTariff}
                  onChange={(e) => setDirectTransshipmentTariff(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-500">Operaciones de transbordo en terminal intermodal</span>
              </div>

              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-emerald-900 uppercase">
                    Ahorros Terrestres Estimados ($)
                  </label>
                  <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                    (-) Deducción Directa
                  </span>
                </div>
                <input
                  type="number"
                  value={estimatedLandSavings}
                  onChange={(e) => setEstimatedLandSavings(Number(e.target.value))}
                  className="w-full bg-white border border-emerald-300 rounded px-2.5 py-1.5 text-xs text-emerald-900 font-mono font-black"
                />
                <span className="text-[10px] text-emerald-700">
                  Peajes, desgaste de flota y seguros de carretera evitados (Resta al costo operativo)
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-slate-800">Deducción de Ahorros Terrestres en Costo Total:</span>
                <p className="text-[11px] text-slate-500">
                  Los ${estimatedLandSavings.toLocaleString()} USD de ahorro terrestre reducen el costo neto del viaje fluvial.
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-sm text-emerald-600">
                  -${estimatedLandSavings.toLocaleString()} USD
                </span>
                <span className="text-[10px] block text-slate-400">Deducción aplicada</span>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* 5. GESTIÓN DE TIEMPOS Y DEMORAS (ESCLUSAS Y ADUANAS)                */}
          {/* ------------------------------------------------------------------ */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⏳</span>
                <h3 className="text-xs md:text-sm font-bold text-purple-800 uppercase tracking-wider">
                  Gestión de Tiempos y Demoras Fluviales
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-950 border border-purple-800 px-2 py-0.5 rounded">
                Multiplicación Automática de OPEX y Combustible en Ralentí
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                <label className="block text-[10px] font-bold text-slate-600 uppercase">Días Estimados de Navegación</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={navigationDays}
                  onChange={(e) => setNavigationDays(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-500">Tiempo neto navegando en corredor</span>
              </div>

              <div className="bg-white border border-purple-200 rounded-lg p-3 space-y-1 shadow-sm">
                <label className="block text-[10px] font-bold text-purple-700 uppercase">Tiempos de Espera en Esclusas (días)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={lockWaitDays}
                  onChange={(e) => setLockWaitDays(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-600">Congestión y paso en esclusas ({(lockWaitDays * 24).toFixed(0)} horas)</span>
              </div>

              <div className="bg-white border border-purple-200 rounded-lg p-3 space-y-1 shadow-sm">
                <label className="block text-[10px] font-bold text-purple-700 uppercase">Demoras Aduaneras (días)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={customsDelayDays}
                  onChange={(e) => setCustomsDelayDays(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-600">Trámites de frontera fluvial ({(customsDelayDays * 24).toFixed(0)} horas)</span>
              </div>
            </div>

            {/* IMPACTO AUTOMÁTICO DE DEMORAS EN OPEX Y FUEL */}
            <div className="bg-purple-950/30 border border-purple-200 bg-purple-50/70 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
              <div>
                <span className="text-xs font-bold text-purple-700 uppercase block mb-1">
                  Sobrecosto Automático por Demoras ({totalDelayDays} días extra / {(totalDelayDays * 24).toFixed(0)} h)
                </span>
                <p className="text-slate-800 text-[11px] leading-relaxed">
                  + <b>${(totalDelayDays * calculatedDailyOpex).toLocaleString()} USD</b> de OPEX remolcador (tripulación/seguros en espera)
                  <br />
                  + <b>${(totalDelayDays * idleFuelTonsPerDay * fuelPricePerTon).toLocaleString()} USD</b> de combustible en ralentí
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Sobrecosto Total Demoras</span>
                <span className="text-base font-mono font-black text-rose-300">
                  +${((totalDelayDays * calculatedDailyOpex) + (totalDelayDays * idleFuelTonsPerDay * fuelPricePerTon)).toLocaleString()} USD
                </span>
              </div>
            </div>
          </section>

          {/* PARÁMETRO DE FLETE COMERCIAL */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-900 uppercase block">Flete Comercial de Venta (Ingresos)</span>
              <p className="text-slate-600 text-[11px]">Define el flete por tonelada para contrastar con los costes operativos en la Vista Ejecutiva.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-600">$</span>
              <input
                type="number"
                step="0.5"
                value={freightRatePerTon}
                onChange={(e) => setFreightRatePerTon(Number(e.target.value))}
                className="w-28 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 font-mono font-bold text-right"
              />
              <span className="font-mono text-slate-600">USD / MT</span>
            </div>
          </section>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VISTA 2: VISTA EJECUTIVA (DASHBOARD DE SOLO LECTURA)                 */}
      {/* ==================================================================== */}
      {activeMode === 'exec' && (
        <div id="convoy-executive-view" className="space-y-6">
          
          {/* CABECERA: ESTADO DE LA OPERACIÓN FLUVIAL */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${decoupledEstimate?.executiveSummary?.isProfitable ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <h3 className="text-slate-900 font-black text-base uppercase tracking-wider">
                  {decoupledEstimate?.executiveSummary?.isProfitable ? 'OPERACIÓN FLUVIAL RENTABLE' : 'OPERACIÓN FLUVIAL A REVISAR'}
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1 ml-5">
                Ruta: <b className="text-slate-900">{originTerminal}</b> ➔ <b className="text-slate-900">{destinationTerminal}</b> ({riverName})
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs">
              <div className="bg-white border border-slate-300 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-slate-500 uppercase block">Remolcador</span>
                <span className="font-bold text-blue-700">{selectedTugboat?.name || 'TBN'}</span>
              </div>
              <div className="bg-white border border-slate-300 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-slate-500 uppercase block">Barcazas</span>
                <span className="font-bold text-slate-900 font-mono">{coupledBarges.length} uds ({totalCapacityMt.toLocaleString()} MT)</span>
              </div>
              <div className="bg-white border border-slate-300 rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-slate-500 uppercase block">Duración Total</span>
                <span className="font-bold text-purple-700 font-mono">{totalOperationalDays} días</span>
              </div>
            </div>
          </div>

          {/* REPORTE DE EFICIENCIA AMBIENTAL Y SOSTENIBILIDAD */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-sm space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🌱</span>
                <h4 className="text-xs md:text-sm font-bold text-emerald-950 uppercase tracking-wider">
                  Reporte de Eficiencia Ambiental y Sostenibilidad
                </h4>
              </div>
              <span className="text-[10px] font-mono bg-emerald-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wide w-fit">
                {decoupledEstimate?.sustainability?.co2ReductionPercent || 72}% Menos CO2
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-base md:text-lg font-black text-emerald-900 tracking-tight">
                  {decoupledEstimate?.sustainability?.formattedMetric || `Este convoy de ${coupledBarges.length} barcazas equivale a ${Math.round(totalCapacityMt / 25)} camiones, reduciendo las emisiones de CO2 en un 72%`}
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  <b>Argumento Comercial Clave:</b> Impulsa el cierre comercial combinando un Beneficio Neto de <b>${decoupledEstimate?.executiveSummary?.netProfit.toLocaleString()} USD</b> con la reducción garantizada de la huella de carbono y el descongestionamiento de autopistas.
                </p>
              </div>
              <div className="shrink-0 bg-white/90 border border-emerald-300 rounded-lg p-3 text-center min-w-[140px] shadow-sm">
                <span className="text-[10px] text-emerald-800 uppercase font-bold block">Camiones Evitados</span>
                <span className="text-2xl font-black font-mono text-emerald-700">
                  {decoupledEstimate?.sustainability?.truckEquivalent || Math.round(totalCapacityMt / 25)}
                </span>
                <span className="text-[10px] text-slate-500 block">unidades de ruta</span>
              </div>
            </div>
          </div>

          {/* 3 TARJETAS PRINCIPALES: BENEFICIO NETO, COSTO POR TONELADA Y TCE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* TARJETA 1: BENEFICIO NETO */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>💰</span> Beneficio Neto de la Operación
                </span>
                <span className="text-[10px] font-mono bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                  Solo Lectura
                </span>
              </div>

              <div>
                <span className="block text-2xl md:text-3xl font-black font-mono text-emerald-700">
                  ${decoupledEstimate?.executiveSummary?.netProfit.toLocaleString() ?? '0'} USD
                </span>
                <span className="text-xs text-slate-600 block mt-1">
                  Margen: <b>{decoupledEstimate?.executiveSummary?.grossFreightRevenue ? ((decoupledEstimate.executiveSummary.netProfit / decoupledEstimate.executiveSummary.grossFreightRevenue) * 100).toFixed(1) : 0}%</b> sobre ingresos
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Ingresos Totales (Flete):</span>
                  <span className="font-mono font-bold text-slate-900">${decoupledEstimate?.executiveSummary?.grossFreightRevenue.toLocaleString() ?? '0'}</span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Costo Total del Viaje:</span>
                  <span className="font-mono font-bold text-rose-300">-${decoupledEstimate?.totalVoyageCost.toLocaleString() ?? '0'}</span>
                </div>
              </div>
            </div>

            {/* TARJETA 2: COSTO TOTAL POR TONELADA (MOTOR VS BARCAZAS) */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <span>⚖️</span> Costo Total por Tonelada
                </span>
                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">
                  Desglosado
                </span>
              </div>

              <div>
                <span className="block text-2xl md:text-3xl font-black font-mono text-slate-900">
                  ${decoupledEstimate?.costPerCargoTon.toFixed(2) ?? '0.00'} <span className="text-sm font-normal text-slate-600">USD/MT</span>
                </span>
                <span className="text-xs text-slate-600 block mt-1">
                  Flete comercial aplicado: <b>${freightRatePerTon} USD/MT</b>
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-800">
                  <span className="text-blue-700">⚙️ Vector Motor (Remolcador):</span>
                  <span className="font-mono font-bold text-slate-900">
                    ${decoupledEstimate?.executiveSummary?.costPerTonMotor.toFixed(2)} USD/MT
                  </span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-emerald-300">📦 Vector Barcazas (Carga):</span>
                  <span className="font-mono font-bold text-slate-900">
                    ${decoupledEstimate?.executiveSummary?.costPerTonBarges.toFixed(2)} USD/MT
                  </span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-sky-300">🏛️ Gastos Fluviales y PDA:</span>
                  <span className="font-mono font-bold text-slate-900">
                    ${decoupledEstimate?.executiveSummary?.costPerTonPda.toFixed(2)} USD/MT
                  </span>
                </div>
              </div>
            </div>

            {/* TARJETA 3: TCE DIARIO (TIME CHARTER EQUIVALENT) */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📈</span> TCE Diario de la Operación
                </span>
                <span className="text-[10px] font-mono bg-white text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold">
                  Time Charter Equiv.
                </span>
              </div>

              <div>
                <span className="block text-2xl md:text-3xl font-black font-mono text-purple-700">
                  ${decoupledEstimate?.executiveSummary?.dailyTce.toLocaleString() ?? '0'} <span className="text-sm font-normal text-slate-600">/ día</span>
                </span>
                <span className="text-xs text-slate-600 block mt-1">
                  Rendimiento neto diario sobre {totalOperationalDays} días operativos
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Beneficio Neto Diario:</span>
                  <span className="font-mono font-bold text-slate-900">
                    ${decoupledEstimate?.executiveSummary?.dailyNetProfit.toLocaleString() ?? '0'} / día
                  </span>
                </div>
                <div className="flex justify-between text-slate-800">
                  <span className="text-slate-500">Costo Operativo Diario:</span>
                  <span className="font-mono font-bold text-slate-800">
                    ${decoupledEstimate?.costPerDay.toLocaleString() ?? '0'} / día
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* TABLA DE DESGLOSE FINANCIERO COMPLETO (SOLO LECTURA) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Consolidado de Costes Operativos del Viaje (Solo Lectura)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Concepto Operativo</th>
                    <th className="py-2.5 px-3">Detalle Fluvial</th>
                    <th className="py-2.5 px-3 text-right">Días / Unidades</th>
                    <th className="py-2.5 px-3 text-right">Costo Total (USD)</th>
                    <th className="py-2.5 px-3 text-right">USD / MT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-blue-700">Motor: OPEX Remolcador</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">Tripulación, seguros y mantenimiento</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">{totalOperationalDays} días</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-bold">${(totalOperationalDays * calculatedDailyOpex).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">${totalCapacityMt > 0 ? ((totalOperationalDays * calculatedDailyOpex) / totalCapacityMt).toFixed(2) : '0.00'}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-amber-300">Motor: Bunkers Fluviales</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">Navegación + ralentí en esclusas/aduanas</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">{((navigationDays * sailingFuelTonsPerDay) + (totalDelayDays * idleFuelTonsPerDay)).toFixed(1)} MT</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-bold">${((navigationDays * sailingFuelTonsPerDay + totalDelayDays * idleFuelTonsPerDay) * fuelPricePerTon).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">${totalCapacityMt > 0 ? ((((navigationDays * sailingFuelTonsPerDay + totalDelayDays * idleFuelTonsPerDay) * fuelPricePerTon)) / totalCapacityMt).toFixed(2) : '0.00'}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-emerald-300">Carga: CAPEX Barcazas</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">Alquiler y amortización de tren de carga</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">{coupledBarges.length} barcazas</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-bold">${decoupledEstimate?.cargoCost.totalCargoCost.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">${decoupledEstimate?.executiveSummary?.costPerTonBarges.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-sky-700">Gastos Fluviales (PDAs)</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">Peajes de hidrovía, esclusas, practicaje y puertos</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">POL / POD</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-bold">${pdaBreakdown.totalPdaCost.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">${decoupledEstimate?.executiveSummary?.costPerTonPda.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-teal-700">Sincro-modal: Transbordo Directo</td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">Transferencia barcaza a camión / tren</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">Operación</td>
                    <td className="py-2.5 px-3 text-right text-slate-900 font-bold">+${directTransshipmentTariff.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">${totalCapacityMt > 0 ? (directTransshipmentTariff / totalCapacityMt).toFixed(2) : '0.00'}</td>
                  </tr>
                  <tr className="bg-emerald-50/70">
                    <td className="py-2.5 px-3 font-sans font-semibold text-emerald-800">Sincro-modal: Ahorros Terrestres Evitados</td>
                    <td className="py-2.5 px-3 text-emerald-700 font-sans">Peajes, seguros y desgaste de flota deducidos (-)</td>
                    <td className="py-2.5 px-3 text-right text-emerald-800">Deducción</td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">-${estimatedLandSavings.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-700">-${totalCapacityMt > 0 ? (estimatedLandSavings / totalCapacityMt).toFixed(2) : '0.00'}</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
                    <td className="py-3 px-3 font-sans text-slate-900 uppercase">Total Costos Operativos</td>
                    <td className="py-3 px-3 text-slate-600 font-sans">Suma agregada del viaje fluvial</td>
                    <td className="py-3 px-3 text-right text-purple-700">{totalOperationalDays} días</td>
                    <td className="py-3 px-3 text-right text-emerald-700 text-sm">${decoupledEstimate?.totalVoyageCost.toLocaleString()} USD</td>
                    <td className="py-3 px-3 text-right text-slate-900 text-sm">${decoupledEstimate?.costPerCargoTon.toFixed(2)} USD/MT</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* BOTÓN VOLVER A MODO TÉCNICO */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => handleSwitchMode('tech')}
              className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold px-4 py-2.5 rounded-lg transition flex items-center gap-2"
            >
              <span>⚙️ Modificar Parámetros en Modo Técnico</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConvoyBuilder;
