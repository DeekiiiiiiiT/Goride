import { useQuery } from "@tanstack/react-query";
import { refineriesApi } from "./refineriesApi";

export function useRefineryList() {
  return useQuery({ queryKey: ["refineries"], queryFn: () => refineriesApi.list() });
}

export function useRefineryBoard(slug: string, week: string) {
  return useQuery({
    queryKey: ["refinery-board", slug, week],
    queryFn: () => refineriesApi.board(slug, week || null),
    enabled: Boolean(slug),
  });
}

export function useRefinerySeries(slug: string, products: string[], from: string | null, to: string | null, compare: boolean) {
  return useQuery({
    queryKey: ["refinery-series", slug, products.join(","), from, to, compare],
    queryFn: () => refineriesApi.series(slug, products, from, to, compare),
    enabled: Boolean(slug) && products.length > 0,
  });
}

export function useRefineryHistory(slug: string, year: number | null, page: number) {
  return useQuery({
    queryKey: ["refinery-history", slug, year, page],
    queryFn: () => refineriesApi.history(slug, year, page),
    enabled: Boolean(slug),
  });
}

export function useRefineryRuns(slug: string) {
  return useQuery({
    queryKey: ["refinery-runs", slug],
    queryFn: () => refineriesApi.runs(slug),
    enabled: Boolean(slug),
  });
}

export function useBenchmarkName() {
  const list = useRefineryList();
  return list.data?.benchmark?.name || list.data?.refineries.find((row) => row.is_benchmark)?.name || "";
}
