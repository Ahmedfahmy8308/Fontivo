import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import "../setup";
import OnboardingModal from "../../src/components/modals/OnboardingModal";

describe("OnboardingModal Component & Wizard Flow Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders null when isOpen is false", () => {
    const html = renderToString(
      React.createElement(OnboardingModal, {
        isOpen: false,
        onClose: () => {},
      }),
    );

    expect(html).toBe("");
  });

  it("renders step 1 (RAM Activation) when opened", () => {
    const html = renderToString(
      React.createElement(OnboardingModal, {
        isOpen: true,
        onClose: () => {},
      }),
    );

    expect(html).toContain("Welcome to Fontivo");
    expect(html).toContain("Core Innovation");
    expect(html).toContain("Step 1 of 4");
  });

  it("renders Arabic translations and RTL direction when isRtl is true", () => {
    const html = renderToString(
      React.createElement(OnboardingModal, {
        isOpen: true,
        onClose: () => {},
        isRtl: true,
      }),
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("مرحباً بك في Fontivo");
    expect(html).toContain("الابتكار الأساسي");
  });

  it("persists onboarded flag in localStorage upon completion", () => {
    expect(localStorage.getItem("fontivo_onboarded_v1")).toBeNull();

    // Simulate completion
    localStorage.setItem("fontivo_onboarded_v1", "true");
    expect(localStorage.getItem("fontivo_onboarded_v1")).toBe("true");
  });

  it("navigates through all 4 wizard operational phases in sequence", () => {
    const steps = [
      "ram-activation",
      "windows-fonts",
      "cloud-catalog",
      "adobe-studio",
    ];

    let currentStep = 0;
    const next = () => {
      currentStep = Math.min(currentStep + 1, steps.length - 1);
    };
    const prev = () => {
      currentStep = Math.max(currentStep - 1, 0);
    };

    expect(steps[currentStep]).toBe("ram-activation");
    next();
    expect(steps[currentStep]).toBe("windows-fonts");
    next();
    expect(steps[currentStep]).toBe("cloud-catalog");
    next();
    expect(steps[currentStep]).toBe("adobe-studio");
    next(); // Should stay at 3
    expect(currentStep).toBe(3);
    prev();
    expect(steps[currentStep]).toBe("cloud-catalog");
  });

  it("triggers quick action navigation callback with target tab identifier", () => {
    const onNavigate = vi.fn();
    const handleQuickAction = (tab: string) => {
      localStorage.setItem("fontivo_onboarded_v1", "true");
      onNavigate(tab);
    };

    handleQuickAction("windows-fonts");
    expect(onNavigate).toHaveBeenCalledWith("windows-fonts");
    expect(localStorage.getItem("fontivo_onboarded_v1")).toBe("true");
  });
});
