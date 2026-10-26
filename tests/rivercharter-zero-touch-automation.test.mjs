import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Zero-Touch Automation: Definición y exposición de applyDataBridgePayload en index.html', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.ok(
    indexHtml.includes('window.applyDataBridgePayload = function'),
    'Debe definir window.applyDataBridgePayload en index.html'
  );
  assert.ok(
    indexHtml.includes('bunker_price') && indexHtml.includes('draft_restriction_factor'),
    'Debe soportar bunker_price y draft_restriction_factor en applyDataBridgePayload'
  );
  assert.ok(
    indexHtml.includes('Cálculo Completado (Datos en Tiempo Real)'),
    'Debe incluir el texto de feedback visual y toast "Cálculo Completado (Datos en Tiempo Real)"'
  );
});

test('Zero-Touch Automation: Binding de bunker_price y draft_restriction_factor, cálculo y feedback', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Extraer con exactitud las funciones updateFluvialCalculations y applyDataBridgePayload
  const startIndexFluvial = indexHtml.indexOf('window.updateFluvialCalculations = function() {');
  const endIndexFluvial = indexHtml.indexOf('window.applyDataBridgePayload = function');
  assert.ok(startIndexFluvial !== -1 && endIndexFluvial !== -1, 'Debe localizar el bloque window.updateFluvialCalculations');
  const fluvialCode = indexHtml.slice(startIndexFluvial, endIndexFluvial).trim();

  const startIndexPayload = indexHtml.indexOf('window.applyDataBridgePayload = function');
  const endIndexPayload = indexHtml.indexOf('window.applyRiverCharterVisibility = function');
  assert.ok(startIndexPayload !== -1 && endIndexPayload !== -1, 'Debe localizar el bloque window.applyDataBridgePayload');
  const payloadCode = indexHtml.slice(startIndexPayload, endIndexPayload).trim();

  const elements = new Map();
  const getOrCreate = (id, defaultVal = '') => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: defaultVal,
        textContent: defaultVal,
        innerHTML: defaultVal,
        attributes: new Map(),
        dataset: {},
        classList: {
          add(c) {},
          remove(c) {},
          contains(c) { return false; }
        },
        setAttribute(k, v) { this.attributes.set(k, v); },
        getAttribute(k) { return this.attributes.get(k); },
        querySelector() { return null; },
        dispatchEvent(e) {}
      });
    }
    return elements.get(id);
  };

  // Mock DOM elements
  getOrCreate('fluvial-fuel-price', '780');
  getOrCreate('price-port', '830');
  getOrCreate('cargo-qty', '10000');
  getOrCreate('vessel-dwt', '10000');
  getOrCreate('port-pol', 'Corumbá');
  getOrCreate('port-pod', 'Nueva Palmira');
  getOrCreate('freight-sell', '38.5');
  getOrCreate('dist-laden', '600');
  getOrCreate('dist-ballast', '0');
  getOrCreate('fluvial-opex-tugboat', '3200');
  getOrCreate('fluvial-capex-barges', '2400');
  getOrCreate('fluvial-fuel-sailing-rate', '6.5');
  getOrCreate('fluvial-fuel-idle-rate', '0.8');
  getOrCreate('min_water_level', '2.80');
  getOrCreate('exec-fluvial-cost-per-ton', '$0.00');
  getOrCreate('exec-buy-freight', '$0.00 / MT');
  getOrCreate('exec-fluvial-tce', '$0');
  getOrCreate('exec-tce', '$0');
  getOrCreate('res-breakeven', '$0.00');
  getOrCreate('res-cost-base-break-even', '$0.00 /MT');
  getOrCreate('res-tce-label', 'TCE Fluvial: $0');
  getOrCreate('sea-assistant-toggle', '');
  getOrCreate('sea-assistant-dot', '');

  let runEngineCalled = false;
  let toastMessage = null;

  const mockWindow = {
    activeBargeStandard: 'latam_super_jumbo',
    activeBargeCount: 4,
    activeConvoyData: {
      standard: 'latam_super_jumbo',
      bargeCount: 4,
      capacityPerBarge: 2500,
      totalCapacityMt: 10000,
    },
    State: {},
    runEngine() {
      runEngineCalled = true;
    },
    showToast(msg) {
      toastMessage = msg;
    },
    dispatchEvent(e) {},
    console
  };

  const context = {
    window: mockWindow,
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelector(sel) {
        const idMatch = sel.match(/^#([a-zA-Z0-9_-]+)/);
        if (idMatch) return elements.get(idMatch[1]) || null;
        return null;
      },
      querySelectorAll(sel) {
        return [];
      },
      createElement(tag) {
        return { style: {}, className: '', innerHTML: '' };
      },
      body: {
        appendChild(el) {}
      }
    },
    Event: class {
      constructor(type) { this.type = type; }
    },
    CustomEvent: class {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    setTimeout(fn, ms) { return 1; },
    parseFloat,
    parseInt,
    isNaN,
    Math,
    String,
    Number,
    Boolean,
    console
  };

  mockWindow.document = context.document;
  context.window.window = mockWindow;

  vm.createContext(context);
  vm.runInContext(fluvialCode, context);
  vm.runInContext(payloadCode, context);

  assert.equal(typeof context.window.applyDataBridgePayload, 'function', 'applyDataBridgePayload debe compilar y ser función');

  const payload = {
    bunker_price: 815,
    draft_restriction_factor: 0.80, // Estiaje 80%
    pol: 'Corumbá',
    pod: 'Nueva Palmira',
    freight_sell: 42.0,
    loading_rate: 3000,
    discharge_rate: 2000
  };

  const result = context.window.applyDataBridgePayload(payload);

  assert.ok(result, 'Resultado de applyDataBridgePayload no debe ser nulo');
  assert.equal(result.success, true, 'Debe indicar éxito');

  // 1. Binding de Búnker (MGO)
  assert.equal(Number(elements.get('fluvial-fuel-price').value), 815, 'fluvial-fuel-price debe mapear bunker_price 815');
  assert.equal(Number(elements.get('price-port').value), 815, 'price-port debe mapear bunker_price 815');
  assert.equal(context.window.State.fluvialFuelPrice, 815, 'State.fluvialFuelPrice debe ser 815');
  assert.equal(context.window.State.bunkerPrice, 815, 'State.bunkerPrice debe ser 815');

  // 2. Binding de Estiaje y Capacidad Neta por Barcaza
  // 2500 TM nominal * 0.80 = 2000 TM/barcaza. Convoy de 4 barcazas = 8000 TM
  assert.equal(result.netBargeCapacity, 2000, 'Capacidad neta por barcaza debe ser 2000 TM');
  assert.equal(result.totalNetCapacity, 8000, 'Capacidad neta del convoy debe ser 8000 TM');
  assert.equal(Number(elements.get('cargo-qty').value), 8000, 'Input cargo-qty debe ser 8000 TM');
  assert.equal(context.window.State.bargeNetCapacity, 2000, 'State.bargeNetCapacity debe ser 2000');
  assert.equal(context.window.State.totalNetCapacity, 8000, 'State.totalNetCapacity debe ser 8000');
  assert.equal(context.window.State.draftRestrictionFactor, 0.80, 'State.draftRestrictionFactor debe ser 0.80');

  // 3. Auto-cálculo global invocado
  assert.equal(runEngineCalled, true, 'runEngine debe haber sido invocado automáticamente');

  // 4. Feedback de automatización (Toast y botón IA)
  assert.ok(toastMessage, 'Debe mostrarse una notificación toast');
  assert.ok(toastMessage.includes('Cálculo Completado (Datos en Tiempo Real)'), 'Toast debe indicar "Cálculo Completado (Datos en Tiempo Real)"');
  assert.equal(elements.get('sea-assistant-toggle').getAttribute('title'), 'Cálculo Completado (Datos en Tiempo Real)');

  // 5. Renderizado de Vistas (Vista Ejecutiva y Modo Técnico)
  const execCostPerTon = elements.get('exec-fluvial-cost-per-ton');
  const resBreakeven = elements.get('res-breakeven');
  const execTce = elements.get('exec-fluvial-tce');
  const resTce = elements.get('res-tce-label');

  assert.ok(execCostPerTon.innerHTML.includes('$'), 'Vista Ejecutiva: debe mostrar coste por tonelada');
  assert.ok(resBreakeven.textContent.includes('$'), 'Modo Técnico: debe mostrar Break-Even');
  assert.ok(execTce.innerHTML.includes('$'), 'Vista Ejecutiva: debe mostrar TCE');
  assert.ok(resTce.textContent.includes('TCE Fluvial'), 'Modo Técnico: debe mostrar TCE Fluvial');
});

test('Zero-Touch Automation: Integración con sea-assistant-entry.js', async () => {
  const assistantJs = await readFile(new URL('../src/sea-assistant-entry.js', import.meta.url), 'utf8');

  assert.ok(
    assistantJs.includes('window.applyDataBridgePayload'),
    'sea-assistant-entry.js debe invocar window.applyDataBridgePayload en executeActionableAiUpdateFields'
  );
  assert.ok(
    assistantJs.includes('applyDataBridgePayload'),
    'sea-assistant-entry.js debe soportar la acción applyDataBridgePayload'
  );
});
