import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type {
  EpochMilliseconds,
  Language,
  ReleaseStatus,
  ReleaseTriggerKind,
} from '@/lib/cms/contracts.ts';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/*                                                                     */
/* Camelcase view models over `releases` / `site_state`. The dashboard */
/* performs no I/O: the caller supplies state and handles the actions. */
/* ------------------------------------------------------------------ */

export interface ReleaseSummary {
  id: string;
  status: ReleaseStatus;
  triggerKind: ReleaseTriggerKind;
  /** Number of visible routes in the release manifest. */
  itemCount: number;
  manifestSha256: string;
  codeCommit: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  finishedAt: EpochMilliseconds | null;
}

export type ReleaseChangeKind = 'added' | 'updated' | 'removed';

export interface ReleaseDiffEntry {
  postId: string;
  lang: Language;
  slug: string;
  title: string;
  change: ReleaseChangeKind;
}

/** What the next release would do, relative to the live one. */
export interface ReleaseDiff {
  baseReleaseId: string | null;
  entries: ReleaseDiffEntry[];
  /** Routes carried over unchanged; shown as context, not listed. */
  unchangedCount: number;
}

export interface PublishRequest {
  triggerKind: ReleaseTriggerKind;
  baseReleaseId: string | null;
  entries: ReleaseDiffEntry[];
}

export interface ReleaseDashboardProps {
  /** From `site_state.live_release_id`; null before the first successful release. */
  liveReleaseId?: string | null;
  /** Newest first. Includes the in-flight release, if any. */
  releases?: ReleaseSummary[];
  pendingDiff?: ReleaseDiff;
  /** Omit to render the dashboard read-only. Rejecting surfaces the error inline. */
  onPublish?: (request: PublishRequest) => void | Promise<void>;
  onRollback?: (releaseId: string) => void | Promise<void>;
  onSelectRelease?: (release: ReleaseSummary) => void;
  className?: string;
}

/**
 * `idx_one_active_release` (db/migrations/0003_releases.sql) permits exactly one
 * release in a non-terminal state, so these statuses block a new publish.
 */
const IN_FLIGHT_STATUSES: readonly ReleaseStatus[] = [
  'queued',
  'building',
  'deploying',
  'reconciling',
];

export function isInFlight(status: ReleaseStatus): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

const STATUS_STYLE: Record<ReleaseStatus, string> = {
  queued: 'border-border text-muted-foreground',
  building: 'border-foreground/40 text-foreground',
  deploying: 'border-foreground/40 text-foreground',
  reconciling: 'border-foreground/40 text-foreground',
  live: 'border-foreground bg-foreground text-background',
  failed: 'border-destructive text-destructive',
};

const CHANGE_STYLE: Record<ReleaseChangeKind, string> = {
  added: 'text-foreground',
  updated: 'text-muted-foreground',
  removed: 'text-destructive',
};

const CHANGE_ICON: Record<ReleaseChangeKind, typeof Plus> = {
  added: Plus,
  updated: ArrowUpRight,
  removed: Minus,
};

/** Fixed locale + UTC so server and client markup agree during hydration. */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function formatDateTime(value: EpochMilliseconds): string {
  return `${DATE_TIME_FORMAT.format(new Date(value))} UTC`;
}

function formatDuration(from: EpochMilliseconds, to: EpochMilliseconds | null): string | null {
  if (to === null) return null;
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/* ------------------------------------------------------------------ */
/* Mock state                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_LIVE_RELEASE_ID = 'rel_00000000000042';

export const MOCK_RELEASES: ReleaseSummary[] = [
  {
    id: 'rel_00000000000042',
    status: 'live',
    triggerKind: 'publish',
    itemCount: 12,
    manifestSha256: 'b7c1d2e3f40516273849a0b1c2d3e4f50617283940a1b2c3d4e5f60718293a0b1',
    codeCommit: '504ecf8',
    errorCode: null,
    errorMessage: null,
    createdAt: 1789030800000,
    updatedAt: 1789031160000,
    finishedAt: 1789031160000,
  },
  {
    id: 'rel_00000000000041',
    status: 'failed',
    triggerKind: 'publish',
    itemCount: 12,
    manifestSha256: '3a9f0c1d2e3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c',
    codeCommit: '11418bf',
    errorCode: 'DEPLOY_TIMEOUT',
    errorMessage: 'Provider deployment did not confirm within 600s.',
    createdAt: 1788944400000,
    updatedAt: 1788945300000,
    finishedAt: 1788945300000,
  },
  {
    id: 'rel_00000000000040',
    status: 'live',
    triggerKind: 'rollback',
    itemCount: 11,
    manifestSha256: 'f10e2d3c4b5a69788796a5b4c3d2e1f00918273645a5b4c3d2e1f0a9b8c7d6e5f',
    codeCommit: 'e30308b',
    errorCode: null,
    errorMessage: null,
    createdAt: 1788858000000,
    updatedAt: 1788858420000,
    finishedAt: 1788858420000,
  },
];

export const MOCK_DIFF: ReleaseDiff = {
  baseReleaseId: MOCK_LIVE_RELEASE_ID,
  unchangedCount: 10,
  entries: [
    {
      postId: 'post_th_00000002',
      lang: 'th',
      slug: 'thai-inflation-2026',
      title: 'อ่านตัวเลขเงินเฟ้อไทย ปี 2569',
      change: 'added',
    },
    {
      postId: 'post_en_00000002',
      lang: 'en',
      slug: 'thai-inflation-2026',
      title: 'Reading Thai Inflation in 2026',
      change: 'added',
    },
    {
      postId: 'post_th_00000001',
      lang: 'th',
      slug: 'cloudflare-cms-architecture',
      title: 'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
      change: 'updated',
    },
    {
      postId: 'post_th_00000004',
      lang: 'th',
      slug: 'sanity-migration-retro',
      title: 'บันทึกการย้ายออกจาก Sanity',
      change: 'removed',
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

export function StatusBadge({
  status,
  className,
}: {
  status: ReleaseStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2 py-0.5 text-[0.7rem] uppercase tracking-[0.14em]',
        STATUS_STYLE[status],
        className
      )}
    >
      {isInFlight(status) ? (
        <span className="h-1.5 w-1.5 animate-pulse bg-current" aria-hidden />
      ) : null}
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function DiffTally({ diff }: { diff: ReleaseDiff }) {
  const counts = useMemo(() => {
    const tally: Record<ReleaseChangeKind, number> = { added: 0, updated: 0, removed: 0 };
    for (const entry of diff.entries) tally[entry.change] += 1;
    return tally;
  }, [diff]);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs tabular-nums">
      {(['added', 'updated', 'removed'] as const).map((change) => {
        const Icon = CHANGE_ICON[change];
        return (
          <span key={change} className={cn('inline-flex items-center gap-1.5', CHANGE_STYLE[change])}>
            <Icon className="h-3 w-3" aria-hidden />
            {counts[change]} {change}
          </span>
        );
      })}
      <span className="text-muted-foreground/60">{diff.unchangedCount} unchanged</span>
    </div>
  );
}

/** Lightweight modal: Escape to close, focus moved in and restored on close. */
function Modal({
  title,
  labelledBy,
  onClose,
  children,
}: {
  title: string;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-full max-w-xl flex-col border border-border bg-background outline-none"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h3 id={labelledBy} className="font-serif text-lg tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export default function ReleaseDashboard({
  liveReleaseId = MOCK_LIVE_RELEASE_ID,
  releases = MOCK_RELEASES,
  pendingDiff = MOCK_DIFF,
  onPublish,
  onRollback,
  onSelectRelease,
  className,
}: ReleaseDashboardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogTitleId = useId();

  const live = useMemo(
    () => releases.find((release) => release.id === liveReleaseId) ?? null,
    [releases, liveReleaseId]
  );
  const active = useMemo(() => releases.find((release) => isInFlight(release.status)) ?? null, [releases]);
  const history = useMemo(
    () => releases.filter((release) => release.id !== active?.id),
    [releases, active]
  );

  const changeCount = pendingDiff.entries.length;
  const blockedReason = active
    ? `Release ${active.id} is ${active.status}. Only one release may be in flight.`
    : changeCount === 0
      ? 'No draft changes to publish.'
      : !onPublish
        ? 'Publishing is disabled in this view.'
        : null;

  const closeModal = useCallback(() => setModalOpen(false), []);

  const confirmPublish = async () => {
    if (!onPublish || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await onPublish({
        triggerKind: 'publish',
        baseReleaseId: pendingDiff.baseReleaseId,
        entries: pendingDiff.entries,
      });
      setModalOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (releaseId: string) => {
    if (!onRollback || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await onRollback(releaseId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Rollback failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn('flex flex-col bg-background text-foreground', className)}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <h2 className="font-serif text-xl tracking-tight">Releases</h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={blockedReason !== null || busy}
          title={blockedReason ?? undefined}
          className="border border-foreground px-4 py-1.5 text-xs uppercase tracking-[0.1em] transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          Publish release
          {changeCount > 0 ? <span className="ml-2 tabular-nums opacity-70">{changeCount}</span> : null}
        </button>
      </header>

      {actionError ? (
        <p role="alert" className="border-b border-destructive/40 bg-destructive/5 px-6 py-2 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}

      {/* Live release ---------------------------------------------- */}
      <div className="border-b border-border px-6 py-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground/70">
            Live
          </span>
          {live ? <StatusBadge status={live.status} /> : null}
        </div>

        {live ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Field label="Release ID">
              <span className="font-mono text-xs">{live.id}</span>
            </Field>
            <Field label="Routes">
              <span className="tabular-nums">{live.itemCount}</span>
            </Field>
            <Field label="Commit">
              <span className="font-mono text-xs">{live.codeCommit ?? '—'}</span>
            </Field>
            <Field label="Published">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDateTime(live.finishedAt ?? live.updatedAt)}
              </span>
            </Field>
            <div className="col-span-2 md:col-span-4">
              <Field label="Manifest SHA-256">
                <span className="block truncate font-mono text-[0.7rem] text-muted-foreground">
                  {live.manifestSha256}
                </span>
              </Field>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {liveReleaseId
              ? `Live release ${liveReleaseId} is not in the loaded history.`
              : 'Nothing published yet. The first release will become live.'}
          </p>
        )}
      </div>

      {/* In-flight release ------------------------------------------ */}
      {active ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-muted/30 px-6 py-4">
          <StatusBadge status={active.status} />
          <span className="font-mono text-xs">{active.id}</span>
          <span className="text-xs capitalize text-muted-foreground">{active.triggerKind}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            started {formatDateTime(active.createdAt)}
          </span>
        </div>
      ) : null}

      {/* Pending changes -------------------------------------------- */}
      <div className="border-b border-border px-6 py-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <span className="text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground/70">
            Pending changes
          </span>
          {blockedReason ? (
            <span className="text-[0.7rem] text-muted-foreground">{blockedReason}</span>
          ) : null}
        </div>
        {changeCount === 0 ? (
          <p className="text-sm text-muted-foreground">Drafts match the live release.</p>
        ) : (
          <DiffTally diff={pendingDiff} />
        )}
      </div>

      {/* History ---------------------------------------------------- */}
      <div className="px-6 py-5">
        <h3 className="mb-3 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground/70">
          Recent releases
        </h3>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No releases recorded.</p>
        ) : (
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {history.map((release) => {
              const duration = formatDuration(release.createdAt, release.finishedAt);
              return (
                <li key={release.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <StatusBadge status={release.status} className="shrink-0" />

                  <button
                    type="button"
                    onClick={() => onSelectRelease?.(release)}
                    disabled={!onSelectRelease}
                    className="font-mono text-xs underline-offset-4 transition-colors hover:underline disabled:cursor-default disabled:no-underline"
                  >
                    {release.id}
                  </button>

                  {release.id === liveReleaseId ? (
                    <span className="border border-border px-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                      current
                    </span>
                  ) : null}

                  <span className="text-xs capitalize text-muted-foreground">{release.triggerKind}</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {release.itemCount} routes
                  </span>

                  <span className="ml-auto flex items-center gap-4">
                    <span className="text-xs tabular-nums text-muted-foreground/70">
                      {formatDateTime(release.createdAt)}
                      {duration ? ` · ${duration}` : null}
                    </span>
                    {onRollback && release.status === 'live' && release.id !== liveReleaseId ? (
                      <button
                        type="button"
                        onClick={() => handleRollback(release.id)}
                        disabled={busy || active !== null}
                        title={active ? 'A release is already in flight.' : `Roll back to ${release.id}`}
                        className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-[0.7rem] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden />
                        Roll back
                      </button>
                    ) : null}
                  </span>

                  {release.errorMessage ? (
                    <p className="w-full text-xs text-destructive">
                      <span className="font-mono">{release.errorCode ?? 'ERROR'}</span> — {release.errorMessage}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Publish modal ---------------------------------------------- */}
      {modalOpen ? (
        <Modal title="Publish release" labelledBy={dialogTitleId} onClose={closeModal}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Base release">
                <span className="font-mono text-xs">{pendingDiff.baseReleaseId ?? 'none (first release)'}</span>
              </Field>
              <Field label="Routes after publish">
                <span className="tabular-nums">
                  {pendingDiff.unchangedCount +
                    pendingDiff.entries.filter((entry) => entry.change !== 'removed').length}
                </span>
              </Field>
            </dl>

            <div className="mb-3 border-t border-border pt-4">
              <DiffTally diff={pendingDiff} />
            </div>

            <ul className="divide-y divide-border/60">
              {pendingDiff.entries.map((entry) => {
                const Icon = CHANGE_ICON[entry.change];
                return (
                  <li key={`${entry.postId}-${entry.change}`} className="flex items-start gap-3 py-2.5">
                    <Icon
                      className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', CHANGE_STYLE[entry.change])}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{entry.title}</span>
                      <span className="font-mono text-[0.7rem] text-muted-foreground/70">
                        /{entry.lang}/{entry.slug}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                      {entry.change}
                    </span>
                  </li>
                );
              })}
            </ul>

            {pendingDiff.entries.some((entry) => entry.change === 'removed') ? (
              <p className="mt-4 flex items-start gap-2 border border-border px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                Removed routes stop resolving as soon as this release goes live. Previous releases stay
                intact and can be rolled back to.
              </p>
            ) : null}

            {actionError ? (
              <p role="alert" className="mt-4 text-xs text-destructive">
                {actionError}
              </p>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={closeModal}
              className="px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPublish}
              disabled={busy || !onPublish}
              className="border border-foreground px-4 py-1.5 text-xs uppercase tracking-[0.1em] transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              {busy ? 'Queueing…' : 'Queue release'}
            </button>
          </footer>
        </Modal>
      ) : null}
    </section>
  );
}
