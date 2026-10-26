import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTsModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
}

// ============================================================================
// 1. MÓDULO RO-RO FLUVIAL (BLOQUE 2 - ESPECIFICACIONES)
// ============================================================================

test('Ro-Ro mode computes capacity using linear meters and truck count instead of bulk deadweight', async () => {
  const { calculateSustainabilityMetrics, estimateFluvialVoyage } = await loadTsModule(
    '../src/services/fluvialEstimator.ts'
  );

  // Convoy Ro-Ro de 4 barcazas con 800 metros lineales y 48 semirremolques
  const roroSust = calculateSustainabilityMetrics({
    bargeCount: 4,
    operationType: 'RORO',
    linearMeters: 800,
    truckCount: 48,
  });

  assert.equal(roroSust.bargeCount, 4);
  assert.equal(roroSust.truckEquivalent, 48, 'Debe tomar directamente la cantidad de camiones/semirremolques en Ro-Ro');
  assert.equal(roroSust.co2ReductionPercent, 72, 'Debe computar 72% de reducción de CO2 vs terrestre');
  assert.equal(
    roroSust.formattedMetric,
    'Este convoy de 4 barcazas equivale a 48 camiones, reduciendo las emisiones de CO2 en un 72%'
  );

  // Estimación completa en modo Ro-Ro
  const estimate = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Río Bravo', dailyOpexUsd: 3200, enginePowerHp: 3000 },
    barges: [
      { id: 1, name: 'Barcaza Ro-Ro 01', type: 'RORO_BARGE', dailyRentalUsd: 600, linearMeters: 800, truckCount: 48 },
      { id: 2, name: 'Barcaza Ro-Ro 02', type: 'RORO_BARGE', dailyRentalUsd: 600, linearMeters: 800, truckCount: 48 },
    ],
    operationType: 'RORO',
    totalTruckCount: 96,
    totalLinearMeters: 1600,
    navigationDays: 5,
  });

  assert.equal(estimate.sustainability.truckEquivalent, 96);
  assert.equal(
    estimate.sustainability.formattedMetric,
    'Este convoy de 2 barcazas equivale a 96 camiones, reduciendo las emisiones de CO2 en un 72%'
  );
  assert.ok(estimate.totalVoyageCost > 0);
});

// ============================================================================
// 2. COSTOS DE SINCRO-MODALIDAD (BLOQUE 3 - COSTES)
// ============================================================================

test('Intermodal transfer tariff adds to cost and estimated land savings subtracts from total voyage cost', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const baseParams = {
    tugboat: { name: 'Empujador Guaraní', dailyOpexUsd: 3000, enginePowerHp: 2400 },
    barges: [
      { id: 1, name: 'Barcaza 1', capacity: 1500, dailyRentalUsd: 300 },
      { id: 2, name: 'Barcaza 2', capacity: 1500, dailyRentalUsd: 300 },
    ],
    navigationDays: 5,
    freightRatePerTon: 35,
  };

  // 1. Sin intermodalidad
  const baseline = estimateFluvialVoyage(baseParams);

  // 2. Con tarifa de transbordo directo ($1,800) y Ahorros Terrestres Estimados ($3,600)
  const synchromodal = estimateFluvialVoyage({
    ...baseParams,
    directTransshipmentTariff: 1800,
    estimatedLandSavings: 3600,
  });

  assert.equal(synchromodal.intermodalCost.directTransshipmentTariff, 1800);
  assert.equal(synchromodal.intermodalCost.estimatedLandSavings, 3600);
  assert.equal(synchromodal.intermodalCost.netIntermodalImpact, -1800, 'El impacto neto debe ser -$1,800 a favor del cliente');

  // El costo total del viaje debe incluir el transbordo y restar los ahorros terrestres
  assert.equal(
    synchromodal.totalVoyageCost,
    baseline.totalVoyageCost + 1800 - 3600,
    'El costo total debe restar los ahorros terrestres'
  );

  // Beneficio neto debe incrementarse por el ahorro terrestre neto
  assert.equal(
    synchromodal.executiveSummary.netProfit,
    baseline.executiveSummary.netProfit + 1800,
    'El beneficio neto debe reflejar los ahorros terrestres restados'
  );
});

// ============================================================================
// 3. ALERTAS RIS Y CARTOGRAFÍA DINÁMICA (BLOQUE 1 - RUTAS)
// ============================================================================

test('RIS alerts adjust grounding risk with active sandbars and increase fuel consumption with strong currents', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const baseParams = {
    tugboat: { name: 'Empujador Titán', dailyOpexUsd: 3000, enginePowerHp: 3000 },
    barges: [
      { id: 1, name: 'Barcaza C-1', capacity: 2000, dynamicDraft: 2.5, dailyRentalUsd: 400 },
    ],
    navigationDays: 6,
    bunkerPriceUsdPerTon: 780,
  };

  // Condición normal: Calado 2.5m, Nivel de agua 2.8m -> Margen 0.30m (SAFE)
  const normal = estimateFluvialVoyage({
    ...baseParams,
    minWaterLevel: 2.8,
    risSandbarsActive: false,
    risStrongCurrentsActive: false,
  });

  assert.equal(normal.executiveSummary.risGroundingRisk, 'SAFE');

  // Restricción RIS: Bancos de arena activos reducen profundidad útil en 0.40m -> Fondo 2.40m < Calado 2.50m (CRITICAL)
  const withSandbars = estimateFluvialVoyage({
    ...baseParams,
    minWaterLevel: 2.8,
    risSandbarsActive: true,
    risStrongCurrentsActive: false,
  });

  assert.equal(
    withSandbars.executiveSummary.risGroundingRisk,
    'CRITICAL',
    'Con bancos de arena activos sobre fondo bajo debe alertar RIESGO CRÍTICO de varadura'
  );

  // Restricción RIS: Corrientes fuertes aumentan consumo de combustible en navegación en un 25%
  const withCurrents = estimateFluvialVoyage({
    ...baseParams,
    minWaterLevel: 2.8,
    risSandbarsActive: false,
    risStrongCurrentsActive: true,
  });

  assert.ok(
    withCurrents.motorCost.estimatedFuelCost > normal.motorCost.estimatedFuelCost,
    'El costo de combustible debe ser mayor con corrientes fuertes'
  );

  const fuelRatio = withCurrents.motorCost.estimatedFuelCost / normal.motorCost.estimatedFuelCost;
  // Debe ser exactamente 1.25x para el tramo de navegación
  assert.ok(
    Math.abs(fuelRatio - 1.25) < 0.01,
    `El multiplicador de combustible de navegación debe ser ~1.25 (actual: ${fuelRatio.toFixed(3)})`
  );
});

// ============================================================================
// 4. REPORTE DE EFICIENCIA AMBIENTAL (VISTA EJECUTIVA Y BLOQUE 8)
// ============================================================================

test('Sustainability metric matches exact prompt specification and pairs with Net Profit in commercial summary', async () => {
  const { calculateSustainabilityMetrics, estimateFluvialVoyage } = await loadTsModule(
    '../src/services/fluvialEstimator.ts'
  );

  const sust = calculateSustainabilityMetrics({
    bargeCount: 4,
    totalCargoTons: 12000,
  });

  // 12000 TM / 25 TM por camión = 480 camiones
  assert.equal(sust.bargeCount, 4);
  assert.equal(sust.truckEquivalent, 480);
  assert.equal(sust.co2ReductionPercent, 72);

  // Verificación estricta de la frase requerida por el prompt
  const expectedText = 'Este convoy de 4 barcazas equivale a 480 camiones, reduciendo las emisiones de CO2 en un 72%';
  assert.equal(sust.formattedMetric, expectedText);

  // Verificación de integración en resumen ejecutivo
  const estimate = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Delta', dailyOpexUsd: 3200, enginePowerHp: 3200 },
    barges: [
      { id: 1, name: 'B-1', capacity: 3000, dailyRentalUsd: 500 },
      { id: 2, name: 'B-2', capacity: 3000, dailyRentalUsd: 500 },
      { id: 3, name: 'B-3', capacity: 3000, dailyRentalUsd: 500 },
      { id: 4, name: 'B-4', capacity: 3000, dailyRentalUsd: 500 },
    ],
    navigationDays: 7,
    freightRatePerTon: 35,
  });

  assert.ok(
    estimate.executiveSummary.summary.includes(expectedText),
    'El resumen ejecutivo debe contener la frase de sostenibilidad'
  );
  assert.ok(
    estimate.executiveSummary.summary.includes('Beneficio Neto:'),
    'La métrica de sostenibilidad debe ser argumento de venta junto al Beneficio Neto'
  );
});

// ============================================================================
// 5. VERIFICACIÓN DE ELEMENTOS DE INTERFAZ EN index.html
// ============================================================================

test('index.html contains all required UI elements and functions for Ro-Ro, Synchromodality, RIS, and Sustainability', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Bloque 1: Alertas RIS y Cartografía Dinámica
  assert.ok(html.includes('id="fluvial-ris-panel"'), 'Debe contener el panel visual RIS');
  assert.ok(html.includes('id="ris-sandbars-toggle"'), 'Debe contener el checkbox de bancos de arena activos');
  assert.ok(html.includes('id="ris-currents-toggle"'), 'Debe contener el checkbox de corrientes fuertes');
  assert.ok(html.includes('id="ris-grounding-risk-badge"'), 'Debe contener el badge de riesgo de varadura');
  assert.ok(html.includes('id="ris-fuel-adjustment-badge"'), 'Debe contener el badge de ajuste de combustible RIS');

  // Bloque 2: Módulo Ro-Ro Fluvial
  assert.ok(html.includes('id="fluvial-operation-type-selector"'), 'Debe contener el selector de operación fluvial');
  assert.ok(html.includes('id="btn-fluvial-bulk"'), 'Debe contener botón de Carga a Granel');
  assert.ok(html.includes('id="btn-fluvial-roro"'), 'Debe contener botón de Ro-Ro / Carretera Flotante');
  assert.ok(html.includes('id="fluvial-roro-capacity-panel"'), 'Debe contener panel de capacidad Ro-Ro');
  assert.ok(html.includes('id="roro-linear-meters"'), 'Debe contener input de Metros Lineales');
  assert.ok(html.includes('id="roro-truck-count"'), 'Debe contener input de Semirremolques / Camiones');

  // Bloque 3: Costos de Sincro-modalidad
  assert.ok(html.includes('id="fluvial-intermodal-panel"'), 'Debe contener submódulo de Transferencia Intermodal');
  assert.ok(html.includes('id="fluvial-transshipment-tariff"'), 'Debe contener input de Tarifas de Transbordo Directo');
  assert.ok(html.includes('id="fluvial-land-savings"'), 'Debe contener input de Ahorros Terrestres Estimados (Deducción)');

  // Vista Ejecutiva y Bloque 8: Sostenibilidad
  assert.ok(html.includes('id="exec-sustainability-panel"'), 'Debe contener panel de sostenibilidad en Vista Ejecutiva');
  assert.ok(html.includes('id="exec-sustainability-metric"'), 'Debe contener texto de sostenibilidad en Vista Ejecutiva');
  assert.ok(html.includes('id="exec-sustainability-trucks"'), 'Debe contener indicador numérico de camiones equivalentes');
  assert.ok(html.includes('id="commercial-sustainability-panel"'), 'Debe contener banner comercial de sostenibilidad en Bloque 8');
  assert.ok(html.includes('id="commercial-sustainability-metric"'), 'Debe contener métrica en Bloque 8');

  // Funciones globales de cálculo
  assert.ok(html.includes('window.setFluvialOperationType'), 'Debe definir window.setFluvialOperationType');
  assert.ok(html.includes('window.updateFluvialCalculations'), 'Debe definir window.updateFluvialCalculations');
});
