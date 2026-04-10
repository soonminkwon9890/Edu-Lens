import { SignIn } from "@clerk/nextjs";
import { Aperture } from "lucide-react";

export default function SignInPage(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center
                    bg-background px-4 py-12 gap-8">
      {/* ── Brand header ─────────────────────────────────────────────── */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl
                           bg-lens-gradient shadow-lg shadow-lens-500/30">
            <Aperture className="h-6 w-6 text-white" aria-hidden />
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">에듀렌즈 로그인</h1>
        <p className="text-sm text-muted-foreground">
          계속하려면 로그인해 주세요
        </p>
      </div>

      {/* ── Clerk SignIn — styled to match the app design system ─────── */}
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        appearance={{
          elements: {
            rootBox:         "w-full max-w-md",
            card:            "rounded-2xl border border-border bg-card shadow-xl shadow-black/5 p-0",
            headerTitle:     "hidden",   // we show our own header above
            headerSubtitle:  "hidden",
            socialButtonsBlockButton:
              "rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm",
            dividerRow:      "text-muted-foreground",
            formFieldLabel:  "text-sm font-medium text-foreground",
            formFieldInput:
              "rounded-lg border border-input bg-background text-sm " +
              "focus:ring-2 focus:ring-lens-500/40 transition-shadow",
            formButtonPrimary:
              "rounded-lg bg-lens-gradient text-white font-semibold text-sm " +
              "shadow-md shadow-lens-500/30 hover:shadow-lens-500/50 transition-shadow",
            footerActionLink: "text-lens-400 hover:text-lens-300 font-medium",
            identityPreviewText: "text-foreground",
            identityPreviewEditButton: "text-lens-400 hover:text-lens-300",
          },
        }}
      />
    </div>
  );
}
