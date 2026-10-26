import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import ConvoyBuilder from './components/ConvoyBuilder';

interface ConvoyBuilderErrorBoundaryState {
  hasError: boolean;
}

class ConvoyBuilderErrorBoundary extends React.Component<React.PropsWithChildren, ConvoyBuilderErrorBoundaryState> {
  state: ConvoyBuilderErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ConvoyBuilderErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ConvoyBuilder] React render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="rounded-xl border border-rose-500 bg-rose-950/80 p-4 text-sm font-semibold text-rose-200">
          Error al cargar el Ensamblador de Convoy Fluvial. El resto de la plataforma continúa disponible.
        </div>
      );
    }
    return this.props.children;
  }
}

function ConvoyBuilderApp() {
  const [currentMode, setCurrentMode] = useState<'tech' | 'exec'>('tech');

  // Sincronización reactiva con eventos globales de modo (calculator-mode-changed)
  useEffect(() => {
    const handleGlobalModeChange = (e: Event) => {
      const customEvt = e as CustomEvent<{ mode: 'tech' | 'exec' }>;
      const targetMode = customEvt.detail?.mode;
      if (targetMode === 'tech' || targetMode === 'exec') {
        setCurrentMode(targetMode);
      }
    };

    window.addEventListener('calculator-mode-changed', handleGlobalModeChange);
    return () => {
      window.removeEventListener('calculator-mode-changed', handleGlobalModeChange);
    };
  }, []);

  // Notificar al host y alternar la vista activa
  const handleModeChange = useCallback((newMode: 'tech' | 'exec') => {
    setCurrentMode(newMode);
    if (typeof window !== 'undefined') {
      if (typeof (window as any).setCalculatorMode === 'function') {
        try {
          (window as any).setCalculatorMode(newMode);
        } catch (_) {}
      } else {
        try {
          window.dispatchEvent(new CustomEvent('calculator-mode-changed', { detail: { mode: newMode } }));
        } catch (_) {}
      }
    }
  }, []);

  return (
    <ConvoyBuilderErrorBoundary>
      <ConvoyBuilder
        mode={currentMode}
        onModeChange={handleModeChange}
        onConvoyChange={(convoy) => {
          if (typeof window !== 'undefined') {
            (window as any).activeConvoyData = convoy;
            window.dispatchEvent(new CustomEvent('rivercharter:convoy-updated', { detail: convoy }));
          }
        }}
      />
    </ConvoyBuilderErrorBoundary>
  );
}

let convoyRoot: any = null;

export function mountConvoyBuilder(container?: HTMLElement | null) {
  const mountPoint = container || document.getElementById('convoy-builder-root');
  if (!mountPoint) return null;

  if (!convoyRoot) {
    convoyRoot = createRoot(mountPoint);
  }
  convoyRoot.render(<ConvoyBuilderApp />);
  return convoyRoot;
}

if (typeof window !== 'undefined') {
  (window as any).mountConvoyBuilder = mountConvoyBuilder;
}

const initialContainer = document.getElementById('convoy-builder-root');
if (initialContainer) {
  mountConvoyBuilder(initialContainer);
}
