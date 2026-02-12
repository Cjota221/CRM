'use client';

import Header from '@/components/layout/Header';
import { useCampanhas } from '@/hooks';
import { useMemo } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  BarChart3,
  MessageCircle,
  Clock,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
} from 'lucide-react';

function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; icon: React.ElementType; label: string }> = {
    draft: { bg: 'bg-slate-100', text: 'text-slate-600', icon: Clock, label: 'Rascunho' },
    scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock, label: 'Agendada' },
    running: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: Play, label: 'Ativa' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', icon: Pause, label: 'Pausada' },
    completed: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle2, label: 'Concluída' },
    cancelled: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle, label: 'Cancelada' },
  };
  const s = map[status] || map['draft'];
  const Icon = s.icon;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text} inline-flex items-center gap-1`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function CampanhasPage() {
  const { data: campanhas = [], isLoading, error, refetch } = useCampanhas();

  const stats = useMemo(() => {
    const ativas = campanhas.filter((c) => c.status === 'running' || c.status === 'scheduled').length;
    const totalEnviadas = campanhas.reduce((sum, c) => sum + (c.stats?.sent || 0), 0);
    const totalEntregues = campanhas.reduce((sum, c) => sum + (c.stats?.delivered || 0), 0);
    const taxa = totalEnviadas > 0 ? Math.round((totalEntregues / totalEnviadas) * 100) : 0;
    return { total: campanhas.length, ativas, totalEnviadas, taxa };
  }, [campanhas]);

  return (
    <>
      <Header
        title="Campanhas"
        subtitle={isLoading ? 'Carregando...' : `${stats.total} campanhas • ${stats.ativas} ativa(s)`}
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Atualizar
            </button>
            <button className="btn btn-primary">
              <Plus className="w-4 h-4" /> Nova Campanha
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto max-w-6xl">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
            <div className="metric-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="metric-label">Total de Campanhas</p>
                  <p className="metric-value">{stats.total}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </div>
            <div className="metric-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="metric-label">Ativas</p>
                  <p className="metric-value text-emerald-600">{stats.ativas}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Play className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </div>
            <div className="metric-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="metric-label">Mensagens Enviadas</p>
                  <p className="metric-value text-violet-600">{stats.totalEnviadas.toLocaleString('pt-BR')}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-violet-500" />
                </div>
              </div>
            </div>
            <div className="metric-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="metric-label">Taxa de Entrega</p>
                  <p className="metric-value text-amber-600">{stats.taxa}%</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-amber-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Campaign List */}
          <div className="card">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Campanhas</h3>
              <div className="flex gap-2">
                <button className="btn btn-secondary text-xs">
                  <Clock className="w-3 h-3" /> Agendadas
                </button>
                <button className="btn btn-secondary text-xs">
                  <Pause className="w-3 h-3" /> Pausadas
                </button>
              </div>
            </div>

            {/* Loading */}
            {isLoading && (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-4" />
                <p className="text-sm text-slate-500">Carregando campanhas...</p>
              </div>
            )}

            {/* Error */}
            {error && !isLoading && (
              <div className="p-12 text-center">
                <p className="text-sm text-red-500 mb-4">Erro ao carregar campanhas</p>
                <button onClick={() => refetch()} className="btn btn-primary">
                  <RefreshCw className="w-4 h-4" /> Tentar novamente
                </button>
              </div>
            )}

            {/* Campaign items */}
            {!isLoading && !error && campanhas.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {campanhas.map((campanha) => (
                  <div
                    key={campanha.id}
                    className="p-5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                          <Send className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {campanha.name}
                          </p>
                          {campanha.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{campanha.description}</p>
                          )}
                        </div>
                      </div>
                      <CampaignStatusBadge status={campanha.status} />
                    </div>

                    {/* Stats bar */}
                    {campanha.stats && campanha.stats.total_recipients > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>{campanha.stats.sent}/{campanha.stats.total_recipients} enviadas</span>
                          <span>{campanha.stats.progress_percent || 0}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
                            style={{ width: `${campanha.stats.progress_percent || 0}%` }}
                          />
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-400">
                          <span>✅ {campanha.stats.delivered} entregues</span>
                          <span>👁 {campanha.stats.read} lidas</span>
                          {campanha.stats.failed > 0 && (
                            <span className="text-red-400">❌ {campanha.stats.failed} falhas</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && campanhas.length === 0 && (
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                  <Megaphone className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="font-medium text-slate-800 dark:text-slate-200">Nenhuma campanha ainda</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Crie sua primeira campanha para enviar mensagens em massa.
                </p>
                <button className="btn btn-primary mt-4">
                  <Plus className="w-4 h-4" /> Criar Campanha
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
