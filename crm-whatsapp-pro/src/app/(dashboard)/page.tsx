'use client';

import Header from '@/components/layout/Header';
import Link from 'next/link';
import { useDashboard } from '@/hooks';
import {
  TrendingDown,
  Target,
  ArrowUpCircle,
  Rocket,
  AlertTriangle,
  Zap,
  Activity,
  UserX,
  Cake,
  Crown,
  ShoppingCart,
  Radar,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// KPI Card Component
function KPICard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  valueColor,
  sub,
  onClick,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`kpi-card-dash rounded-xl p-5 shadow-sm hover:shadow transition-all ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-[18px] h-[18px] ${iconColor}`} />
        </div>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

// Quick Action Button
function QuickAction({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl p-4 text-center transition-all border border-slate-100 dark:border-slate-600"
    >
      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center mx-auto mb-2">
        <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </div>
      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </button>
  );
}

// Risk Signal Row
function RiskSignal({
  emoji,
  title,
  sub,
  count,
  value,
}: {
  emoji: string;
  title: string;
  sub: string;
  count: number;
  value: string;
}) {
  return (
    <div className="p-5 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
        <span className="text-lg">{emoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{count}</p>
        <p className="text-xs text-slate-400">{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: metrics, isLoading, error, refetch } = useDashboard();

  const m = metrics || {
    total_clientes: 0, clientes_ativos: 0, clientes_risco: 0,
    clientes_inativos: 0, clientes_vip: 0, ltv_medio: 0,
    ltv_risco: 0, ltv_inativos: 0, ticket_medio: 0,
    campanhas_total: 0, campanhas_ativas: 0, mensagens_enviadas: 0,
  };

  return (
    <>
      <Header
        title="Centro de Comando"
        subtitle={`Vigilante IA v2.0 • ${m.total_clientes} clientes`}
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              Escanear
            </button>
            <Link href="/analytics" className="btn btn-primary" style={{ background: '#7C3AED' }}>
              <Sparkles className="w-4 h-4" />
              Anny BI
            </Link>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        {error && (
          <div className="container mx-auto max-w-6xl mb-6">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">Erro ao carregar métricas. Verifique a conexão com o servidor.</p>
              <button onClick={() => refetch()} className="ml-auto btn btn-secondary text-xs">
                <RefreshCw className="w-3 h-3" /> Tentar novamente
              </button>
            </div>
          </div>
        )}

        <div className="container mx-auto max-w-6xl">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <KPICard
              icon={TrendingDown}
              iconBg="bg-red-50"
              iconColor="text-red-500"
              label="LTV em Risco"
              value={formatCurrency(m.ltv_risco)}
              valueColor="text-red-600"
              sub={`${m.clientes_risco} clientes parados`}
            />
            <KPICard
              icon={Target}
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
              label="Oportunidades"
              value={formatCurrency(m.ltv_inativos)}
              valueColor="text-amber-600"
              sub={`${m.clientes_inativos} prontos para reposição`}
            />
            <KPICard
              icon={ArrowUpCircle}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-500"
              label="Ativos"
              value={String(m.clientes_ativos)}
              valueColor="text-emerald-600"
              sub={`Ticket médio ${formatCurrency(m.ticket_medio)}`}
            />
            <KPICard
              icon={Rocket}
              iconBg="bg-purple-50"
              iconColor="text-purple-500"
              label="Campanhas Ativas"
              value={String(m.campanhas_ativas)}
              valueColor="text-purple-600"
              sub={`${m.mensagens_enviadas} mensagens enviadas`}
            />
          </div>

          {/* Atenção Imediata */}
          <div className="section-dash rounded-xl shadow-sm mb-10 overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2 bg-red-50/40 dark:bg-red-900/20">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Atenção Imediata</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-slate-50 dark:divide-slate-700">
              {/* UTI de Vendas */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">UTI de Vendas</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Clientes em estado crítico</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{m.clientes_risco}</span>
                    <button className="btn btn-primary text-xs py-1.5 px-3" style={{ background: '#7C3AED' }}>
                      <Zap className="w-3 h-3" /> Gerar Estratégia
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 mb-4 border border-slate-100 dark:border-slate-600">
                  <p className="text-xl font-bold text-red-600">{formatCurrency(m.ltv_risco)}</p>
                  <p className="text-xs text-slate-400">LTV mensal perdido</p>
                </div>
                <div className="text-center py-6 text-slate-300 text-sm">
                  <p>Clique em &quot;Escanear&quot; para analisar</p>
                </div>
              </div>

              {/* Oportunidades Quentes */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Oportunidades Quentes</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Prontos para reposição</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{m.clientes_inativos}</span>
                    <button className="btn btn-primary text-xs py-1.5 px-3" style={{ background: '#D97706' }}>
                      <Zap className="w-3 h-3" /> Gerar Mensagens
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 mb-4 border border-slate-100 dark:border-slate-600">
                  <p className="text-xl font-bold text-amber-600">{formatCurrency(m.ltv_inativos)}</p>
                  <p className="text-xs text-slate-400">Potencial imediato</p>
                </div>
                <div className="text-center py-6 text-slate-300 text-sm">
                  <p>Baseado no ciclo de compra</p>
                </div>
              </div>
            </div>
          </div>

          {/* Crescimento C4 */}
          <div className="section-dash rounded-xl shadow-sm mb-10 overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2 bg-purple-50/40 dark:bg-purple-900/20">
              <Rocket className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Crescimento</span>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Performance C4 Franquias</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Franqueadas e candidatas</p>
                </div>
                <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">0</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 border border-slate-100 dark:border-slate-600 text-center">
                  <p className="text-xl font-bold text-purple-600">0</p>
                  <p className="text-xs text-slate-400">Candidatas</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 border border-slate-100 dark:border-slate-600 text-center">
                  <p className="text-xl font-bold text-slate-500">0</p>
                  <p className="text-xs text-slate-400">Sem vendas</p>
                </div>
              </div>
              <div className="text-center py-6 text-slate-300 text-sm">
                <p>Monitoramento de franquias</p>
              </div>
            </div>
          </div>

          {/* Sinais de Risco */}
          <div className="section-dash rounded-xl shadow-sm mb-10 overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sinais de Risco</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-slate-50 dark:divide-slate-700">
              <RiskSignal emoji="🐋" title="Baleias Adormecidas" sub="Atacado pesado que sumiu" count={0} value="R$ 0" />
              <RiskSignal emoji="⏰" title="Fora do Ciclo" sub="Passaram do intervalo normal" count={0} value="R$ 0" />
              <RiskSignal emoji="⚠️" title="Possível Problema" sub="Parou após último pedido" count={0} value="R$ 0" />
            </div>
          </div>

          {/* Ações Rápidas */}
          <div className="section-dash rounded-xl shadow-sm">
            <div className="px-6 py-3.5 border-b border-slate-50 dark:border-slate-700 flex items-center gap-2">
              <Zap className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Ações Rápidas</span>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <QuickAction icon={UserX} label="Reativar Inativos" sub={`${m.clientes_inativos} clientes`} />
                <QuickAction icon={Cake} label="Aniversariantes" sub="Ver este mês" />
                <QuickAction icon={Crown} label="Mimar VIPs" sub={`${m.clientes_vip} VIPs`} />
                <QuickAction icon={ShoppingCart} label="Nova Campanha" sub={`${m.campanhas_total} campanhas`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
