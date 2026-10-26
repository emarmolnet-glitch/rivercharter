import type { Config } from "@netlify/functions";
import { createCorsHeaders } from "./_shared/cors.js";

const DATABRIDGE_FLUVIAL_ROUTES: Record<string, any> = {
  mississippi: {
    routeKey: "mississippi",
    riverName: "Río Misisipi",
    corridor: "Misisipi (St. Louis - New Orleans / Golfo de México)",
    minWaterLevel: 2.74,
    alertLevel: "MODERATE",
    alertStatus: "Alerta de Estiaje USACE: Canal regulado a 9.0 ft (2.74 m) en tramos críticos del Bajo Misisipi",
    avgFreightRateUsdMt: 28.20,
    terminalCostUsd: 1400,
    terminalCostDescription: "Terminal automatizada de alta transferencia (EE. UU.)",
    internationalTollsUsd: 2100,
    internationalTollsDescription: "Tasas de mantenimiento fluvial y esclusas USACE",
    pdaLocks: 2400,
  },
  hidrovia_parana_paraguay: {
    routeKey: "hidrovia_parana_paraguay",
    riverName: "Hidrovía Paraná-Paraguay",
    corridor: "Hidrovía Paraná-Paraguay (Corumbá / Asunción - Gran Rosario / Nueva Palmira)",
    minWaterLevel: 2.60,
    alertLevel: "CRITICAL",
    alertStatus: "Alerta Crítica de Estiaje: Bajante histórica en Paso Florentino / Paso Bravo (Calado crítico 2.60 m)",
    avgFreightRateUsdMt: 34.50,
    terminalCostUsd: 3200,
    terminalCostDescription: "Sobrecostos de manipulación y congestión portuaria en Sudamérica",
    internationalTollsUsd: 4850,
    internationalTollsDescription: "Peajes internacionales Vía Navegable Troncal (Santa Fe al Océano / AGP)",
    pdaLocks: 3500,
  },
  default: {
    routeKey: "default",
    riverName: "Hidrovía Paraná-Paraguay",
    corridor: "Hidrovía Paraná-Paraguay (Corredor Central)",
    minWaterLevel: 2.80,
    alertLevel: "NORMAL",
    alertStatus: "Régimen Hidrológico Promedio (Calado de referencia: 2.80 m)",
    avgFreightRateUsdMt: 33.00,
    terminalCostUsd: 2800,
    terminalCostDescription: "Tarifa promedio de terminal fluvial",
    internationalTollsUsd: 4200,
    internationalTollsDescription: "Peajes de balizamiento y navegación fluvial",
    pdaLocks: 3500,
  },
};

const DATABRIDGE_FLUVIAL_STANDARDS: Record<string, any> = {
  mississippi_jumbo: {
    standardKey: "mississippi_jumbo",
    name: "Estándar Misisipi (Jumbo)",
    bargeType: "HOPPER",
    capacityMt: 1500,
    dimensions: "59.4m × 10.7m × 3.66m (195 ft × 35 ft)",
    lengthMeters: 59.44,
    beamMeters: 10.67,
    depthMeters: 3.66,
    dynamicDraftMeters: 2.74,
    dailyRateUsd: 250,
    defaultBargeCount: 4,
    totalConvoyCapacityMt: 6000,
    description: "Barcaza Jumbo de 195′ × 35′, calado de 9.0 ft (2.74 m) y 1,500 TM de capacidad unitaria para la cuenca del Misisipi.",
  },
  latam_super_jumbo: {
    standardKey: "latam_super_jumbo",
    name: "Estándar LatAm (Súper Jumbo)",
    bargeType: "HOPPER",
    capacityMt: 2500,
    dimensions: "61.0m × 16.5m × 4.27m (200 ft × 54 ft)",
    lengthMeters: 61.0,
    beamMeters: 16.46,
    depthMeters: 4.27,
    dynamicDraftMeters: 3.20,
    dailyRateUsd: 380,
    defaultBargeCount: 4,
    totalConvoyCapacityMt: 10000,
    description: "Barcaza Súper Jumbo Hidrovía de 200′ × 54′, calado de 10.5 ft (3.20 m) y 2,500 TM de capacidad unitaria optimizada para la Hidrovía Paraná-Paraguay.",
  },
};

const DATABRIDGE_TRANSSHIPMENT_NODES: Record<string, any> = {
  gran_rosario: {
    nodeKey: "gran_rosario",
    name: "Gran Rosario",
    region: "Santa Fe / Litoral Argentino",
    riverOrCorridor: "Hidrovía Paraná-Paraguay",
    handlingDelayDays: 2.50,
    landTransitDays: 1.50,
    landTransitMode: "Ferroviario (Belgrano Cargas) / Camión cerealero",
    estimatedLandSavingsUsd: 4200,
    terminalCostUsd: 3200,
    suggestedWaterLevel: 2.60,
  },
  miritituba: {
    nodeKey: "miritituba",
    name: "Miritituba",
    region: "Tapajós / Arco Norte (Brasil)",
    riverOrCorridor: "Río Tapajós - Corredor Arco Norte",
    handlingDelayDays: 3.00,
    landTransitDays: 2.50,
    landTransitMode: "Carretero BR-163 (Mato Grosso a Estación de Transbordo Fluvial)",
    estimatedLandSavingsUsd: 5800,
    terminalCostUsd: 3500,
    suggestedWaterLevel: 2.90,
  },
  nueva_palmira: {
    nodeKey: "nueva_palmira",
    name: "Nueva Palmira",
    region: "Río Uruguay / Delta del Paraná (Uruguay)",
    riverOrCorridor: "Río Uruguay / Río de la Plata",
    handlingDelayDays: 2.00,
    landTransitDays: 1.25,
    landTransitMode: "Bimodal Fluvial-Oceánico / Camión litoral",
    estimatedLandSavingsUsd: 3800,
    terminalCostUsd: 2900,
    suggestedWaterLevel: 2.80,
  },
  corumba: {
    nodeKey: "corumba",
    name: "Corumbá / Ladário",
    region: "Alto Paraguay (Brasil / Pantanal)",
    riverOrCorridor: "Alto Paraguay",
    handlingDelayDays: 2.75,
    landTransitDays: 2.00,
    landTransitMode: "Ferroviario Malha Oeste / Rodoviario mineral",
    estimatedLandSavingsUsd: 4900,
    terminalCostUsd: 3100,
    suggestedWaterLevel: 2.50,
  },
  nola: {
    nodeKey: "nola",
    name: "New Orleans / NOLA",
    region: "Bajo Misisipi / Louisiana (EE. UU.)",
    riverOrCorridor: "Río Misisipi",
    handlingDelayDays: 1.25,
    landTransitDays: 1.00,
    landTransitMode: "Class I Railroads (BNSF/UP) / Terminal automatizada",
    estimatedLandSavingsUsd: 3100,
    terminalCostUsd: 1400,
    suggestedWaterLevel: 2.74,
  },
  st_louis: {
    nodeKey: "st_louis",
    name: "St. Louis / Granite City",
    region: "Medio Misisipi / Illinois (EE. UU.)",
    riverOrCorridor: "Río Misisipi",
    handlingDelayDays: 1.50,
    landTransitDays: 1.20,
    landTransitMode: "Ferroviario Mid-West / Intermodal agrícola",
    estimatedLandSavingsUsd: 3400,
    terminalCostUsd: 1600,
    suggestedWaterLevel: 2.74,
  },
};

function normalizeCorridorKey(input: string): string {
  const normalized = String(input || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (
    normalized.includes("misisipi") ||
    normalized.includes("mississippi") ||
    normalized.includes("nola") ||
    normalized.includes("new orleans") ||
    normalized.includes("baton rouge") ||
    normalized.includes("st. louis") ||
    normalized.includes("st louis") ||
    normalized.includes("memphis") ||
    normalized.includes("cairo") ||
    normalized.includes("usa")
  ) {
    return "mississippi";
  }
  return "hidrovia_parana_paraguay";
}

export default async (req: Request) => {
  const corsHeaders = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...createCorsHeaders(req, "GET, POST, OPTIONS"),
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "all";
  const routeParam = url.searchParams.get("route") || url.searchParams.get("corridor") || "";
  const standardParam = url.searchParams.get("standard") || "";
  const nodeParam = url.searchParams.get("node") || "";

  const corridorKey = normalizeCorridorKey(routeParam);
  const hydrology = DATABRIDGE_FLUVIAL_ROUTES[corridorKey] || DATABRIDGE_FLUVIAL_ROUTES.default;

  if (action === "hydrology" || action === "estiaje") {
    return Response.json(
      {
        success: true,
        source: "DataBridge Fluvial Market Intel",
        hydrology,
      },
      { headers: corsHeaders },
    );
  }

  if (action === "tariffs") {
    return Response.json(
      {
        success: true,
        source: "DataBridge Fluvial Market Intel",
        tariffs: {
          terminalCost: hydrology.terminalCostUsd,
          terminalCostDescription: hydrology.terminalCostDescription,
          internationalTolls: hydrology.internationalTollsUsd,
          internationalTollsDescription: hydrology.internationalTollsDescription,
          pdaLocks: hydrology.pdaLocks,
        },
      },
      { headers: corsHeaders },
    );
  }

  if (action === "standards" || action === "barges") {
    const standard = DATABRIDGE_FLUVIAL_STANDARDS[standardParam] || DATABRIDGE_FLUVIAL_STANDARDS.latam_super_jumbo;
    return Response.json(
      {
        success: true,
        source: "DataBridge Fluvial Market Intel",
        standards: DATABRIDGE_FLUVIAL_STANDARDS,
        selectedStandard: standard,
      },
      { headers: corsHeaders },
    );
  }

  if (action === "nodes") {
    const node = DATABRIDGE_TRANSSHIPMENT_NODES[nodeParam];
    return Response.json(
      {
        success: true,
        source: "DataBridge Fluvial Market Intel",
        nodes: DATABRIDGE_TRANSSHIPMENT_NODES,
        selectedNode: node || null,
      },
      { headers: corsHeaders },
    );
  }

  if (action === "market_freight") {
    return Response.json(
      {
        success: true,
        source: "DataBridge Fluvial Market Intel",
        corridor: hydrology.corridor,
        avgFreightRateUsdMt: hydrology.avgFreightRateUsdMt,
        currency: "USD",
        unit: "MT",
        timestamp: new Date().toISOString(),
      },
      { headers: corsHeaders },
    );
  }

  // Action: "all"
  return Response.json(
    {
      success: true,
      source: "DataBridge Fluvial Market Intel",
      corridorKey,
      hydrology,
      standards: DATABRIDGE_FLUVIAL_STANDARDS,
      transshipmentNodes: DATABRIDGE_TRANSSHIPMENT_NODES,
      marketFreight: {
        avgFreightRateUsdMt: hydrology.avgFreightRateUsdMt,
        currency: "USD",
        unit: "MT",
      },
    },
    { headers: corsHeaders },
  );
};
