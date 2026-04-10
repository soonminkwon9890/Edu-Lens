"use client";

import { useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Aperture, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "credentials" | "verify";
type Role = "student" | "instructor";

// Clerk wraps API errors in an `errors` array; this helper extracts the message
function extractClerkError(err: unknown): string {
  if (err instanceof Error) return err.message;
  const clerkErr = err as { errors?: Array<{ longMessage?: string; message?: string }> };
  return (
    clerkErr.errors?.[0]?.longMessage ??
    clerkErr.errors?.[0]?.message ??
    "알 수 없는 오류가 발생했습니다."
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SignUpPage(): JSX.Element {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [step,     setStep]     = useState<Step>("credentials");
  const [nickname, setNickname] = useState("");
  const [role,     setRole]     = useState<Role>("student");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [code,     setCode]     = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // ── Step 1: collect credentials + custom fields ───────────────────────────
  async function handleCredentials(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setLoading(true);

    try {
      // role and nickname go into unsafeMetadata so the webhook can read them
      await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: { role, nickname },
      });

      // Send the email verification code
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify email with OTP code ────────────────────────────────────
  async function handleVerify(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Middleware will redirect based on role once publicMetadata propagates
        router.push("/");
      } else {
        // Clerk may require additional steps (e.g. OAuth finish)
        setError("인증을 완료할 수 없습니다. 다시 시도해 주세요.");
      }
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm " +
    "placeholder:text-muted-foreground focus:outline-none " +
    "focus:ring-2 focus:ring-lens-500/40 transition-shadow";

  const submitCls =
    "w-full flex items-center justify-center gap-2 rounded-lg " +
    "bg-lens-gradient py-2.5 text-sm font-semibold text-white " +
    "shadow-md shadow-lens-500/30 hover:shadow-lens-500/50 " +
    "transition-shadow disabled:opacity-60 disabled:cursor-not-allowed";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl
                             bg-lens-gradient shadow-lg shadow-lens-500/30">
              <Aperture className="h-6 w-6 text-white" aria-hidden />
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">에듀렌즈 가입</h1>
          <p className="text-sm text-muted-foreground">
            {step === "credentials"
              ? "계정을 만들어 학습을 시작하세요"
              : `${email}로 발송된 인증 코드를 입력해 주세요`}
          </p>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 pt-1">
            {(["credentials", "verify"] as const).map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step === s
                    ? "w-6 bg-lens-500"
                    : step === "verify" && i === 0
                      ? "w-3 bg-lens-500/40"
                      : "w-3 bg-border",
                )}
              />
            ))}
          </div>
        </div>

        {/* ── Card ──────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">

          {/* ── Step 1: credentials ───────────────────────────────────── */}
          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="space-y-5">

              {/* Role selection */}
              <fieldset>
                <legend className="text-sm font-medium mb-3">계정 유형 선택</legend>
                <div className="grid grid-cols-2 gap-3">
                  {(["student", "instructor"] as const).map((r) => (
                    <label
                      key={r}
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4",
                        "cursor-pointer select-none transition-all duration-150",
                        role === r
                          ? "border-lens-500 bg-lens-500/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-lens-500/40 hover:bg-accent/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={role === r}
                        onChange={() => setRole(r)}
                        className="sr-only"
                      />
                      <span className="text-2xl" role="img" aria-label={r}>
                        {r === "student" ? "🎓" : "🧑‍🏫"}
                      </span>
                      <span className="text-sm font-semibold">
                        {r === "student" ? "학생" : "강사"}
                      </span>
                      <span className="text-[11px] text-center leading-tight opacity-70">
                        {r === "student"
                          ? "AI 힌트로 학습"
                          : "수강생 현황 모니터링"}
                      </span>
                      {/* Selected checkmark */}
                      {role === r && (
                        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center
                                         rounded-full bg-lens-500 text-white text-[10px]">
                          ✓
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Nickname */}
              <div className="space-y-1.5">
                <label htmlFor="nickname" className="text-sm font-medium">
                  닉네임
                </label>
                <input
                  id="nickname"
                  type="text"
                  required
                  minLength={2}
                  maxLength={30}
                  autoComplete="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="대시보드에 표시될 이름"
                  className={inputCls}
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8자 이상"
                  className={inputCls}
                />
              </div>

              {/* Error */}
              {error && (
                <p role="alert" className="text-sm text-destructive bg-destructive/10
                                           rounded-lg px-3 py-2 leading-relaxed">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || !isLoaded} className={submitCls}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                다음 단계
              </button>
            </form>
          )}

          {/* ── Step 2: OTP verification ────────────────────────────── */}
          {step === "verify" && (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="code" className="text-sm font-medium">
                  인증 코드
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className={cn(inputCls, "text-center tracking-[0.6em] text-lg font-mono")}
                />
                <p className="text-xs text-muted-foreground">
                  스팸함도 확인해 주세요. 코드는 10분간 유효합니다.
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive bg-destructive/10
                                           rounded-lg px-3 py-2 leading-relaxed">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || code.length < 6} className={submitCls}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                인증 완료
              </button>

              <button
                type="button"
                onClick={() => { setStep("credentials"); setCode(""); setError(null); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← 이전 단계로
              </button>
            </form>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link
            href="/sign-in"
            className="text-lens-400 hover:text-lens-300 font-medium transition-colors"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
