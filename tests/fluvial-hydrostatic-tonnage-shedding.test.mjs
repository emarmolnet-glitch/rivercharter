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
// 1. PARÁMETROS HIDROSTÁTICOS BASE EN BARCAZAS
// ============================================================================

test('fluvialEstimator exports naval architecture hydrostatic defaults (lightshipDraft, designDraft, TPC, UKC)', async () => {
  const {
    DEFAULT_LIGHTSHIP_DRAFT,
    DEFAULT_DESIGN_DRAFT,
    DEFAULT_TPC,
    DEFAULT_UKC,
  } = await loadTsModule('../src/services/fluvialEstimator.ts');

  assert.equal(DEFAULT_LIGHTSHIP_DRAFT, 0.55, 'Calado en rosca por defecto debe ser 0.55 m');
  assert.equal(DEFAULT_DESIGN_DRAFT, 3.66, 'Calado de diseño máximo por defecto debe ser 3.66 m (12 ft)');
  assert.equal(DEFAULT_TPC, 4.5, 'Factor TPC debe ser 4.5 MT/cm para barcazas estándar/Jumbo');
  assert.equal(DEFAULT_UKC, 0.30, 'Margen de seguridad bajo la quilla (UKC) debe ser 0.30 m');
});

// ============================================================================
// 2. ALGORITMO DE CALADO ADMISIBLE Y TONNAGE SHEDDING (MERMA DE CARGA)
// ============================================================================

test('calculateTonnageShedding calculates admissible draft, capacity reduction, and deadfreight under estiaje', async () => {
  const { calculateTonnageShedding } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // Caso: Convoy de 4 barcazas estándar Jumbo (1500 MT nominales cada una = 6000 MT total)
  // Nivel de agua minWaterLevel = 2.60 m. UKC = 0.30 m.
  // maxAdmissibleDraft = Math.min(3.66, 2.60 - 0.30) = 2.30 m.
  // adjustedCapacityPerBarge = (2.30 - 0.55) * 100 * 4.5 = 1.75 * 100 * 4.5 = 787.5 MT.
  // adjustedTonnage = 787.5 * 4 = 3150 MT.
  // lostTonnage = 6000 - 3150 = 2850 MT (Merma / Falso Flete).
  const result = calculateTonnageShedding({
    minWaterLevel: 2.60,
    ukc: 0.30,
    designDraft: 3.66,
    lightshipDraft: 0.55,
    tpc: 4.5,
    bargeCount: 4,
    nominalTonnage: 6000,
  });

  assert.equal(result.maxAdmissibleDraft, 2.30, 'Calado admisible debe ser 2.30 m (2.60 - 0.30)');
  assert.equal(result.isDraftRestricted, true, 'Debe identificar que hay restricción por estiaje');
  assert.equal(result.adjustedCapacityPerBarge, 787.5, 'Capacidad reducida por barcaza debe ser 787.5 MT');
  assert.equal(result.adjustedTonnage, 3150, 'Carga neta del convoy debe ser 3150 MT');
  assert.equal(result.lostTonnage, 2850, 'La merma (lostTonnage) debe ser 2850 MT');
  assert.ok(
    result.infoMessage?.includes('Restricción por estiaje activa: Calado admisible limitado a 2.30 m'),
    'El mensaje debe incluir el formato exacto requerido'
  );
  assert.ok(
    result.infoMessage?.includes('Carga total reducida automáticamente a 3,150 MT (Merma: 2,850 MT)'),
    'El mensaje debe indicar la carga reducida y la merma'
  );
});

test('calculateTonnageShedding maintains full nominal capacity when water level allows design draft', async () => {
  const { calculateTonnageShedding } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // Nivel de agua abundante: 4.20 m (4.20 - 0.30 = 3.90 m > 3.66 m)
  const result = calculateTonnageShedding({
    minWaterLevel: 4.20,
    bargeCount: 4,
    nominalTonnage: 6000,
  });

  assert.equal(result.maxAdmissibleDraft, 3.66, 'Calado admisible debe ser el de diseño (3.66 m)');
  assert.equal(result.isDraftRestricted, false, 'No debe haber restricción por estiaje');
  assert.equal(result.adjustedTonnage, 6000, 'Capacidad ajustada debe ser la nominal');
  assert.equal(result.lostTonnage, 0, 'No debe haber merma de carga');
});

// ============================================================================
// 3. FALSO FLETE (DEADFREIGHT) E IMPACTO FINANCIERO EN BREAK-EVEN
// ============================================================================

test('estimateFluvialVoyage divides total costs by adjustedTonnage, increasing Break-Even $/MT', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const baseParams = {
    tugboat: { dailyOpex: 3200, enginePowerHp: 3500 },
    navigationDays: 8,
    fuelConsumptionTonsPerDay: 4,
    fuelPricePerTon: 700,
    barges: [
      { id: 1, name: 'B-1', capacity: 1500, couplingDays: 8, dailyRate: 250 },
      { id: 2, name: 'B-2', capacity: 1500, couplingDays: 8, dailyRate: 250 },
    ],
    waitingHours: 0,
    freightRatePerTon: 35,
  };

  // Sin estiaje: 2 barcazas × 1500 MT = 3000 MT nominal
  // Total viaje: 52000 USD. Break-Even nominal: 52000 / 3000 = ~17.33 $/MT
  const normalEstimate = estimateFluvialVoyage({
    ...baseParams,
  });

  assert.equal(normalEstimate.totalVoyageCost, 52000);
  assert.equal(normalEstimate.totalCargoTons, 3000);
  assert.equal(normalEstimate.costPerCargoTon, 17.33);
  assert.equal(normalEstimate.lostTonnage, 0);

  // Con estiaje crítico: minWaterLevel = 2.60 m (UKC = 0.30 m -> maxAdmissibleDraft = 2.30 m)
  // adjustedCapacityPerBarge = (2.30 - 0.55) * 100 * 4.5 = 787.5 MT
  // adjustedTonnage = 787.5 * 2 = 1575 MT
  // lostTonnage = 3000 - 1575 = 1425 MT
  // Nuevo Break-Even: 52000 / 1575 = ~33.02 $/MT (se encarece automáticamente por falso flete)
  const restrictedEstimate = estimateFluvialVoyage({
    ...baseParams,
    minWaterLevel: 2.60,
  });

  assert.equal(restrictedEstimate.totalVoyageCost, 52000, 'El OPEX total se mantiene inalterado');
  assert.equal(restrictedEstimate.totalCargoTons, 1575, 'La carga neta para cálculos financieros debe ser 1575 MT');
  assert.equal(restrictedEstimate.adjustedTonnage, 1575, 'Exporta adjustedTonnage');
  assert.equal(restrictedEstimate.lostTonnage, 1425, 'Exporta lostTonnage');
  assert.equal(restrictedEstimate.maxAdmissibleDraft, 2.30, 'Exporta maxAdmissibleDraft');
  assert.equal(restrictedEstimate.costPerCargoTon, 33.02, 'Break-Even encarecido a 33.02 $/MT');
  assert.ok(
    restrictedEstimate.costPerCargoTon > normalEstimate.costPerCargoTon,
    'El Break-Even con merma debe ser superior al nominal'
  );
  assert.equal(restrictedEstimate.nominalCostPerTon, 17.33, 'Conserva el costo por tonelada nominal de referencia');
});

// ============================================================================
// 4. FEEDBACK VISUAL Y RENDERIZADO REACTIVO EN INDEX.HTML Y CONVOYBUILDER.TSX
// ============================================================================

test('ConvoyBuilder.tsx renders reactive informative panel and replaces hard blocking with tonnage shedding', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // Panel informativo en vez de bloqueo duro
  assert.ok(
    convoySource.includes('Restricción por estiaje activa: Calado admisible limitado a'),
    'ConvoyBuilder.tsx debe incluir el texto informativo requerido de estiaje y calado admisible'
  );
  assert.ok(
    convoySource.includes('Carga total reducida automáticamente a'),
    'ConvoyBuilder.tsx debe indicar la carga total reducida automáticamente'
  );
  assert.ok(
    convoySource.includes('Merma:'),
    'ConvoyBuilder.tsx debe reflejar la merma de carga (deadfreight)'
  );
  assert.ok(
    convoySource.includes('Impacto Falso Flete (Break-Even)'),
    'ConvoyBuilder.tsx debe mostrar el impacto del falso flete en el incremento del Break-Even'
  );
  assert.ok(
    convoySource.includes('adjustedTonnage') && convoySource.includes('lostTonnage'),
    'ConvoyBuilder.tsx debe manejar adjustedTonnage y lostTonnage'
  );
});

test('index.html contains reactive panel and updates financial calculations with Tonnage Shedding', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.ok(
    indexHtml.includes('id="fluvial-tonnage-shedding-panel"'),
    'index.html debe contener el panel fluvial-tonnage-shedding-panel'
  );
  assert.ok(
    indexHtml.includes('Restricción por estiaje activa: Calado admisible limitado a'),
    'index.html debe formatear el mensaje de estiaje activo en updateFluvialCalculations'
  );
  assert.ok(
    indexHtml.includes('adjustedCapacityPerBarge') && indexHtml.includes('lostTonnage'),
    'index.html debe calcular adjustedCapacityPerBarge y lostTonnage'
  );
  assert.ok(
    indexHtml.includes('lightshipDraft = 0.55') && indexHtml.includes('designDraft = 3.66') && indexHtml.includes('TPC = 4.5'),
    'index.html debe implementar los parámetros hidrostáticos base (0.55m, 3.66m, 4.5 MT/cm)'
  );
});
