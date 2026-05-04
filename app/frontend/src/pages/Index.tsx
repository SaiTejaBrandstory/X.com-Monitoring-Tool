/**
 * PersonaRewire main app shell.
 *
 * Provides sidebar navigation across Feed, Profiles, Personas, Saved, Costs.
 * Auth-gated: shows login screen when the user is not signed in.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  DollarSign,
  History,
  LayoutGrid,
  LogOut,
  Settings,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authApi } from '@/lib/auth';
import { client } from '@/lib/personaApi';
import LiveFeed from '@/components/LiveFeed';
import ProfileManager from '@/components/ProfileManager';
import PersonaManager from '@/components/PersonaManager';
import CostTracker from '@/components/CostTracker';
import RewriteHistory from '@/components/RewriteHistory';
import { appLogoUrl } from '@/lib/config';

type Tab = 'feed' | 'profiles' | 'personas' | 'history' | 'costs';

const HERO_IMG =
  'https://mgx-backend-cdn.metadl.com/generate/images/910092/2026-04-24/niyx2qiaafla/hero-dashboard-banner.png';
const WORKSPACE_IMG =
  'https://mgx-backend-cdn.metadl.com/generate/images/910092/2026-04-24/niyxvdaaafna/persona-workspace-illustration.png';

interface AuthedUser {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

const Index = () => {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('feed');

  useEffect(() => {
    const check = async () => {
      try {
        const resp = await client.auth.me();
        if (resp?.data) {
          setUser(resp.data as AuthedUser);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <img
          src={appLogoUrl}
          alt=""
          width={40}
          height={40}
          className="rounded-lg opacity-90"
        />
        <div className="text-slate-400 text-sm">Loading PersonaRewire…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <div className="relative overflow-hidden">
          <img
            src={HERO_IMG}
            alt="PersonaRewire dashboard"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
          <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-16">
            <img
              src={appLogoUrl}
              alt=""
              width={52}
              height={52}
              className="rounded-xl mb-5 ring-1 ring-white/10"
            />
            <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/40 mb-4">
              <Sparkles className="h-3 w-3 mr-1" /> AI Content Intelligence
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-br from-white via-violet-200 to-indigo-300 bg-clip-text text-transparent leading-tight">
              PersonaRewire
            </h1>
            <p className="text-xl text-slate-300 mt-4 max-w-2xl">
              Discover viral posts from creators you follow, then rewrite them
              in your brand voice — ethically, instantly, with full cost
              transparency.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Button
                size="lg"
                className="bg-violet-600 hover:bg-violet-500 text-white"
                onClick={() => {
                  void authApi.login('/').catch((err) =>
                    console.error('Login failed:', err)
                  );
                }}
              >
                Sign in to start
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="!bg-transparent border-slate-600 text-slate-200 hover:!bg-slate-800 hover:text-white"
                onClick={() =>
                  document
                    .getElementById('features')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                How it works
              </Button>
            </div>
          </div>
        </div>

        <div id="features" className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Activity,
              title: 'Live viral feed',
              desc: 'Monitor Twitter/X and LinkedIn profiles by category with auto-refresh and virality signals.',
            },
            {
              icon: Wand2,
              title: 'Persona-aware rewrites',
              desc: 'Define your brand voice once. Rewrite any post in your tone — configurable model (default: OpenRouter free tier).',
            },
            {
              icon: DollarSign,
              title: 'Cost transparency',
              desc: 'Per-token cost tracking, budget alerts, and exportable reports — no surprises.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur p-6 hover:border-violet-500/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-violet-500/20 text-violet-300 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="max-w-6xl mx-auto px-6 pb-24">
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/50 p-8 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-3">
                Built for compliance
              </h2>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li>• Every rewrite is framed as original adaptation, never a repost.</li>
                <li>• Raw scraped content auto-expires after 90 days.</li>
                <li>• All outputs are watermarked with provenance metadata.</li>
                <li>• Full audit log for admin actions.</li>
              </ul>
            </div>
            <img
              src={WORKSPACE_IMG}
              alt="Persona workspace"
              className="w-full h-auto rounded-xl"
            />
          </div>
        </div>
      </div>
    );
  }

  const navItems: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'feed', label: 'Live Feed', icon: Activity },
    { key: 'profiles', label: 'Profiles', icon: Users },
    { key: 'personas', label: 'Personas', icon: Wand2 },
    { key: 'history', label: 'Rewrite History', icon: History },
    { key: 'costs', label: 'Costs', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-64 border-r border-slate-800 bg-slate-900/40 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-white/10">
              <img src={appLogoUrl} alt="" width={36} height={36} className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="font-semibold leading-tight">PersonaRewire</div>
              <div className="text-xs text-slate-400">Content intelligence</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-violet-500/15 text-violet-200 border-l-2 border-violet-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          <Link
            to="/admin/config"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Admin Config
          </Link>
        </nav>

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-semibold">
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {user.name || user.email || 'User'}
              </div>
              <div className="text-[10px] text-slate-500 truncate">
                {user.email || user.id}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-slate-400 hover:text-rose-400"
              onClick={async () => {
                await client.auth.logout();
                window.location.reload();
              }}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        {tab === 'feed' && <LiveFeed userId={user.id} />}
        {tab === 'profiles' && <ProfileManager />}
        {tab === 'personas' && <PersonaManager userId={user.id} />}
        {tab === 'history' && (
          <RewriteHistory
            userId={user.id}
            onNavigateToFeed={() => setTab('feed')}
          />
        )}
        {tab === 'costs' && <CostTracker userId={user.id} />}
      </main>
    </div>
  );
};

export default Index;