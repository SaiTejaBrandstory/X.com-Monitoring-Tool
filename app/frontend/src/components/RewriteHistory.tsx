/**
 * RewriteHistory — chronological log of AI-generated rewrites.
 *
 * Fetches `/api/v1/entities/rewritten_outputs` scoped to the signed-in user,
 * with persona/platform/funnel-stage/date-range/search filters, row-level
 * actions (view side-by-side, copy, re-open in workspace, delete), and
 * CSV export of the filtered set.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Calendar,
  Copy,
  Download,
  Eye,
  History,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  client,
  displayAiEngineUserLabel,
  estimateCost,
  FunnelStage,
  IngestedPost,
  Persona,
  Platform,
  RewrittenOutput,
  timeAgo,
} from '@/lib/personaApi';
import RewriteWorkspace from './RewriteWorkspace';

interface Props {
  userId: string;
  onNavigateToFeed?: () => void;
}

type PlatformFilter = 'all' | Platform | 'instagram';
type StageFilter = 'all' | FunnelStage | 'none';

/**
 * Best-effort funnel-stage inference. `rewritten_outputs` does not currently
 * persist the stage the user selected at generation time, so we surface stage
 * as "—" unless we can recover it from model metadata in the future. We still
 * expose the filter so it lights up once that field is added.
 */
const inferStage = (_row: RewrittenOutput): StageFilter => {
  // Placeholder: if a future schema adds `funnel_stage` column, read it here.
  return 'none';
};

const PLATFORM_COLOR: Record<string, string> = {
  twitter: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  linkedin: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  instagram: 'bg-pink-500/15 text-pink-300 border-pink-500/40',
};

const STAGE_COLOR: Record<string, string> = {
  TOFU: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  MOFU: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  BOFU: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const formatFullTimestamp = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const csvEscape = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const PAGE_SIZE = 50;

const RewriteHistory = ({ userId, onNavigateToFeed }: Props) => {
  const [rows, setRows] = useState<RewrittenOutput[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [sortDesc, setSortDesc] = useState<boolean>(true);

  // Row interaction state
  const [viewRow, setViewRow] = useState<RewrittenOutput | null>(null);
  const [deleteRow, setDeleteRow] = useState<RewrittenOutput | null>(null);
  const [reopenTarget, setReopenTarget] = useState<{
    post: IngestedPost;
    savedPostId?: number;
  } | null>(null);

  const personaById = useMemo(() => {
    const m = new Map<number, Persona>();
    personas.forEach((p) => m.set(p.id, p));
    return m;
  }, [personas]);

  // Load history + personas
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [outputsResp, personasResp] = await Promise.all([
          client.entities.rewritten_outputs.queryAll({ limit: 500 }),
          client.entities.personas.queryAll({ limit: 200 }),
        ]);
        if (cancelled) return;
        const items = (outputsResp.data?.items || []) as RewrittenOutput[];
        // Backend scopes by user_id via RLS, but double-filter for safety.
        const mine = items.filter((r) => !r.user_id || r.user_id === userId);
        setRows(mine);
        setPersonas((personasResp.data?.items || []) as Persona[]);
      } catch (e) {
        console.error('load history', e);
        toast.error('Failed to load rewrite history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const filtered = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate + 'T00:00:00').getTime() : null;
    const toTs = toDate ? new Date(toDate + 'T23:59:59').getTime() : null;
    const needle = searchText.trim().toLowerCase();

    const result = rows.filter((r) => {
      if (personaFilter !== 'all' && String(r.persona_id) !== personaFilter) {
        return false;
      }
      if (
        platformFilter !== 'all' &&
        (r.platform_target || '').toLowerCase() !== platformFilter
      ) {
        return false;
      }
      if (stageFilter !== 'all') {
        const stage = inferStage(r);
        if (stage !== stageFilter) return false;
      }
      if (fromTs || toTs) {
        const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }
      if (needle) {
        const blob = `${r.original_content || ''} ${r.rewritten_content || ''}`.toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortDesc ? tb - ta : ta - tb;
    });
    return result;
  }, [
    rows,
    personaFilter,
    platformFilter,
    stageFilter,
    fromDate,
    toDate,
    searchText,
    sortDesc,
  ]);

  const visible = filtered.slice(0, PAGE_SIZE);

  const resetFilters = () => {
    setPersonaFilter('all');
    setPlatformFilter('all');
    setStageFilter('all');
    setFromDate('');
    setToDate('');
    setSearchText('');
  };

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteRow) return;
    const target = deleteRow;
    setDeleteRow(null);
    try {
      await client.entities.rewritten_outputs.delete({ id: target.id });
      setRows((prev) => prev.filter((r) => r.id !== target.id));
      toast.success('Rewrite deleted');
    } catch (e) {
      console.error('delete', e);
      toast.error('Delete failed');
    }
  };

  const handleReopen = (row: RewrittenOutput) => {
    // Build a synthetic IngestedPost from the stored original content so the
    // workspace can re-generate against the same source.
    const pseudo: IngestedPost = {
      id: -1,
      platform: ((row.platform_target || 'twitter').toLowerCase() === 'linkedin'
        ? 'linkedin'
        : 'twitter') as Platform,
      author_handle: 'history',
      author_name: personaById.get(row.persona_id || -1)?.name || 'From history',
      content: row.original_content || '',
      engagement_score: 0,
    };
    setReopenTarget({ post: pseudo, savedPostId: row.saved_post_id });
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.info('Nothing to export');
      return;
    }
    const header = [
      'created_at',
      'persona',
      'platform',
      'funnel_stage',
      'max_words',
      'word_count',
      'tokens_input',
      'tokens_output',
      'usd_cost',
      'original_text',
      'rewritten_text',
    ];
    const lines = [header.join(',')];
    filtered.forEach((r) => {
      const persona = personaById.get(r.persona_id || -1)?.name || '';
      const stage = inferStage(r);
      const cost = estimateCost(
        r.model_used || '',
        r.tokens_input || 0,
        r.tokens_output || 0,
      );
      const row = [
        r.created_at || '',
        persona,
        r.platform_target || '',
        stage === 'none' ? '' : stage,
        r.max_words ?? '',
        r.word_count ?? '',
        r.tokens_input ?? '',
        r.tokens_output ?? '',
        cost.toFixed(6),
        r.original_content || '',
        r.rewritten_content || '',
      ];
      lines.push(row.map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `rewrite-history-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? '' : 's'}`);
  };

  // --- Reopen in workspace overlay ---
  if (reopenTarget) {
    return (
      <RewriteWorkspace
        userId={userId}
        post={reopenTarget.post}
        savedPostId={reopenTarget.savedPostId}
        onClose={() => {
          setReopenTarget(null);
          // Refresh on close so any new rewrite shows up in the history list.
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  // --- Empty state ---
  if (!loading && rows.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <History className="h-5 w-5 text-violet-300" />
          <h1 className="text-2xl font-semibold">Rewrite History</h1>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center">
          <div className="h-14 w-14 mx-auto rounded-full bg-violet-500/15 text-violet-300 flex items-center justify-center mb-4">
            <Wand2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No rewrites yet</h2>
          <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
            Every AI rewrite you generate is archived here with its persona,
            platform, length budget, and cost. Start from the Live Feed to
            create your first one.
          </p>
          <Button
            className="bg-violet-600 hover:bg-violet-500 text-white"
            onClick={() => onNavigateToFeed?.()}
          >
            Create your first rewrite
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-5 min-w-0 w-full box-border">
      <header className="flex items-start sm:items-center justify-between gap-4 flex-wrap min-w-0">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-violet-300" />
            <h1 className="text-2xl font-semibold">Rewrite History</h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Every generated rewrite, stored with timestamps, persona, platform,
            engine, and cost.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            onClick={() => setSortDesc((v) => !v)}
            title={sortDesc ? 'Showing newest first' : 'Showing oldest first'}
          >
            <ArrowUpDown className="h-4 w-4 mr-1.5" />
            {sortDesc ? 'Newest first' : 'Oldest first'}
          </Button>
        </div>
      </header>

      {/* Filters — wrap + min-w-0 so nothing spills past the viewport */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-w-0 max-w-full space-y-4">
        <div className="min-w-0 w-full">
          <Label className="text-xs text-slate-400">Search</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search original or rewritten text…"
              className="pl-8 w-full min-w-0 max-w-full bg-slate-900 border-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 gap-y-4 items-end min-w-0">
          <div className="min-w-0 sm:col-span-1 lg:col-span-2">
            <Label className="text-xs text-slate-400">Persona</Label>
            <Select value={personaFilter} onValueChange={setPersonaFilter}>
              <SelectTrigger className="mt-1 w-full min-w-0 bg-slate-900 border-slate-800 [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all">All personas</SelectItem>
                {personas.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 sm:col-span-1 lg:col-span-2">
            <Label className="text-xs text-slate-400">Platform</Label>
            <Select
              value={platformFilter}
              onValueChange={(v) => setPlatformFilter(v as PlatformFilter)}
            >
              <SelectTrigger className="mt-1 w-full min-w-0 bg-slate-900 border-slate-800 [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="twitter">Twitter / X</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 sm:col-span-1 lg:col-span-2">
            <Label className="text-xs text-slate-400">Funnel stage</Label>
            <Select
              value={stageFilter}
              onValueChange={(v) => setStageFilter(v as StageFilter)}
            >
              <SelectTrigger className="mt-1 w-full min-w-0 bg-slate-900 border-slate-800 [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="TOFU">TOFU</SelectItem>
                <SelectItem value="MOFU">MOFU</SelectItem>
                <SelectItem value="BOFU">BOFU</SelectItem>
                <SelectItem value="none">Unspecified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-6">
            <Label className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" /> Date range
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 min-w-0">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full min-w-0 bg-slate-900 border-slate-800 text-xs"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full min-w-0 bg-slate-900 border-slate-800 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between pt-1 border-t border-slate-800/80 min-w-0">
          <div className="text-xs text-slate-500 min-w-0 break-words">
            Showing{' '}
            <span className="text-slate-300 font-medium">{visible.length}</span>{' '}
            of{' '}
            <span className="text-slate-300 font-medium">{filtered.length}</span>{' '}
            {filtered.length === 1 ? 'rewrite' : 'rewrites'}
            {filtered.length !== rows.length ? ` (from ${rows.length} total)` : ''}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-200 shrink-0 self-start sm:self-auto"
            onClick={resetFilters}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
          No rewrites match these filters.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((row) => {
            const persona = personaById.get(row.persona_id || -1);
            const platform = (row.platform_target || '').toLowerCase();
            const stage = inferStage(row);
            const cost = estimateCost(
              row.model_used || '',
              row.tokens_input || 0,
              row.tokens_output || 0,
            );
            const preview = (row.rewritten_content || '').slice(0, 160);
            return (
              <div
                key={row.id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-700 transition-colors p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-200">
                      {persona?.name || 'Unknown persona'}
                    </span>
                    {platform && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${PLATFORM_COLOR[platform] || 'border-slate-700 text-slate-300'}`}
                      >
                        {platform === 'twitter' ? 'Twitter/X' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </Badge>
                    )}
                    {stage !== 'none' && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${STAGE_COLOR[stage] || ''}`}
                      >
                        {stage}
                      </Badge>
                    )}
                    <span className="text-[11px] text-slate-500">
                      {`${row.word_count ?? 0} words · ${displayAiEngineUserLabel()} · $${cost.toFixed(4)}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-2">
                    <span title={row.created_at}>{formatFullTimestamp(row.created_at)}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{timeAgo(row.created_at)}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mt-2 line-clamp-2">
                  {preview}
                  {(row.rewritten_content || '').length > 160 ? '…' : ''}
                </p>
                <div className="flex items-center gap-1 mt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                    onClick={() => setViewRow(row)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                    onClick={() => handleCopy(row.rewritten_content || '')}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-violet-300 hover:text-violet-200 hover:bg-violet-500/10"
                    onClick={() => handleReopen(row)}
                    disabled={!row.original_content}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-open
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 ml-auto"
                    onClick={() => setDeleteRow(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            );
          })}
          {filtered.length > visible.length && (
            <div className="text-center text-xs text-slate-500 pt-2">
              Showing first {PAGE_SIZE} of {filtered.length}. Narrow the
              filters to see older entries.
            </div>
          )}
        </div>
      )}

      {/* Side-by-side view dialog */}
      <Dialog open={!!viewRow} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-4xl">
          <DialogHeader>
            <DialogTitle>Rewrite detail</DialogTitle>
            <DialogDescription className="text-slate-400">
              {viewRow ? formatFullTimestamp(viewRow.created_at) : ''}
              {viewRow?.persona_id ? (
                <>
                  {' · '}
                  {personaById.get(viewRow.persona_id)?.name || 'Unknown persona'}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {viewRow && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Original
                  </h3>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200 whitespace-pre-wrap max-h-80 overflow-auto">
                  {viewRow.original_content || '—'}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Rewritten
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-slate-300 hover:text-white"
                    onClick={() => handleCopy(viewRow.rewritten_content || '')}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-sm text-slate-100 whitespace-pre-wrap max-h-80 overflow-auto">
                  {viewRow.rewritten_content || '—'}
                </div>
              </div>
              <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Stat label="Words" value={String(viewRow.word_count ?? '—')} />
                <Stat label="Chars" value={String(viewRow.char_count ?? '—')} />
                <Stat label="Engine" value={displayAiEngineUserLabel()} />
                <Stat
                  label="Cost"
                  value={`$${estimateCost(
                    viewRow.model_used || '',
                    viewRow.tokens_input || 0,
                    viewRow.tokens_output || 0,
                  ).toFixed(4)}`}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
              onClick={() => setViewRow(null)}
            >
              Close
            </Button>
            {viewRow && (
              <Button
                className="bg-violet-600 hover:bg-violet-500 text-white"
                onClick={() => {
                  const target = viewRow;
                  setViewRow(null);
                  handleReopen(target);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Re-open in Workspace
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteRow}
        onOpenChange={(open) => !open && setDeleteRow(null)}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this rewrite?</DialogTitle>
            <DialogDescription className="text-slate-400">
              This permanently removes the generated text from your history.
              The associated cost event will remain in the Costs report.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
              onClick={() => setDeleteRow(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-500 text-white"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">
      {label}
    </div>
    <div className="text-sm text-slate-200 mt-0.5 truncate" title={value}>
      {value}
    </div>
  </div>
);

export default RewriteHistory;