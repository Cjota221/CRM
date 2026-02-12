'use client';

import Header from '@/components/layout/Header';
import { useState } from 'react';
import { Brain, Zap, Save } from 'lucide-react';

export default function ConfiguracoesPage() {
  const [ativoDays, setAtivoDays] = useState(30);
  const [riscoDays, setRiscoDays] = useState(90);
  const [apiKey, setApiKey] = useState('');

  const webhookUrl = 'https://crmcjota.netlify.app/.netlify/functions/webhook-handler';

  function handleSave() {
    localStorage.setItem('crm-settings', JSON.stringify({
      statusAtivoDays: ativoDays,
      statusRiscoDays: riscoDays,
      openaiApiKey: apiKey,
    }));
    alert('Configurações salvas!');
  }

  return (
    <>
      <Header title="Configurações" />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto max-w-2xl">
          {/* Status dos Clientes */}
          <div className="card mb-6">
            <div className="p-6">
              <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">Status dos Clientes</h4>
              <p className="text-sm text-slate-500 mb-4">Defina os intervalos em dias para cada status.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Cliente Ativo (até X dias)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={ativoDays}
                    onChange={(e) => setAtivoDays(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Cliente em Risco (até X dias)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={riscoDays}
                    onChange={(e) => setRiscoDays(Number(e.target.value))}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Acima do valor &quot;Em Risco&quot;, o cliente é &quot;Inativo&quot;.
                </p>
              </div>
            </div>
          </div>

          {/* IA Integration */}
          <div className="card mb-6">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-slate-500" />
                <h4 className="font-medium text-slate-700 dark:text-slate-200">Integração com IA (ChatGPT)</h4>
              </div>
              <p className="text-sm text-slate-500 mb-4">Configure sua API Key do ChatGPT (OpenAI).</p>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  API Key do ChatGPT
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Obtenha em: platform.openai.com/api-keys
              </p>
            </div>
          </div>

          {/* Webhooks */}
          <div className="card mb-6">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-slate-500" />
                <h4 className="font-medium text-slate-700 dark:text-slate-200">Webhooks (Tempo Real)</h4>
              </div>
              <p className="text-sm text-slate-500 mb-4">Receba notificações automáticas quando pedidos são criados ou atualizados.</p>
              <div className="card bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">URL do Webhook:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="text-emerald-600 hover:text-emerald-800 text-sm flex items-center gap-1"
                  >
                    Copiar
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 font-mono text-sm text-slate-800 dark:text-slate-200 break-all">
                  {webhookUrl}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button onClick={handleSave} className="btn btn-primary">
              <Save className="w-4 h-4" /> Salvar Configurações
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
