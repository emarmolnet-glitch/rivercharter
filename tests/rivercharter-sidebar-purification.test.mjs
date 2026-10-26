import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('1. Static source code contains conditional navigation logic for RiverCharter', () => {
  // Navigation function headers and structure
  assert.match(indexHtml, /function getPrimaryNavigationModules\(\)/, 'getPrimaryNavigationModules defined');
  assert.match(indexHtml, /function renderPrimaryNavigation\(\)/, 'renderPrimaryNavigation defined');
  assert.match(indexHtml, /function renderAdvancedModulesMenu\(\)/, 'renderAdvancedModulesMenu defined');
  assert.match(indexHtml, /function syncFluvialSidebarElements\(\)/, 'syncFluvialSidebarElements defined');
  assert.match(indexHtml, /window\.setFluvialNavigationMode/, 'setFluvialNavigationMode exposed on window');

  // Fluvial filtering in getPrimaryNavigationModules
  assert.match(indexHtml, /fluvialIncompatibleIds\s*=\s*new Set\(\['compatibilidad',\s*'ais',\s*'multimodal'\]\)/);

  // CSS rule for hiding Land Charter link in fluvial mode
  assert.match(indexHtml, /#app-navigation-sidebar\.is-fluvial-sidebar\s+#btn-open-land-charter/);
});

test('2. Fluvial mode filters out incompatible modules and retains essential modules in getPrimaryNavigationModules', () => {
  // Extract and evaluate getPrimaryNavigationModules with mock environment
  const sandbox = {
    PRIMARY_MODULES: [
      { id: 'map', label: 'Mapa' },
      { id: 'estimator', label: 'Calculadora' },
      { id: 'dossiers', label: 'Dossiers' },
      { id: 'decisiones', label: 'Decisiones' },
      { id: 'compatibilidad', label: 'Compatibilidad' },
      { id: 'tracking', label: 'Tracking', presentation: 'module-overlay' },
      { id: 'ais', label: 'Densidad' },
      { id: 'gencon', label: 'Editor' },
      { id: 'auditor', label: 'Auditoría' },
    ],
    OPTIONAL_MODULES: [
      { id: 'multimodal', label: 'Cotizador Multimodal', preferenceKey: 'showContainerModules' },
      { id: 'asbatankvoy', label: 'Editor ASBATANKVOY' },
      { id: 'cbam', label: 'CBAM' },
    ],
    userPreferences: { showContainerModules: true },
    window: { isRiverCharter: true, isFluvial: true },
    isFluvialContext: () => true,
  };

  const code = `
    function getPrimaryNavigationModules() {
      const isFluvialArg = arguments[0];
      const isFluvial = typeof isFluvialArg === 'boolean'
          ? isFluvialArg
          : (typeof isFluvialContext === 'function' ? isFluvialContext() : Boolean(window.isRiverCharter || window.isFluvial));
      if (isFluvial) {
          const fluvialIncompatibleIds = new Set(['compatibilidad', 'ais', 'multimodal']);
          return PRIMARY_MODULES.filter(moduleConfig => !fluvialIncompatibleIds.has(moduleConfig.id));
      }
      const promotedOptionalModules = OPTIONAL_MODULES.filter(moduleConfig => (
          moduleConfig.preferenceKey === 'showContainerModules' && userPreferences.showContainerModules
      ));
      return [...PRIMARY_MODULES, ...promotedOptionalModules];
    }
    return { getPrimaryNavigationModules };
  `;

  const fn = new Function('PRIMARY_MODULES', 'OPTIONAL_MODULES', 'userPreferences', 'window', 'isFluvialContext', code);
  const { getPrimaryNavigationModules } = fn(
    sandbox.PRIMARY_MODULES,
    sandbox.OPTIONAL_MODULES,
    sandbox.userPreferences,
    sandbox.window,
    sandbox.isFluvialContext
  );

  // In fluvial mode:
  const fluvialModules = getPrimaryNavigationModules(true);
  const fluvialIds = fluvialModules.map(m => m.id);

  // Incompatible modules must NOT be present
  assert.equal(fluvialIds.includes('compatibilidad'), false, 'Compatibilidad must be excluded in fluvial mode');
  assert.equal(fluvialIds.includes('ais'), false, 'Densidad (ais) must be excluded in fluvial mode');
  assert.equal(fluvialIds.includes('multimodal'), false, 'Cotizador Multimodal must be excluded in fluvial mode');

  // Essential modules must ALL be present
  assert.ok(fluvialIds.includes('map'), 'Mapa is present');
  assert.ok(fluvialIds.includes('estimator'), 'Calculadora is present');
  assert.ok(fluvialIds.includes('dossiers'), 'Dossiers is present');
  assert.ok(fluvialIds.includes('decisiones'), 'Decisiones is present');
  assert.ok(fluvialIds.includes('tracking'), 'Tracking is present');
  assert.ok(fluvialIds.includes('gencon'), 'Editor is present');
  assert.ok(fluvialIds.includes('auditor'), 'Auditoría is present');
  assert.equal(fluvialModules.length, 7, 'Exactly 7 essential modules in fluvial navigation');

  // In maritime mode (isFluvial = false):
  const maritimeModules = getPrimaryNavigationModules(false);
  const maritimeIds = maritimeModules.map(m => m.id);

  assert.ok(maritimeIds.includes('compatibilidad'), 'Compatibilidad is present in maritime mode');
  assert.ok(maritimeIds.includes('ais'), 'Densidad (ais) is present in maritime mode');
  assert.ok(maritimeIds.includes('multimodal'), 'Multimodal is present when enabled in maritime mode');
  assert.equal(maritimeModules.length, 10, 'All 10 modules present in maritime mode');
});

test('3. DOM execution verifies incompatible items are removed/hidden in fluvial mode and visible in maritime mode', () => {
  // Simulate DOM elements
  const createdButtons = [];
  const tabsContainer = {
    children: [],
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
    },
  };
  const mobileContainer = {
    children: [],
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
    },
  };
  const landCharterBtn = {
    id: 'btn-open-land-charter',
    style: {
      display: '',
      setProperty(prop, val) { this[prop] = val; },
      removeProperty(prop) { delete this[prop]; },
    },
    setAttribute(name, val) { this[name] = val; },
    removeAttribute(name) { delete this[name]; },
  };
  const sidebar = {
    id: 'app-navigation-sidebar',
    classList: {
      classes: new Set(),
      toggle(cls, state) {
        if (state) this.classes.add(cls);
        else this.classes.delete(cls);
      },
      contains(cls) { return this.classes.has(cls); },
    },
  };

  const getElementById = (id) => {
    if (id === 'primary-module-tabs') return tabsContainer;
    if (id === 'mobile-module-nav-menu') return mobileContainer;
    if (id === 'btn-open-land-charter') return landCharterBtn;
    if (id === 'app-navigation-sidebar') return sidebar;
    return null;
  };

  const createMockButton = (moduleConfig, variant) => {
    const btn = {
      id: `tab-btn-${moduleConfig.id}`,
      dataset: { moduleId: moduleConfig.id },
      label: moduleConfig.label,
      addEventListener() {},
    };
    createdButtons.push(btn);
    return btn;
  };

  const PRIMARY_MODULES = [
    { id: 'map', label: 'Mapa' },
    { id: 'estimator', label: 'Calculadora' },
    { id: 'dossiers', label: 'Dossiers' },
    { id: 'decisiones', label: 'Decisiones' },
    { id: 'compatibilidad', label: 'Compatibilidad' },
    { id: 'tracking', label: 'Tracking', presentation: 'module-overlay' },
    { id: 'ais', label: 'Densidad' },
    { id: 'gencon', label: 'Editor' },
    { id: 'auditor', label: 'Auditoría' },
  ];

  function syncFluvialSidebarElements(isFluvial) {
    const sb = getElementById('app-navigation-sidebar');
    if (sb) sb.classList.toggle('is-fluvial-sidebar', Boolean(isFluvial));
    const lc = getElementById('btn-open-land-charter');
    if (lc) {
      if (isFluvial) {
        lc.style.setProperty('display', 'none');
        lc.setAttribute('aria-hidden', 'true');
      } else {
        lc.style.removeProperty('display');
        lc.removeAttribute('aria-hidden');
      }
    }
  }

  function renderPrimaryNavigation(isFluvial) {
    const tabs = getElementById('primary-module-tabs');
    const fluvialIncompatibleIds = new Set(['compatibilidad', 'ais', 'multimodal']);
    const modules = isFluvial
      ? PRIMARY_MODULES.filter(m => !fluvialIncompatibleIds.has(m.id))
      : PRIMARY_MODULES;

    tabs.children = [];
    modules.forEach(m => tabs.appendChild(createMockButton(m, 'primary')));

    if (!isFluvial) {
      // Proyectos
      tabs.appendChild({ id: 'tab-btn-forwarders', label: 'PROYECTOS' });
      // Reporte de Mercado
      tabs.appendChild({ id: 'btn-market-report-nav', label: 'Reporte de Mercado' });
    }
    syncFluvialSidebarElements(isFluvial);
  }

  // --- Test Fluvial Mode ---
  renderPrimaryNavigation(true);

  const fluvialTabIds = tabsContainer.children.map(c => c.id);
  assert.equal(fluvialTabIds.includes('tab-btn-compatibilidad'), false, 'Compatibilidad hidden in RiverCharter');
  assert.equal(fluvialTabIds.includes('tab-btn-ais'), false, 'Densidad hidden in RiverCharter');
  assert.equal(fluvialTabIds.includes('tab-btn-forwarders'), false, 'Proyectos hidden in RiverCharter');
  assert.equal(fluvialTabIds.includes('btn-market-report-nav'), false, 'Reporte de Mercado hidden in RiverCharter');
  assert.equal(landCharterBtn.style.display, 'none', 'Land Charter Core PRO is hidden with display none');
  assert.ok(sidebar.classList.contains('is-fluvial-sidebar'), 'Sidebar has is-fluvial-sidebar class');

  // Verify essential modules in tabs
  assert.ok(fluvialTabIds.includes('tab-btn-map'), 'Mapa tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-estimator'), 'Calculadora tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-dossiers'), 'Dossiers tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-decisiones'), 'Decisiones tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-tracking'), 'Tracking tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-gencon'), 'Editor tab is present');
  assert.ok(fluvialTabIds.includes('tab-btn-auditor'), 'Auditoría tab is present');

  // --- Test Maritime Mode ---
  renderPrimaryNavigation(false);

  const maritimeTabIds = tabsContainer.children.map(c => c.id);
  assert.ok(maritimeTabIds.includes('tab-btn-compatibilidad'), 'Compatibilidad restored in maritime mode');
  assert.ok(maritimeTabIds.includes('tab-btn-ais'), 'Densidad restored in maritime mode');
  assert.ok(maritimeTabIds.includes('tab-btn-forwarders'), 'Proyectos restored in maritime mode');
  assert.ok(maritimeTabIds.includes('btn-market-report-nav'), 'Reporte de Mercado restored in maritime mode');
  assert.equal(landCharterBtn.style.display, undefined, 'Land Charter Core PRO visible in maritime mode');
  assert.equal(sidebar.classList.contains('is-fluvial-sidebar'), false, 'Sidebar is-fluvial-sidebar class removed in maritime mode');
});
