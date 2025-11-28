import { useQuery } from "@tanstack/react-query";
import { fetchPriceComparison, type PriceComparisonResponse } from "@/libs/api";

export function usePriceComparison(coin: string) {
  return useQuery<PriceComparisonResponse, Error>({
    queryKey: ["priceComparison", coin],
    queryFn: () => fetchPriceComparison(coin),
    enabled: !!coin,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}
