import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import { ErrorBoundary } from "../../src/components/common/ErrorBoundary";

describe("ErrorBoundary Component Tests", () => {
  it("updates state via getDerivedStateFromError when error is thrown", () => {
    const error = new Error("Simulated OpenType parse crash");
    const state = ErrorBoundary.getDerivedStateFromError(error);

    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it("renders children normally when no error occurs", () => {
    const html = renderToString(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement("div", { className: "test-child" }, "Safe Content"),
      ),
    );

    expect(html).toContain("Safe Content");
  });

  it("renders error boundary fallback with reload and recovery controls", () => {
    const errorBoundaryInstance = new ErrorBoundary({ children: null });
    errorBoundaryInstance.state = {
      hasError: true,
      error: new Error("Critical Canvas Rendering Failure"),
      errorInfo: { componentStack: "\n    in CanvasSpecimen\n    in App" },
      showDetails: false,
    };

    const rendered = errorBoundaryInstance.render();
    const html = renderToString(rendered);

    expect(html).toContain("Critical Canvas Rendering Failure");
    expect(html).toContain("Reload View");
    expect(html).toContain("Back to Library");
  });

  it("resets error state when handleBackToLibrary is triggered", () => {
    let resetCalled = false;
    const errorBoundaryInstance = new ErrorBoundary({
      children: null,
      onReset: () => {
        resetCalled = true;
      },
    });
    errorBoundaryInstance.setState = (updater: any) => {
      if (typeof updater === "function") {
        errorBoundaryInstance.state = updater(errorBoundaryInstance.state);
      } else {
        errorBoundaryInstance.state = {
          ...errorBoundaryInstance.state,
          ...updater,
        };
      }
    };
    errorBoundaryInstance.state = {
      hasError: true,
      error: new Error("Test Error"),
      errorInfo: null,
      showDetails: false,
    };

    errorBoundaryInstance.handleBackToLibrary();
    expect(resetCalled).toBe(true);
    expect(errorBoundaryInstance.state.hasError).toBe(false);
  });
});
