import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cerebroSource = await readFile(new URL('../netlify/functions/cerebro-ia.js', import.meta.url), 'utf8');

test('1. Bug de Inyección de Flete (cerebro-ia.js): buildStrategicPrompt identifica #freight-sell y despacha eventos reales', async () => {
  // Eliminar imports de chatAssistant para ejecutar funciones puras de cerebro-ia
  const strippedSource = cerebroSource
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n');

  const { buildStrategicPrompt } = await import(
    `data:text/javascript;base64,${Buffer.from(strippedSource, 'utf8').toString('base64')}`
  );

  assert.equal(typeof buildStrategicPrompt, 'function', 'buildStrategicPrompt debe estar exportada');

  // Evaluar bloque fluvial con flete solicitado de $40
  const fluvialPromptResult = buildStrategicPrompt({
    isFluvial: true,
    pol: 'Corumbá',
    pod: 'Gran Rosario',
    freightSell: 40
  });

  assert.ok(fluvialPromptResult.isFluvial, 'Debe activar el bloque fluvial');
  assert.equal(fluvialPromptResult.freightSellId, 'freight-sell', 'Debe identificar el ID #freight-sell');
  assert.equal(fluvialPromptResult.freightVal, 40, 'Debe tomar los $40 pedidos');

  const promptText = String(fluvialPromptResult.prompt || fluvialPromptResult);
  assert.ok(
    promptText.includes("document.getElementById('freight-sell')"),
    'El prompt debe buscar el elemento #freight-sell'
  );
  assert.ok(
    promptText.includes("input.dispatchEvent(new Event('input', { bubbles: true }))"),
    'Debe despachar evento input con bubbles: true'
  );
  assert.ok(
    promptText.includes("input.dispatchEvent(new Event('change', { bubbles: true }))"),
    'Debe despachar evento change con bubbles: true'
  );

  // Verificación del template de timeout y código inyectado
  const expectedSnippet = "const input = document.getElementById('freight-sell'); if(input) { input.value = FREIGHT_VAL; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }";
  assert.ok(
    promptText.includes(expectedSnippet) || fluvialPromptResult.scriptTemplate.includes(expectedSnippet),
    'Debe incluir el snippet exacto con FREIGHT_VAL'
  );

  // Probar simulación en VM simulando el DOM
  let inputEventDispatched = false;
  let changeEventDispatched = false;
  let assignedValue = null;

  const mockInput = {
    value: 19.00,
    dispatchEvent: (ev) => {
      if (ev.type === 'input' && ev.bubbles === true) inputEventDispatched = true;
      if (ev.type === 'change' && ev.bubbles === true) changeEventDispatched = true;
    }
  };

  const context = {
    document: {
      getElementById: (id) => (id === 'freight-sell' ? mockInput : null)
    },
    Event: class {
      constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = Boolean(opts.bubbles);
      }
    },
    FREIGHT_VAL: 40
  };

  vm.createContext(context);
  vm.runInContext(fluvialPromptResult.scriptTemplate, context);

  assert.equal(mockInput.value, 40, 'El valor del input debe cambiar de 19 a 40');
  assert.equal(inputEventDispatched, true, 'El evento input debe haberse emitido');
  assert.equal(changeEventDispatched, true, 'El evento change debe haberse emitido');
});

test('2. Bug del Mapa (Líneas Geodésicas): index.html detecta Rutas Fluviales y provee coordenadas de corredor GeoJSON', () => {
  assert.ok(
    indexHtml.includes('function isFluvialRoute'),
    'index.html debe implementar la función isFluvialRoute'
  );
  assert.ok(
    indexHtml.includes('HIDROVIA_PARANA_PARAGUAY_CORRIDOR_COORDINATES'),
    'index.html debe definir HIDROVIA_PARANA_PARAGUAY_CORRIDOR_COORDINATES'
  );
  assert.ok(
    indexHtml.includes('MISSISSIPPI_CORRIDOR_COORDINATES'),
    'index.html debe definir MISSISSIPPI_CORRIDOR_COORDINATES'
  );
  assert.ok(
    indexHtml.includes('function buildFluvialRouteSegment'),
    'index.html debe implementar buildFluvialRouteSegment'
  );
  assert.ok(
    indexHtml.includes('function getFluvialCorridorGeoJSON'),
    'index.html debe implementar getFluvialCorridorGeoJSON'
  );
  assert.ok(
    indexHtml.includes('L.geoJSON'),
    'index.html debe soportar renderizado de GeoJSON con L.geoJSON'
  );
});

test('3. Trazado Fluvial en VM: Corumbá a Gran Rosario genera corredor fluvial sin trazar línea geodésica recta', () => {
  // Extraer las funciones del corredor fluvial de index.html y ejecutarlas en VM
  const startIdx = indexHtml.indexOf('const HIDROVIA_PARANA_PARAGUAY_CORRIDOR_COORDINATES');
  const endIdx = indexHtml.indexOf('window.MISSISSIPPI_CORRIDOR_COORDINATES = MISSISSIPPI_CORRIDOR_COORDINATES;');
  assert.ok(startIdx > 0 && endIdx > startIdx, 'Debe localizar el bloque de corredor fluvial en index.html');

  const snippet = indexHtml.slice(startIdx, endIdx + 76);

  const context = {
    haversine: (lat1, lon1, lat2, lon2) => {
      const R = 3440.065;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    },
    document: {
      getElementById: () => null
    },
    window: {},
    console: { log: () => {}, warn: () => {} }
  };

  vm.createContext(context);
  vm.runInContext(snippet, context);

  // 1. Detección de ruta fluvial
  const isFluvial = context.isFluvialRoute(
    { name: 'Corumbá', lat: -19.0067, lon: -57.6533 },
    { name: 'Gran Rosario', lat: -32.9468, lon: -60.6393 }
  );
  assert.equal(isFluvial, true, 'Corumbá a Gran Rosario debe ser detectada como Ruta Fluvial');

  // 2. Generación del segmento fluvial
  const segment = context.buildFluvialRouteSegment(
    { name: 'Corumbá', lat: -19.0067, lon: -57.6533 },
    { name: 'Gran Rosario', lat: -32.9468, lon: -60.6393 }
  );

  assert.equal(segment.isFluvial, true, 'El segmento debe marcar isFluvial');
  assert.equal(segment.corridorKey, 'hidrovia_parana_paraguay', 'Debe seleccionar el corredor Hidrovía Paraná-Paraguay');
  assert.ok(segment.coordinates.length > 20, 'Debe contener más de 20 coordenadas siguiendo el cauce del río');
  assert.ok(segment.distance > 800, 'La distancia por el río debe ser superior a 800 millas náuticas');

  // 3. Verificación del objeto GeoJSON
  assert.equal(segment.geoJSON.type, 'Feature');
  assert.equal(segment.geoJSON.geometry.type, 'LineString');
  assert.equal(segment.geoJSON.geometry.coordinates.length, segment.coordinates.length);
  // En GeoJSON las coordenadas son [lon, lat]
  assert.ok(Math.abs(segment.geoJSON.geometry.coordinates[0][0] - (-57.6533)) < 0.1);
});

test('4. Trazado Fluvial en VM: Misisipi (St. Louis a New Orleans) genera corredor fluvial Misisipi', () => {
  const startIdx = indexHtml.indexOf('const HIDROVIA_PARANA_PARAGUAY_CORRIDOR_COORDINATES');
  const endIdx = indexHtml.indexOf('window.MISSISSIPPI_CORRIDOR_COORDINATES = MISSISSIPPI_CORRIDOR_COORDINATES;');
  const snippet = indexHtml.slice(startIdx, endIdx + 76);

  const context = {
    haversine: (lat1, lon1, lat2, lon2) => {
      const R = 3440.065;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    },
    document: {
      getElementById: () => null
    },
    window: {},
    console: { log: () => {}, warn: () => {} }
  };

  vm.createContext(context);
  vm.runInContext(snippet, context);

  const isFluvial = context.isFluvialRoute(
    { name: 'St. Louis / Granite City', lat: 38.6270, lon: -90.1994 },
    { name: 'New Orleans / NOLA', lat: 29.9511, lon: -90.0715 }
  );
  assert.equal(isFluvial, true, 'St. Louis a NOLA debe ser detectada como Ruta Fluvial');

  const corridorKey = context.getFluvialCorridorKey(
    { name: 'St. Louis', lat: 38.6270, lon: -90.1994 },
    { name: 'New Orleans', lat: 29.9511, lon: -90.0715 }
  );
  assert.equal(corridorKey, 'mississippi', 'Debe seleccionar el corredor mississippi');

  const segment = context.buildFluvialRouteSegment(
    { name: 'St. Louis', lat: 38.6270, lon: -90.1994 },
    { name: 'New Orleans', lat: 29.9511, lon: -90.0715 }
  );

  assert.equal(segment.isFluvial, true);
  assert.equal(segment.corridorKey, 'mississippi');
  assert.ok(segment.coordinates.length > 15, 'Debe contener los meandros del río Misisipi');
});
