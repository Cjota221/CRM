'use client';

import Header from '@/components/layout/Header';
import {
  Link as LinkIcon,
  Copy,
  Trash2,
  Calendar,
  ShoppingBag,
  ShoppingCart,
  Banknote,
  Package,
  RefreshCw,
  CreditCard,
  Inbox,
  Radio,
  Info,
  AlertTriangle,
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
  valueColor?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">{label}</p>
          <p className={`metric-value ${valueColor || ''}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

export default function WebhooksPage() {
  const webhookUrl = 'https://crmcjota.netlify.app/.netlify/functions/webhook-handler';

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl);
  }

  return (
    <>
      <Header
        title="Webhooks - Eventos em Tempo Real"
        actions={
          <button className="btn btn-secondary">
            <Trash2 className="w-4 h-4" /> Limpar Histórico
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          {/* Webhook URL Card */}
          <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 border-0 mb-8">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <LinkIcon className="w-5 h-5 text-white" />
                <h3 className="text-lg font-semibold text-white">URL do Webhook</h3>
              </div>
              <p className="text-sm text-white/70 mb-4">Configure esta URL no FacilZap para receber eventos em tempo real</p>
              <div className="bg-white/10 rounded-xl p-4 flex items-center justify-between">
                <code className="text-sm font-mono text-white break-all">{webhookUrl}</code>
                <button onClick={copyUrl} className="btn bg-white text-emerald-600 text-sm py-2 ml-3 flex-shrink-0">
                  <Copy className="w-4 h-4" /> Copiar
                </button>
              </div>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: Package, label: 'pedido_criado' },
                  { icon: RefreshCw, label: 'pedido_atualizado' },
                  { icon: CreditCard, label: 'pedido_pago' },
                  { icon: ShoppingCart, label: 'carrinho_abandonado' },
                ].map(({ icon: I, label }) => (
                  <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                    <I className="w-6 h-6 text-white mx-auto mb-2" />
                    <p className="text-xs text-white/80">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
            <MetricCard label="Eventos Hoje" value="0" icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-500" />
            <MetricCard label="Novos Pedidos" value="0" valueColor="text-emerald-600" icon={ShoppingBag} iconBg="bg-emerald-50" iconColor="text-emerald-500" />
            <MetricCard label="Carrinhos Abandonados" value="0" valueColor="text-amber-600" icon={ShoppingCart} iconBg="bg-amber-50" iconColor="text-amber-500" />
            <MetricCard label="Valor Recuperável" value="R$ 0" valueColor="text-violet-600" icon={Banknote} iconBg="bg-violet-50" iconColor="text-violet-500" />
          </div>

          {/* Lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-5 h-5 text-amber-500" />
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Carrinhos Abandonados</h3>
                </div>
                <span className="text-sm text-slate-400">0 carrinhos</span>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 text-sm">Nenhum carrinho abandonado</p>
                <p className="text-slate-400 text-xs mt-1">Configure o webhook no FacilZap para receber alertas</p>
              </div>
            </div>
            <div className="card">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Radio className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">Histórico de Eventos</h3>
                </div>
                <span className="text-sm text-slate-400">0 eventos</span>
              </div>
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <Radio className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 text-sm">Aguardando eventos...</p>
                <p className="text-slate-400 text-xs mt-1">Os eventos aparecerão aqui quando o FacilZap enviar</p>
              </div>
            </div>
          </div>

          {/* How to configure */}
          <div className="mt-6 card bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-blue-800 dark:text-blue-300">Como Configurar no FacilZap</h4>
              </div>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-decimal list-inside">
                <li>Acesse sua conta no <strong>FacilZap</strong></li>
                <li>No menu lateral, clique em <strong>Integrações</strong></li>
                <li>Clique no submenu <strong>Webhooks</strong></li>
                <li>Cole a URL acima e <strong>ative</strong> o webhook</li>
                <li>Ative os eventos: <strong>Pedido Criado</strong>, <strong>Pedido Atualizado</strong>, <strong>Carrinho Abandonado</strong></li>
                <li>Clique em <strong>Salvar</strong></li>
              </ol>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-3 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                A URL deve retornar código 200. O FacilZap faz até 3 tentativas em caso de falha.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
