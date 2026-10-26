/**
 * RiverCharter - Global TypeScript Definitions for Fluvial Logistics
 * Replaces the legacy monolithic static ocean Vessel model with a modular
 * push-convoy architecture: Tugboats, Barges, River Voyages, and dynamic Voyage-Barge couplings.
 */

// ============================================================================
// ENUMS & UNION TYPES
// ============================================================================

export type TugboatStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'OFFLINE' | 'STANDBY';

export type BargeType = 'HOPPER' | 'TANKER' | 'DECK' | 'BOX' | 'CONTAINER_BARGE' | 'RORO_BARGE';

export type OperationType = 'BULK' | 'RORO' | 'Carga a Granel' | 'Ro-Ro / Carretera Flotante';

export type BargeStatus = 'AVAILABLE' | 'COUPLED' | 'MAINTENANCE' | 'OUT_OF_SERVICE';

export type RiverVoyageStatus = 'PLANNED' | 'IN_TRANSIT' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';

export type VoyageBargeStatus = 'COUPLED' | 'IN_TRANSIT' | 'DECOUPLED';

// ============================================================================
// CORE STRUCTURAL ENTITIES
// ============================================================================

/**
 * Tugboat (Remolcador fluvial / Empujador)
 * Unidad propulsora activa del convoy con especificación de motor,
 * opex diario operativo y código MMSI para rastreo satelital AIS.
 */
export interface Tugboat {
  id: number;
  name: string;
  motor: string; // Motor / propulsión (ej. Caterpillar 3512B 2x1500 BHP)
  enginePowerHp?: number | null; // Potencia en HP/BHP
  dailyOpex: number; // Costo operativo diario (OPEX)
  mmsi?: string | null; // Identificador MMSI para telemetría AIS
  bollardPullTons?: number | null; // Tiro a punto fijo (toneladas)
  status: TugboatStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type NewTugboat = Omit<Tugboat, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Barge (Barcaza fluvial)
 * Unidad de carga modular acoplable con capacidad nominal,
 * calado dinámico regulado por hidrometría y dispositivo telemétrico IoT.
 */
export interface Barge {
  id: number;
  name: string;
  bargeNumber?: string | null;
  bargeType: BargeType;
  capacity: number; // Capacidad de carga en toneladas métricas (MT)
  dynamicDraft: number; // Calado dinámico según estiaje y carga (metros)
  iotTrackingId?: string | null; // Identificador del sensor de rastreo telemétrico IoT
  status: BargeStatus;
  currentLocation?: string | null;
  operationType?: OperationType;
  linearMeters?: number | null; // Metros lineales para Ro-Ro
  truckCount?: number | null; // Cantidad de semirremolques / camiones
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type NewBarge = Omit<Barge, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * River Voyage (Viaje Fluvial)
 * Itinerario operativo con identificador de viaje, remolcador asignado
 * y nivel mínimo de estiaje para navegación segura.
 */
export interface RiverVoyage {
  id: number;
  voyageNumber: string; // ID de viaje único (ej. "RV-2026-PAR-001")
  tugboatId: number; // Remolcador fluvial asignado
  riverName: string; // Corredor fluvial (ej. "Hidrovía Paraná-Paraguay", "Río Magdalena")
  originTerminal: string;
  destinationTerminal: string;
  minWaterLevel: number; // Nivel mínimo de estiaje requerido (metros)
  currentWaterLevel?: number | null; // Lectura hidrométrica en tiempo real (metros)
  departureDate?: string | Date | null;
  estimatedArrivalDate?: string | Date | null;
  actualArrivalDate?: string | Date | null;
  status: RiverVoyageStatus;
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type NewRiverVoyage = Omit<RiverVoyage, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Voyage Barge (Tabla Puente Dinámica)
 * Modela el acople y desacople dinámico de barcazas a lo largo de un viaje fluvial.
 * Dispone de borrado en cascada (ON DELETE CASCADE) para integridad referencial.
 */
export interface VoyageBarge {
  id: number;
  voyageId: number; // Referencia al viaje (ON DELETE CASCADE)
  bargeId: number; // Referencia a la barcaza (ON DELETE CASCADE)
  couplingPoint: string; // Punto/km de acople (ej. "Terminal San Lorenzo Km 445")
  decouplingPoint?: string | null; // Punto/km de desacople (ej. "Puerto Palmira Km 0")
  coupledAt: string | Date;
  decoupledAt?: string | Date | null;
  cargoDescription?: string | null;
  cargoWeightTons?: number | null;
  loadedDraftMeters?: number | null;
  status: VoyageBargeStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type NewVoyageBarge = Omit<VoyageBarge, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================================================
// AGGREGATE & OPERATIONAL CONVOY INTERFACES
// ============================================================================

/**
 * Detalle de una barcaza acoplada a un viaje, incluyendo especificaciones de la barcaza
 */
export interface CoupledBargeDetail extends VoyageBarge {
  barge: Barge;
}

/**
 * Itinerario Fluvial Completo con Remolcador y Barcazas Acopladas
 */
export interface RiverVoyageDetail extends RiverVoyage {
  tugboat: Tugboat;
  coupledBarges: CoupledBargeDetail[];
  totalCapacityMT: number;
  maxLoadedDraftMeters: number;
  isDraftSafeForLowWater: boolean; // Verifica si el calado respeta el minWaterLevel
}

/**
 * Convoy Fluvial Activo (Push Convoy / Tren de Barcazas)
 */
export interface RiverConvoy {
  voyageId: number;
  voyageNumber: string;
  riverName: string;
  tugboat: Tugboat;
  activeBarges: Barge[];
  totalBargesCount: number;
  totalCapacityTons: number;
  maxDynamicDraftMeters: number;
  minWaterLevelMeters: number;
  navigationAlert?: string | null;
}

export interface SaveRiverVoyagePayload {
  tugboat_id: number;
  barge_ids: number[];
  voyage_number?: string;
  river_name?: string;
  origin_terminal?: string;
  destination_terminal?: string;
  min_water_level?: number;
  current_water_level?: number;
  departure_date?: string | Date | null;
  estimated_arrival_date?: string | Date | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// FLUVIAL TECHNICAL & EXECUTIVE COST STRUCTURES
// ============================================================================

/**
 * Desglose diario de OPEX del Remolcador (tripulación, seguros, mantenimiento)
 */
export interface TugboatOpexBreakdown {
  crewDaily: number; // Coste diario de tripulación
  insuranceDaily: number; // Seguros del remolcador
  maintenanceDaily: number; // Mantenimiento y consumibles
  otherDaily?: number; // Otros costes operativos
  totalDailyOpex: number; // Suma total del OPEX diario
}

/**
 * Módulo de Combustible Fluvial (Bunkers exclusivo del remolcador)
 */
export interface FluvialBunkers {
  fuelPricePerTon: number; // Precio combustible ($/MT)
  sailingFuelTonsPerDay: number; // Consumo navegando / empujando carga (MT/día)
  idleFuelTonsPerDay: number; // Consumo en ralentí / espera en esclusas (MT/día)
}

/**
 * Gastos Portuarios y Fluviales (PDAs de Hidrovía)
 */
export interface FluvialPdaExpenses {
  loadPortTariff: number; // Tarifas puerto de carga ($)
  dischargePortTariff: number; // Tarifas puerto de descarga ($)
  waterwayTolls: number; // Peajes de hidrovía ($)
  lockDues: number; // Derechos de esclusas ($)
  riverPilotage: number; // Practicaje fluvial ($)
  crossBorderTariffs: number; // Aranceles transfronterizos ($)
  totalPdaCost?: number; // Subtotal general de gastos portuarios y de canal
}

/**
 * Gestión de Tiempos y Demoras Fluviales
 */
export interface FluvialDelays {
  navigationDays: number; // Días estimados de navegación
  lockWaitDays: number; // Tiempos de espera en esclusas (días)
  customsDelayDays: number; // Demoras aduaneras (días)
  totalDelayDays: number; // Total días extra (esclusas + aduanas)
  totalOperationalDays: number; // Días totales de la operación
  riverCurrentKnots?: number; // Corriente media del río
  vConvoyWaterKnots?: number; // Velocidad del convoy en agua calma
  speedDownstreamKnots?: number; // SOG bajada
  speedUpstreamKnots?: number; // SOG subida
}

/**
 * Métricas Consolidadas de la Vista Ejecutiva (Dashboard de solo lectura)
 */
export interface FluvialExecutiveMetrics {
  grossFreightRevenue: number; // Ingresos brutos por flete ($)
  totalVoyageCost: number; // Costo total del viaje ($)
  netProfit: number; // Beneficio neto ($)
  costPerTonMotor: number; // Costo por tonelada del motor ($/MT)
  costPerTonBarges: number; // Costo por tonelada de barcazas ($/MT)
  costPerTonPda: number; // Costo por tonelada de gastos fluviales ($/MT)
  totalCostPerTon: number; // Costo total por tonelada ($/MT)
  dailyTce: number; // TCE (Time Charter Equivalent) diario ($/día)
  totalCargoTons: number; // Toneladas de carga agregadas
  isProfitable: boolean; // Estado de rentabilidad
  sustainabilityText?: string; // Métrica de sostenibilidad comercial
  truckEquivalent?: number; // Equivalencia en camiones terrestres evitados
  co2ReductionPercent?: number; // Porcentaje de reducción de emisiones CO2 (%)
  co2SavedTons?: number; // Toneladas de CO2 evitadas
  intermodalSavings?: number; // Ahorros terrestres estimados para el cliente ($)
  operationType?: OperationType;
  linearMeters?: number;
  truckCount?: number;
  bidirectionalSailing?: unknown;
}

/**
 * Evento de Acople/Desacople para auditoría telemétrica
 */
export interface BargeCouplingEvent {
  action: 'COUPLE' | 'DECOUPLE';
  voyageId: number;
  bargeId: number;
  locationWaypoint: string;
  timestamp: string | Date;
  recordedDraftMeters?: number;
  operatorNotes?: string;
}
