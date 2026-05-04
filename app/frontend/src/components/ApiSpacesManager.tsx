/**
 * ApiSpacesManager — Admin tab to manage X.com / social scraper API configurations.
 *
 * Features:
 *  - List all configured API Spaces (table view)
 *  - Add / Edit / Delete entries via modal
 *  - Test connection (checks token presence + updates last_tested_at)
 *  - Set one entry as "Active" per platform (mutually exclusive per platform)
 *  - Masked token input with show/hide toggle
 *
 * NOTE: Live Feed scanning uses the server-side X.com credentials. This manager
 * is for extra scraper / API bookkeeping (LinkedIn, Instagram, etc.).
 * Entries here are optional for Live Feed scans to work.
 *
 * Backing table `api_spaces` is shared (no user_id filter) to match the rest
 * of this app's admin data model.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Trash2,
  Edit3,
  Radio,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  client,
  listApiSpaces,
  setActiveApiSpace,
  testApiSpace,
  type ApiSpace,
  type ApiSpacePlatform,
  type ApiSpaceProxyGroup,
} from '@/lib/personaApi';

interface FormState {
  label: string;
  platform: ApiSpacePlatform;
  actor_type: string;
  api_token_encrypted: string;
  proxy_group: ApiSpaceProxyGroup;
  notes: string;
}

const EMPTY_FORM: FormState = {
  label: '',
  platform: 'twitter',
  actor_type: 'twitter-scraper',
  api_token_encrypted: '',
  proxy_group: 'RESIDENTIAL',
  notes: '',
};

const ACTOR_PRESETS: Record<ApiSpacePlatform, string[]> = {
  twitter: ['standard', 'custom'],
  linkedin: ['linkedin-posts-scraper', 'custom'],
  instagram: ['instagram-scraper', 'custom'],
  other: ['custom'],
};

const statusBadge = (status?: string, isActive?: boolean) => {
  if (isActive) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 gap-1">
        <Radio className="h-3 w-3" /> Active
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  if (status === 'active') {
    return (
      <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/40 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Tested
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-700/40 text-slate-400 border-slate-700 gap-1">
      <Clock className="h-3 w-3" /> Untested
    </Badge>
  );
};

const maskToken = (token?: string): string => {
  if (!token) return '—';
  if (token.length <= 8) return '••••';
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
};

const ApiSpacesManager = () => {
  const [spaces, setSpaces] = useState<ApiSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiSpace | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listApiSpaces();
      setSpaces(list);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load API Spaces');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeByPlatform = useMemo(() => {
    const map: Partial<Record<ApiSpacePlatform, ApiSpace>> = {};
    for (const s of spaces) {
      if (s.is_active && s.platform) map[s.platform] = s;
    }
    return map;
  }, [spaces]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowToken(false);
    setDialogOpen(true);
  };

  const openEdit = (sp: ApiSpace) => {
    setEditing(sp);
    setForm({
      label: sp.label || '',
      platform: (sp.platform as ApiSpacePlatform) || 'twitter',
      actor_type: sp.actor_type || 'twitter-scraper',
      api_token_encrypted: sp.api_token_encrypted || '',
      proxy_group: (sp.proxy_group as ApiSpaceProxyGroup) || 'RESIDENTIAL',
      notes: sp.notes || '',
    });
    setShowToken(false);
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!form.actor_type.trim()) {
      toast.error('Actor type is required');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const resp = await client.entities.api_spaces.update({
          id: String(editing.id),
          data: {
            label: form.label,
            platform: form.platform,
            actor_type: form.actor_type,
            api_token_encrypted: form.api_token_encrypted,
            proxy_group: form.proxy_group,
            notes: form.notes,
            provider: 'x-api',
          },
        });
        setSpaces((prev) =>
          prev.map((s) => (s.id === editing.id ? (resp.data as ApiSpace) : s)),
        );
        toast.success('API Space updated');
      } else {
        const resp = await client.entities.api_spaces.create({
          data: {
            label: form.label,
            platform: form.platform,
            actor_type: form.actor_type,
            api_token_encrypted: form.api_token_encrypted,
            proxy_group: form.proxy_group,
            notes: form.notes,
            provider: 'x-api',
            is_active: false,
            test_status: 'untested',
          },
        });
        setSpaces((prev) => [...prev, resp.data as ApiSpace]);
        toast.success('API Space created');
      }
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (sp: ApiSpace) => {
    if (!confirm(`Delete "${sp.label}"? This cannot be undone.`)) return;
    try {
      await client.entities.api_spaces.delete({ id: String(sp.id) });
      setSpaces((prev) => prev.filter((s) => s.id !== sp.id));
      toast.success('Deleted');
    } catch (e) {
      console.error(e);
      toast.error('Delete failed');
    }
  };

  const runTest = async (sp: ApiSpace) => {
    setTestingId(sp.id);
    try {
      const result = await testApiSpace(sp.id);
      setSpaces((prev) =>
        prev.map((s) =>
          s.id === sp.id
            ? {
                ...s,
                test_status: result.test_status,
                last_tested_at: result.last_tested_at,
              }
            : s,
        ),
      );
      if (result.ok) toast.success(`✓ ${sp.label}: ${result.message}`);
      else toast.error(`✗ ${sp.label}: ${result.message}`);
    } catch (e) {
      console.error(e);
      toast.error('Test failed');
    } finally {
      setTestingId(null);
    }
  };

  const activate = async (sp: ApiSpace) => {
    try {
      await setActiveApiSpace(sp.id);
      // Update local state: deactivate others on same platform, activate this one
      setSpaces((prev) =>
        prev.map((s) =>
          s.platform === sp.platform
            ? { ...s, is_active: s.id === sp.id }
            : s,
        ),
      );
      toast.success(`${sp.label} is now the active ${sp.platform} scraper`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to set active');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">
            X.com API Spaces
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Manage integrations for scraping and related tools (X/Twitter,
            LinkedIn, Instagram). The active entry is used where applicable in
            Profile Manager. Live Feed scans use the separate server connection,
            so an entry here is not required for that feature.
          </p>
        </div>
        <Button
          onClick={openAdd}
          className="bg-violet-600 hover:bg-violet-500 text-white"
        >
          <Plus className="h-4 w-4 mr-1" /> Add API Space
        </Button>
      </div>

      {/* Active summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['twitter', 'linkedin', 'instagram'] as ApiSpacePlatform[]).map(
          (plat) => {
            const a = activeByPlatform[plat];
            return (
              <div
                key={plat}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                  {plat}
                </div>
                <div className="flex items-center gap-2">
                  <Radio
                    className={`h-4 w-4 ${
                      a ? 'text-emerald-400' : 'text-slate-600'
                    }`}
                  />
                  <span className="text-sm text-slate-200">
                    {a ? a.label : 'No active config'}
                  </span>
                </div>
                {a && (
                  <div className="text-[11px] text-slate-500 mt-1 font-mono truncate">
                    {a.actor_type} · {a.proxy_group}
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading API Spaces…
          </div>
        ) : spaces.length === 0 ? (
          <div className="p-10 text-center">
            <Zap className="h-8 w-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No API Spaces yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Add one to start scraping profiles.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">Label</TableHead>
                <TableHead className="text-slate-400">Platform</TableHead>
                <TableHead className="text-slate-400">Actor</TableHead>
                <TableHead className="text-slate-400">Proxy</TableHead>
                <TableHead className="text-slate-400">Token</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spaces.map((sp) => (
                <TableRow
                  key={sp.id}
                  className="border-slate-800 hover:bg-slate-800/30"
                >
                  <TableCell className="font-medium text-slate-100">
                    {sp.label}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-slate-700 text-slate-300 text-[11px]"
                    >
                      {sp.platform}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-300">
                    {sp.actor_type}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {sp.proxy_group || '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">
                    {maskToken(sp.api_token_encrypted)}
                  </TableCell>
                  <TableCell>
                    {statusBadge(sp.test_status, sp.is_active)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!sp.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => activate(sp)}
                          className="h-7 px-2 text-xs border-emerald-700/60 !bg-transparent !hover:bg-emerald-900/30 text-emerald-300"
                          title="Set as active for this platform"
                        >
                          <Radio className="h-3 w-3 mr-1" /> Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => runTest(sp)}
                        disabled={testingId === sp.id}
                        className="h-7 px-2 text-xs border-slate-700 !bg-transparent !hover:bg-slate-800 text-slate-300"
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        {testingId === sp.id ? 'Testing…' : 'Test'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(sp)}
                        className="h-7 px-2 text-xs border-slate-700 !bg-transparent !hover:bg-slate-800 text-slate-300"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove(sp)}
                        className="h-7 px-2 text-xs border-rose-900/60 !bg-transparent !hover:bg-rose-900/30 text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit API Space' : 'Add API Space'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-slate-400">Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Primary X.com connection"
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Platform</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => {
                    const plat = v as ApiSpacePlatform;
                    setForm({
                      ...form,
                      platform: plat,
                      actor_type: ACTOR_PRESETS[plat][0],
                    });
                  }}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="twitter">Twitter / X</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">Proxy Group</Label>
                <Select
                  value={form.proxy_group}
                  onValueChange={(v) =>
                    setForm({ ...form, proxy_group: v as ApiSpaceProxyGroup })
                  }
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                    <SelectItem value="RESIDENTIAL">RESIDENTIAL</SelectItem>
                    <SelectItem value="DATACENTER">DATACENTER</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">
                Actor ID / Type
              </Label>
              <Input
                value={form.actor_type}
                onChange={(e) =>
                  setForm({ ...form, actor_type: e.target.value })
                }
                placeholder="e.g. custom-actor-id"
                className="bg-slate-950 border-slate-800 font-mono text-sm"
                list="actor-presets"
              />
              <datalist id="actor-presets">
                {ACTOR_PRESETS[form.platform].map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <p className="text-[11px] text-slate-500 mt-1">
                Presets for {form.platform}:{' '}
                {ACTOR_PRESETS[form.platform].join(', ')}
              </p>
            </div>
            <div>
              <Label className="text-xs text-slate-400">
                Platform API token
              </Label>
              <div className="flex gap-1">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={form.api_token_encrypted}
                  onChange={(e) =>
                    setForm({ ...form, api_token_encrypted: e.target.value })
                  }
                  placeholder="AAAAAA…••••••••"
                  className="bg-slate-950 border-slate-800 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowToken((s) => !s)}
                  className="border-slate-700 !bg-transparent !hover:bg-slate-800 text-slate-300 shrink-0"
                >
                  {showToken ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Stored as-is in this MVP. For production, wrap in an encryption
                edge function before persisting.
              </p>
            </div>
            <div>
              <Label className="text-xs text-slate-400">Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any context: rate limits, team ownership, billing notes…"
                className="bg-slate-950 border-slate-800 text-sm min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-700 !bg-transparent !hover:bg-slate-800 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {submitting
                ? 'Saving…'
                : editing
                  ? 'Save Changes'
                  : 'Create API Space'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiSpacesManager;