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
// 1. AISLAMIENTO CONTABLE Y CÁLCULO PURO DE BREAK-EVEN / TCE
// ============================================================================

test('Aislamiento Contable: totalVoyageCost NUNCA resta estimatedLandSavings y dailyTce no lo incluye', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const estimateWithoutSavings = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Río de la Plata', dailyOpex: 3000, enginePowerHp: 3000 },
    barges: [
      { id: 1, name: 'Barge 101', capacity: 1500, dailyRate: 250 },
      { id: 2, name: 'Barge 102', capacity: 1500, dailyRate: 250 },
    ],
    navigationDays: 6,
    freightRatePerTon: 35,
    directTransshipmentTariff: 1500,
    estimatedLandSavings: 0,
  });

  const estimateWithSavings = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Río de la Plata', dailyOpex: 3000, enginePowerHp: 3000 },
    barges: [
      { id: 1, name: 'Barge 101', capacity: 1500, dailyRate: 250 },
      { id: 2, name: 'Barge 102', capacity: 1500, dailyRate: 250 },
    ],
    navigationDays: 6,
    freightRatePerTon: 35,
    directTransshipmentTariff: 1500,
    estimatedLandSavings: 5000, // $5,000 de ahorros de camión para el cliente
  });

  // 1. El costo operativo puro del armador debe ser EXACTAMENTE IDÉNTICO
  assert.equal(
    estimateWithSavings.totalVoyageCost,
    estimateWithoutSavings.totalVoyageCost,
    'totalVoyageCost no debe restar estimatedLandSavings (OPEX puro)'
  );

  // 2. El beneficio neto del armador debe ser EXACTAMENTE IDÉNTICO
  assert.equal(
    estimateWithSavings.executiveSummary.netProfit,
    estimateWithoutSavings.executiveSummary.netProfit,
    'netProfit del armador no debe incluir ahorros de terceros'
  );

  // 3. El TCE diario debe ser EXACTAMENTE IDÉNTICO
  assert.equal(
    estimateWithSavings.executiveSummary.dailyTce,
    estimateWithoutSavings.executiveSummary.dailyTce,
    'dailyTce del armador no debe incluir ahorros de terceros'
  );

  // 4. El costo por tonelada (Break-Even) debe mantenerse puro
  assert.equal(
    estimateWithSavings.costPerCargoTon,
    estimateWithoutSavings.costPerCargoTon,
    'El costo por tonelada debe reflejar el Break-Even puro'
  );

  // 5. Los ahorros del cliente se reportan como argumento comercial sin contaminar la cuenta del buque
  assert.equal(estimateWithSavings.intermodalCost.estimatedLandSavings, 5000);
});

// ============================================================================
// 2. NAVEGACIÓN BIDIRECCIONAL & VELOCIDAD SOBRE FONDO (SOG)
// ============================================================================

test('calculateBidirectionalSailing calcula SOG bajada y subida según la corriente del río', async () => {
  const { calculateBidirectionalSailing } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // v_convoy = 8.0 kn, corriente = 2.5 kn
  const result = calculateBidirectionalSailing({
    distLadenNm: 600,
    distBallastNm: 600,
    convoySpeedWaterKnots: 8.0,
    riverCurrentKnots: 2.5,
    ladenDirection: 'DOWNSTREAM',
    ballastDirection: 'UPSTREAM',
  });

  // Bajada: 8.0 + 2.5 = 10.5 kn
  assert.equal(result.speedDownstreamKnots, 10.5, 'SOG Bajada debe ser 10.5 nudos');
  // Subida: 8.0 - 2.5 = 5.5 kn
  assert.equal(result.speedUpstreamKnots, 5.5, 'SOG Subida debe ser 5.5 nudos');

  // Días con carga aguas abajo (600 NM @ 10.5 kn = 600 / (10.5 * 24) = 2.38 días)
  assert.equal(result.sailingDaysLaden, 2.38, 'Días de bajada con carga correctos');

  // Días en lastre aguas arriba (600 NM @ 5.5 kn = 600 / (5.5 * 24) = 4.55 días)
  assert.equal(result.sailingDaysBallast, 4.55, 'Días de subida en lastre correctos');

  // Total días de navegación netos = 2.38 + 4.55 = 6.93 días
  assert.equal(result.totalNavigationDays, 6.93, 'Total días navegación bidireccional correcto');
});

test('estimateFluvialVoyage integra navegación bidireccional y ajusta días y combustible reales', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const estimate = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Paraná', dailyOpex: 3000, enginePowerHp: 3000 },
    barges: [
      { id: 1, name: 'B-1', capacity: 1500, dailyRate: 250 },
    ],
    distLadenNm: 600,
    distBallastNm: 600,
    convoySpeedWaterKnots: 8.0,
    riverCurrentKnots: 2.5,
    ladenDirection: 'DOWNSTREAM',
  });

  assert.ok(estimate.executiveSummary.bidirectionalSailing, 'Debe incluir desglose bidireccional');
  assert.equal(estimate.executiveSummary.bidirectionalSailing.speedDownstreamKnots, 10.5);
  assert.equal(estimate.executiveSummary.bidirectionalSailing.speedUpstreamKnots, 5.5);
  assert.equal(estimate.totalEffectiveDays, 6.93);
});

// ============================================================================
// 3. VERIFICACIÓN DE INTERFAZ EN index.html & ConvoyBuilder.tsx
// ============================================================================

test('index.html incluye controles de velocidad en agua, corriente del río y visualizadores SOG', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.ok(indexHtml.includes('id="fluvial-convoy-speed"'), 'Debe incluir input fluvial-convoy-speed');
  assert.ok(indexHtml.includes('id="fluvial-river-current"'), 'Debe incluir input fluvial-river-current');
  assert.ok(indexHtml.includes('id="fluvial-navigation-direction"'), 'Debe incluir select fluvial-navigation-direction');
  assert.ok(indexHtml.includes('id="fluvial-sog-downstream-badge"'), 'Debe incluir badge SOG bajada');
  assert.ok(indexHtml.includes('id="fluvial-sog-upstream-badge"'), 'Debe incluir badge SOG subida');
  assert.ok(indexHtml.includes('id="fluvial-sailing-days-badge"'), 'Debe incluir badge días navegación');

  // Aislamiento contable en updateFluvialCalculations
  assert.ok(
    indexHtml.includes('const totalConvoyCost = Math.max(0, grossOperatingCost)'),
    'totalConvoyCost no debe restar estimatedLandSavings'
  );
  assert.ok(
    indexHtml.includes('dailyTce = totalDays > 0 ? (grossRevenue - totalBunkerCost - (pdaLocks + pdaTolls + pdaPilotage) - transshipmentTariff) / totalDays : 0'),
    'dailyTce debe ser puro'
  );
});

test('ConvoyBuilder.tsx incluye controles bidireccionales y tabla financiera con aislamiento contable', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  assert.ok(convoySource.includes('convoySpeedWaterKnots'), 'Debe gestionar convoySpeedWaterKnots');
  assert.ok(convoySource.includes('riverCurrentKnots'), 'Debe gestionar riverCurrentKnots');
  assert.ok(convoySource.includes('ladenDirection'), 'Debe gestionar ladenDirection');
  assert.ok(convoySource.includes('calculateBidirectionalSailing'), 'Debe invocar calculateBidirectionalSailing');
  assert.ok(
    convoySource.includes('Valor Comercial: Ahorros Terrestres Cliente'),
    'La tabla consolidada debe tratar los ahorros terrestres como valor comercial del cliente sin restar de OPEX'
  );
});
