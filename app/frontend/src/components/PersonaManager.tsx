/**
 * PersonaManager — CRUD UI for user personas (brand voices).
 *
 * Supports:
 * - Manual persona CRUD
 * - AI-powered persona auto-generation from a category (✨ Suggest with AI)
 * - TOFU / MOFU / BOFU content guidance per persona
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, Wand2, Sparkles, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/dialog';
import {
  client,
  Persona,
  Platform,
  Category,
  FunnelStageMap,
  parseFunnelStages,
  stringifyFunnelStages,
  suggestPersonas,
  SuggestedPersona,
} from '@/lib/personaApi';

interface Props {
  userId: string;
}

const emptyForm = {
  name: '',
  tone_description: '',
  style_rules: '',
  few_shot_examples: '',
  default_platform: 'twitter' as Platform,
  default_max_words: 100,
  funnel_tofu: '',
  funnel_mofu: '',
  funnel_bofu: '',
};

const PersonaManager = ({ userId: _userId }: Props) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [form, setForm] = useState(emptyForm);

  // AI suggest state
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestCategoryId, setSuggestCategoryId] = useState<string>('');
  const [suggestCount, setSuggestCount] = useState<number>(3);
  const [suggestPlatform, setSuggestPlatform] = useState<Platform>('twitter');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedPersona[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());

  const load = async () => {
    try {
      const [pResp, cResp] = await Promise.all([
        client.entities.personas.query({ limit: 100 }),
        client.entities.categories.queryAll({ limit: 200 }),
      ]);
      setPersonas((pResp.data?.items || []) as Persona[]);
      setCategories((cResp.data?.items || []) as Category[]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load personas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Persona) => {
    const stages = parseFunnelStages(p.funnel_stages);
    setEditing(p);
    setForm({
      name: p.name,
      tone_description: p.tone_description || '',
      style_rules: p.style_rules || '',
      few_shot_examples: p.few_shot_examples || '',
      default_platform: (p.default_platform as Platform) || 'twitter',
      default_max_words: p.default_max_words || 100,
      funnel_tofu: stages.TOFU || '',
      funnel_mofu: stages.MOFU || '',
      funnel_bofu: stages.BOFU || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Persona name is required');
      return;
    }
    const funnel_stages = stringifyFunnelStages({
      TOFU: form.funnel_tofu,
      MOFU: form.funnel_mofu,
      BOFU: form.funnel_bofu,
    });
    const payload = {
      name: form.name,
      tone_description: form.tone_description,
      style_rules: form.style_rules,
      few_shot_examples: form.few_shot_examples,
      default_platform: form.default_platform,
      default_max_words: form.default_max_words,
      funnel_stages,
    };
    try {
      if (editing) {
        const resp = await client.entities.personas.update({
          id: String(editing.id),
          data: payload,
        });
        setPersonas(
          personas.map((p) =>
            p.id === editing.id ? (resp.data as Persona) : p,
          ),
        );
        toast.success('Persona updated');
      } else {
        const resp = await client.entities.personas.create({ data: payload });
        setPersonas([...personas, resp.data as Persona]);
        toast.success('Persona created');
      }
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save persona');
    }
  };

  const remove = async (p: Persona) => {
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    try {
      await client.entities.personas.delete({ id: String(p.id) });
      setPersonas(personas.filter((x) => x.id !== p.id));
      toast.success('Persona deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete persona');
    }
  };

  const openSuggest = () => {
    setSuggestions([]);
    setSavedIdx(new Set());
    setSuggestCount(3);
    setSuggestPlatform('twitter');
    setSuggestCategoryId(categories[0] ? String(categories[0].id) : '');
    setSuggestOpen(true);
  };

  const runSuggest = async () => {
    const cat = categories.find((c) => String(c.id) === suggestCategoryId);
    if (!cat) {
      toast.error('Pick a category first');
      return;
    }
    setSuggestLoading(true);
    setSuggestions([]);
    setSavedIdx(new Set());
    try {
      const result = await suggestPersonas({
        category_name: cat.name,
        category_description: '',
        count: suggestCount,
        target_platform: suggestPlatform,
      });
      if (!result.length) {
        toast.error('AI returned no personas. Try again.');
      } else {
        setSuggestions(result);
        toast.success(`Generated ${result.length} persona suggestion(s)`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate personas');
    } finally {
      setSuggestLoading(false);
    }
  };

  const saveSuggestion = async (idx: number) => {
    const s = suggestions[idx];
    if (!s) return;
    setSavingIdx(idx);
    try {
      const resp = await client.entities.personas.create({
        data: {
          name: s.name,
          tone_description: s.tone_description,
          style_rules: s.style_rules,
          few_shot_examples: s.few_shot_examples,
          default_platform: s.default_platform,
          default_max_words: s.default_max_words || 60,
          funnel_stages: s.funnel_stages,
        },
      });
      setPersonas((prev) => [...prev, resp.data as Persona]);
      setSavedIdx((prev) => new Set(prev).add(idx));
      toast.success(`Saved "${s.name}"`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save persona');
    } finally {
      setSavingIdx(null);
    }
  };

  const saveAllSuggestions = async () => {
    for (let i = 0; i < suggestions.length; i += 1) {
      if (!savedIdx.has(i)) {
        // eslint-disable-next-line no-await-in-loop
        await saveSuggestion(i);
      }
    }
    toast.success('All suggestions saved');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Personas</h1>
          <p className="text-sm text-slate-400">
            Define your brand voices — tone, style rules, funnel-stage guidance,
            and reference examples.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={openSuggest}
            variant="outline"
            className="!bg-transparent border-violet-600/50 text-violet-300 hover:!bg-violet-600/10"
          >
            <Sparkles className="h-4 w-4 mr-1" /> Suggest with AI
          </Button>
          <Button
            onClick={openCreate}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> New persona
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">Loading…</div>
      ) : personas.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
          <Wand2 className="h-10 w-10 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">
            No personas yet. Create one or click{' '}
            <span className="text-violet-300">Suggest with AI</span>.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {personas.map((p) => {
            const stages = parseFunnelStages(p.funnel_stages);
            const hasStages = !!(stages.TOFU || stages.MOFU || stages.BOFU);
            return (
              <div
                key={p.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 flex flex-col"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-100">{p.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.default_platform || 'twitter'} · ~
                      {p.default_max_words || 100} words
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(p)}
                    className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm text-slate-300 mt-3 line-clamp-3">
                  {p.tone_description || (
                    <em className="text-slate-500">No tone description</em>
                  )}
                </p>
                {hasStages && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {stages.TOFU && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        TOFU
                      </span>
                    )}
                    {stages.MOFU && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        MOFU
                      </span>
                    )}
                    {stages.BOFU && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                        BOFU
                      </span>
                    )}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(p)}
                  className="mt-4 !bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800 self-start"
                >
                  Edit
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit persona' : 'New persona'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Friendly startup founder"
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div>
              <Label>Tone description</Label>
              <Textarea
                value={form.tone_description}
                onChange={(e) =>
                  setForm({ ...form, tone_description: e.target.value })
                }
                placeholder="e.g. Warm, curious, and pragmatic. Avoid jargon."
                className="bg-slate-950 border-slate-800 min-h-[80px]"
              />
            </div>
            <div>
              <Label>Style rules</Label>
              <Textarea
                value={form.style_rules}
                onChange={(e) =>
                  setForm({ ...form, style_rules: e.target.value })
                }
                placeholder={
                  '- No hashtags\n- Maximum 3 sentences\n- End with a question'
                }
                className="bg-slate-950 border-slate-800 min-h-[80px] font-mono text-xs"
              />
            </div>
            <div>
              <Label>Few-shot examples (one per blank line)</Label>
              <Textarea
                value={form.few_shot_examples}
                onChange={(e) =>
                  setForm({ ...form, few_shot_examples: e.target.value })
                }
                placeholder="Example post 1…&#10;&#10;Example post 2…"
                className="bg-slate-950 border-slate-800 min-h-[100px] text-xs"
              />
            </div>

            <div className="border-t border-slate-800 pt-4">
              <Label className="text-slate-200">
                Funnel stage content guidance
              </Label>
              <p className="text-xs text-slate-500 mb-3">
                Used by the Rewrite Workspace to tailor output to TOFU / MOFU /
                BOFU.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-emerald-300">TOFU — awareness</Label>
                  <Textarea
                    value={form.funnel_tofu}
                    onChange={(e) =>
                      setForm({ ...form, funnel_tofu: e.target.value })
                    }
                    placeholder="e.g. Educational, broad hooks, no CTA."
                    className="bg-slate-950 border-slate-800 min-h-[60px] text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-amber-300">MOFU — consideration</Label>
                  <Textarea
                    value={form.funnel_mofu}
                    onChange={(e) =>
                      setForm({ ...form, funnel_mofu: e.target.value })
                    }
                    placeholder="e.g. How-to, comparison, soft CTA."
                    className="bg-slate-950 border-slate-800 min-h-[60px] text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-rose-300">BOFU — decision</Label>
                  <Textarea
                    value={form.funnel_bofu}
                    onChange={(e) =>
                      setForm({ ...form, funnel_bofu: e.target.value })
                    }
                    placeholder="e.g. Concrete offer, proof, clear CTA."
                    className="bg-slate-950 border-slate-800 min-h-[60px] text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Default platform</Label>
                <Select
                  value={form.default_platform}
                  onValueChange={(v) =>
                    setForm({ ...form, default_platform: v as Platform })
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
                <Label>Default max words</Label>
                <Input
                  type="number"
                  value={form.default_max_words}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      default_max_words: Number(e.target.value) || 100,
                    })
                  }
                  className="bg-slate-950 border-slate-800"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={save}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Suggest dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Suggest personas with AI
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Category</Label>
              <Select
                value={suggestCategoryId}
                onValueChange={(v) => setSuggestCategoryId(v)}
              >
                <SelectTrigger className="bg-slate-950 border-slate-800">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>How many?</Label>
              <Input
                type="number"
                min={1}
                max={6}
                value={suggestCount}
                onChange={(e) =>
                  setSuggestCount(
                    Math.max(1, Math.min(6, Number(e.target.value) || 3)),
                  )
                }
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="col-span-2">
              <Label>Target platform</Label>
              <Select
                value={suggestPlatform}
                onValueChange={(v) => setSuggestPlatform(v as Platform)}
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
            <div className="flex items-end">
              <Button
                onClick={runSuggest}
                disabled={suggestLoading || !suggestCategoryId}
                className="bg-violet-600 hover:bg-violet-500 text-white w-full"
              >
                {suggestLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" /> Generate
                  </>
                )}
              </Button>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400">
                  {suggestions.length} suggestion(s). Review and save the ones
                  you like.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveAllSuggestions}
                  disabled={savingIdx !== null}
                  className="!bg-transparent border-emerald-600/50 text-emerald-300 hover:!bg-emerald-600/10"
                >
                  Save all
                </Button>
              </div>
              <div className="space-y-3">
                {suggestions.map((s, idx) => {
                  const stages = parseFunnelStages(s.funnel_stages);
                  const isSaved = savedIdx.has(idx);
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-100">
                            {s.name}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {s.tone_description}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveSuggestion(idx)}
                          disabled={isSaved || savingIdx === idx}
                          className={
                            isSaved
                              ? 'bg-emerald-700 text-white'
                              : 'bg-violet-600 hover:bg-violet-500 text-white'
                          }
                        >
                          {isSaved ? (
                            <>
                              <Check className="h-3 w-3 mr-1" /> Saved
                            </>
                          ) : savingIdx === idx ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Save'
                          )}
                        </Button>
                      </div>
                      <div className="mt-3 grid sm:grid-cols-3 gap-2">
                        {(['TOFU', 'MOFU', 'BOFU'] as const).map((stage) => {
                          const key = stage as keyof FunnelStageMap;
                          const text = stages[key];
                          const color =
                            stage === 'TOFU'
                              ? 'emerald'
                              : stage === 'MOFU'
                              ? 'amber'
                              : 'rose';
                          return (
                            <div
                              key={stage}
                              className={`rounded-md border border-${color}-500/20 bg-${color}-500/5 p-2`}
                            >
                              <div
                                className={`text-[10px] font-semibold text-${color}-300 mb-1`}
                              >
                                {stage}
                              </div>
                              <div className="text-[11px] text-slate-300 leading-snug">
                                {text || (
                                  <em className="text-slate-600">(none)</em>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuggestOpen(false)}
              className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonaManager;