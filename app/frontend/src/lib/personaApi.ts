/**
 * PersonaRewire API helpers.
 *
 * Thin wrappers around metagptx web-sdk to keep components clean.
 */
import { createClient } from '@metagptx/web-sdk';

export const client = createClient();

export type Platform = 'twitter' | 'linkedin';
export type ViralityTrend = 'up' | 'down' | 'steady';

export interface Category {
  id: number;
  name: string;
  color?: string;
  refresh_interval_minutes?: number;
  is_paused?: boolean;
}

export interface MonitoredProfile {
  id: number;
  category_id?: number;
  platform: Platform;
  handle: string;
  display_name?: string;
  avatar_url?: string;
  profile_url?: string;
  is_active?: boolean;
}

/** Parsed from `post_extras` JSON (X API media + link entities). */
export interface PostExtrasMediaItem {
  type: string;
  url?: string;
  preview_url?: string;
  alt_text?: string | null;
}

export interface PostExtras {
  media: PostExtrasMediaItem[];
  urls: { expanded_url: string; display_url: string }[];
}

export function parsePostExtras(raw?: string | null): PostExtras | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const rec = o as Record<string, unknown>;
    const media = Array.isArray(rec.media) ? (rec.media as PostExtrasMediaItem[]) : [];
    const urlsRaw = Array.isArray(rec.urls) ? rec.urls : [];
    const urls = urlsRaw
      .filter((u): u is { expanded_url: string; display_url: string } => {
        if (!u || typeof u !== 'object') return false;
        const e = (u as { expanded_url?: string }).expanded_url;
        return typeof e === 'string' && Boolean(e.trim());
      })
      .map((u) => ({
        expanded_url: u.expanded_url,
        display_url:
          typeof (u as { display_url?: string }).display_url === 'string'
            ? ((u as { display_url?: string }).display_url as string)
            : u.expanded_url,
      }));
    return { media, urls };
  } catch {
    return null;
  }
}

export interface IngestedPost {
  id: number;
  profile_id?: number;
  platform: Platform;
  author_handle: string;
  author_name?: string;
  author_avatar?: string;
  content: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  engagement_score?: number;
  virality_trend?: ViralityTrend;
  posted_at?: string;
  raw_url?: string;
  /** JSON string from backend for extra post media and links */
  post_extras?: string | null;
  category_id?: number;
  is_new?: boolean;
}

export interface SavedPost {
  id: number;
  user_id: string;
  post_id: number;
  notes?: string;
  created_at?: string;
}

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface FunnelStageMap {
  TOFU?: string;
  MOFU?: string;
  BOFU?: string;
}

export interface Persona {
  id: number;
  user_id: string;
  name: string;
  tone_description?: string;
  style_rules?: string;
  few_shot_examples?: string;
  default_platform?: Platform;
  default_max_words?: number;
  funnel_stages?: string; // JSON string of FunnelStageMap
}

export const parseFunnelStages = (raw?: string): FunnelStageMap => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as FunnelStageMap;
  } catch {
    /* ignore */
  }
  return {};
};

export const stringifyFunnelStages = (map: FunnelStageMap): string =>
  JSON.stringify({
    TOFU: map.TOFU || '',
    MOFU: map.MOFU || '',
    BOFU: map.BOFU || '',
  });

export interface SuggestedPersona {
  name: string;
  tone_description: string;
  style_rules: string;
  funnel_stages: string;
  default_platform: Platform;
  default_max_words: number;
  few_shot_examples: string;
}

export const suggestPersonas = async (args: {
  category_name: string;
  category_description?: string;
  count?: number;
  target_platform?: Platform;
}): Promise<SuggestedPersona[]> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/personas/suggest',
    method: 'POST',
    data: {
      category_name: args.category_name,
      category_description: args.category_description || '',
      count: args.count ?? 3,
      target_platform: args.target_platform || 'twitter',
    },
    options: { timeout: 120_000 },
  });
  const data = resp.data as { personas: SuggestedPersona[] };
  return data?.personas || [];
};

export interface RewrittenOutput {
  id: number;
  user_id: string;
  saved_post_id?: number;
  persona_id?: number;
  original_content?: string;
  original_hook?: string;
  rewritten_content: string;
  word_count?: number;
  char_count?: number;
  platform_target?: string;
  version?: number;
  lock_hook?: boolean;
  max_words?: number;
  max_chars?: number;
  model_used?: string;
  tokens_input?: number;
  tokens_output?: number;
  created_at?: string;
}

export interface CostEvent {
  id: number;
  user_id: string;
  service: string;
  cost_center?: string;
  category?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd: number;
  model_used?: string;
  event_meta?: string;
  created_at?: string;
}

export type ApiSpacePlatform = 'twitter' | 'linkedin' | 'instagram' | 'other';
export type ApiSpaceTestStatus = 'untested' | 'active' | 'inactive' | 'failed';
export type ApiSpaceProxyGroup = 'RESIDENTIAL' | 'DATACENTER' | 'none';

export interface ApiSpace {
  id: number;
  label: string;
  provider?: string;
  api_token_encrypted?: string;
  actor_type: string;
  platform: ApiSpacePlatform;
  proxy_group?: ApiSpaceProxyGroup;
  is_active?: boolean;
  last_tested_at?: string;
  test_status?: ApiSpaceTestStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export const setActiveApiSpace = async (id: number) => {
  const resp = await client.apiCall.invoke({
    url: `/api/v1/entities/api_spaces/${id}/set_active`,
    method: 'POST',
  });
  return resp.data as {
    message: string;
    id: number;
    platform: string;
    is_active: boolean;
  };
};

export const testApiSpace = async (id: number) => {
  const resp = await client.apiCall.invoke({
    url: `/api/v1/entities/api_spaces/${id}/test`,
    method: 'POST',
  });
  return resp.data as {
    id: number;
    test_status: ApiSpaceTestStatus;
    last_tested_at?: string;
    ok: boolean;
    message: string;
  };
};

export const listApiSpaces = async (): Promise<ApiSpace[]> => {
  const resp = await client.entities.api_spaces.queryAll({ limit: 200 });
  return (resp.data?.items || []) as ApiSpace[];
};

export const getActiveApiSpaceFor = (
  spaces: ApiSpace[],
  platform: ApiSpacePlatform,
): ApiSpace | undefined => {
  return spaces.find((s) => s.platform === platform && s.is_active);
};

export interface XcomScanRequest {
  profile_ids?: number[];
  posts_per_profile?: number;
  date_from?: string;
  date_to?: string;
  dry_run?: boolean;
}

export interface XcomProfileResult {
  profile_id: number;
  handle: string;
  fetched: number;
  saved: number;
  status: string;
  error?: string;
}

export interface XcomScanResponse {
  total_fetched: number;
  total_saved: number;
  profiles: XcomProfileResult[];
  using_mock: boolean;
  started_at: string;
  finished_at: string;
  posts?: IngestedPost[];
}

export interface XcomStatus {
  has_active_api_space: boolean;
  has_token: boolean;
  using_mock: boolean;
  active_profiles: number;
  api_space_label?: string;
}

export const scanXcom = async (
  args: XcomScanRequest,
): Promise<XcomScanResponse> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/xcom/scan',
    method: 'POST',
    data: {
      profile_ids: args.profile_ids,
      posts_per_profile: args.posts_per_profile ?? 10,
      date_from: args.date_from,
      date_to: args.date_to,
      dry_run: args.dry_run ?? false,
    },
    options: { timeout: 180_000 },
  });
  return resp.data as XcomScanResponse;
};

export const getXcomStatus = async (): Promise<XcomStatus> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/xcom/status',
    method: 'GET',
  });
  return resp.data as XcomStatus;
};

export interface ClearXcomFeedResponse {
  deleted: number;
  platform: string;
}

export const clearXcomFeed = async (): Promise<ClearXcomFeedResponse> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/xcom/clear-feed',
    method: 'DELETE',
  });
  return resp.data as ClearXcomFeedResponse;
};

export const computeEngagement = (p: IngestedPost): number => {
  return (p.likes || 0) + (p.retweets || 0) * 2 + (p.replies || 0) * 1.5;
};

export const formatNum = (n: number): string => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

export const timeAgo = (iso?: string): string => {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = (now - then) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

/**
 * User-visible label for the AI rewriter — never expose provider/model slugs in UI.
 */
export const displayAiEngineUserLabel = (): string => 'AI';

/**
 * Rough cost estimation (USD) — used for display when backend doesn't supply it.
 * Based on public list prices; keep in sync with actual billing when available.
 */
export const estimateCost = (
  model: string,
  tokensIn: number,
  tokensOut: number,
): number => {
  const m = model.toLowerCase().trim();
  // OpenRouter free router + explicit :free slugs → treat as $0 in the UI.
  if (m === 'openrouter/free' || m.endsWith(':free')) {
    return 0;
  }
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-5.4': { in: 1.25 / 1_000_000, out: 10 / 1_000_000 },
    'gpt-4o-mini': { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 },
    'claude-opus-4.6': { in: 15 / 1_000_000, out: 75 / 1_000_000 },
    'deepseek-v3.2': { in: 0.27 / 1_000_000, out: 1.1 / 1_000_000 },
    // OpenRouter slug(s) — rough list-tier estimate for UI only (billing is via OpenRouter).
    'deepseek/deepseek-chat': { in: 0.27 / 1_000_000, out: 1.1 / 1_000_000 },
    'deepseek/deepseek-r1': { in: 0.55 / 1_000_000, out: 2.2 / 1_000_000 },
  };
  let rate =
    rates[m] ||
    (m.includes('deepseek')
      ? { in: 0.27 / 1_000_000, out: 1.1 / 1_000_000 }
      : undefined);
  if (!rate) {
    rate = { in: 0.2 / 1_000_000, out: 0.4 / 1_000_000 };
  }
  return tokensIn * rate.in + tokensOut * rate.out;
};

export interface ExtractHookResult {
  hook: string;
  hook_type: string;
}

export const extractHook = async (
  content: string,
): Promise<ExtractHookResult> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/rewrite/extract_hook',
    method: 'POST',
    data: { content },
  });
  return resp.data as ExtractHookResult;
};

export interface GenerateRewriteArgs {
  original_content: string;
  original_hook?: string;
  persona_name: string;
  persona_tone: string;
  persona_style_rules?: string;
  few_shot_examples?: string[];
  target_platform: Platform;
  max_words: number;
  max_chars: number;
  lock_hook: boolean;
  funnel_stage?: FunnelStage;
  funnel_stage_guidance?: string;
}

export interface GenerateRewriteResult {
  rewritten_content: string;
  hook: string;
  word_count: number;
  char_count: number;
  model_used: string;
  tokens_input: number;
  tokens_output: number;
}

export const generateRewrite = async (
  args: GenerateRewriteArgs,
): Promise<GenerateRewriteResult> => {
  const resp = await client.apiCall.invoke({
    url: '/api/v1/rewrite/generate',
    method: 'POST',
    data: args,
    options: { timeout: 120_000 },
  });
  return resp.data as GenerateRewriteResult;
};