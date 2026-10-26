import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Toggle Ejecutivo / Técnico: HTML structure, IDs, and onclick synchronization with React', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // 1. Verificación de botones en el DOM
  assert.ok(indexHtml.includes('id="btn-mode-exec"'), 'Debe existir el botón id="btn-mode-exec"');
  assert.ok(indexHtml.includes('id="btn-mode-tech"'), 'Debe existir el botón id="btn-mode-tech"');
  assert.ok(indexHtml.includes('btn-exec-view'), 'Debe soportar la clase o identificador btn-exec-view');
  assert.ok(indexHtml.includes('btn-tech-view'), 'Debe soportar la clase o identificador btn-tech-view');

  // 2. Contenedores de vista
  assert.ok(indexHtml.includes('id="executive-dashboard"'), 'Debe existir el contenedor executive-dashboard');
  assert.ok(indexHtml.includes('id="technical-workspace"'), 'Debe existir el contenedor technical-workspace para Bloques 1-10');

  // 3. Sincronización con React: dispatchEvent en onclick o handler
  assert.ok(
    indexHtml.includes("window.dispatchEvent(new CustomEvent('calculator-mode-changed', { detail: { mode: 'tech' } }))"),
    'Debe despachar CustomEvent calculator-mode-changed con mode tech'
  );
  assert.ok(
    indexHtml.includes("window.dispatchEvent(new CustomEvent('calculator-mode-changed', { detail: { mode: 'exec' } }))"),
    'Debe despachar CustomEvent calculator-mode-changed con mode exec'
  );
});

test('Toggle Ejecutivo / Técnico: Script parsing and setCalculatorMode execution', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // Extraemos la definición de setCalculatorMode
  const match = indexHtml.match(/window\.setCalculatorMode\s*=\s*function\(mode\)\s*\{[\s\S]*?\n\s*\};/);
  assert.ok(match, 'Debe extraerse la función setCalculatorMode');

  const execDash = {
    classes: new Set(['flex']),
    classList: {
      add(c) { execDash.classes.add(c); },
      remove(c) { execDash.classes.delete(c); },
      contains(c) { return execDash.classes.has(c); }
    }
  };

  const techWork = {
    classes: new Set(['hidden']),
    classList: {
      add(c) { techWork.classes.add(c); },
      remove(c) { techWork.classes.delete(c); },
      contains(c) { return techWork.classes.has(c); }
    }
  };

  const btnExec = {
    className: 'px-5 py-2 rounded-md text-sm font-bold bg-white text-blue-700 shadow-sm border border-slate-200 transition-all',
    classList: {
      contains(c) { return btnExec.className.split(' ').includes(c); }
    }
  };

  const btnTech = {
    className: 'px-5 py-2 rounded-md text-sm font-bold text-slate-600 hover:text-slate-900 bg-transparent border border-transparent transition-all',
    classList: {
      contains(c) { return btnTech.className.split(' ').includes(c); }
    }
  };

  const dispatchedEvents = [];

  const context = {
    document: {
      getElementById(id) {
        if (id === 'executive-dashboard') return execDash;
        if (id === 'technical-workspace') return techWork;
        if (id === 'btn-mode-exec' || id === 'btn-exec-view') return btnExec;
        if (id === 'btn-mode-tech' || id === 'btn-tech-view') return btnTech;
        return null;
      },
      querySelector(sel) {
        if (sel === '.btn-exec-view') return btnExec;
        if (sel === '.btn-tech-view') return btnTech;
        return null;
      }
    },
    window: {
      dispatchEvent(evt) {
        dispatchedEvents.push(evt);
      }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    console
  };
  context.window.document = context.document;

  vm.runInNewContext(match[0], context);

  // TEST 1: Alternar a Modo Técnico
  context.window.setCalculatorMode('tech');

  assert.equal(techWork.classList.contains('hidden'), false, 'technical-workspace no debe tener hidden en modo técnico');
  assert.equal(execDash.classList.contains('hidden'), true, 'executive-dashboard debe tener hidden en modo técnico');
  assert.ok(btnTech.className.includes('bg-white'), 'btnTech debe tener fondo blanco como activo');
  assert.ok(btnTech.className.includes('text-blue-700'), 'btnTech debe tener texto azul/oscuro');
  assert.ok(btnExec.className.includes('bg-transparent'), 'btnExec debe tener fondo transparente');
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'calculator-mode-changed');
  assert.equal(dispatchedEvents[0].detail?.mode, 'tech');

  // TEST 2: Alternar a Vista Ejecutiva
  context.window.setCalculatorMode('exec');

  assert.equal(execDash.classList.contains('hidden'), false, 'executive-dashboard no debe tener hidden en vista ejecutiva');
  assert.equal(execDash.classList.contains('flex'), true, 'executive-dashboard debe tener flex en vista ejecutiva');
  assert.equal(techWork.classList.contains('hidden'), true, 'technical-workspace debe tener hidden en vista ejecutiva');
  assert.ok(btnExec.className.includes('bg-white'), 'btnExec debe tener fondo blanco como activo');
  assert.ok(btnExec.className.includes('text-blue-700'), 'btnExec debe tener texto azul/oscuro');
  assert.ok(btnTech.className.includes('bg-transparent'), 'btnTech debe tener fondo transparente');
  assert.equal(dispatchedEvents.length, 2);
  assert.equal(dispatchedEvents[1].type, 'calculator-mode-changed');
  assert.equal(dispatchedEvents[1].detail?.mode, 'exec');
});

test('Toggle Ejecutivo / Técnico: Resiliencia ante elementos ausentes en DOM (no arroja excepciones)', async () => {
  const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  const match = indexHtml.match(/window\.setCalculatorMode\s*=\s*function\(mode\)\s*\{[\s\S]*?\n\s*\};/);
  assert.ok(match, 'Debe extraerse la función setCalculatorMode');

  const contextEmpty = {
    document: {
      getElementById() { return null; },
      querySelector() { return null; }
    },
    window: {
      dispatchEvent() {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    console
  };
  contextEmpty.window.document = contextEmpty.document;

  vm.runInNewContext(match[0], contextEmpty);

  assert.doesNotThrow(() => {
    contextEmpty.window.setCalculatorMode('tech');
  }, 'No debe lanzar error con DOM vacío en modo tech');

  assert.doesNotThrow(() => {
    contextEmpty.window.setCalculatorMode('exec');
  }, 'No debe lanzar error con DOM vacío en modo exec');
});
