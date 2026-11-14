import { writable } from "svelte/store";

type TaskCompletionCelebration = {
  id: number;
  profileId: string;
};

export const taskCompletionCelebration =
  writable<TaskCompletionCelebration | null>(null);

let celebrationId = 0;

export function celebrateTaskCompletion(profileId: string) {
  taskCompletionCelebration.set({
    id: ++celebrationId,
    profileId,
  });
}
