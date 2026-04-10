"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useClerk, useSession } from "@clerk/nextjs";
import { Aperture, Loader2, GraduationCap, Presentation } from "lucide-react";
import { saveOnboarding } from "@/app/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "student" | "instructor";

// ── Role option card ──────────────────────────────────────────────────────────

interface RoleCardProps {
  value:       Role;
  selected:    boolean;
  icon:        React.ReactNode;
  title:       string;
  description: string;
  onSelect:    (r: Role) => void;
}

function RoleCard({ value, selected, icon, title, description, onSelect }: RoleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        "flex flex-col items-start gap-2 rounded-2xl border p-5 text-left",
        "transition-all duration-150 focus:outline-none focus-visible:ring-2",
        "focus-visible:ring-lens-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-lens-500/70 bg-lens-500/10 shadow-lg shadow-lens-500/15"
          : "border-border bg-card hover:border-lens-500/40 hover:bg-accent/40",
      ].join(" ")}
      aria-pressed={selected}
    >
      <span className={[
        "flex h-10 w-10 items-center justify-center rounded-xl",
        selected ? "bg-lens-500/25 text-lens-300" : "bg-muted text-muted-foreground",
      ].join(" ")}>
        {icon}
      </span>
      <div>
        <p className={`text-sm font-semibold ${selected ? "text-foreground" : "text-foreground/80"}`}>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      {/* Selection indicator */}
      <span className={[
        "ml-auto mt-auto self-end flex h-5 w-5 items-center justify-center rounded-full",
        "border-2 transition-colors shrink-0",
        selected
          ? "border-lens-500 bg-lens-500"
          : "border-border bg-transparent",
      ].join(" ")}>
        {selected && (
          <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
            <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage(): JSX.Element {
  const router        = useRouter();
  const { user }      = useUser();
  const { session }   = useSession();
  const { signOut }   = useClerk();

  const [nickname,     setNickname]     = useState("");
  const [role,         setRole]         = useState<Role | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const canSubmit = nickname.trim().length > 0 && role !== null && !isLoading && !isCancelling;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !role) return;

    setError(null);
    setIsLoading(true);
    try {
      const result = await saveOnboarding({ nickname: nickname.trim(), role });

      if (!result.success) {
        setError(result.error);
        return;
      }

      // 1. Sync local user object with the server-side publicMetadata update.
      await user?.reload();
      // 2. Force Clerk to mint a new JWT that contains the updated role and
      //    write it to the session cookie — without this, the middleware reads
      //    the OLD cached token and may redirect back to /onboarding.
      await session?.getToken({ skipCache: true });
      // 3. Tell Next.js Server Components to re-render with the fresh token,
      //    then soft-navigate (no full page reload / flash).
      router.refresh();
      router.push(result.role === "instructor" ? "/admin" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    setIsCancelling(true);
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center
                    bg-background px-4 py-16 gap-10">

      {/* ── Brand ────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl
                           bg-lens-gradient shadow-xl shadow-lens-500/35">
            <Aperture className="h-7 w-7 text-white" aria-hidden />
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">에듀렌즈 시작하기</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
          처음 오셨군요! 닉네임과 역할을 설정하면 바로 시작할 수 있어요.
        </p>
      </div>

      {/* ── Form card ────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border
                   bg-card p-8 shadow-xl shadow-black/5 space-y-7"
      >
        {/* Nickname */}
        <div className="space-y-2">
          <label htmlFor="nickname" className="block text-sm font-medium text-foreground">
            닉네임
          </label>
          <input
            id="nickname"
            type="text"
            placeholder="다른 사람에게 표시될 이름을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            autoFocus
            required
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5
                       text-sm placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-lens-500/40
                       transition-shadow"
          />
          <p className="text-[11px] text-muted-foreground/60 text-right">
            {nickname.length} / 30
          </p>
        </div>

        {/* Role selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">역할 선택</p>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard
              value="student"
              selected={role === "student"}
              onSelect={setRole}
              icon={<GraduationCap className="h-5 w-5" aria-hidden />}
              title="수강생"
              description="AI 진단과 힌트로 학습 막힘을 스스로 해결해요"
            />
            <RoleCard
              value="instructor"
              selected={role === "instructor"}
              onSelect={setRole}
              icon={<Presentation className="h-5 w-5" aria-hidden />}
              title="강사"
              description="수강생의 학습 현황을 실시간으로 모니터링해요"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10
                        px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 rounded-xl
                     bg-lens-gradient py-3 text-sm font-semibold text-white
                     shadow-md shadow-lens-500/30
                     hover:shadow-lg hover:shadow-lens-500/40
                     transition-all active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              저장 중…
            </>
          ) : (
            "에듀렌즈 시작하기 →"
          )}
        </button>

        {/* Cancel / escape hatch */}
        <button
          type="button"
          onClick={handleCancel}
          disabled={isLoading || isCancelling}
          className="w-full flex items-center justify-center gap-2 rounded-xl
                     border border-border py-2.5 text-sm text-muted-foreground
                     hover:bg-accent hover:text-foreground transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isCancelling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              로그아웃 중…
            </>
          ) : (
            "취소 및 처음으로 돌아가기"
          )}
        </button>
      </form>
    </div>
  );
}
