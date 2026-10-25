/**
 * RiverCharter - Global TypeScript Definitions for Fluvial Logistics
 * Replaces the legacy monolithic static ocean Vessel model with a modular
 * push-convoy architecture: Tugboats, Barges, River Voyages, and dynamic Voyage-Barge couplings.
 */

// ============================================================================
// ENUMS & UNION TYPES
// ============================================================================

export type TugboatStatus = 'OPERATIONAL' | 'MAINTENANCE' | 'OFFLINE' | 'STANDBY';

export type BargeType = 'HOPPER' | 'TANKER' | 'DECK' | 'BOX' | 'CONTAINER_BARGE';

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
