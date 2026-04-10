"use client";

import { useState, useEffect, useTransition } from "react";
import { Search, Loader2, UserCheck2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { searchInstructors, setMentor } from "@/app/actions";
import type { InstructorResult } from "@/app/actions";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface MentorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called optimistically so the parent can update its label immediately. */
  onMentorSet: (mentorId: string, nickname: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MentorDialog({
  open,
  onOpenChange,
  onMentorSet,
}: MentorDialogProps): JSX.Element {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<InstructorResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [isPending,  startTransition] = useTransition();

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }

    setSearching(true);
    const timer = setTimeout(() => {
      searchInstructors(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // ── Reset state when dialog closes ────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  // ── Confirm mentor selection ───────────────────────────────────────────────
  function handleConfirm(): void {
    if (!selectedId) return;
    const selected = results.find((r) => r.id === selectedId);
    if (!selected) return;

    setError(null);
    startTransition(async () => {
      try {
        await setMentor(selectedId);
        onMentorSet(selectedId, selected.nickname);
        onOpenChange(false);
      } catch {
        setError("멘토 설정에 실패했습니다. 다시 시도해 주세요.");
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>멘토 설정</DialogTitle>
          <DialogDescription>
            강사 닉네임으로 검색하여 내 멘토로 지정하세요.
            멘토는 실시간으로 학생의 학습 현황을 모니터링합니다.
          </DialogDescription>
        </DialogHeader>

        {/* ── Search input ─────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="강사 닉네임 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-input bg-background
                       pl-9 pr-10 py-2.5 text-sm placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-lens-500/40 transition-shadow"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* ── Results list ─────────────────────────────────────────────── */}
        {results.length > 0 && (
          <ul className="mt-1 max-h-52 overflow-y-auto rounded-xl border border-border
                          bg-background p-1.5 space-y-0.5">
            {results.map((instructor) => {
              const isSelected = selectedId === instructor.id;
              return (
                <li key={instructor.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(instructor.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                      "transition-colors text-left",
                      isSelected
                        ? "bg-lens-500/20 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {/* Avatar */}
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      "text-xs font-bold border transition-colors",
                      isSelected
                        ? "bg-lens-500/30 border-lens-500/50 text-lens-300"
                        : "bg-muted border-border text-muted-foreground",
                    )}>
                      {instructor.nickname.slice(0, 2).toUpperCase()}
                    </span>

                    <span className="font-medium flex-1 truncate">{instructor.nickname}</span>

                    {isSelected && (
                      <UserCheck2 className="h-4 w-4 shrink-0 text-lens-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {query.trim() && !searching && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <span className="block text-2xl mb-2">🔍</span>
            "{query}"에 해당하는 강사를 찾을 수 없습니다.
          </p>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* ── Confirm button ────────────────────────────────────────────── */}
        <button
          type="button"
          disabled={!selectedId || isPending}
          onClick={handleConfirm}
          className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl
                     bg-lens-gradient py-2.5 text-sm font-semibold text-white
                     shadow-md shadow-lens-500/30 hover:shadow-lg hover:shadow-lens-500/40
                     transition-all active:scale-95
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" />설정 중...</>
            : "멘토로 설정하기"
          }
        </button>
      </DialogContent>
    </Dialog>
  );
}
