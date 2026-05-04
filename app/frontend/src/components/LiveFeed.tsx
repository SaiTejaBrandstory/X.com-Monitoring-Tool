/**
 * LiveFeed — the main content discovery surface.
 *
 * Displays viral posts from monitored profiles with filters, sort, virality badges,
 * and a side panel for saved posts. Clicking Rewrite opens the RewriteWorkspace modal.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  Download,
  ExternalLink,
  Film,
  Filter,
  Heart,
  Linkedin,
  Loader2,
  MessageCircle,
  Minus,
  RefreshCw,
  Repeat2,
  Search,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  client,
  Category,
  IngestedPost,
  MonitoredProfile,
  parsePostExtras,
  Platform,
  SavedPost,
  XcomScanResponse,
  XcomStatus,
  clearXcomFeed,
  formatNum,
  getXcomStatus,
  scanXcom,
  timeAgo,
} from '@/lib/personaApi';
import { XPlatformIcon } from '@/components/icons/XPlatformIcon';
import RewriteWorkspace from './RewriteWorkspace';

const EMPTY_IMG =
  'https://mgx-backend-cdn.metadl.com/generate/images/910092/2026-04-24/niyxtfyaaflq/empty-state-feed.png';

interface Props {
  userId: string;
}

/**
 * Shared className constants to ensure every Select dropdown in this screen
 * has consistent, high-contrast dark-mode styling.
 *
 *  - SelectContent: opaque slate background, subtle border, above cards (z-50).
 *  - SelectItem:
 *      * default text = slate-100 (bright, fully readable)
 *      * highlighted (hover / keyboard focus) = slate-800 bg + white text
 *        (explicitly overrides shadcn's default `focus:bg-accent` which
 *        resolves to a near-white background on this theme)
 *      * selected check mark inherits the bright text color for visibility
 */
const SELECT_CONTENT_CLS =
  'bg-slate-900 border-slate-700 text-slate-100 shadow-lg z-50';
const SELECT_ITEM_CLS =
  'text-slate-100 focus:bg-slate-800 focus:text-white data-[highlighted]:bg-slate-800 data-[highlighted]:text-white data-[state=checked]:text-sky-300';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const LiveFeed = ({ userId }: Props) => {
  const [posts, setPosts] = useState<IngestedPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [profiles, setProfiles] = useState<MonitoredProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [platformFilter, setPlatformFilter] = useState<'all' | Platform>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'virality' | 'recent'>('virality');
  const [query, setQuery] = useState('');
  const [viewTab, setViewTab] = useState<'feed' | 'saved'>('feed');

  const [rewriteTarget, setRewriteTarget] = useState<IngestedPost | null>(null);

  // X.com scan controls
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [xcomStatus, setXcomStatus] = useState<XcomStatus | null>(null);
  const [lastScan, setLastScan] = useState<XcomScanResponse | null>(null);
  const [scanDateFrom, setScanDateFrom] = useState(daysAgoISO(7));
  const [scanDateTo, setScanDateTo] = useState(todayISO());
  const [scanPerProfile, setScanPerProfile] = useState(10); // UI allows 5–100 per profile
  /** Scan modal: pick category first, then profile(s) within that category. */
  const [scanCategoryId, setScanCategoryId] = useState<string>('all');
  const [scanProfileFilter, setScanProfileFilter] = useState<'all' | string>('all');

  const loadData = async () => {
    try {
      const [pRes, cRes, sRes, mpRes] = await Promise.all([
        client.entities.ingested_posts.query({
          limit: 100,
          sort: '-engagement_score',
        }),
        client.entities.categories.query({ limit: 50 }),
        client.entities.saved_posts.query({ limit: 200 }),
        client.entities.monitored_profiles.queryAll({ limit: 200 }),
      ]);
      setPosts((pRes.data?.items || []) as IngestedPost[]);
      setCategories((cRes.data?.items || []) as Category[]);
      setSavedPosts((sRes.data?.items || []) as SavedPost[]);
      setProfiles((mpRes.data?.items || []) as MonitoredProfile[]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  const loadXcomStatus = async () => {
    try {
      const s = await getXcomStatus();
      setXcomStatus(s);
    } catch (e) {
      console.error('xcom status failed', e);
    }
  };

  useEffect(() => {
    loadData();
    loadXcomStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await loadXcomStatus();
    setTimeout(() => {
      setRefreshing(false);
      toast.success('Feed refreshed');
    }, 400);
  };

  const xcomProfiles = useMemo(
    () => profiles.filter((p) => p.platform === 'twitter'),
    [profiles],
  );

  const activeTwitterProfiles = useMemo(
    () => xcomProfiles.filter((p) => p.is_active !== false),
    [xcomProfiles],
  );

  /** Monitored X profiles in the scan modal’s selected category (active only). */
  const scanProfilePool = useMemo(() => {
    if (scanCategoryId === 'all') return activeTwitterProfiles;
    if (scanCategoryId === 'uncategorized') {
      return activeTwitterProfiles.filter(
        (p) => p.category_id == null || p.category_id === undefined,
      );
    }
    const cid = Number(scanCategoryId);
    if (Number.isNaN(cid)) return activeTwitterProfiles;
    return activeTwitterProfiles.filter((p) => p.category_id === cid);
  }, [activeTwitterProfiles, scanCategoryId]);

  /** Categories that have at least one active X profile (for the scan modal). */
  const scanCategoryOptions = useMemo(() => {
    const ids = new Set(
      activeTwitterProfiles
        .map((p) => p.category_id)
        .filter((id): id is number => id != null && !Number.isNaN(id)),
    );
    return categories.filter((c) => ids.has(c.id));
  }, [activeTwitterProfiles, categories]);

  const hasUncategorizedTwitter = useMemo(
    () =>
      activeTwitterProfiles.some(
        (p) => p.category_id == null || p.category_id === undefined,
      ),
    [activeTwitterProfiles],
  );

  const handleScanXcom = async () => {
    if (scanning) return;
    if (scanDateFrom && scanDateTo && scanDateFrom > scanDateTo) {
      toast.error('"From" date must be before "To" date.');
      return;
    }
    if (scanProfilePool.length === 0) {
      toast.error('No active X profiles in this category. Add profiles or pick another category.');
      return;
    }
    setScanning(true);
    try {
      let profile_ids: number[] | undefined;
      if (scanProfileFilter === 'all') {
        if (scanCategoryId === 'all') {
          profile_ids = undefined;
        } else {
          profile_ids = scanProfilePool.map((p) => p.id);
        }
      } else {
        const n = Number(scanProfileFilter);
        profile_ids = Number.isNaN(n) ? undefined : [n];
      }
      const result = await scanXcom({
        profile_ids,
        posts_per_profile: scanPerProfile,
        date_from: scanDateFrom || undefined,
        date_to: scanDateTo || undefined,
        dry_run: false,
      });
      setLastScan(result);
      const errored = result.profiles.filter((p) => p.status !== 'ok');
      if (errored.length > 0) {
        toast.error(
          `Scan finished with ${errored.length} error(s). First: @${errored[0].handle} — ${errored[0].error || 'unknown'}`,
        );
      } else {
        if (result.total_fetched === 0 && result.total_saved === 0) {
          toast('Scan completed — no tweets in range', {
            description:
              'Try a wider date range, or confirm this account posts original tweets (replies and retweets are excluded from this scan).',
          });
        } else {
          toast.success(
            `${result.total_saved > 0 ? `Saved ${result.total_saved} new · ` : ''}Fetched ${result.total_fetched} tweet(s) from ${result.profiles.length} profile(s)`,
          );
        }
      }
      await loadData();
      await loadXcomStatus();
    } catch (e) {
      const msg =
        (e as { message?: string; response?: { data?: { detail?: string } } })
          ?.response?.data?.detail ||
        (e as Error)?.message ||
        'Unknown error';
      toast.error(`X.com scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  const handleClearFeed = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const result = await clearXcomFeed();
      toast.success(
        result.deleted > 0
          ? `Cleared ${result.deleted} post(s). Click Scan X.com to fetch live posts.`
          : 'Feed was already empty.',
      );
      setClearOpen(false);
      setLastScan(null);
      await loadData();
    } catch (e) {
      const msg =
        (e as { message?: string; response?: { data?: { detail?: string } } })
          ?.response?.data?.detail ||
        (e as Error)?.message ||
        'Unknown error';
      toast.error(`Clear feed failed: ${msg}`);
    } finally {
      setClearing(false);
    }
  };

  const toggleSave = async (post: IngestedPost) => {
    const existing = savedPosts.find((s) => s.post_id === post.id);
    try {
      if (existing) {
        await client.entities.saved_posts.delete({ id: String(existing.id) });
        setSavedPosts(savedPosts.filter((s) => s.id !== existing.id));
        toast.success('Removed from saved');
      } else {
        const resp = await client.entities.saved_posts.create({
          data: { post_id: post.id, notes: '' },
        });
        const newSaved = resp.data as SavedPost;
        setSavedPosts([...savedPosts, newSaved]);
        toast.success('Saved');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to update saved posts');
    }
  };

  const isSaved = (postId: number) =>
    savedPosts.some((s) => s.post_id === postId);

  const filteredAndSorted = useMemo(() => {
    let list = [...posts];
    if (viewTab === 'saved') {
      const savedIds = new Set(savedPosts.map((s) => s.post_id));
      list = list.filter((p) => savedIds.has(p.id));
    }
    if (platformFilter !== 'all') {
      list = list.filter((p) => p.platform === platformFilter);
    }
    if (categoryFilter !== 'all') {
      list = list.filter((p) => String(p.category_id) === categoryFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.author_name?.toLowerCase().includes(q) ||
          p.author_handle.toLowerCase().includes(q),
      );
    }
    if (sortBy === 'virality') {
      list.sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0));
    } else {
      list.sort((a, b) => {
        const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [posts, savedPosts, viewTab, platformFilter, categoryFilter, query, sortBy]);

  const getCategoryById = (id?: number) =>
    categories.find((c) => c.id === id);

  const renderTrend = (trend?: string) => {
    if (trend === 'up')
      return <ArrowUp className="h-3 w-3 text-emerald-400" />;
    if (trend === 'down')
      return <ArrowDown className="h-3 w-3 text-rose-400" />;
    return <Minus className="h-3 w-3 text-slate-500" />;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Live Feed</h1>
          <p className="text-sm text-slate-400">
            Viral posts from your monitored profiles — refreshed every 5–15
            minutes.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={
              !xcomStatus
                ? 'bg-slate-700/40 text-slate-300 border-slate-600/40'
                : xcomStatus.has_token
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }
          >
            {!xcomStatus
              ? 'Connection: checking…'
              : xcomStatus.has_token
                ? `Scan ready (${xcomStatus.active_profiles} profile${xcomStatus.active_profiles === 1 ? '' : 's'})`
                : 'Scanning not configured — ask your admin'}
          </Badge>
          <Button
            onClick={() => setScanOpen(true)}
            disabled={scanning}
            className="bg-sky-600 hover:bg-sky-500 text-white"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Scan X.com
          </Button>
          <Button
            onClick={() => setClearOpen(true)}
            disabled={clearing}
            variant="outline"
            className="!bg-transparent border-rose-700/60 text-rose-300 hover:!bg-rose-900/30"
          >
            {clearing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Clear feed
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400" />
              Clear all X.com posts?
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This permanently deletes every X.com post currently in your Live Feed — including any
              stale demo/seed rows. Your monitored profiles and saved rewrites are NOT affected.
              After clearing, click <span className="text-sky-300 font-medium">Scan X.com</span> to
              fetch fresh posts from X.com.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearOpen(false)}
              disabled={clearing}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleClearFeed}
              disabled={clearing}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {clearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Yes, clear feed
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scanOpen}
        onOpenChange={(open) => {
          setScanOpen(open);
          if (open) {
            setScanCategoryId('all');
            setScanProfileFilter('all');
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XPlatformIcon className="h-5 w-5 text-slate-200" title="X" />
              Scan X.com posts
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {xcomStatus?.has_token
                ? 'Pulls recent posts straight into your Live Feed.'
                : 'Live scanning isn’t set up yet. Ask an administrator to configure the server connection.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Date from</Label>
                <Input
                  type="date"
                  value={scanDateFrom}
                  onChange={(e) => setScanDateFrom(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Date to</Label>
                <Input
                  type="date"
                  value={scanDateTo}
                  onChange={(e) => setScanDateTo(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Posts per profile</Label>
              <Input
                type="number"
                min={5}
                max={100}
                value={scanPerProfile}
                onChange={(e) =>
                  setScanPerProfile(
                    Math.max(5, Math.min(100, Number(e.target.value) || 5)),
                  )
                }
                className="bg-slate-950 border-slate-800 text-slate-100"
              />
              <p className="text-[11px] text-slate-500">
                Allowed range is 5–100 posts per profile. Higher values may hit usage limits sooner.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Category</Label>
              <Select
                value={scanCategoryId}
                onValueChange={(v) => {
                  setScanCategoryId(v);
                  setScanProfileFilter('all');
                }}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={SELECT_CONTENT_CLS}>
                  <SelectItem value="all" className={SELECT_ITEM_CLS}>
                    All categories ({activeTwitterProfiles.length} active X profile
                    {activeTwitterProfiles.length === 1 ? '' : 's'})
                  </SelectItem>
                  {hasUncategorizedTwitter && (
                    <SelectItem value="uncategorized" className={SELECT_ITEM_CLS}>
                      Uncategorized (
                      {
                        activeTwitterProfiles.filter(
                          (p) => p.category_id == null || p.category_id === undefined,
                        ).length
                      }
                      )
                    </SelectItem>
                  )}
                  {scanCategoryOptions.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={String(c.id)}
                      className={SELECT_ITEM_CLS}
                    >
                      {c.name} (
                      {
                        activeTwitterProfiles.filter((p) => p.category_id === c.id)
                          .length
                      }
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Choose a category, then pick which profile(s) to scan below.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Profile filter</Label>
              <Select
                value={scanProfileFilter}
                onValueChange={setScanProfileFilter}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={SELECT_CONTENT_CLS}>
                  <SelectItem value="all" className={SELECT_ITEM_CLS}>
                    All profiles in this category ({scanProfilePool.length})
                  </SelectItem>
                  {scanProfilePool.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={String(p.id)}
                      className={SELECT_ITEM_CLS}
                    >
                      @{p.handle.replace(/^@/, '')}
                      {p.display_name ? ` — ${p.display_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lastScan && (
              <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs space-y-1.5">
                <div className="flex items-center gap-2 text-slate-300">
                  <Download className="h-3 w-3" />
                  Last scan: {lastScan.total_fetched} fetched ·{' '}
                  {lastScan.total_saved} new saved
                  <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                    live
                  </Badge>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {lastScan.profiles.map((r) => (
                    <div
                      key={r.profile_id}
                      className={`flex justify-between ${
                        r.status !== 'ok' ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      <span>@{r.handle}</span>
                      <span>
                        {r.status === 'ok'
                          ? `${r.fetched} fetched · ${r.saved} saved`
                          : r.error?.slice(0, 60) || 'error'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScanOpen(false)}
              disabled={scanning}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Close
            </Button>
            <Button
              onClick={handleScanXcom}
              disabled={scanning || scanProfilePool.length === 0}
              className="bg-sky-600 hover:bg-sky-500 text-white"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Start scan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'feed' | 'saved')}>
        <TabsList className="bg-slate-900 border border-slate-800">
          <TabsTrigger value="feed">All posts</TabsTrigger>
          <TabsTrigger value="saved">
            Saved ({savedPosts.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="my-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, authors…"
            className="pl-9 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <Select
          value={platformFilter}
          onValueChange={(v) => setPlatformFilter(v as 'all' | Platform)}
        >
          <SelectTrigger className="w-[140px] bg-slate-900 border-slate-800 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLS}>
            <SelectItem value="all" className={SELECT_ITEM_CLS}>
              All platforms
            </SelectItem>
            <SelectItem value="twitter" className={SELECT_ITEM_CLS}>
              Twitter/X
            </SelectItem>
            <SelectItem value="linkedin" className={SELECT_ITEM_CLS}>
              LinkedIn
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px] bg-slate-900 border-slate-800 text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLS}>
            <SelectItem value="all" className={SELECT_ITEM_CLS}>
              All categories
            </SelectItem>
            {categories.map((c) => (
              <SelectItem
                key={c.id}
                value={String(c.id)}
                className={SELECT_ITEM_CLS}
              >
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as 'virality' | 'recent')}
        >
          <SelectTrigger className="w-[160px] bg-slate-900 border-slate-800 text-slate-100">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT_CLS}>
            <SelectItem value="virality" className={SELECT_ITEM_CLS}>
              Top virality
            </SelectItem>
            <SelectItem value="recent" className={SELECT_ITEM_CLS}>
              Most recent
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <img
            src={EMPTY_IMG}
            alt="No posts"
            className="h-40 w-40 mx-auto opacity-80"
          />
          <p className="mt-4 text-slate-400 text-sm">
            {viewTab === 'saved'
              ? 'No saved posts yet. Bookmark posts from the feed to see them here.'
              : 'No posts match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSorted.map((post) => {
            const cat = getCategoryById(post.category_id);
            const extras = parsePostExtras(post.post_extras);
            return (
              <article
                key={post.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 hover:border-violet-500/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <img
                      src={
                        post.author_avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_handle}`
                      }
                      alt={post.author_handle}
                      className="h-10 w-10 rounded-full bg-slate-800 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-100">
                          {post.author_name || post.author_handle}
                        </span>
                        <span className="text-xs text-slate-500">
                          @{post.author_handle}
                        </span>
                        {post.platform === 'twitter' ? (
                          <XPlatformIcon
                            className="h-3 w-3 text-slate-200"
                            title="X"
                          />
                        ) : (
                          <Linkedin className="h-3 w-3 text-blue-500" />
                        )}
                        {cat && (
                          <Badge
                            className={`${cat.color || 'bg-slate-600'} text-white border-0 text-[10px] px-1.5 py-0`}
                          >
                            {cat.name}
                          </Badge>
                        )}
                        {post.is_new && (
                          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40 text-[10px] px-1.5 py-0">
                            NEW
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500 ml-auto">
                          {timeAgo(post.posted_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {post.content}
                      </p>
                      {extras && extras.urls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {extras.urls.map((u, ui) => (
                            <a
                              key={`${u.expanded_url}-${ui}`}
                              href={u.expanded_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex max-w-full truncate rounded-full border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[11px] text-sky-300 hover:bg-slate-800 hover:text-sky-200"
                              title={u.expanded_url}
                            >
                              {u.display_url}
                            </a>
                          ))}
                        </div>
                      )}
                      {extras && extras.media.length > 0 && (
                        <div
                          className={`mt-3 grid gap-2 ${
                            extras.media.length === 1
                              ? 'grid-cols-1 max-w-xl'
                              : 'grid-cols-1 sm:grid-cols-2'
                          }`}
                        >
                          {extras.media.map((m, idx) => {
                            const src =
                              m.url ||
                              m.preview_url ||
                              '';
                            if (!src) return null;
                            const isVideoLike =
                              m.type === 'video' || m.type === 'animated_gif';
                            return (
                              <div
                                key={`${src}-${idx}`}
                                className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950"
                              >
                                <a
                                  href={post.raw_url || '#'}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                  title={
                                    isVideoLike
                                      ? 'Open on X to play video'
                                      : 'Open on X'
                                  }
                                >
                                  <img
                                    src={src}
                                    alt={
                                      (m.alt_text as string | undefined) ||
                                      (isVideoLike ? 'Video preview' : 'Post media')
                                    }
                                    className="w-full max-h-80 object-contain bg-black/40"
                                    loading="lazy"
                                  />
                                  {isVideoLike && (
                                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                                      <Film className="h-3 w-3" />
                                      {m.type === 'animated_gif' ? 'GIF' : 'Video'}
                                    </span>
                                  )}
                                </a>
                                {m.alt_text && (
                                  <p className="px-2 py-1 text-[11px] text-slate-500 line-clamp-2">
                                    {m.alt_text}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3 w-3" />
                      {formatNum(post.likes || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat2 className="h-3 w-3" />
                      {formatNum(post.retweets || 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {formatNum(post.replies || 0)}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-violet-300">
                      {renderTrend(post.virality_trend)}
                      {formatNum(Math.round(post.engagement_score || 0))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {post.raw_url && (
                      <a
                        href={post.raw_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Source
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleSave(post)}
                      className="text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                    >
                      {isSaved(post.id) ? (
                        <>
                          <BookmarkCheck className="h-4 w-4 mr-1 text-amber-400" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="h-4 w-4 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setRewriteTarget(post)}
                      className="bg-violet-600 hover:bg-violet-500 text-white"
                    >
                      <Wand2 className="h-4 w-4 mr-1" />
                      Rewrite
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rewriteTarget && (
        <RewriteWorkspace
          userId={userId}
          post={rewriteTarget}
          savedPostId={savedPosts.find((s) => s.post_id === rewriteTarget.id)?.id}
          onClose={() => setRewriteTarget(null)}
        />
      )}
    </div>
  );
};

export default LiveFeed;