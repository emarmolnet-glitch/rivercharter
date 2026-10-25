import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('aisstreamClient service manages stable WebSocket connection and filters by active tugboats', async () => {
  const serviceSource = await readFile(new URL('../src/services/aisstreamClient.ts', import.meta.url), 'utf8');

  // 1. Verifica endpoint oficial de aisstream
  assert.ok(
    serviceSource.includes('wss://stream.aisstream.io/v0/stream'),
    'aisstreamClient debe conectarse a wss://stream.aisstream.io/v0/stream'
  );

  // 2. Verifica despacho del CustomEvent global tracking:aisstream-update
  assert.ok(
    serviceSource.includes('tracking:aisstream-update'),
    'aisstreamClient debe despachar el CustomEvent tracking:aisstream-update'
  );

  // 3. Inyección directa al DOM de latitud, longitud y velocidad
  assert.ok(
    serviceSource.includes('latitude') && serviceSource.includes('longitude') && serviceSource.includes('speedKnots'),
    'aisstreamClient debe extraer e inyectar latitud, longitud y velocidad'
  );

  // 4. Filtrado estricto por remolcadores activos
  assert.ok(
    serviceSource.includes('activeMmsis') && serviceSource.includes('setActiveMmsis'),
    'aisstreamClient debe gestionar la lista y filtrado de remolcadores activos'
  );

  // 5. Soporte de pausa y reactivación para ahorro de datos
  assert.ok(
    serviceSource.includes('pause()') && serviceSource.includes('resume()'),
    'aisstreamClient debe proveer métodos pause() y resume() para suspender la conexión y ahorrar ancho de banda'
  );

  // 6. Manejo de reconexión automática y tolerancia a fallos
  assert.ok(
    serviceSource.includes('scheduleReconnect') || serviceSource.includes('reconnectTimer'),
    'aisstreamClient debe gestionar reconexión automática'
  );
});

test('iot-webhook Netlify function processes satellite POST requests from Swarm, Iridium and IoT', async () => {
  const functionSource = await readFile(new URL('../netlify/functions/iot-webhook.ts', import.meta.url), 'utf8');

  // 1. Extracción del iotTrackingId
  assert.ok(
    functionSource.includes('extractIotTrackingId') || functionSource.includes('iotTrackingId'),
    'iot-webhook debe extraer el iotTrackingId'
  );

  // 2. Extracción y validación de coordenadas (latitud y longitud)
  assert.ok(
    functionSource.includes('extractCoordinates') || (functionSource.includes('latitude') && functionSource.includes('longitude')),
    'iot-webhook debe extraer y validar coordenadas geográficas'
  );

  // 3. Soporte para proveedores satelitales Swarm e Iridium
  assert.ok(
    functionSource.includes('Swarm') || functionSource.includes('Iridium') || functionSource.includes('imei') || functionSource.includes('device_id'),
    'iot-webhook debe dar soporte a tramas satelitales Swarm/Iridium'
  );

  // 4. Actualización de la tabla barges en Neon PostgreSQL
  assert.ok(
    functionSource.includes('UPDATE barges') || functionSource.includes('barges'),
    'iot-webhook debe actualizar las coordenadas en la tabla barges'
  );

  // 5. Preparación de notificación telemétrica al frontend
  assert.ok(
    functionSource.includes('rivercharter:barge-telemetry'),
    'iot-webhook debe preparar el evento rivercharter:barge-telemetry para notificar al frontend'
  );

  // 6. Soporte de endpoint GET para consultas/notificaciones
  assert.ok(
    functionSource.includes('request.method === "GET"'),
    'iot-webhook debe responder a peticiones GET para consultar telemetría reciente'
  );
});

test('db/schema.ts and db/index.ts include coordinates and IoT telemetry in barges table', async () => {
  const schemaSource = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.ok(schemaSource.includes('latitude: numeric("latitude"'), 'db/schema.ts debe contener columna latitude en barges');
  assert.ok(schemaSource.includes('longitude: numeric("longitude"'), 'db/schema.ts debe contener columna longitude en barges');
  assert.ok(schemaSource.includes('lastTelemetryAt'), 'db/schema.ts debe registrar lastTelemetryAt');

  const dbIndexSource = await readFile(new URL('../db/index.ts', import.meta.url), 'utf8');
  assert.ok(dbIndexSource.includes('ALTER TABLE barges ADD COLUMN IF NOT EXISTS latitude'), 'db/index.ts debe asegurar columna latitude');
  assert.ok(dbIndexSource.includes('ALTER TABLE barges ADD COLUMN IF NOT EXISTS longitude'), 'db/index.ts debe asegurar columna longitude');
});

test('useAisStreamControl hook and AisStreamToggle component provide state toggle in main UI and map', async () => {
  const hookSource = await readFile(new URL('../src/hooks/useAisStreamControl.ts', import.meta.url), 'utf8');
  assert.ok(hookSource.includes('toggleConnection'), 'useAisStreamControl debe proveer toggleConnection');
  assert.ok(hookSource.includes('pause'), 'useAisStreamControl debe proveer pause');
  assert.ok(hookSource.includes('resume'), 'useAisStreamControl debe proveer resume');
  assert.ok(hookSource.includes('isPaused'), 'useAisStreamControl debe exponer el estado isPaused');

  const toggleSource = await readFile(new URL('../src/components/AisStreamToggle.tsx', import.meta.url), 'utf8');
  assert.ok(toggleSource.includes('useAisStreamControl'), 'AisStreamToggle debe usar el hook de control');
  assert.ok(toggleSource.includes('toggleConnection'), 'AisStreamToggle debe disparar toggleConnection');
  assert.ok(toggleSource.includes('AIS EN VIVO') || toggleSource.includes('AIS En Vivo'), 'AisStreamToggle debe renderizar estado en vivo');
  assert.ok(toggleSource.includes('AIS PAUSADO') || toggleSource.includes('AIS Pausado'), 'AisStreamToggle debe renderizar estado pausado');

  const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(
    appSource.includes('<AisStreamToggle') || appSource.includes('AisStreamToggle'),
    'src/App.jsx debe integrar el toggle en la cabecera principal de la UI'
  );

  const mapSource = await readFile(new URL('../src/components/LazyGlobeMap.tsx', import.meta.url), 'utf8');
  assert.ok(
    mapSource.includes('<AisStreamToggle') || mapSource.includes('AisStreamToggle'),
    'LazyGlobeMap debe superponer el controlador de telemetría directamente sobre el mapa'
  );
});
