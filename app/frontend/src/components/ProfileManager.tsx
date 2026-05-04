/**
 * ProfileManager — manage categories and monitored Twitter/LinkedIn profiles.
 *
 * Supports:
 * - Category CRUD with pause/resume.
 * - Single-profile add via dialog.
 * - Bulk profile upload: paste handles (one per line or `handle,category` CSV)
 *   with a batch platform + default category. Shows per-row success/failure.
 * - Edit existing profiles (platform, handle, display name, category).
 */
import { useEffect, useState } from 'react';
import {
  Linkedin,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { XPlatformIcon } from '@/components/icons/XPlatformIcon';
import { client, Category, MonitoredProfile, Platform } from '@/lib/personaApi';

const NONE_VALUE = '__none__';

interface BulkResult {
  handle: string;
  category?: string;
  status: 'ok' | 'failed' | 'skipped';
  error?: string;
}

const ProfileManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [profiles, setProfiles] = useState<MonitoredProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create category dialog
  const [newCatName, setNewCatName] = useState('');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);

  // Single profile dialog
  const [newProfOpen, setNewProfOpen] = useState(false);
  const [newProfPlatform, setNewProfPlatform] = useState<Platform>('twitter');
  const [newProfHandle, setNewProfHandle] = useState('');
  const [newProfName, setNewProfName] = useState('');
  const [newProfCategory, setNewProfCategory] = useState<string>(NONE_VALUE);

  // Edit profile dialog
  const [editProf, setEditProf] = useState<MonitoredProfile | null>(null);
  const [editForm, setEditForm] = useState({
    platform: 'twitter' as Platform,
    handle: '',
    display_name: '',
    category_id: NONE_VALUE,
  });

  // Bulk upload dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkPlatform, setBulkPlatform] = useState<Platform>('twitter');
  const [bulkCategory, setBulkCategory] = useState<string>(NONE_VALUE);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);

  const load = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        client.entities.categories.query({ limit: 100 }),
        client.entities.monitored_profiles.query({ limit: 500 }),
      ]);
      setCategories((cRes.data?.items || []) as Category[]);
      setProfiles((pRes.data?.items || []) as MonitoredProfile[]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetchCategories = async () => {
    try {
      const cRes = await client.entities.categories.query({ limit: 100 });
      setCategories((cRes.data?.items || []) as Category[]);
    } catch (e) {
      console.error(e);
    }
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }
    setCreatingCat(true);
    try {
      const resp = await client.entities.categories.create({
        data: {
          name,
          color: 'bg-violet-500',
          refresh_interval_minutes: 10,
          is_paused: false,
        },
      });
      const created = resp.data as Category;
      // Sync: update local state immediately AND refetch as a safety net so
      // selects/dialogs relying on the latest list never miss the new row.
      setCategories((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created];
      });
      await refetchCategories();
      setNewCatName('');
      setNewCatOpen(false);
      toast.success(`Category "${created.name}" created`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to create category');
    } finally {
      setCreatingCat(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (
      !confirm(
        `Delete category "${cat.name}"? Profiles will be moved to Uncategorized.`,
      )
    )
      return;
    try {
      // Detach profiles first
      const affected = profiles.filter((p) => p.category_id === cat.id);
      await Promise.all(
        affected.map((p) =>
          client.entities.monitored_profiles.update({
            id: String(p.id),
            data: { category_id: null },
          }),
        ),
      );
      await client.entities.categories.delete({ id: String(cat.id) });
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setProfiles((prev) =>
        prev.map((p) =>
          p.category_id === cat.id ? { ...p, category_id: null } : p,
        ),
      );
      toast.success('Category deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete category');
    }
  };

  const toggleCategoryPause = async (cat: Category) => {
    try {
      const resp = await client.entities.categories.update({
        id: String(cat.id),
        data: { is_paused: !cat.is_paused },
      });
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? (resp.data as Category) : c)),
      );
      toast.success(cat.is_paused ? 'Category resumed' : 'Category paused');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update category');
    }
  };

  const openNewProfile = async () => {
    // Ensure freshest categories before opening so the new-category row
    // created a moment ago is always selectable.
    await refetchCategories();
    setNewProfOpen(true);
  };

  const addProfile = async () => {
    const handle = newProfHandle.trim().replace(/^@/, '');
    if (!handle) {
      toast.error('Handle is required');
      return;
    }
    try {
      const resp = await client.entities.monitored_profiles.create({
        data: {
          category_id:
            newProfCategory && newProfCategory !== NONE_VALUE
              ? Number(newProfCategory)
              : null,
          platform: newProfPlatform,
          handle,
          display_name: newProfName.trim() || handle,
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${handle}`,
          is_active: true,
        },
      });
      setProfiles((prev) => [...prev, resp.data as MonitoredProfile]);
      setNewProfHandle('');
      setNewProfName('');
      setNewProfCategory(NONE_VALUE);
      setNewProfOpen(false);
      toast.success('Profile added to watchlist');
    } catch (e) {
      console.error(e);
      toast.error('Failed to add profile');
    }
  };

  const openEditProfile = async (prof: MonitoredProfile) => {
    await refetchCategories();
    setEditProf(prof);
    setEditForm({
      platform: (prof.platform as Platform) || 'twitter',
      handle: prof.handle,
      display_name: prof.display_name || '',
      category_id: prof.category_id ? String(prof.category_id) : NONE_VALUE,
    });
  };

  const saveEditProfile = async () => {
    if (!editProf) return;
    const handle = editForm.handle.trim().replace(/^@/, '');
    if (!handle) {
      toast.error('Handle is required');
      return;
    }
    try {
      const resp = await client.entities.monitored_profiles.update({
        id: String(editProf.id),
        data: {
          platform: editForm.platform,
          handle,
          display_name: editForm.display_name.trim() || handle,
          category_id:
            editForm.category_id && editForm.category_id !== NONE_VALUE
              ? Number(editForm.category_id)
              : null,
        },
      });
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === editProf.id ? (resp.data as MonitoredProfile) : p,
        ),
      );
      setEditProf(null);
      toast.success('Profile updated');
    } catch (e) {
      console.error(e);
      toast.error('Failed to update profile');
    }
  };

  const toggleProfileActive = async (prof: MonitoredProfile) => {
    try {
      const resp = await client.entities.monitored_profiles.update({
        id: String(prof.id),
        data: { is_active: !prof.is_active },
      });
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === prof.id ? (resp.data as MonitoredProfile) : p,
        ),
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to toggle profile');
    }
  };

  const deleteProfile = async (prof: MonitoredProfile) => {
    if (!confirm(`Remove @${prof.handle} from watchlist?`)) return;
    try {
      await client.entities.monitored_profiles.delete({ id: String(prof.id) });
      setProfiles((prev) => prev.filter((p) => p.id !== prof.id));
      toast.success('Profile removed');
    } catch (e) {
      console.error(e);
      toast.error('Failed to remove profile');
    }
  };

  const openBulk = async () => {
    await refetchCategories();
    setBulkResults([]);
    setBulkOpen(true);
  };

  const resolveCategoryIdByName = (name: string): number | null => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const found = categories.find((c) => c.name.toLowerCase() === n);
    return found ? found.id : null;
  };

  const runBulkUpload = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error('Paste at least one handle');
      return;
    }
    setBulkRunning(true);
    const results: BulkResult[] = [];
    const existingSet = new Set(
      profiles.map((p) => `${p.platform}:${p.handle.toLowerCase()}`),
    );
    const created: MonitoredProfile[] = [];
    // Track categories we auto-created during this batch so duplicate names
    // in the CSV reuse the same id instead of creating over and over.
    const newCatsByName: Record<string, Category> = {};

    const defaultCategoryId =
      bulkCategory && bulkCategory !== NONE_VALUE
        ? Number(bulkCategory)
        : null;

    for (const raw of lines) {
      // Support `handle,category` CSV-style rows
      const parts = raw.split(',').map((p) => p.trim());
      const handleRaw = parts[0] || '';
      const perLineCat = parts[1] || '';
      const handle = handleRaw.replace(/^@/, '').replace(/^https?:\/\/\S+\//, '');

      if (!handle || !/^[A-Za-z0-9_.-]{1,40}$/.test(handle)) {
        results.push({
          handle: handleRaw,
          status: 'failed',
          error: 'Invalid handle format',
        });
        continue;
      }
      const key = `${bulkPlatform}:${handle.toLowerCase()}`;
      if (existingSet.has(key)) {
        results.push({
          handle,
          status: 'skipped',
          error: 'Already in watchlist',
        });
        continue;
      }

      // Resolve category for this row
      let categoryId: number | null = defaultCategoryId;
      let categoryLabel = '';
      if (perLineCat) {
        categoryLabel = perLineCat;
        // 1. match existing categories
        const existing = resolveCategoryIdByName(perLineCat);
        if (existing !== null) {
          categoryId = existing;
        } else if (newCatsByName[perLineCat.toLowerCase()]) {
          categoryId = newCatsByName[perLineCat.toLowerCase()].id;
        } else {
          // 2. auto-create the new category on the fly
          try {
            const catResp = await client.entities.categories.create({
              data: {
                name: perLineCat,
                color: 'bg-violet-500',
                refresh_interval_minutes: 10,
                is_paused: false,
              },
            });
            const newCat = catResp.data as Category;
            newCatsByName[perLineCat.toLowerCase()] = newCat;
            categoryId = newCat.id;
          } catch (e) {
            console.error('auto create category failed', e);
            // Fall back to default category if creation fails
            categoryId = defaultCategoryId;
          }
        }
      }

      try {
        const resp = await client.entities.monitored_profiles.create({
          data: {
            category_id: categoryId,
            platform: bulkPlatform,
            handle,
            display_name: handle,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${handle}`,
            is_active: true,
          },
        });
        created.push(resp.data as MonitoredProfile);
        existingSet.add(key);
        results.push({
          handle,
          category: categoryLabel || undefined,
          status: 'ok',
        });
      } catch (e) {
        console.error(e);
        results.push({
          handle,
          status: 'failed',
          error: 'Create request failed',
        });
      }
    }

    if (created.length > 0) {
      setProfiles((prev) => [...prev, ...created]);
    }
    const newCatsCreated = Object.values(newCatsByName);
    if (newCatsCreated.length > 0) {
      setCategories((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        return [...prev, ...newCatsCreated.filter((c) => !existingIds.has(c.id))];
      });
    }
    await refetchCategories();

    setBulkResults(results);
    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    toast.success(
      `Bulk import done — ${ok} added, ${skipped} skipped, ${failed} failed`,
    );
    setBulkRunning(false);
  };

  const profilesByCategory = (catId: number) =>
    profiles.filter((p) => p.category_id === catId);
  const uncategorized = profiles.filter((p) => !p.category_id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Profiles & Categories</h1>
          <p className="text-sm text-slate-400">
            Group the creators you follow and control refresh cadence per
            category.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Create category */}
          <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
              >
                <Plus className="h-4 w-4 mr-1" /> Category
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
              <DialogHeader>
                <DialogTitle>New category</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Label>Name</Label>
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCategory();
                  }}
                  placeholder="e.g. Fintech founders"
                  className="bg-slate-950 border-slate-800"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={addCategory}
                  disabled={creatingCat}
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {creatingCat ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk upload */}
          <Button
            variant="outline"
            onClick={openBulk}
            className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
          >
            <Upload className="h-4 w-4 mr-1" /> Bulk upload
          </Button>

          {/* Single profile add */}
          <Button
            onClick={openNewProfile}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> Profile
          </Button>
        </div>
      </div>

      {/* Single profile dialog */}
      <Dialog open={newProfOpen} onOpenChange={setNewProfOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle>Add profile to watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Platform</Label>
              <Select
                value={newProfPlatform}
                onValueChange={(v) => setNewProfPlatform(v as Platform)}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="twitter">Twitter/X</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Handle (without @)</Label>
              <Input
                value={newProfHandle}
                onChange={(e) => setNewProfHandle(e.target.value)}
                placeholder="elonmusk"
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div>
              <Label>Display name (optional)</Label>
              <Input
                value={newProfName}
                onChange={(e) => setNewProfName(e.target.value)}
                placeholder="Elon Musk"
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Select
                value={newProfCategory}
                onValueChange={setNewProfCategory}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  No categories yet — create one first or leave as None.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={addProfile}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile dialog */}
      <Dialog open={!!editProf} onOpenChange={(o) => !o && setEditProf(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Platform</Label>
              <Select
                value={editForm.platform}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, platform: v as Platform })
                }
              >
                <SelectTrigger className="bg-slate-950 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value="twitter">Twitter/X</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Handle (without @)</Label>
              <Input
                value={editForm.handle}
                onChange={(e) =>
                  setEditForm({ ...editForm, handle: e.target.value })
                }
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div>
              <Label>Display name</Label>
              <Input
                value={editForm.display_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, display_name: e.target.value })
                }
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={editForm.category_id}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, category_id: v })
                }
              >
                <SelectTrigger className="bg-slate-950 border-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  <SelectItem value={NONE_VALUE}>Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditProf(null)}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={saveEditProfile}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk upload dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk profile upload</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Platform for this batch</Label>
                <Select
                  value={bulkPlatform}
                  onValueChange={(v) => setBulkPlatform(v as Platform)}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="twitter">Twitter/X</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default category</Label>
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Paste handles (one per line)</Label>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  'elonmusk\nnaval\nsama,AI founders\npaulg,Fintech founders\n@dhh'
                }
                className="bg-slate-950 border-slate-800 min-h-[180px] font-mono text-xs"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Tip: use <code className="text-slate-300">handle,category</code>{' '}
                per line to override the default. Unknown categories are
                auto-created. Duplicates are skipped.
              </p>
            </div>

            {bulkResults.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 sticky top-0 bg-slate-900">
                    <tr>
                      <th className="text-left px-3 py-2">Handle</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {bulkResults.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-slate-200">
                          {r.handle}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">
                          {r.category || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.status === 'ok' && (
                            <span className="text-emerald-400">Added</span>
                          )}
                          {r.status === 'skipped' && (
                            <span className="text-amber-400">
                              Skipped · {r.error}
                            </span>
                          )}
                          {r.status === 'failed' && (
                            <span className="text-rose-400">
                              Failed · {r.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Close
            </Button>
            <Button
              onClick={runBulkUpload}
              disabled={bulkRunning}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              {bulkRunning ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Body */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <section
              key={cat.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    className={`${cat.color || 'bg-violet-500'} text-white border-0`}
                  >
                    {cat.name}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    Refresh every {cat.refresh_interval_minutes || 10}m ·{' '}
                    {profilesByCategory(cat.id).length} profile
                    {profilesByCategory(cat.id).length === 1 ? '' : 's'}
                  </span>
                  {cat.is_paused && (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40">
                      Paused
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleCategoryPause(cat)}
                    className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  >
                    {cat.is_paused ? (
                      <>
                        <Play className="h-3 w-3 mr-1" /> Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3 mr-1" /> Pause
                      </>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCategory(cat)}
                    className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                    title="Delete category"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {profilesByCategory(cat.id).length === 0 ? (
                  <div className="text-xs text-slate-500 col-span-full py-4 text-center border border-dashed border-slate-800 rounded-lg">
                    No profiles in this category yet.
                  </div>
                ) : (
                  profilesByCategory(cat.id).map((prof) => (
                    <ProfileCard
                      key={prof.id}
                      profile={prof}
                      onToggle={() => toggleProfileActive(prof)}
                      onEdit={() => openEditProfile(prof)}
                      onDelete={() => deleteProfile(prof)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}

          {uncategorized.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Uncategorized ({uncategorized.length})
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {uncategorized.map((prof) => (
                  <ProfileCard
                    key={prof.id}
                    profile={prof}
                    onToggle={() => toggleProfileActive(prof)}
                    onEdit={() => openEditProfile(prof)}
                    onDelete={() => deleteProfile(prof)}
                  />
                ))}
              </div>
            </section>
          )}

          {categories.length === 0 && profiles.length === 0 && (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl text-slate-400 text-sm">
              No categories or profiles yet — create one or bulk upload to get
              started.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CardProps {
  profile: MonitoredProfile;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
const ProfileCard = ({ profile, onToggle, onEdit, onDelete }: CardProps) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 flex items-center gap-3">
    <img
      src={
        profile.avatar_url ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.handle}`
      }
      alt={profile.handle}
      className="h-10 w-10 rounded-full bg-slate-800"
    />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1 text-sm font-medium text-slate-100 truncate">
        {profile.display_name || profile.handle}
        {profile.platform === 'twitter' ? (
          <XPlatformIcon
            className="h-3 w-3 text-slate-200 flex-shrink-0"
            title="X"
          />
        ) : (
          <Linkedin className="h-3 w-3 text-blue-500 flex-shrink-0" />
        )}
      </div>
      <div className="text-xs text-slate-500 truncate">@{profile.handle}</div>
    </div>
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        onClick={onEdit}
        className="h-7 w-7 text-slate-400 hover:text-violet-300 hover:bg-slate-800"
        title="Edit"
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onToggle}
        className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
        title={profile.is_active ? 'Pause' : 'Resume'}
      >
        {profile.is_active ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3" />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDelete}
        className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  </div>
);

export default ProfileManager;