"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useCloudSync } from "@/lib/useCloudSync";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Mounted here so every route mirrors the shelf and saves to the database
  // without each page opting in.
  useCloudSync();

  // Created in state so each browser session gets exactly one client, and it is
  // never shared across requests during SSR.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The Archive's catalogue is effectively static; avoid refetch churn.
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
