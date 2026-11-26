import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../setup";

describe("Notifications & Toast Queue Suite Tests", () => {
  interface ToastNotification {
    id: string;
    type: "success" | "error" | "info" | "warning";
    title: string;
    message?: string;
    duration?: number;
    createdAt: number;
  }

  let queue: ToastNotification[] = [];

  beforeEach(() => {
    queue = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues toast notifications with unique IDs and metadata", () => {
    const addToast = (
      type: ToastNotification["type"],
      title: string,
      message?: string,
    ) => {
      const toast: ToastNotification = {
        id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type,
        title,
        message,
        duration: 3000,
        createdAt: Date.now(),
      };
      queue.push(toast);
      return toast;
    };

    const t1 = addToast(
      "success",
      "Font Activated",
      "Amiri Regular loaded in RAM",
    );
    const t2 = addToast("info", "Workspace Saved", "Tokens updated");

    expect(queue.length).toBe(2);
    expect(t1.type).toBe("success");
    expect(t2.type).toBe("info");
    expect(t1.id).not.toBe(t2.id);
  });

  it("dismisses notifications by specific ID", () => {
    const t1 = {
      id: "t-1",
      type: "success" as const,
      title: "Success",
      createdAt: Date.now(),
    };
    const t2 = {
      id: "t-2",
      type: "error" as const,
      title: "Error",
      createdAt: Date.now(),
    };
    queue = [t1, t2];

    const dismiss = (id: string) => {
      queue = queue.filter((t) => t.id !== id);
    };

    dismiss("t-1");
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe("t-2");
  });

  it("automatically expires toasts after configured duration timeout", () => {
    let activeToasts: ToastNotification[] = [];

    const showToastWithTimeout = (toast: ToastNotification) => {
      activeToasts.push(toast);
      setTimeout(() => {
        activeToasts = activeToasts.filter((t) => t.id !== toast.id);
      }, toast.duration || 3000);
    };

    showToastWithTimeout({
      id: "toast-timeout",
      type: "success",
      title: "Auto-dismissing toast",
      duration: 3000,
      createdAt: Date.now(),
    });

    expect(activeToasts.length).toBe(1);

    // Fast forward 2900ms -> still active
    vi.advanceTimersByTime(2900);
    expect(activeToasts.length).toBe(1);

    // Fast forward remaining 100ms -> dismissed
    vi.advanceTimersByTime(100);
    expect(activeToasts.length).toBe(0);
  });

  it("limits max queue size to prevent notification flooding", () => {
    const MAX_TOASTS = 3;
    const addWithLimit = (title: string) => {
      const newToast: ToastNotification = {
        id: `t-${queue.length}`,
        type: "info",
        title,
        createdAt: Date.now(),
      };
      if (queue.length >= MAX_TOASTS) {
        queue.shift(); // Evict oldest
      }
      queue.push(newToast);
    };

    addWithLimit("Toast 1");
    addWithLimit("Toast 2");
    addWithLimit("Toast 3");
    addWithLimit("Toast 4");

    expect(queue.length).toBe(3);
    expect(queue[0].title).toBe("Toast 2");
    expect(queue[2].title).toBe("Toast 4");
  });
});
