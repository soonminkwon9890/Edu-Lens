"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { type ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): JSX.Element {
  return (
    <ClerkProvider
      // Korean locale for Clerk's built-in UI strings
      // (custom sign-up is fully Korean already; this covers sign-in + error messages)
      localization={{
        locale: "ko-KR",
      }}
      appearance={{
        baseTheme: dark,
        variables: {
          // Align with the app's lens-500 brand colour
          colorPrimary:     "#7c5cfc",
          colorBackground:  "hsl(var(--background))",
          colorInputBackground: "hsl(var(--background))",
          colorText:        "hsl(var(--foreground))",
          borderRadius:     "0.75rem",
          fontFamily:       "var(--font-sans), system-ui, sans-serif",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      {/* Add ToastProvider, QueryClientProvider, etc. here as needed */}
      {children}
    </ClerkProvider>
  );
}
