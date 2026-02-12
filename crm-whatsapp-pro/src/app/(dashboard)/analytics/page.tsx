'use client';

import Header from '@/components/layout/Header';
import {
  RefreshCw,
  Flame,
  Thermometer,
  Snowflake,
  Crown,
  MapPin,
  Brain,
  Sparkles,
  Megaphone,
} from 'lucide-react';

function TempCard({
  icon: Icon,
  iconColor,
  borderColor,
  label,
  count,
  sub,
  valueColor,
}: {
  icon: React.ElementType;
  iconColor: string;
  borderColor: string;
  label: string;
  count: number;
  sub: string;
  valueColor: string;
}) {
  return (
    <div className={`card cursor-pointer border-l-4 ${borderColor} hover:shadow-md transition-all`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${iconColor}`} />
              <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
            </div>
            <p className={`text-3xl font-bold ${valueColor}`}>{count}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <>
      <Header
        title="Análise Estratégica"
        subtitle="Seu assistente de Growth com IA"
        actions={
          <button className="btn btn-secondary">
            <RefreshCw className="w-4 h-4" /> Atualizar Análise
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          {/* Temperature Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <TempCard
              icon={Flame}
              iconColor="text-red-500"
              borderColor="border-l-red-500"
              label="Clientes Quentes"
              count={0}
              sub="Compraram nos últimos 30 dias"
              valueColor="text-red-600"
            />
            <TempCard
              icon={Thermometer}
              iconColor="text-amber-500"
              borderColor="border-l-amber-500"
              label="Clientes Mornos"
              count={0}
              sub="30-90 dias sem comprar"
              valueColor="text-amber-600"
            />
            <TempCard
              icon={Snowflake}
              iconColor="text-blue-500"
              borderColor="border-l-blue-500"
              label="Clientes Frios"
              count={0}
              sub="+90 dias sem comprar (Churn Risk)"
              valueColor="text-blue-600"
            />
          </div>

          {/* VIP + State Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <Crown className="w-5 h-5 text-amber-500" />
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Clientes VIP</h3>
                </div>
              </div>
              <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                <p className="text-sm text-slate-400 text-center py-6">Nenhum VIP identificado</p>
              </div>
            </div>
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Clientes por Estado</h3>
                </div>
              </div>
              <div className="p-4 grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                <p className="text-sm text-slate-400 text-center col-span-3 py-6">Sem dados regionais</p>
              </div>
            </div>
          </div>

          {/* AI Assistant */}
          <div className="card bg-gradient-to-br from-slate-800 to-slate-900 border-0 mb-8">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <Brain className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">Assistente de IA</h3>
              </div>
              <p className="text-sm text-white/70 mb-5">Deixe a IA analisar seus dados e sugerir estratégias</p>
              <div className="flex flex-wrap gap-3">
                <button className="btn bg-amber-400 text-slate-900 hover:bg-amber-300">
                  <Brain className="w-4 h-4" /> IA: Sugerir Parâmetros Ideais
                </button>
                <button className="btn bg-white text-slate-800 hover:bg-slate-100">
                  <Sparkles className="w-4 h-4" /> Gerar Estratégia de Reativação
                </button>
                <button className="btn bg-white text-slate-800 hover:bg-slate-100">
                  <Crown className="w-4 h-4" /> Estratégia para VIPs
                </button>
              </div>
            </div>
          </div>

          {/* Segment link */}
          <div className="card hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Clientes do Segmento</h3>
              <a href="/campanhas" className="btn btn-success">
                <Megaphone className="w-4 h-4" /> Criar Campanha
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
