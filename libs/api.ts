import axios from "axios";

// Backend API base URL - can be configured via environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Backend price response types
export interface BackendPriceResponse {
  coin: string;
  price: number;
  created_at: string;
}

export interface PriceComparisonResponse {
  coin: string;
  prices: BackendPriceResponse[];
  count: number;
}

// Fetcher function for React Query
export const fetchPriceComparison = async (
  coin: string
): Promise<PriceComparisonResponse> => {
  const response = await apiClient.get<PriceComparisonResponse>(
    `/api/prices/${coin}`
  );
  return response.data;
};

export default apiClient;
