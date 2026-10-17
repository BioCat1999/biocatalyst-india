/** React Navigation param lists (React Navigation v7, typed). */

export type RootStackParamList = {
  MainTabs: undefined;
  EventDetail: { eventId: string };
  Company: { slug: string };
  Drug: { slug: string };
  Trial: { registry: string; trialId: string };
  Ipo: undefined;
  Insights: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

/**
 * Search scope: which result group the Search tab is restricted to.
 * Set from a tab's header search button so results match the tab the
 * user is on (Feed -> events, Watchlist -> companies, ...). Undefined
 * means unscoped: all groups.
 */
export type SearchScope = "events" | "companies" | "drugs" | "trials";

export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  events: "Feed",
  companies: "Companies",
  drugs: "Drugs",
  trials: "Trials",
};

export type MainTabParamList = {
  Feed: undefined;
  Search: { scope?: SearchScope } | undefined;
  Global: undefined;
  Watchlist: undefined;
  Alerts: undefined;
  Account: undefined;
};
