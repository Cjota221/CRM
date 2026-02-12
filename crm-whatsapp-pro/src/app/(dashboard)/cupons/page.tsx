'use client';

import Header from '@/components/layout/Header';
import {
  Plus,
  Ticket,
  CheckCircle,
  Send,
  Receipt,
  Percent,
  Sparkles,
  Gem,
  Package,
  Truck,
  Info,
} from 'lucide-react';

function MetricCard({
  label,
  value,
  valueColor,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  valueColor: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">{label}</p>
          <p className={`metric-value ${valueColor}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

export default function CuponsPage() {
  return (
    <>
      <Header
        title="Gestão de Cupons"
        subtitle="Crie, rastreie e analise ROI dos seus cupons"
        actions={
          <button className="btn btn-success">
            <Plus className="w-4 h-4" /> Cadastrar Cupom
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
            <MetricCard label="Cupons Ativos" value="0" valueColor="text-emerald-600" icon={CheckCircle} iconBg="bg-emerald-50" iconColor="text-emerald-500" />
            <MetricCard label="Cupons Enviados" value="0" valueColor="text-blue-600" icon={Send} iconBg="bg-blue-50" iconColor="text-blue-500" />
            <MetricCard label="Cupons Usados" value="0" valueColor="text-violet-600" icon={Receipt} iconBg="bg-violet-50" iconColor="text-violet-500" />
            <MetricCard label="Taxa Conversão" value="0%" valueColor="text-amber-600" icon={Percent} iconBg="bg-amber-50" iconColor="text-amber-500" />
          </div>

          {/* Auto Rules */}
          <div className="card bg-gradient-to-br from-slate-800 to-slate-900 border-0 mb-8">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">Regras de Cupom Automático</h3>
              </div>
              <p className="text-sm text-white/70 mb-5">Configure as regras para sugestão automática de cupons</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gem className="w-4 h-4 text-white" />
                    <p className="font-medium text-white">Ticket Alto (R$ 500+)</p>
                  </div>
                  <p className="text-sm text-white/70">Cupom de 15% para reativação</p>
                  <p className="text-xs text-white/50 mt-1">Código: VOLTA15</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-white" />
                    <p className="font-medium text-white">Ticket Médio (R$ 200-500)</p>
                  </div>
                  <p className="text-sm text-white/70">Cupom de 10%</p>
                  <p className="text-xs text-white/50 mt-1">Código: VOLTA10</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck className="w-4 h-4 text-white" />
                    <p className="font-medium text-white">Ticket Baixo (&lt;R$ 200)</p>
                  </div>
                  <p className="text-sm text-white/70">Frete Grátis</p>
                  <p className="text-xs text-white/50 mt-1">Código: FRETEGRATIS</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Cupons Cadastrados</h3>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <Ticket className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 text-sm">Nenhum cupom cadastrado</p>
                <p className="text-slate-400 text-xs mt-1">Clique em &quot;Cadastrar Cupom&quot; para começar</p>
              </div>
            </div>
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Histórico de Uso</h3>
                <span className="text-sm text-slate-400">0 usos</span>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <Info className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 text-sm">Nenhum uso registrado</p>
                <p className="text-slate-400 text-xs mt-1">Os usos aparecerão aqui automaticamente</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
