'use client';

import Header from '@/components/layout/Header';
import { useState } from 'react';
import { Search, Receipt } from 'lucide-react';

export default function PedidosPage() {
  const [search, setSearch] = useState('');

  return (
    <>
      <Header title="Painel de Pedidos" />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          <div className="card p-5 mb-6">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  className="input pl-10"
                  placeholder="Buscar por Cód. do Pedido ou Nome do Cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-4 text-left table-header">Cód. Pedido</th>
                  <th className="px-6 py-4 text-left table-header">Cliente</th>
                  <th className="px-6 py-4 text-left table-header">Data</th>
                  <th className="px-6 py-4 text-center table-header">Itens</th>
                  <th className="px-6 py-4 text-right table-header">Total</th>
                  <th className="px-6 py-4 text-center table-header">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-50 dark:divide-slate-700">
                {/* TODO: Order rows */}
              </tbody>
            </table>
          </div>

          <div className="card p-12 text-center mt-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-medium text-slate-800 dark:text-slate-200">Nenhum pedido encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Clique em &quot;Sincronizar Dados&quot; para carregar os pedidos.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
