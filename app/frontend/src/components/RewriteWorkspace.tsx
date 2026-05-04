/**
 * RewriteWorkspace — modal surface for the core AI rewrite flow.
 *
 * Left panel: original post. Right panel: persona selection, target platform,
 * length budget, hook lock, and streamed rewrite output. Saves the generated
 * output to `rewritten_outputs` and a cost event to `cost_events`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  client,
  displayAiEngineUserLabel,
  estimateCost,
  FunnelStage,
  generateRewrite,
  IngestedPost,
  parseFunnelStages,
  Persona,
  Platform,
} from '@/lib/personaApi';

interface Props {
  userId: string;
  post: IngestedPost;
  savedPostId?: number;
  onClose: () => void;
}

/**
 * Default funnel-stage guidance, mirrored from the backend so the UI can show
 * the user exactly what will be sent to the model when a persona has no
 * custom stage guidance.
 */
const DEFAULT_STAGE_GUIDANCE: Record<FunnelStage, string> = {
  TOFU:
    'Earn attention. Open with a contrarian hook or pattern interrupt, tease insight, no CTA needed. Feel like a thought, not a sales pitch.',
  MOFU:
    "Educate and differentiate. Use frameworks, comparisons, case snippets, teach the 'how'. End with a soft nudge (learn more / DM me).",
  BOFU:
    'Drive decision. Use proof, specificity, ROI language, a single clear CTA, urgency without hype. Make the next step obvious.',
};

const RewriteWorkspace = ({ userId, post, savedPostId, onClose }: Props) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [targetPlatform, setTargetPlatform] = useState<Platform>(
    post.platform as Platform,
  );
  const [maxWords, setMaxWords] = useState(100);
  const [lockHook, setLockHook] = useState(false);
  const [funnelStage, setFunnelStage] = useState<FunnelStage | 'none'>('none');
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [lastHook, setLastHook] = useState<string>('');
  const [lastMeta, setLastMeta] = useState<{
    tokens_in: number;
    tokens_out: number;
    model: string;
    cost: number;
  } | null>(null);

  const selectedPersona = useMemo(
    () => personas.find((p) => String(p.id) === selectedPersonaId),
    [personas, selectedPersonaId],
  );

  const personaStages = useMemo(
    () => parseFunnelStages(selectedPersona?.funnel_stages),
    [selectedPersona],
  );

  const currentStageGuidance = useMemo(() => {
    if (funnelStage === 'none') return '';
    return personaStages[funnelStage] || '';
  }, [funnelStage, personaStages]);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await client.entities.personas.query({ limit: 50 });
        const list = (resp.data?.items || []) as Persona[];
        setPersonas(list);
        if (list.length > 0) {
          setSelectedPersonaId(String(list[0].id));
          setMaxWords(list[0].default_max_words || 100);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const maxChars = targetPlatform === 'twitter' ? 280 : 3000;

  const doGenerate = async () => {
    if (!selectedPersona) {
      toast.error('Please select a persona first');
      return;
    }
    setGenerating(true);
    try {
      const examples = selectedPersona.few_shot_examples
        ? selectedPersona.few_shot_examples.split(/\n\s*\n/).filter(Boolean)
        : [];
      const result = await generateRewrite({
        original_content: post.content,
        persona_name: selectedPersona.name,
        persona_tone: selectedPersona.tone_description || '',
        persona_style_rules: selectedPersona.style_rules || '',
        few_shot_examples: examples,
        target_platform: targetPlatform,
        max_words: maxWords,
        max_chars: maxChars,
        lock_hook: lockHook,
        funnel_stage: funnelStage === 'none' ? undefined : funnelStage,
        funnel_stage_guidance: currentStageGuidance || undefined,
      });
      setOutput(result.rewritten_content);
      setLastHook(result.hook);
      const cost = estimateCost(
        result.model_used,
        result.tokens_input,
        result.tokens_output,
      );
      setLastMeta({
        tokens_in: result.tokens_input,
        tokens_out: result.tokens_output,
        model: result.model_used,
        cost,
      });

      // Persist to rewritten_outputs.
      // Note: omit `saved_post_id` entirely when we don't have a saved post —
      // the backend expects an int or a missing field, NOT a literal null.
      try {
        const outputData: Record<string, unknown> = {
          persona_id: selectedPersona.id,
          original_content: post.content,
          original_hook: result.hook,
          rewritten_content: result.rewritten_content,
          word_count: result.word_count,
          char_count: result.char_count,
          platform_target: targetPlatform,
          version: 1,
          lock_hook: lockHook,
          max_words: maxWords,
          max_chars: maxChars,
          model_used: result.model_used,
          tokens_input: result.tokens_input,
          tokens_output: result.tokens_output,
        };
        if (typeof savedPostId === 'number') {
          outputData.saved_post_id = savedPostId;
        }
        await client.entities.rewritten_outputs.create({ data: outputData });
      } catch (e) {
        console.error('save output', e);
      }

      // Log cost
      try {
        await client.entities.cost_events.create({
          data: {
            service: 'ai_rewrite',
            cost_center: 'rewrite',
            category: 'llm',
            tokens_input: result.tokens_input,
            tokens_output: result.tokens_output,
            cost_usd: cost,
            model_used: result.model_used,
            event_meta: JSON.stringify({
              persona: selectedPersona.name,
              platform: targetPlatform,
            }),
          },
        });
      } catch (e) {
        console.error('log cost', e);
      }

      toast.success('Rewrite generated');
    } catch (e: unknown) {
      console.error(e);
      toast.error('Failed to generate rewrite');
    } finally {
      setGenerating(false);
    }
  };

  const copyOut = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h2 className="font-semibold">Rewrite workspace</h2>
            <Badge
              className="bg-violet-500/20 text-violet-300 border-violet-500/40 text-[10px]"
              title="Powered by AI"
            >
              {displayAiEngineUserLabel()}
            </Badge>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Original */}
          <div className="p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Original post
            </h3>
            <div className="flex items-center gap-2">
              <img
                src={
                  post.author_avatar ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_handle}`
                }
                className="h-8 w-8 rounded-full bg-slate-800"
                alt={post.author_handle}
              />
              <div>
                <div className="text-sm font-medium">
                  {post.author_name || post.author_handle}
                </div>
                <div className="text-xs text-slate-500">
                  @{post.author_handle} · {post.platform}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-200 whitespace-pre-wrap">
              {post.content}
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              ⚠️ Adaptations are your original content in your voice. Always
              credit the source author when sharing, and do not repost verbatim.
            </div>
          </div>

          {/* Rewrite */}
          <div className="p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your rewrite
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Persona</Label>
                <Select
                  value={selectedPersonaId}
                  onValueChange={(v) => {
                    setSelectedPersonaId(v);
                    const p = personas.find((x) => String(x.id) === v);
                    if (p) {
                      setMaxWords(p.default_max_words || 100);
                      if (p.default_platform)
                        setTargetPlatform(p.default_platform as Platform);
                    }
                  }}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue
                      placeholder={
                        personas.length === 0
                          ? 'Create a persona first'
                          : 'Select'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target platform</Label>
                <Select
                  value={targetPlatform}
                  onValueChange={(v) => setTargetPlatform(v as Platform)}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="twitter">Twitter/X</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Max words</Label>
                <Input
                  type="number"
                  value={maxWords}
                  onChange={(e) => setMaxWords(Number(e.target.value) || 100)}
                  className="bg-slate-900 border-slate-800"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Lock hook</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch
                      checked={lockHook}
                      onCheckedChange={setLockHook}
                    />
                    <span className="text-xs text-slate-400">
                      {lockHook ? 'Keep opening' : 'Rewrite all'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Funnel stage</Label>
                <Select
                  value={funnelStage}
                  onValueChange={(v) => setFunnelStage(v as FunnelStage | 'none')}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    <SelectItem value="none">None — persona default</SelectItem>
                    <SelectItem value="TOFU">TOFU — awareness</SelectItem>
                    <SelectItem value="MOFU">MOFU — consideration</SelectItem>
                    <SelectItem value="BOFU">BOFU — decision</SelectItem>
                  </SelectContent>
                </Select>
                {funnelStage !== 'none' && (
                  <div className="mt-1.5 text-[11px] text-slate-400 leading-snug rounded-md border border-slate-800 bg-slate-900/50 p-2">
                    {currentStageGuidance ? (
                      <>
                        <span className="text-slate-500">
                          Persona guidance ({funnelStage}):{' '}
                        </span>
                        {currentStageGuidance}
                      </>
                    ) : (
                      <>
                        <span className="text-slate-500">
                          Default {funnelStage} guidance:{' '}
                        </span>
                        {DEFAULT_STAGE_GUIDANCE[funnelStage]}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={doGenerate}
              disabled={generating || !selectedPersona}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…
                </>
              ) : output ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" /> Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate rewrite
                </>
              )}
            </Button>

            {output && (
              <div className="space-y-2">
                <Textarea
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  className="bg-slate-900 border-slate-800 min-h-[180px] text-sm"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <div>
                    {output.split(/\s+/).filter(Boolean).length} words ·{' '}
                    {output.length}/{maxChars} chars
                  </div>
                  {lastMeta && (
                    <div className="font-mono">
                      {lastMeta.tokens_in}→{lastMeta.tokens_out} tok · $
                      {lastMeta.cost.toFixed(5)}
                    </div>
                  )}
                </div>
                {lastHook && (
                  <div className="text-[11px] text-slate-500">
                    <span className="text-slate-400">Source hook:</span>{' '}
                    <span className="italic">{lastHook}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyOut}
                    className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toast.success('Already saved to your history');
                    }}
                    className="!bg-transparent border-slate-700 text-slate-200 hover:!bg-slate-800"
                  >
                    <Save className="h-3 w-3 mr-1" /> Saved ✓
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewriteWorkspace;