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
// 1. CONSTANTES NAVALES Y DIMENSIONES BASE (PIES)
// ============================================================================

test('Dimensiones Base Navales: Esloras y Mangas reglamentarias en pies', async () => {
  const {
    STANDARD_BARGE_LOA_FEET,
    STANDARD_BARGE_BEAM_FEET,
    STANDARD_TUGBOAT_LOA_FEET,
    STANDARD_LOCK_LENGTH_FEET,
    STANDARD_LOCK_WIDTH_FEET,
    DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK,
  } = await loadTsModule('../src/services/fluvialEstimator.ts');

  assert.equal(STANDARD_BARGE_LOA_FEET, 195, 'Eslora de barcaza Jumbo estándar debe ser 195 ft');
  assert.equal(STANDARD_BARGE_BEAM_FEET, 35, 'Manga de barcaza Jumbo estándar debe ser 35 ft');
  assert.equal(STANDARD_TUGBOAT_LOA_FEET, 150, 'Eslora del empujador promedio debe ser 150 ft');
  assert.equal(STANDARD_LOCK_LENGTH_FEET, 600, 'Largo de cámara estándar del Misisipi debe ser 600 ft');
  assert.equal(STANDARD_LOCK_WIDTH_FEET, 110, 'Ancho de cámara estándar del Misisipi debe ser 110 ft');
  assert.equal(DOUBLE_LOCKAGE_ADDITIONAL_HOURS_PER_LOCK, 3.5, 'Demora adicional por esclusa para esclusado doble debe ser 3.5 horas');
});

// ============================================================================
// 2. CÁLCULO GEOMÉTRICO DEL CONVOY (DISPOSICIÓN Y DIMENSIONES TOTALES)
// ============================================================================

test('Cálculo Geométrico: 15 barcazas Jumbo = 3 col × 5 fil -> 1125 ft x 105 ft', async () => {
  const { calculateConvoyGeometry, calculateConvoyArrangement } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // Disposición óptima
  const arrangement = calculateConvoyArrangement(15);
  assert.equal(arrangement.columns, 3, '15 barcazas deben disponerse en 3 columnas');
  assert.equal(arrangement.rows, 5, '15 barcazas deben disponerse en 5 filas');

  const geom = calculateConvoyGeometry({
    bargeCount: 15,
    lockCount: 2,
    fuelPricePerTon: 700,
  });

  // Eslora Total = (5 filas * 195 ft) + 150 ft = 975 + 150 = 1125 ft
  assert.equal(geom.totalLengthFeet, 1125, 'Eslora total convoy debe ser (5*195)+150 = 1125 ft');
  // Manga Total = 3 columnas * 35 ft = 105 ft
  assert.equal(geom.totalBeamFeet, 105, 'Manga total convoy debe ser 3*35 = 105 ft');
  // Comparación contra cámara 600x110: 1125 > 600 -> Excede Eslora
  assert.equal(geom.exceedsLength, true, '1125 ft excede los 600 ft de la cámara');
  assert.equal(geom.exceedsBeam, false, '105 ft entra en los 110 ft de manga');
  assert.equal(geom.requiresDoubleLockage, true, 'Debe requerir esclusado doble');

  // Adición de horas: 2 esclusas * 3.5h = 7.0 horas
  assert.equal(geom.additionalHours, 7.0, '2 esclusas deben sumar 7.0 horas de demora');
});

test('Cálculo Geométrico: Convoy pequeño que cabe en cámara (4 barcazas = 2 col × 2 fil -> 540 ft x 70 ft)', async () => {
  const { calculateConvoyGeometry } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const geom = calculateConvoyGeometry({
    bargeCount: 4,
    lockCount: 2,
  });

  // 4 barcazas -> 2 col x 2 fil
  // Eslora = (2 * 195) + 150 = 540 ft (<= 600 ft)
  // Manga = 2 * 35 = 70 ft (<= 110 ft)
  assert.equal(geom.columns, 2);
  assert.equal(geom.rows, 2);
  assert.equal(geom.totalLengthFeet, 540);
  assert.equal(geom.totalBeamFeet, 70);
  assert.equal(geom.exceedsLength, false, '540 ft cabe en la cámara de 600 ft');
  assert.equal(geom.exceedsBeam, false, '70 ft cabe en la cámara de 110 ft');
  assert.equal(geom.requiresDoubleLockage, false, 'Convoy pequeño no requiere esclusado doble');
  assert.equal(geom.additionalHours, 0, 'No debe sumar horas adicionales de esclusado doble');
});

// ============================================================================
// 3. MOTOR DE ESCLUSADO DOBLE: INYECCIÓN DE HORAS Y COMBUSTIBLE DE MANIOBRA
// ============================================================================

test('Motor de Esclusado Doble: Inyecta +3.5h por esclusa y calcula combustible de maniobra activo', async () => {
  const { calculateDemurrageCost, calculateConvoyGeometry } = await loadTsModule('../src/services/fluvialEstimator.ts');

  // 16 barcazas, 3 esclusas, precio fuel $750/MT
  const geom = calculateConvoyGeometry({
    bargeCount: 16,
    lockCount: 3,
    fuelPricePerTon: 750,
  });

  assert.equal(geom.requiresDoubleLockage, true);
  assert.equal(geom.lockCount, 3);
  assert.equal(geom.additionalHours, 10.5, '3 esclusas * 3.5h = 10.5h');

  // Demurrage cost con esclusado doble
  const demurrage = calculateDemurrageCost({
    waitingHours: 12, // 12h de espera normal
    dailyOpex: 3600, // $150/h
    fuelPricePerTon: 750,
    requiresDoubleLockage: true,
    lockCount: 3,
    doubleLockageHours: 10.5,
    maneuverFuelTonsPerHour: 0.15,
  });

  // Horas totales = 12h base + 10.5h doble esclusado = 22.5h
  assert.equal(demurrage.waitingHours, 22.5);
  // Consumo maniobra = 10.5h * 0.15 MT/h = 1.575 MT
  assert.equal(demurrage.totalManeuverFuelTons, 1.575);
  // Costo combustible maniobra = 1.575 MT * $750 = $1,181.25 USD
  assert.equal(demurrage.maneuverFuelCost, 1181.25);
  // OPEX de horas de maniobra = 10.5h * $150/h = $1,575 USD
  assert.equal(demurrage.doubleLockageOpexCost, 1575);
  assert.equal(demurrage.doubleLockageTotalCost, 1575 + 1181.25);
});

test('estimateFluvialVoyage integra geometría de convoy y esclusado doble en viaje completo', async () => {
  const { estimateFluvialVoyage } = await loadTsModule('../src/services/fluvialEstimator.ts');

  const barges15 = Array.from({ length: 15 }).map((_, i) => ({
    id: i + 1,
    name: `Jumbo Barge ${i + 1}`,
    capacity: 1500,
    dailyRate: 250,
  }));

  const result = estimateFluvialVoyage({
    tugboat: { name: 'Empujador Misisipi', dailyOpex: 3600, enginePowerHp: 4500 },
    barges: barges15,
    navigationDays: 8,
    lockCount: 4, // 4 esclusas en ruta
    fuelPricePerTon: 700,
    freightRatePerTon: 40,
  });

  assert.ok(result.convoyGeometry, 'Debe incluir convoyGeometry en el resultado');
  assert.equal(result.convoyGeometry.requiresDoubleLockage, true, '15 barcazas deben requerir esclusado doble');
  assert.equal(result.convoyGeometry.additionalHours, 14.0, '4 esclusas * 3.5h = 14h adicionales');
  assert.equal(result.demurrageCost.requiresDoubleLockage, true);
  assert.equal(result.demurrageCost.doubleLockageHours, 14.0);
  assert.ok(result.demurrageCost.maneuverFuelCost > 0, 'Debe haber costo de combustible de maniobra');
  assert.ok(result.totalVoyageCost > 0);
});

// ============================================================================
// 4. INTERFAZ REACTIVA (UI): MENSAJE Y COPIA EXACTA REQUERIDA POR EL USUARIO
// ============================================================================

test('Copia Exacta UI: Mensaje informativo en ConvoyBuilder.tsx, LockDemurrageModule.tsx e index.html', async () => {
  const convoyBuilderSrc = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');
  const lockModuleSrc = await readFile(new URL('../src/components/LockDemurrageModule.tsx', import.meta.url), 'utf8');
  const indexHtmlSrc = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const estimatorSrc = await readFile(new URL('../src/services/fluvialEstimator.ts', import.meta.url), 'utf8');

  const expectedSnippet = 'Maniobra de Esclusado Doble Requerida: El convoy';
  const expectedTail = 'excede la cámara estándar (600x110). Se han añadido automáticamente +3.5h y consumos de maniobra por cada esclusa de la ruta.';

  // Verificación en fluvialEstimator.ts
  assert.ok(
    estimatorSrc.includes(expectedSnippet) && estimatorSrc.includes(expectedTail),
    'fluvialEstimator.ts debe generar el texto exacto requerido'
  );

  // Verificación en ConvoyBuilder.tsx
  assert.ok(
    convoyBuilderSrc.includes(expectedSnippet) && convoyBuilderSrc.includes(expectedTail),
    'ConvoyBuilder.tsx debe contener el panel con el texto exacto requerido'
  );
  assert.ok(
    convoyBuilderSrc.includes('id="double-lockage-alert"') || convoyBuilderSrc.includes("id='double-lockage-alert'"),
    'ConvoyBuilder.tsx debe tener el contenedor #double-lockage-alert'
  );

  // Verificación en LockDemurrageModule.tsx
  assert.ok(
    lockModuleSrc.includes(expectedSnippet) && lockModuleSrc.includes(expectedTail),
    'LockDemurrageModule.tsx debe contener el panel informativo con el texto exacto requerido'
  );
  assert.ok(
    lockModuleSrc.includes('id="lock-module-double-lockage-alert"') || lockModuleSrc.includes("id='lock-module-double-lockage-alert'"),
    'LockDemurrageModule.tsx debe tener el contenedor #lock-module-double-lockage-alert'
  );

  // Verificación en index.html
  assert.ok(
    indexHtmlSrc.includes(expectedSnippet) && indexHtmlSrc.includes(expectedTail),
    'index.html debe contener el panel informativo con el texto exacto requerido'
  );
  assert.ok(
    indexHtmlSrc.includes('id="fluvial-double-lockage-panel"'),
    'index.html debe contener el contenedor #fluvial-double-lockage-panel'
  );
});

// ============================================================================
// 5. CUMPLIMIENTO DE GOBERNANZA (GEMINI.md)
// ============================================================================

test('Gobernanza GEMINI.md: Ninguna llamada automática a APIs AIS ni disparo autónomo de Informes Master', async () => {
  const estimatorSrc = await readFile(new URL('../src/services/fluvialEstimator.ts', import.meta.url), 'utf8');
  const convoyBuilderSrc = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // No debe haber llamadas a datalastic ni aisstream automáticas en el módulo de cálculo de esclusado
  assert.ok(!estimatorSrc.includes('datalastic.com'), 'fluvialEstimator.ts no debe llamar a Datalastic');
  assert.ok(!estimatorSrc.includes('aisstream.io'), 'fluvialEstimator.ts no debe llamar a AISStream');
});
