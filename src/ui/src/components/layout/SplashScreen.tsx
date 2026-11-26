import React, { useState, useEffect, useCallback, useRef } from "react";

export interface SplashScreenProps {
  onFinish?: () => void;
  forceShow?: boolean;
}

/**
 * Fontivo Swiss/Bauhaus Splash Opening Screen
 * Uses GPU-composited CSS animations and stable refs so parent re-renders never stutter or reset timers.
 */
export default function SplashScreen({
  onFinish,
  forceShow = false,
}: SplashScreenProps) {
  const [shouldShow, setShouldShow] = useState(() => {
    if (forceShow) return true;
    try {
      const seen = sessionStorage.getItem("fontivo_splash_seen");
      return !seen;
    } catch {
      return true;
    }
  });

  const [isExiting, setIsExiting] = useState<boolean>(false);
  const onFinishRef = useRef(onFinish);
  const hasExitedRef = useRef(false);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const handleFinish = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    setIsExiting(true);
    try {
      sessionStorage.setItem("fontivo_splash_seen", "true");
    } catch {}

    setTimeout(() => {
      setShouldShow(false);
      if (onFinishRef.current) onFinishRef.current();
    }, 240);
  }, []);

  useEffect(() => {
    if (!shouldShow) {
      if (onFinishRef.current) onFinishRef.current();
      return;
    }

    const autoCloseTimer = setTimeout(() => {
      handleFinish();
    }, 1450);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        handleFinish();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(autoCloseTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shouldShow, handleFinish]);

  if (!shouldShow) return null;

  return (
    <div
      onClick={handleFinish}
      role="dialog"
      aria-label="Fontivo Opening Splash"
      dir="ltr"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden transition-all duration-300 ease-out will-change-transform ${
        isExiting
          ? "opacity-0 scale-[1.015] pointer-events-none"
          : "opacity-100 scale-100"
      }`}
      style={{
        backgroundColor: "#140D18",
        backgroundImage:
          "radial-gradient(circle at 50% 42%, rgba(241, 107, 80, 0.14) 0%, rgba(183, 161, 217, 0.08) 38%, transparent 66%)",
      }}
    >
      <style>{`
        @keyframes fontivoRibbonTop {
          0% { opacity: 0; transform: translate(-22px, 12px) scale(0.88); }
          100% { opacity: 1; transform: translate(0, 0) scale(1); }
        }
        @keyframes fontivoRibbonBottom {
          0% { opacity: 0; transform: translate(-14px, 18px) scale(0.88); }
          100% { opacity: 1; transform: translate(0, 0) scale(1); }
        }
        @keyframes fontivoRingExpand {
          0% { opacity: 0; transform: scale(0.75); }
          50% { opacity: 0.45; }
          100% { opacity: 0.2; transform: scale(1.06); }
        }
        @keyframes fontivoSplashText {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fontivoLoaderSweep {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
      `}</style>

      <div className="relative flex flex-col items-center max-w-md w-full px-6">
        {/* Fontivo v2.0 Animated Dual-Ribbon F Brand Mark */}
        <div className="relative w-32 h-32 sm:w-36 sm:h-36 mb-5 will-change-transform flex items-center justify-center">
          <div
            className="absolute inset-2 rounded-full border border-[#B7A1D9]/25"
            style={{
              opacity: 0,
              animation:
                "fontivoRingExpand 900ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className="w-full h-full relative z-10"
            aria-hidden="true"
          >
            <path
              fill="#F16B50"
              d="M86 177c0-67 49-116 116-116h211c14 0 22 15 14 27l-43 66H204c-31 0-53 16-69 44l-49 85z"
              style={{
                opacity: 0,
                animation:
                  "fontivoRibbonTop 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            />
            <path
              fill="#B7A1D9"
              d="M76 350c0-67 49-116 116-116h177c14 0 22 15 14 27l-43 66H194c-31 0-53 16-69 44l-49 85z"
              style={{
                opacity: 0,
                animation:
                  "fontivoRibbonBottom 560ms cubic-bezier(0.16, 1, 0.3, 1) 140ms forwards",
              }}
            />
          </svg>
        </div>

        {/* Typographic Wordmark */}
        <div
          className="text-center will-change-transform w-full flex flex-col items-center"
          style={{
            opacity: 0,
            animation:
              "fontivoSplashText 440ms cubic-bezier(0.16, 1, 0.3, 1) 180ms forwards",
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#FFF9F2] font-display">
              Font<span className="text-[#F16B50]">ivo</span>
            </span>
          </div>

          <p className="text-[11px] font-bold tracking-[0.22em] text-[#B7A1D9] uppercase mt-2 font-sans">
            Type. Design. Deliver.
          </p>

          {/* Clean Plum/Coral/Lavender Loading Bar Sweep (no rainbow dots) */}
          <div className="w-40 h-1 rounded-full bg-[#291C2E] overflow-hidden mt-5">
            <div
              className="h-full w-full origin-left rounded-full"
              style={{
                background: "linear-gradient(90deg, #F16B50 0%, #B7A1D9 100%)",
                transform: "scaleX(0)",
                animation:
                  "fontivoLoaderSweep 1100ms cubic-bezier(0.22, 1, 0.36, 1) 200ms forwards",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
