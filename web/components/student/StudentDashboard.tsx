"use client";

import { useState } from "react";
import { UserCircle2, ChevronDown } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import MentorDialog from "./MentorDialog";
import CategoryGrid from "./CategoryGrid";
import RecentActivity, { type ResolvedSession } from "./RecentActivity";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentDashboardProps {
  userId:               string;
  nickname:             string;
  initialMentorId:      string | null;
  initialMentorNickname: string | null;
  recentSessions:       ResolvedSession[];
  activeCategoryIds:    string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudentDashboard({
  userId,
  nickname,
  initialMentorId,
  initialMentorNickname,
  recentSessions,
  activeCategoryIds,
}: StudentDashboardProps): JSX.Element {
  const [mentorId,       setMentorId]       = useState<string | null>(initialMentorId);
  const [mentorNickname, setMentorNickname] = useState<string | null>(initialMentorNickname);
  const [dialogOpen,     setDialogOpen]     = useState(false);

  const hasMentor = !!mentorId;

  function handleMentorSet(id: string, nick: string): void {
    setMentorId(id);
    setMentorNickname(nick);
  }

  function handleNoMentor(): void {
    setDialogOpen(true);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">

          {/* Brand */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">
              <span className="text-lens-400">Edu</span>Lens
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5
                             text-[10px] font-semibold
                             bg-lens-500/15 text-lens-300 border border-lens-500/25">
              학생
            </span>
          </div>

          {/* Right side: mentor button (only when mentor is set) + UserButton */}
          <div className="flex items-center gap-3">
            {hasMentor && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5",
                  "text-sm transition-all duration-150",
                  "border-lens-500/30 text-lens-300",
                  "hover:bg-accent focus:outline-none focus:ring-2",
                  "focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
                )}
              >
                <UserCircle2 className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">
                  멘토: {mentorNickname}
                </span>
                <span className="sm:hidden">{mentorNickname}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            )}

            {/* Clerk user menu — includes logout */}
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">

        {/* Welcome */}
        <section>
          <h1 className="text-2xl font-bold tracking-tight">
            안녕하세요, <span className="text-lens-400">{nickname}</span>님 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            오늘도 함께 성장해 봐요. 카테고리를 선택하면 AI 화면 감지가 시작됩니다.
          </p>
        </section>

        {/* No-mentor banner — shown ONLY when mentor is not set.
            This is the single entry point for setting a mentor in that state. */}
        {!hasMentor && (
          <div className="flex items-start gap-4 rounded-2xl border border-amber-500/30
                           bg-amber-500/10 px-5 py-4">
            <span className="text-2xl mt-0.5 select-none" role="img" aria-label="알림">💡</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">
                멘토가 아직 설정되지 않았습니다
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                멘토를 설정하면 강사가 실시간으로 학습 현황을 확인하고 도움을 줄 수 있어요.
                학습 카테고리를 실행하기 전에 먼저 설정해 주세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="shrink-0 self-center rounded-xl border border-amber-500/50
                         bg-amber-500/15 px-4 py-2
                         text-sm font-semibold text-amber-300
                         hover:bg-amber-500/25 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              설정하기
            </button>
          </div>
        )}

        {/* Category grid */}
        <section>
          <CategoryGrid
            userId={userId}
            mentorId={mentorId}
            onNoMentor={handleNoMentor}
            activeCategoryIds={activeCategoryIds}
          />
        </section>

        <hr className="border-border" />

        {/* Recent activity */}
        <section>
          <RecentActivity recentSessions={recentSessions} />
        </section>

      </main>

      {/* ── Mentor dialog ─────────────────────────────────────────────────── */}
      <MentorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onMentorSet={handleMentorSet}
      />
    </div>
  );
}
