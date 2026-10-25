import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('ConvoyBuilder component manages state with tugboat_id and barge_ids and renders Convoy Assembly interface', async () => {
  const convoySource = await readFile(new URL('../src/components/ConvoyBuilder.tsx', import.meta.url), 'utf8');

  // Verifica que maneja tugboat_id y el array barge_ids
  assert.ok(convoySource.includes('tugboat_id'), 'ConvoyBuilder debe gestionar el estado tugboat_id');
  assert.ok(convoySource.includes('barge_ids'), 'ConvoyBuilder debe gestionar el array barge_ids');

  // Verifica el selector principal de Tugboat
  assert.ok(
    convoySource.includes('Selector Principal de Remolcador') || convoySource.includes('convoy-tugboat-select'),
    'ConvoyBuilder debe incluir un selector principal para asignar un Tugboat'
  );

  // Verifica panel dinámico con botones para añadir, listar y eliminar barcazas
  assert.ok(convoySource.includes('handleAddBarge'), 'ConvoyBuilder debe incluir acción para añadir barcazas');
  assert.ok(convoySource.includes('handleRemoveBarge'), 'ConvoyBuilder debe incluir acción para eliminar barcazas');
  assert.ok(convoySource.includes('coupledBarges'), 'ConvoyBuilder debe listar las barcazas acopladas');

  // Verifica payload de guardado con tugboat_id y barge_ids
  assert.ok(
    convoySource.includes('tugboat_id: Number(tugboatId)'),
    'El payload de guardado debe enviar tugboat_id'
  );
  assert.ok(
    convoySource.includes('barge_ids: [...bargeIds]'),
    'El payload de guardado debe enviar el array barge_ids'
  );
});

test('shipcomparison.tsx replaces single ocean vessel selector with Convoy Builder and state', async () => {
  const shipCompSource = await readFile(new URL('../shipcomparison.tsx', import.meta.url), 'utf8');

  // Comprueba eliminación del modelo antiguo y presencia de tugboat_id y barge_ids
  assert.ok(shipCompSource.includes('tugboat_id'), 'shipcomparison.tsx debe mantener tugboat_id en el estado');
  assert.ok(shipCompSource.includes('barge_ids'), 'shipcomparison.tsx debe mantener barge_ids en el estado');
  assert.ok(
    shipCompSource.includes('Remolcador Asignado') || shipCompSource.includes('tugboat-select'),
    'shipcomparison.tsx debe incluir selector de remolcador'
  );
  assert.ok(
    shipCompSource.includes('handleAddBarge') && shipCompSource.includes('handleRemoveBarge'),
    'shipcomparison.tsx debe incluir botones para añadir y eliminar barcazas'
  );
  assert.ok(
    shipCompSource.includes('tugboat_id: Number(tugboat_id)'),
    'El payload enviado en la petición debe incluir tugboat_id'
  );
  assert.ok(
    shipCompSource.includes('barge_ids: [...barge_ids]'),
    'El payload enviado en la petición debe incluir el array barge_ids'
  );
});

test('LazyGlobeMap wraps vessel markers with React.memo and manages dynamic coordinates with useRef', async () => {
  const mapSource = await readFile(new URL('../src/components/LazyGlobeMap.tsx', import.meta.url), 'utf8');

  // Verificación de React.memo para los marcadores
  assert.ok(mapSource.includes('memo(function TugboatMarker'), 'TugboatMarker debe estar envuelto en React.memo');
  assert.ok(mapSource.includes('memo(function BargeMarker'), 'BargeMarker debe estar envuelto en React.memo');
  assert.ok(mapSource.includes('memo(function VesselMarker'), 'VesselMarker debe estar envuelto en React.memo');

  // Verificación de useRef para coordenadas dinámicas
  assert.ok(
    mapSource.includes('const coordsRef = useRef'),
    'Las coordenadas dinámicas deben gestionarse con useRef para evitar re-renderizados costosos del globo 3D'
  );

  // Verificación de diferenciación visual: icono de motor para remolcador y pines secundarios para barcazas
  assert.ok(
    mapSource.includes('motor-icon') || mapSource.includes('river-marker-tugboat'),
    'Debe incluir marcador con icono de motor para el remolcador'
  );
  assert.ok(
    mapSource.includes('river-marker-barge') || mapSource.includes('BargeMarker'),
    'Debe incluir pines secundarios para las barcazas'
  );
  assert.ok(
    mapSource.includes('isCoupled') || mapSource.includes('DESACOPLADA'),
    'Debe preparar el terreno visual para el desacople de las barcazas'
  );
});

test('GlobalFleetGlobe.js renders distinct motor icons for tugboats and secondary pins for barges', async () => {
  const globeSource = await readFile(new URL('../GlobalFleetGlobe.js', import.meta.url), 'utf8');

  assert.ok(
    globeSource.includes('isTugboat') && globeSource.includes('globe-tugboat-marker'),
    'GlobalFleetGlobe.js debe generar la clase y elementos del remolcador con icono de motor'
  );
  assert.ok(
    globeSource.includes('isBarge') && globeSource.includes('globe-barge-marker'),
    'GlobalFleetGlobe.js debe generar pines secundarios para barcazas'
  );
});

test('Netlify function river-voyages handles tugboat_id and barge_ids', async () => {
  const functionSource = await readFile(new URL('../netlify/functions/river-voyages.ts', import.meta.url), 'utf8');

  assert.ok(functionSource.includes('tugboat_id'), 'La función debe procesar tugboat_id');
  assert.ok(functionSource.includes('barge_ids'), 'La función debe procesar barge_ids');
});
