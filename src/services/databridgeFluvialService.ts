/**
 * DataBridge Fluvial Market Intel Service
 * 
 * Centraliza la inteligencia de mercado fluvial consumida por RiverCharter:
 * 1. Riesgo Hidrológico y Alertas de Estiaje (min_water_level).
 * 2. Estándares de convoy: Misisipi Jumbo vs LatAm Súper Jumbo.
 * 3. Tarifas Intermodales: Costo de Terminal (Automatización EE.UU. vs Sudamérica) y Peajes Internacionales (Vía Navegable Troncal).
 * 4. Nodos de trasbordo sincro-modales y tiempos de demora / tránsito terrestre.
 * 5. Flete Fluvial Promedio de mercado (read-only micro-widget).
 */

export interface FluvialRouteHydrology {
  routeKey: 'mississippi' | 'hidrovia_parana_paraguay' | 'default';
  riverName: string;
  corridor: string;
  minWaterLevel: number;
  alertLevel: 'NORMAL' | 'MODERATE' | 'CRITICAL';
  alertStatus: string;
  avgFreightRateUsdMt: number;
  terminalCostUsd: number;
  terminalCostDescription: string;
  internationalTollsUsd: number;
  internationalTollsDescription: string;
}

export interface FluvialBargeStandard {
  standardKey: 'mississippi_jumbo' | 'latam_super_jumbo';
  name: string;
  bargeType: 'HOPPER' | 'BOX' | 'TANKER' | 'DECK';
  capacityMt: number;
  dimensions: string;
  lengthMeters: number;
  beamMeters: number;
  depthMeters: number;
  dynamicDraftMeters: number;
  dailyRateUsd: number;
  defaultBargeCount: number;
  totalConvoyCapacityMt: number;
  description: string;
}

export interface TransshipmentNodeIntel {
  nodeKey: string;
  name: string;
  region: string;
  riverOrCorridor: string;
  handlingDelayDays: number;
  landTransitDays: number;
  landTransitMode: string;
  estimatedLandSavingsUsd: number;
  terminalCostUsd: number;
  suggestedWaterLevel?: number;
}

export const DATABRIDGE_FLUVIAL_STANDARDS: Record<'mississippi_jumbo' | 'latam_super_jumbo', FluvialBargeStandard> = {
  mississippi_jumbo: {
    standardKey: 'mississippi_jumbo',
    name: 'Estándar Misisipi (Jumbo)',
    bargeType: 'HOPPER',
    capacityMt: 1500,
    dimensions: '59.4m × 10.7m × 3.66m (195 ft × 35 ft)',
    lengthMeters: 59.44,
    beamMeters: 10.67,
    depthMeters: 3.66,
    dynamicDraftMeters: 2.74,
    dailyRateUsd: 250,
    defaultBargeCount: 4,
    totalConvoyCapacityMt: 6000,
    description: 'Barcaza Jumbo de 195′ × 35′, calado de 9.0 ft (2.74 m) y 1,500 TM de capacidad unitaria para la cuenca del Misisipi.',
  },
  latam_super_jumbo: {
    standardKey: 'latam_super_jumbo',
    name: 'Estándar LatAm (Súper Jumbo)',
    bargeType: 'HOPPER',
    capacityMt: 2500,
    dimensions: '61.0m × 16.5m × 4.27m (200 ft × 54 ft)',
    lengthMeters: 61.0,
    beamMeters: 16.46,
    depthMeters: 4.27,
    dynamicDraftMeters: 3.20,
    dailyRateUsd: 380,
    defaultBargeCount: 4,
    totalConvoyCapacityMt: 10000,
    description: 'Barcaza Súper Jumbo Hidrovía de 200′ × 54′, calado de 10.5 ft (3.20 m) y 2,500 TM de capacidad unitaria optimizada para la Hidrovía Paraná-Paraguay.',
  },
};

export const DATABRIDGE_FLUVIAL_ROUTES: Record<string, FluvialRouteHydrology> = {
  mississippi: {
    routeKey: 'mississippi',
    riverName: 'Río Misisipi',
    corridor: 'Misisipi (St. Louis - New Orleans / Golfo de México)',
    minWaterLevel: 2.74,
    alertLevel: 'MODERATE',
    alertStatus: 'Alerta de Estiaje USACE: Canal regulado a 9.0 ft (2.74 m) en tramos críticos del Bajo Misisipi',
    avgFreightRateUsdMt: 28.20,
    terminalCostUsd: 1400,
    terminalCostDescription: 'Terminal automatizada de alta transferencia (EE. UU.)',
    internationalTollsUsd: 2100,
    internationalTollsDescription: 'Tasas de mantenimiento fluvial y esclusas USACE',
  },
  hidrovia_parana_paraguay: {
    routeKey: 'hidrovia_parana_paraguay',
    riverName: 'Hidrovía Paraná-Paraguay',
    corridor: 'Hidrovía Paraná-Paraguay (Corumbá / Asunción - Gran Rosario / Nueva Palmira)',
    minWaterLevel: 2.60,
    alertLevel: 'CRITICAL',
    alertStatus: 'Alerta Crítica de Estiaje: Bajante histórica en Paso Florentino / Paso Bravo (Calado crítico 2.60 m)',
    avgFreightRateUsdMt: 34.50,
    terminalCostUsd: 3200,
    terminalCostDescription: 'Sobrecostos de manipulación y congestión portuaria en Sudamérica',
    internationalTollsUsd: 4850,
    internationalTollsDescription: 'Peajes internacionales Vía Navegable Troncal (Santa Fe al Océano / AGP)',
  },
  default: {
    routeKey: 'default',
    riverName: 'Hidrovía Paraná-Paraguay',
    corridor: 'Hidrovía Paraná-Paraguay (Corredor Central)',
    minWaterLevel: 2.80,
    alertLevel: 'NORMAL',
    alertStatus: 'Régimen Hidrológico Promedio (Calado de referencia: 2.80 m)',
    avgFreightRateUsdMt: 33.00,
    terminalCostUsd: 2800,
    terminalCostDescription: 'Tarifa promedio de terminal fluvial',
    internationalTollsUsd: 4200,
    internationalTollsDescription: 'Peajes de balizamiento y navegación fluvial',
  },
};

export const DATABRIDGE_TRANSSHIPMENT_NODES: Record<string, TransshipmentNodeIntel> = {
  gran_rosario: {
    nodeKey: 'gran_rosario',
    name: 'Gran Rosario',
    region: 'Santa Fe / Litoral Argentino',
    riverOrCorridor: 'Hidrovía Paraná-Paraguay',
    handlingDelayDays: 2.50,
    landTransitDays: 1.50,
    landTransitMode: 'Ferroviario (Belgrano Cargas) / Camión cerealero',
    estimatedLandSavingsUsd: 4200,
    terminalCostUsd: 3200,
    suggestedWaterLevel: 2.60,
  },
  miritituba: {
    nodeKey: 'miritituba',
    name: 'Miritituba',
    region: 'Tapajós / Arco Norte (Brasil)',
    riverOrCorridor: 'Río Tapajós - Corredor Arco Norte',
    handlingDelayDays: 3.00,
    landTransitDays: 2.50,
    landTransitMode: 'Carretero BR-163 (Mato Grosso a Estación de Transbordo Fluvial)',
    estimatedLandSavingsUsd: 5800,
    terminalCostUsd: 3500,
    suggestedWaterLevel: 2.90,
  },
  nueva_palmira: {
    nodeKey: 'nueva_palmira',
    name: 'Nueva Palmira',
    region: 'Río Uruguay / Delta del Paraná (Uruguay)',
    riverOrCorridor: 'Río Uruguay / Río de la Plata',
    handlingDelayDays: 2.00,
    landTransitDays: 1.25,
    landTransitMode: 'Bimodal Fluvial-Oceánico / Camión litoral',
    estimatedLandSavingsUsd: 3800,
    terminalCostUsd: 2900,
    suggestedWaterLevel: 2.80,
  },
  corumba: {
    nodeKey: 'corumba',
    name: 'Corumbá / Ladário',
    region: 'Alto Paraguay (Brasil / Pantanal)',
    riverOrCorridor: 'Alto Paraguay',
    handlingDelayDays: 2.75,
    landTransitDays: 2.00,
    landTransitMode: 'Ferroviario Malha Oeste / Rodoviario mineral',
    estimatedLandSavingsUsd: 4900,
    terminalCostUsd: 3100,
    suggestedWaterLevel: 2.50,
  },
  nola: {
    nodeKey: 'nola',
    name: 'New Orleans / NOLA',
    region: 'Bajo Misisipi / Louisiana (EE. UU.)',
    riverOrCorridor: 'Río Misisipi',
    handlingDelayDays: 1.25,
    landTransitDays: 1.00,
    landTransitMode: 'Class I Railroads (BNSF/UP) / Terminal automatizada',
    estimatedLandSavingsUsd: 3100,
    terminalCostUsd: 1400,
    suggestedWaterLevel: 2.74,
  },
  st_louis: {
    nodeKey: 'st_louis',
    name: 'St. Louis / Granite City',
    region: 'Medio Misisipi / Illinois (EE. UU.)',
    riverOrCorridor: 'Río Misisipi',
    handlingDelayDays: 1.50,
    landTransitDays: 1.20,
    landTransitMode: 'Ferroviario Mid-West / Intermodal agrícola',
    estimatedLandSavingsUsd: 3400,
    terminalCostUsd: 1600,
    suggestedWaterLevel: 2.74,
  },
};

/**
 * Detecta si una cadena de texto o un conjunto de puertos/rutas pertenece
 * a la cuenca del Misisipi o a la Hidrovía Paraná-Paraguay.
 */
export function detectFluvialCorridor(routeText: string): 'mississippi' | 'hidrovia_parana_paraguay' {
  const normalized = String(routeText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (
    normalized.includes('misisipi') ||
    normalized.includes('mississippi') ||
    normalized.includes('nola') ||
    normalized.includes('new orleans') ||
    normalized.includes('baton rouge') ||
    normalized.includes('st. louis') ||
    normalized.includes('st louis') ||
    normalized.includes('memphis') ||
    normalized.includes('cairo') ||
    normalized.includes('granite city') ||
    normalized.includes('eeuu') ||
    normalized.includes('usa')
  ) {
    return 'mississippi';
  }

  return 'hidrovia_parana_paraguay';
}

/**
 * Consulta las alertas de estiaje e hidrología en DataBridge Fluvial Market Intel.
 */
export async function fetchFluvialHydrologyAlerts(corridorOrRoute?: string): Promise<FluvialRouteHydrology> {
  const corridorKey = corridorOrRoute ? detectFluvialCorridor(corridorOrRoute) : 'hidrovia_parana_paraguay';

  try {
    const apiOrigin = typeof window !== 'undefined' && (window as any).NETLIFY_API_BASE_URL ? (window as any).NETLIFY_API_BASE_URL : '';
    const res = await fetch(`${apiOrigin}/.netlify/functions/databridge-fluvial-intel?action=hydrology&route=${corridorKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.hydrology) {
        return data.hydrology;
      }
    }
  } catch (_) {
    // Modo offline o fallback local garantizado
  }

  return DATABRIDGE_FLUVIAL_ROUTES[corridorKey] || DATABRIDGE_FLUVIAL_ROUTES.default;
}

/**
 * Consulta las tarifas intermodales (Costo Terminal + Peajes Internacionales) en DataBridge.
 */
export async function fetchFluvialTariffs(corridorOrRoute?: string): Promise<{
  terminalCost: number;
  terminalCostDescription: string;
  internationalTolls: number;
  internationalTollsDescription: string;
  pdaLocks: number;
}> {
  const corridorKey = corridorOrRoute ? detectFluvialCorridor(corridorOrRoute) : 'hidrovia_parana_paraguay';

  try {
    const apiOrigin = typeof window !== 'undefined' && (window as any).NETLIFY_API_BASE_URL ? (window as any).NETLIFY_API_BASE_URL : '';
    const res = await fetch(`${apiOrigin}/.netlify/functions/databridge-fluvial-intel?action=tariffs&route=${corridorKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.tariffs) {
        return data.tariffs;
      }
    }
  } catch (_) {}

  const routeInfo = DATABRIDGE_FLUVIAL_ROUTES[corridorKey] || DATABRIDGE_FLUVIAL_ROUTES.default;
  return {
    terminalCost: routeInfo.terminalCostUsd,
    terminalCostDescription: routeInfo.terminalCostDescription,
    internationalTolls: routeInfo.internationalTollsUsd,
    internationalTollsDescription: routeInfo.internationalTollsDescription,
    pdaLocks: corridorKey === 'mississippi' ? 2400 : 3500,
  };
}

/**
 * Consulta el flete fluvial promedio del mercado para la ruta dada.
 */
export async function fetchFluvialMarketAverageFreight(corridorOrRoute?: string): Promise<{
  avgFreightRate: number;
  currency: string;
  unit: string;
  corridor: string;
  updatedAt: string;
}> {
  const corridorKey = corridorOrRoute ? detectFluvialCorridor(corridorOrRoute) : 'hidrovia_parana_paraguay';
  const routeInfo = DATABRIDGE_FLUVIAL_ROUTES[corridorKey] || DATABRIDGE_FLUVIAL_ROUTES.default;

  return {
    avgFreightRate: routeInfo.avgFreightRateUsdMt,
    currency: 'USD',
    unit: 'MT',
    corridor: routeInfo.corridor,
    updatedAt: new Date().toISOString(),
  };
}
