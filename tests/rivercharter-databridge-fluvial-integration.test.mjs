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

test('1. Bloque 1 (Rutas y Riesgos): Botón Consultar DataBridge Alertas de Estiaje y ajuste de min_water_level', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica que existe el botón con el texto exacto
  assert.ok(
    indexHtml.includes('id="btn-databridge-estiaje"'),
    'Debe existir el botón id="btn-databridge-estiaje"'
  );
  assert.ok(
    indexHtml.includes('Consultar DataBridge: Alertas de Estiaje'),
    'Debe contener la etiqueta de botón "Consultar DataBridge: Alertas de Estiaje"'
  );

  // Verifica la función que consulta el riesgo hidrológico y ajusta min_water_level
  assert.ok(
    indexHtml.includes('window.consultarDataBridgeAlertasEstiaje = async function'),
    'Debe existir window.consultarDataBridgeAlertasEstiaje'
  );
  assert.ok(
    indexHtml.includes('minWater') && indexHtml.includes('min_water_level'),
    'Debe ajustar el input min_water_level automáticamente'
  );

  // Verifica discriminación entre cuenca del Misisipi e Hidrovía Paraná-Paraguay
  assert.ok(
    indexHtml.includes('isMisisipi') && indexHtml.includes('2.74') && indexHtml.includes('2.60'),
    'Debe ajustar a 2.74m para Misisipi y 2.60m para Hidrovía Paraná-Paraguay'
  );
});

test('2. Bloque 2 (Ingeniería de Convoy): Toggle rápido Estándar Misisipi (Jumbo) vs Estándar LatAm (Súper Jumbo)', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // Verifica que el toggle rápido existe en la UI de ConvoyBuilder
  assert.ok(
    convoySource.includes('id="btn-toggle-standard-mississippi"'),
    'Debe existir el botón id="btn-toggle-standard-mississippi"'
  );
  assert.ok(
    convoySource.includes('id="btn-toggle-standard-latam"'),
    'Debe existir el botón id="btn-toggle-standard-latam"'
  );
  assert.ok(
    convoySource.includes('Estándar Misisipi (Jumbo)'),
    'Debe incluir la opción Estándar Misisipi (Jumbo)'
  );
  assert.ok(
    convoySource.includes('Estándar LatAm (Súper Jumbo)'),
    'Debe incluir la opción Estándar LatAm (Súper Jumbo)'
  );

  // Verifica importación directa desde DataBridge y configuración de arreglo dinámico
  assert.ok(
    convoySource.includes('DATABRIDGE_FLUVIAL_STANDARDS'),
    'Debe importar DATABRIDGE_FLUVIAL_STANDARDS'
  );
  assert.ok(
    convoySource.includes('handleApplyBargeStandard'),
    'Debe gestionar handleApplyBargeStandard para configurar barcazas sin introducirlas a mano'
  );
  assert.ok(
    convoySource.includes('capacityMt') && convoySource.includes('dynamicDraftMeters'),
    'Debe configurar capacidades y calados dinámicos'
  );
});

test('3. Bloque 3 (Costes Intermodales): Botón Sincronizar Tarifas con Costo de Terminal y Peajes Internacionales', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica botón Sincronizar Tarifas
  assert.ok(
    indexHtml.includes('id="btn-sync-databridge-tariffs"'),
    'Debe existir el botón id="btn-sync-databridge-tariffs"'
  );
  assert.ok(
    indexHtml.includes('Sincronizar Tarifas'),
    'Debe incluir el texto "Sincronizar Tarifas"'
  );

  // Verifica función sincronizadora
  assert.ok(
    indexHtml.includes('window.sincronizarTarifasDataBridge = async function'),
    'Debe existir window.sincronizarTarifasDataBridge'
  );

  // Verifica autocompletado de Costo de Terminal y Peajes Internacionales (Vía Navegable Troncal)
  assert.ok(
    indexHtml.includes('Costo de Terminal'),
    'Debe contener campo y label de Costo de Terminal'
  );
  assert.ok(
    indexHtml.includes('Peajes Internacionales'),
    'Debe contener campo y label de Peajes Internacionales'
  );
  assert.ok(
    indexHtml.includes('Vía Navegable Troncal'),
    'Debe hacer referencia a la Vía Navegable Troncal'
  );
  assert.ok(
    indexHtml.includes('Automatización EE. UU.'),
    'Debe contemplar automatización de EE. UU. vs sobrecostos de Sudamérica'
  );
});

test('4. Bloques 4 y 5 (Tiempos Sincro-modales): Selector de nodo de trasbordo con demoras y tramo terrestre/ferroviario', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica existencia del selector
  assert.ok(
    indexHtml.includes('id="fluvial-transshipment-node"'),
    'Debe existir el selector id="fluvial-transshipment-node"'
  );
  assert.ok(
    indexHtml.includes('Gran Rosario'),
    'Debe incluir el nodo Gran Rosario'
  );
  assert.ok(
    indexHtml.includes('Miritituba'),
    'Debe incluir el nodo Miritituba'
  );

  // Verifica campos de demoras por carga/descarga y tiempo de tramo terrestre o ferroviario
  assert.ok(
    indexHtml.includes('id="fluvial-handling-delay-days"'),
    'Debe incluir campo id="fluvial-handling-delay-days" para días de demora por carga/descarga'
  );
  assert.ok(
    indexHtml.includes('id="fluvial-land-transit-days"'),
    'Debe incluir campo id="fluvial-land-transit-days" para tiempo de tramo terrestre o ferroviario'
  );

  // Verifica función conectada a DataBridge
  assert.ok(
    indexHtml.includes('window.seleccionarNodoTrasbordoDataBridge'),
    'Debe implementar window.seleccionarNodoTrasbordoDataBridge'
  );
});

test('5. Bloque 7 (Mercado): Micro-widget minimalista de solo lectura con Flete Fluvial Promedio', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica existencia del micro-widget minimalista
  assert.ok(
    indexHtml.includes('id="fluvial-market-micro-widget"'),
    'Debe existir id="fluvial-market-micro-widget"'
  );
  assert.ok(
    indexHtml.includes('Flete Fluvial Promedio'),
    'Debe mostrar la etiqueta "Flete Fluvial Promedio"'
  );
  assert.ok(
    indexHtml.includes('id="fluvial-avg-freight-display"'),
    'Debe existir id="fluvial-avg-freight-display" para el valor del flete'
  );
  assert.ok(
    indexHtml.includes('Solo Lectura'),
    'Debe indicar que es de solo lectura'
  );

  // Asegura que los paneles oceánicos pesados sigan ocultos
  assert.ok(
    indexHtml.includes('id="market-intel-dashboard" data-oceanic="true" class="hidden"'),
    'Market intel oceánico debe permanecer estrictamente oculto'
  );
  assert.ok(
    indexHtml.includes('id="baltic-spot-reference-card" data-oceanic="true" class="hidden"'),
    'Espejo Baltic Spot oceánico debe permanecer estrictamente oculto'
  );
});

test('6. Bloque 8 (Negociación): Motor financiero cruza fletes de venta con OPEX motor + barcazas + peajes intermodales', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Verifica que updateFluvialCalculations cruza flete de venta con OPEX motor + barcazas + peajes intermodales
  assert.ok(
    indexHtml.includes('totalMotorCost = tugTotalOpex + totalBunkerCost'),
    'Debe consolidar totalMotorCost (OPEX motor + combustible)'
  );
  assert.ok(
    indexHtml.includes('bargesTotalCapex'),
    'Debe computar el costo de barcazas'
  );
  assert.ok(
    indexHtml.includes('totalIntermodalTolls = pdaLocks + pdaTolls + pdaPilotage + transshipmentTariff') ||
    indexHtml.includes('pdaTolls + pdaPilotage + transshipmentTariff'),
    'Debe incluir los peajes intermodales importados de DataBridge'
  );
  assert.ok(
    indexHtml.includes('grossRevenue - totalConvoyCost'),
    'Debe calcular netProfit restando totalConvoyCost de grossRevenue'
  );
  assert.ok(
    indexHtml.includes('res-net-profit-charterer'),
    'Debe exponer el Beneficio Neto en res-net-profit-charterer'
  );
});

test('7. Netlify function databridge-fluvial-intel y databridgeFluvialService integran endpoints y catálogos', async () => {
  const functionSource = await readFile(new URL('../netlify/functions/databridge-fluvial-intel.ts', import.meta.url), 'utf8');

  assert.ok(
    functionSource.includes('mississippi') && functionSource.includes('hidrovia_parana_paraguay'),
    'La función debe gestionar rutas Misisipi e Hidrovía Paraná-Paraguay'
  );
  assert.ok(
    functionSource.includes('mississippi_jumbo') && functionSource.includes('latam_super_jumbo'),
    'La función debe gestionar estándares Misisipi Jumbo y LatAm Súper Jumbo'
  );
  assert.ok(
    functionSource.includes('gran_rosario') && functionSource.includes('miritituba'),
    'La función debe gestionar nodos de trasbordo Gran Rosario y Miritituba'
  );

  const {
    DATABRIDGE_FLUVIAL_STANDARDS,
    DATABRIDGE_FLUVIAL_ROUTES,
    detectFluvialCorridor,
  } = await loadTsModule('../src/services/databridgeFluvialService.ts');

  assert.equal(DATABRIDGE_FLUVIAL_STANDARDS.mississippi_jumbo.capacityMt, 1500);
  assert.equal(DATABRIDGE_FLUVIAL_STANDARDS.latam_super_jumbo.capacityMt, 2500);
  assert.equal(DATABRIDGE_FLUVIAL_ROUTES.mississippi.minWaterLevel, 2.74);
  assert.equal(DATABRIDGE_FLUVIAL_ROUTES.hidrovia_parana_paraguay.minWaterLevel, 2.60);

  assert.equal(detectFluvialCorridor('St. Louis to New Orleans'), 'mississippi');
  assert.equal(detectFluvialCorridor('Puerto Rosario a Corumbá'), 'hidrovia_parana_paraguay');
});
