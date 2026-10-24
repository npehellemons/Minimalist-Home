import { writable } from "svelte/store";
import type { DashboardView } from "#lib/dashboard-navigation.svelte.js";

const STORAGE_KEY = "minimalist-home:tab-performance:v1";
const SAMPLE_LIMIT = 30;
const isBrowser = typeof window !== "undefined";

export type TabPerformanceSample = {
  id: string;
  view: DashboardView;
  recordedAt: string;
  cold: boolean;
  shellPaintMs: number;
  readyPaintMs: number;
  importMs: number | null;
};

type PendingTransition = {
  id: string;
  view: DashboardView;
  startedAt: number;
  shellPaintMs: number | null;
};

function readSamples() {
  if (!isBrowser) return [];

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? (stored as TabPerformanceSample[]) : [];
  } catch {
    return [];
  }
}

export const tabPerformanceSamples = writable<TabPerformanceSample[]>(
  readSamples(),
);

const pending = new Map<DashboardView, PendingTransition>();

export function beginTabTransition(view: DashboardView) {
  if (!isBrowser || pending.has(view)) return;

  const id = `${Date.now()}-${view}`;
  pending.set(view, {
    id,
    view,
    startedAt: performance.now(),
    shellPaintMs: null,
  });
  performance.mark(`dashboard-tab:${id}:start`);
}

export function markTabShellPainted(view: DashboardView) {
  const transition = pending.get(view);
  if (!transition || transition.shellPaintMs !== null) return;

  transition.shellPaintMs = performance.now() - transition.startedAt;
  performance.mark(`dashboard-tab:${transition.id}:shell`);
}

export function cancelTabTransition(view: DashboardView) {
  const transition = pending.get(view);
  if (!transition) return;

  performance.clearMarks(`dashboard-tab:${transition.id}:start`);
  performance.clearMarks(`dashboard-tab:${transition.id}:shell`);
  pending.delete(view);
}

export function completeTabTransition(
  view: DashboardView,
  options: { cold: boolean; importMs?: number },
) {
  const transition = pending.get(view);
  if (!transition) return;

  const readyPaintMs = performance.now() - transition.startedAt;
  const measureName = `dashboard-tab:${view}:${options.cold ? "cold" : "warm"}`;
  const sample: TabPerformanceSample = {
    id: transition.id,
    view,
    recordedAt: new Date().toISOString(),
    cold: options.cold,
    shellPaintMs: Math.round(
      (transition.shellPaintMs ?? readyPaintMs) * 10,
    ) / 10,
    readyPaintMs: Math.round(readyPaintMs * 10) / 10,
    importMs:
      options.importMs === undefined
        ? null
        : Math.round(options.importMs * 10) / 10,
  };

  performance.mark(`dashboard-tab:${transition.id}:ready`);
  performance.measure(
    measureName,
    `dashboard-tab:${transition.id}:start`,
    `dashboard-tab:${transition.id}:ready`,
  );
  performance.clearMarks(`dashboard-tab:${transition.id}:start`);
  performance.clearMarks(`dashboard-tab:${transition.id}:shell`);
  performance.clearMarks(`dashboard-tab:${transition.id}:ready`);
  performance.clearMeasures(measureName);
  pending.delete(view);

  window.setTimeout(() => {
    tabPerformanceSamples.update((samples) => {
      const next = [sample, ...samples].slice(0, SAMPLE_LIMIT);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Performance diagnostics must never interfere with navigation.
      }

      return next;
    });
  }, 0);
}

export function clearTabPerformanceSamples() {
  if (isBrowser) localStorage.removeItem(STORAGE_KEY);
  tabPerformanceSamples.set([]);
}
