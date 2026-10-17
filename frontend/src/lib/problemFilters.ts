import type { SortKey, Problem } from "@/api";

// Shared between ProblemList (index) and ProblemEditor (show page) so the
// "next/prev" navigation walks exactly the list the user was filtering.

export const RATING_OPTIONS: { key: string; label: string; test: (r: number | null) => boolean }[] = [
  { key: "0",   label: "0 ★",   test: (r) => r == null || r === 0 },
  { key: "1",   label: "≥ 1 ★", test: (r) => r != null && r >= 1 },
  { key: "2",   label: "≥ 2 ★", test: (r) => r != null && r >= 2 },
  { key: "3",   label: "≥ 3 ★", test: (r) => r != null && r >= 3 },
];

export const ASCENT_OPTIONS: { key: string; label: string; test: (a: number) => boolean }[] = [
  { key: "0",     label: "0",      test: (a) => a === 0 },
  { key: "gt0",   label: "> 0",    test: (a) => a > 0 },
  { key: "gte5",  label: "≥ 5",    test: (a) => a >= 5 },
  { key: "gte10", label: "≥ 10",   test: (a) => a >= 10 },
  { key: "gte25", label: "≥ 25",   test: (a) => a >= 25 },
  { key: "gte50", label: "≥ 50",   test: (a) => a >= 50 },
  { key: "gte100",label: "≥ 100",  test: (a) => a >= 100 },
];

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "rating_desc", label: "Top rated" },
  { value: "ascents_desc", label: "Most ascents" },
  { value: "send_rate_desc", label: "Highest send rate" },
];

// Apply the client-side filters (favorites, rating, ascents) to an
// already-sorted problem list. Server-side filters (grades, setter, sort)
// happen before this in api.problems.list.
export function applyProblemFilters(
  problems: Problem[],
  selectedRatings: Set<string>,
  selectedAscents: Set<string>,
  favoritesOnly: boolean,
  favIds: Set<number>,
): Problem[] {
  const ratingTests = RATING_OPTIONS.filter((o) => selectedRatings.has(o.key));
  const ascentTests = ASCENT_OPTIONS.filter((o) => selectedAscents.has(o.key));
  let out = favoritesOnly ? problems.filter((p) => favIds.has(p.id)) : problems;
  if (ratingTests.length) out = out.filter((p) => ratingTests.some((o) => o.test(p.rating_avg)));
  if (ascentTests.length) out = out.filter((p) => ascentTests.some((o) => o.test(p.ascents ?? 0)));
  return out;
}
