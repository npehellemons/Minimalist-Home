import { getContext, setContext } from "svelte";
import { writable } from "svelte/store";

import {
  readPersistentCache,
  writePersistentCache,
} from "#lib/persistent-cache.js";
import {
  getDailyTasks,
  subscribeToTasks,
  type DailyTask,
} from "#lib/tasks.js";

type TaskStoreState = {
  tasks: DailyTask[];
  loading: boolean;
  error: boolean;
  dateKey: string;
};

type CachedTaskSnapshot = {
  dateKey: string;
  tasks: DailyTask[];
};

const TASK_STORE_CONTEXT = Symbol("task-store");
const TASK_CACHE_VERSION = 1;
const initialState: TaskStoreState = {
  tasks: [],
  loading: false,
  error: false,
  dateKey: "",
};

function createTaskStore() {
  const state = writable<TaskStoreState>(initialState);
  let householdId = "";
  let dateKey = "";
  let loadedKey = "";
  let snapshotKey = "";
  let generation = 0;
  let refreshPromise: Promise<void> | null = null;
  let refreshAgain = false;
  let hydrationKey = "";
  let realtimeCleanup = () => {};
  let realtimeHouseholdId = "";
  let realtimeRefreshTimeout: number | undefined;
  let destroyed = false;

  function cacheKey(targetHouseholdId: string) {
    return `tasks:v${TASK_CACHE_VERSION}:${targetHouseholdId}:latest`;
  }

  function persistSnapshot(
    targetHouseholdId: string,
    targetDateKey: string,
    tasks: DailyTask[],
  ) {
    void writePersistentCache<CachedTaskSnapshot>(
      cacheKey(targetHouseholdId),
      {
        value: { dateKey: targetDateKey, tasks },
        updatedAt: Date.now(),
      },
    );
  }

  function disconnectRealtime() {
    window.clearTimeout(realtimeRefreshTimeout);
    realtimeRefreshTimeout = undefined;
    realtimeCleanup();
    realtimeCleanup = () => {};
    realtimeHouseholdId = "";
  }

  function connectRealtime() {
    if (
      destroyed ||
      !householdId ||
      document.visibilityState !== "visible" ||
      realtimeHouseholdId === householdId
    ) {
      return;
    }

    disconnectRealtime();
    realtimeHouseholdId = householdId;
    realtimeCleanup = subscribeToTasks(householdId, () => {
      window.clearTimeout(realtimeRefreshTimeout);
      realtimeRefreshTimeout = window.setTimeout(() => void refresh(), 120);
    });
  }

  async function runRefresh(targetHouseholdId: string, targetDateKey: string) {
    const requestGeneration = ++generation;
    const requestKey = `${targetHouseholdId}:${targetDateKey}`;

    state.update((current) => ({
      ...current,
      loading: snapshotKey !== requestKey,
      error: false,
      dateKey: targetDateKey,
    }));

    try {
      const tasks = await getDailyTasks(targetHouseholdId, targetDateKey);
      if (
        !destroyed &&
        requestGeneration === generation &&
        householdId === targetHouseholdId &&
        dateKey === targetDateKey
      ) {
        loadedKey = requestKey;
        snapshotKey = requestKey;
        state.set({ tasks, loading: false, error: false, dateKey: targetDateKey });
        persistSnapshot(targetHouseholdId, targetDateKey, tasks);
      }
    } catch (error) {
      console.error("Unable to load household tasks", error);
      if (
        !destroyed &&
        requestGeneration === generation &&
        householdId === targetHouseholdId &&
        dateKey === targetDateKey
      ) {
        state.update((current) => ({
          ...current,
          loading: false,
          error: snapshotKey !== requestKey,
        }));
      }
    }
  }

  async function hydrate(targetHouseholdId: string, targetDateKey: string) {
    const requestKey = `${targetHouseholdId}:${targetDateKey}`;
    const hydrationGeneration = generation;
    const cached = await readPersistentCache<CachedTaskSnapshot>(
      cacheKey(targetHouseholdId),
    );

    if (
      destroyed ||
      hydrationKey !== requestKey ||
      generation !== hydrationGeneration ||
      householdId !== targetHouseholdId ||
      dateKey !== targetDateKey
    ) {
      if (hydrationKey === requestKey) hydrationKey = "";
      return;
    }

    if (cached?.value.dateKey === targetDateKey) {
      snapshotKey = requestKey;
      state.set({
        tasks: cached.value.tasks,
        loading: false,
        error: false,
        dateKey: targetDateKey,
      });
    }

    if (loadedKey !== requestKey) await refresh();
    if (hydrationKey === requestKey) hydrationKey = "";
  }

  async function refresh() {
    if (destroyed || !householdId || !dateKey) return;

    if (refreshPromise) {
      refreshAgain = true;
      await refreshPromise;
      return;
    }

    const targetHouseholdId = householdId;
    const targetDateKey = dateKey;
    refreshPromise = runRefresh(targetHouseholdId, targetDateKey);

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
      if (refreshAgain) {
        refreshAgain = false;
        await refresh();
      }
    }
  }

  function ensure(nextHouseholdId: string, nextDateKey: string) {
    if (!nextHouseholdId || !nextDateKey || destroyed) return;

    const householdChanged = householdId !== nextHouseholdId;
    const nextKey = `${nextHouseholdId}:${nextDateKey}`;
    const keyChanged = `${householdId}:${dateKey}` !== nextKey;
    householdId = nextHouseholdId;
    dateKey = nextDateKey;

    if (householdChanged) disconnectRealtime();
    connectRealtime();

    if (loadedKey !== nextKey && hydrationKey !== nextKey) {
      hydrationKey = nextKey;
      if (keyChanged) {
        state.set({ tasks: [], loading: true, error: false, dateKey: nextDateKey });
      } else {
        state.update((current) => ({ ...current, loading: true, error: false }));
      }
      void hydrate(nextHouseholdId, nextDateKey);
    }
  }

  function setCompleted(taskId: string, profileId: string, completed: boolean) {
    let nextTasks: DailyTask[] = [];
    state.update((current) => {
      nextTasks = current.tasks.map((task) =>
        task.id === taskId && task.profileId === profileId
          ? { ...task, completed }
          : task,
      );
      return { ...current, tasks: nextTasks };
    });
    if (householdId && dateKey) {
      snapshotKey = `${householdId}:${dateKey}`;
      persistSnapshot(householdId, dateKey, nextTasks);
    }
  }

  function removeTask(taskId: string) {
    let nextTasks: DailyTask[] = [];
    state.update((current) => {
      nextTasks = current.tasks.filter((task) => task.id !== taskId);
      return { ...current, tasks: nextTasks };
    });
    if (householdId && dateKey) {
      snapshotKey = `${householdId}:${dateKey}`;
      persistSnapshot(householdId, dateKey, nextTasks);
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      disconnectRealtime();
      return;
    }

    connectRealtime();
    void refresh();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return {
    subscribe: state.subscribe,
    ensure,
    refresh,
    setCompleted,
    removeTask,
    destroy() {
      destroyed = true;
      generation += 1;
      disconnectRealtime();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    },
  };
}

export type TaskStore = ReturnType<typeof createTaskStore>;

export function provideTaskStore() {
  const store = createTaskStore();
  setContext(TASK_STORE_CONTEXT, store);
  return store;
}

export function getTaskStore() {
  return getContext<TaskStore>(TASK_STORE_CONTEXT);
}
