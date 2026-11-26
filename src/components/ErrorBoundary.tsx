import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  detail: string | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      detail: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsedMessage = error.message || 'Ocurrió un error inesperado.';
    let detail: string | null = null;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed === 'object' && 'operationType' in parsed) {
        parsedMessage = `Error de permisos o conexión en Firestore (${parsed.operationType} en ${parsed.path || 'ruta desconocida'}).`;
        detail = parsed.error || null;
      }
    } catch {
      // No es un JSON estructurado; se muestra el mensaje normal.
    }

    return {
      hasError: true,
      message: parsedMessage,
      detail
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '', detail: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f6f7f9] text-[#142136] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900">
                  No se pudo completar la operación
                </h1>
                <p className="text-xs text-slate-500">Panel AlbumEscolar</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed mb-3">
              {this.state.message}
            </p>
            {this.state.detail && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 break-words">
                {this.state.detail}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-lg bg-[#183a6e] hover:bg-[#102a52] text-white text-sm font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar panel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
