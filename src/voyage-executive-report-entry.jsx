import React from 'react';
import { createRoot } from 'react-dom/client';
import VisualStowagePlan from './components/VisualStowagePlan.jsx';
import VoyageExecutiveReportModal, {
  buildVoyageStowagePlan,
  isFluvialContext,
  adaptExecutiveReportModalToFluvial,
} from './components/VoyageExecutiveReportModal.jsx';

import FluvialStowagePlan, { renderFluvialStowagePlanSvg, calculateConvoyMatrix, resolveActiveBargeCount } from './components/FluvialStowagePlan.jsx';

let voyageReportRoot = null;
let visualStowageRoot = null;

export function mountVoyageExecutiveReport(container, props = {}) {
  if (typeof window !== 'undefined') {
    if (typeof window.setDataBridgeVerifiedConnection !== 'function') {
      window.setDataBridgeVerifiedConnection = () => {};
    }
  }

  let mountPoint = container?.querySelector?.('#voyage-executive-report-root')
    || document.getElementById('voyage-executive-report-root')
    || container;

  if (!mountPoint) {
    mountPoint = document.getElementById('voyage-executive-report-root');
    if (!mountPoint) {
      mountPoint = document.createElement('div');
      mountPoint.id = 'voyage-executive-report-root';
      document.body.appendChild(mountPoint);
    }
  }

  if (!voyageReportRoot) {
    voyageReportRoot = createRoot(mountPoint);
  }

  const handleClose = () => {
    if (typeof props.onClose === 'function') {
      props.onClose();
    }
    const modalEl = document.getElementById('voyage-executive-report-modal');
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
    const aiModalEl = document.getElementById('ai-modal');
    if (aiModalEl) {
      if (typeof window.closeAIModal === 'function') {
        window.closeAIModal();
      } else {
        aiModalEl.classList.add('hidden');
      }
    }
  };

  voyageReportRoot.render(
    <VoyageExecutiveReportModal
      isOpen={props.isOpen ?? true}
      onClose={handleClose}
      voyageData={props.voyageData || (typeof window !== 'undefined' ? window.State : null)}
      initialClientMode={Boolean(props.isClientMode ?? window.isExecutiveClientMode)}
    />
  );

  if (isFluvialContext(props)) {
    setTimeout(() => {
      adaptExecutiveReportModalToFluvial(mountPoint);
    }, 50);
  }

  return voyageReportRoot;
}

export function mountVisualStowageInExecutiveModal(containerId = 'voyage-visual-stowage-container', options = {}) {
  const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!target) return null;

  target.style.display = '';
  target.classList.remove('hidden');

  const state = options.state || (typeof window !== 'undefined' ? window.State : {});
  const stowagePlan = options.stowagePlan || buildVoyageStowagePlan(state);
  const vesselType = options.vesselType || (state?.vessel ? `${state.vessel} (${state.class || 'Handysize'})` : 'Handysize Bulk Carrier 32.000 DWT');

  if (!visualStowageRoot) {
    visualStowageRoot = createRoot(target);
  }

  visualStowageRoot.render(
    <VisualStowagePlan
      stowagePlan={stowagePlan}
      vesselType={vesselType}
      projectRef={options.ref || 'EXP-VOYAGE-EST'}
    />
  );

  return visualStowageRoot;
}

if (typeof window !== 'undefined') {
  window.mountVoyageExecutiveReport = mountVoyageExecutiveReport;
  window.mountVisualStowageInExecutiveModal = mountVisualStowageInExecutiveModal;
  window.buildVoyageStowagePlan = buildVoyageStowagePlan;
  window.VoyageExecutiveReportModal = VoyageExecutiveReportModal;
  window.VisualStowagePlan = VisualStowagePlan;
  window.FluvialStowagePlan = FluvialStowagePlan;
  window.renderFluvialStowagePlanSvg = renderFluvialStowagePlanSvg;
  window.calculateConvoyMatrix = calculateConvoyMatrix;
  window.resolveActiveBargeCount = resolveActiveBargeCount;
  window.isFluvialContext = isFluvialContext;
  window.adaptExecutiveReportModalToFluvial = adaptExecutiveReportModalToFluvial;
  window.generarReporteEjecutivo = function () {
    if (typeof window.generateExecutiveReport === 'function') {
      return window.generateExecutiveReport();
    }
  };
}

export {
  VoyageExecutiveReportModal,
  VisualStowagePlan,
  FluvialStowagePlan,
  renderFluvialStowagePlanSvg,
  calculateConvoyMatrix,
  resolveActiveBargeCount,
  buildVoyageStowagePlan,
  isFluvialContext,
  adaptExecutiveReportModalToFluvial,
};
export default VoyageExecutiveReportModal;
