'use client';

import Header from '@/components/layout/Header';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  BarChart3,
  MessageCircle,
  Users,
  Clock,
} from 'lucide-react';

export default function CampanhasPage() {
  return (
    <>
      <Header
        title="Campanhas"
        subtitle="Gerencie suas campanhas de envio em massa"
        actions={
          <button className="btn btn-primary">
            <Plus className="w-4 h-4" /> Nova Campanha
          </button>
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
                  <p className="metric-value">0</p>
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
                  <p className="metric-value text-emerald-600">0</p>
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
                  <p className="metric-value text-violet-600">0</p>
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
                  <p className="metric-value text-amber-600">0%</p>
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
          </div>
        </div>
      </div>
    </>
  );
}
