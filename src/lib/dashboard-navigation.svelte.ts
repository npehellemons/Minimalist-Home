import { getContext, setContext } from "svelte";

export type DashboardView = "home" | "calendar" | "tasks" | "weather" | "settings";
export type DashboardTab = DashboardView | "photos";

type DashboardNavigation = {
  activeTab: DashboardTab;
  documentVisible: boolean;
};

const DASHBOARD_NAVIGATION = Symbol("dashboard-navigation");

export function provideDashboardNavigation() {
  const navigation = $state<DashboardNavigation>({
    activeTab: "home",
    documentVisible: true,
  });
  setContext(DASHBOARD_NAVIGATION, navigation);
  return navigation;
}

export function getDashboardNavigation() {
  return getContext<DashboardNavigation>(DASHBOARD_NAVIGATION);
}
