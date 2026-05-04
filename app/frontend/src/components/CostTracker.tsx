/**
 * CostTracker — per-user cost dashboard for AI spend.
 *
 * Shows: today's spend, 7-day trend, breakdown by service, and recent events.
 * Budget alert is computed client-side from a simple threshold.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { client, CostEvent, displayAiEngineUserLabel } from '@/lib/personaApi';

interface Props {
  userId: string;
}

const COLORS = ['#8b5cf6', '#6366f1', '#10b981', '#f59e0b', '#ef4444'];

const CostTracker = ({ userId }: Props) => {
  const [events, setEvents] = useState<CostEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<number>(() => {
    const saved = localStorage.getItem('personarewire_daily_budget');
    return saved ? Number(saved) : 5;
  });

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await client.entities.cost_events.query({
          limit: 500,
          sort: '-created_at',
        });
        setEvents((resp.data?.items || []) as CostEvent[]);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load cost events');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const todayTotal = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return events
      .filter((e) => (e.created_at || '').slice(0, 10) === today)
      .reduce((sum, e) => sum + (e.cost_usd || 0), 0);
  }, [events]);

  const weekTotal = useMemo(
    () => events.reduce((sum, e) => sum + (e.cost_usd || 0), 0),
    [events],
  );

  const byDay = useMemo(() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    events.forEach((e) => {
      const k = (e.created_at || '').slice(0, 10);
      if (k in days) days[k] += e.cost_usd || 0;
    });
    return Object.entries(days).map(([date, cost]) => ({
      date: date.slice(5),
      cost: Number(cost.toFixed(4)),
    }));
  }, [events]);

  const byService = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((e) => {
      map[e.service] = (map[e.service] || 0) + (e.cost_usd || 0);
    });
    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(4)),
    }));
  }, [events]);

  const overBudget = todayTotal > budget;

  const saveBudget = (val: number) => {
    setBudget(val);
    localStorage.setItem('personarewire_daily_budget', String(val));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cost Tracker</h1>
          <p className="text-sm text-slate-400">
            Transparent per-token spend across AI services — exportable and
            budget-aware.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Daily budget (USD)</Label>
            <Input
              type="number"
              step="0.1"
              value={budget}
              onChange={(e) => saveBudget(Number(e.target.value) || 0)}
              className="w-32 bg-slate-900 border-slate-800"
            />
          </div>
        </div>
      </div>

      {overBudget && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <div>
            You've exceeded your daily budget of ${budget.toFixed(2)}. Ask your
            admin to review rewrite usage or billing settings.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={DollarSign}
          label="Today"
          value={`$${todayTotal.toFixed(4)}`}
          hint={`Budget: $${budget.toFixed(2)}`}
          accent={overBudget ? 'rose' : 'emerald'}
        />
        <StatCard
          icon={TrendingUp}
          label="Last 7 days"
          value={`$${weekTotal.toFixed(4)}`}
          hint={`${events.length} events`}
          accent="violet"
        />
        <StatCard
          icon={Zap}
          label="Avg per rewrite"
          value={
            events.length > 0
              ? `$${(weekTotal / events.length).toFixed(5)}`
              : '$0.00000'
          }
          hint="Including cached"
          accent="indigo"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold mb-3">7-day spend</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-sm font-semibold mb-3">By service</h3>
          <div className="h-56">
            {byService.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-500">
                No spend yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byService}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label
                  >
                    {byService.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold">Recent events</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            No cost events yet. Generate a rewrite to start tracking.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
            {events.slice(0, 50).map((e) => (
              <div
                key={e.id}
                className="px-5 py-3 flex items-center justify-between text-sm hover:bg-slate-900/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className="bg-slate-800 text-slate-300 border-slate-700">
                    {e.service}
                  </Badge>
                  <span className="text-slate-300 truncate">
                    {e.category === 'llm' ||
                    e.cost_center === 'rewrite' ||
                    e.service === 'ai_rewrite'
                      ? displayAiEngineUserLabel()
                      : e.cost_center || e.service || '—'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {e.tokens_input || 0}→{e.tokens_output || 0}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-mono text-violet-300">
                    ${e.cost_usd.toFixed(5)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent: 'violet' | 'emerald' | 'indigo' | 'rose';
}
const StatCard = ({ icon: Icon, label, value, hint, accent }: StatCardProps) => {
  const accents: Record<string, string> = {
    violet: 'bg-violet-500/15 text-violet-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
    indigo: 'bg-indigo-500/15 text-indigo-300',
    rose: 'bg-rose-500/15 text-rose-300',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div
          className={`h-7 w-7 rounded-md flex items-center justify-center ${accents[accent]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold font-mono">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{hint}</div>
    </div>
  );
};

export default CostTracker;