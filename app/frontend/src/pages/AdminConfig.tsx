/**
 * AdminConfig — admin-only settings page.
 *
 * Two tabs:
 *  1. General — key/value config_keys (compliance footer, rate limits, etc.)
 *  2. API Spaces — Apify scraper API configurations, with active-switching
 *     per platform.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Shield, Settings, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authApi } from '@/lib/auth';
import { client } from '@/lib/personaApi';
import ApiSpacesManager from '@/components/ApiSpacesManager';

interface ConfigKey {
  id: number;
  key: string;
  value?: string;
  description?: string;
}

const DEFAULTS: { key: string; description: string; value: string }[] = [
  {
    key: 'compliance_footer',
    description: 'Footer text shown on every generated rewrite',
    value:
      'This rewrite was produced with PersonaRewire. Credit original authors when sharing.',
  },
  {
    key: 'rate_limit_per_minute',
    description: 'Max rewrites per minute per user',
    value: '10',
  },
  {
    key: 'raw_content_retention_days',
    description: 'Days to retain raw scraped posts before purge',
    value: '90',
  },
  {
    key: 'default_model',
    description:
      'Rewrite AI profile name for your team (technical model is configured on the server only)',
    value: 'Standard',
  },
];

const AdminConfig = () => {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<ConfigKey[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const resp = await client.auth.me();
        if (resp?.data) setUser(resp.data as { id: string; email?: string });
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const resp = await client.entities.config_keys.queryAll({ limit: 100 });
        const list = (resp.data?.items || []) as ConfigKey[];
        setConfigs(list);
        const map: Record<string, string> = {};
        list.forEach((c) => (map[c.key] = c.value || ''));
        DEFAULTS.forEach((d) => {
          if (!(d.key in map)) map[d.key] = d.value;
        });
        setEdits(map);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [user]);

  const saveOne = async (key: string) => {
    setSaving(true);
    const existing = configs.find((c) => c.key === key);
    const def = DEFAULTS.find((d) => d.key === key);
    try {
      if (existing) {
        const resp = await client.entities.config_keys.update({
          id: String(existing.id),
          data: { value: edits[key] },
        });
        setConfigs(
          configs.map((c) =>
            c.id === existing.id ? (resp.data as ConfigKey) : c,
          ),
        );
      } else {
        const resp = await client.entities.config_keys.create({
          data: {
            key,
            value: edits[key],
            description: def?.description || '',
          },
        });
        setConfigs([...configs, resp.data as ConfigKey]);
      }
      toast.success(`Saved: ${key}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 p-6">
        <Shield className="h-10 w-10 text-slate-600" />
        <p className="text-slate-400">Sign in to access admin config.</p>
        <Button
          onClick={() => {
            void authApi.login('/admin/config').catch((err) =>
              console.error('Login failed:', err)
            );
          }}
          className="bg-violet-600 hover:bg-violet-500 text-white"
        >
          Sign in
        </Button>
      </div>
    );
  }

  const mergedKeys = Array.from(
    new Set([...DEFAULTS.map((d) => d.key), ...configs.map((c) => c.key)]),
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back to app
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-violet-400" />
          <h1 className="text-2xl font-bold">Admin Config</h1>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
            MVP
          </Badge>
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Platform-wide settings and scraper API management.
        </p>

        <Tabs defaultValue="general">
          <TabsList className="bg-slate-900/70 border border-slate-800">
            <TabsTrigger
              value="general"
              className="data-[state=active]:bg-violet-600 data-[state=active]:text-white"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" /> General
            </TabsTrigger>
            <TabsTrigger
              value="api_spaces"
              className="data-[state=active]:bg-violet-600 data-[state=active]:text-white"
            >
              <Zap className="h-3.5 w-3.5 mr-1.5" /> API Spaces
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <div className="space-y-4">
              {mergedKeys.map((key) => {
                const def = DEFAULTS.find((d) => d.key === key);
                const existing = configs.find((c) => c.key === key);
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-mono text-sm text-violet-300">
                          {key}
                        </div>
                        <div className="text-xs text-slate-500">
                          {existing?.description || def?.description}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => saveOne(key)}
                        disabled={saving}
                        className="bg-violet-600 hover:bg-violet-500 text-white"
                      >
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                    </div>
                    {(edits[key] || '').length > 60 ? (
                      <Textarea
                        value={edits[key] || ''}
                        onChange={(e) =>
                          setEdits({ ...edits, [key]: e.target.value })
                        }
                        className="bg-slate-950 border-slate-800 text-sm"
                      />
                    ) : (
                      <Input
                        value={edits[key] || ''}
                        onChange={(e) =>
                          setEdits({ ...edits, [key]: e.target.value })
                        }
                        className="bg-slate-950 border-slate-800 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="api_spaces" className="mt-4">
            <ApiSpacesManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminConfig;