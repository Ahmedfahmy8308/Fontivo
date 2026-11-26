import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home, Terminal, Bug } from "lucide-react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  isRtl?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log crash details to console for developer triage
    console.error(
      "[Fontivo ErrorBoundary] Caught uncaught render exception:",
      error,
      errorInfo,
    );
    this.setState({ errorInfo });
  }

  handleReload = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  handleBackToLibrary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isRtl = this.props.isRtl ?? false;
      const errorMessage =
        this.state.error?.message ||
        (isRtl ? "خطأ مجهول في المعالجة" : "Unknown rendering failure");
      const componentStack = this.state.errorInfo?.componentStack;

      return (
        <div
          className="flex-1 w-full h-full min-h-[420px] flex items-center justify-center p-6 bg-[var(--color-back-main)] text-[var(--color-text-main)] select-none animate-in fade-in"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="max-w-xl w-full bg-[var(--color-back-card)] border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
            {/* Top decorative accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--color-action)]" />

            {/* Error Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-[var(--color-text-header)] tracking-tight">
                    {isRtl
                      ? "حدث خطأ غير متوقع في عرض الواجهة"
                      : "Unexpected View Render Error"}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold uppercase">
                    Caught
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {isRtl
                    ? "تم حجز الخطأ بنجاح بواسطة نظام حماية الاستقرار لمنع انهيار التطبيق أو ظهور الشاشة السوداء. بياناتك ومكتبتك آمنة تماماً."
                    : "The crash was safely isolated by Fontivo stability protection to prevent a black screen crash. Your font data and system files remain completely intact."}
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-3.5 rounded-xl bg-black/30 border border-[var(--color-border)] font-mono text-xs text-rose-300 break-all select-text">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-dim)] pb-1 mb-1 border-b border-[var(--color-border)]/50">
                <Bug className="w-3.5 h-3.5" />
                <span>Exception details</span>
              </div>
              <div>{errorMessage}</div>
            </div>

            {/* Stack trace toggle */}
            {componentStack && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-header)] flex items-center gap-1.5 cursor-pointer underline transition"
                >
                  <Terminal className="w-3 h-3" />
                  <span>
                    {this.state.showDetails
                      ? isRtl
                        ? "إخفاء تفاصيل المسار البرمجي"
                        : "Hide component stack"
                      : isRtl
                        ? "عرض تفاصيل المسار البرمجي (Stack Trace)"
                        : "Show component stack trace"}
                  </span>
                </button>
                {this.state.showDetails && (
                  <pre className="max-h-36 overflow-y-auto p-3 rounded-lg bg-black/40 border border-[var(--color-border)] font-mono text-[10px] text-zinc-400 select-text leading-tight">
                    {componentStack}
                  </pre>
                )}
              </div>
            )}

            {/* Actions: Reload View & Back to Library */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={this.handleBackToLibrary}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--color-control)] hover:bg-[var(--color-border)] text-[var(--color-text-header)] text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-[var(--color-border)]"
              >
                <Home className="w-4 h-4" />
                <span>{isRtl ? "العودة للمكتبة" : "Back to Library"}</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--color-action)] hover:bg-[var(--color-action-hover)] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isRtl ? "إعادة تشغيل الواجهة" : "Reload View"}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
