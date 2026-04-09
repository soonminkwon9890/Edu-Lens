"use client";

/**
 * Providers
 * ---------
 * Single client boundary that wraps all context/store providers.
 * Add new providers here — keeps layout.tsx a pure Server Component.
 */

import { type ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Add ToastProvider, ThemeProvider, QueryClientProvider, etc. here as needed
  return <>{children}</>;
}
