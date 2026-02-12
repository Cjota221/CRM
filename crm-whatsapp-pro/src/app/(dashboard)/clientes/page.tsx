'use client';

import Header from '@/components/layout/Header';
import { useState } from 'react';
import { Plus, Search, Download, Users } from 'lucide-react';

export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterTag, setFilterTag] = useState('todos');
  const [sortBy, setSortBy] = useState('default');

  return (
    <>
      <Header
        title="Painel de Clientes"
        actions={
          <button className="btn btn-primary">
            <Plus className="w-4 h-4" /> Adicionar Cliente
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          {/* Filters */}
          <div className="card p-5 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    className="input pl-10"
                    placeholder="Buscar por nome, e-mail..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="todos">Todos os Status</option>
                <option value="ativo">Ativo</option>
                <option value="em-risco">Em Risco</option>
                <option value="inativo">Inativo</option>
                <option value="sem-historico">Sem Histórico</option>
              </select>
              <select className="input w-auto" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
                <option value="todos">Todas as Tags</option>
                <option value="cliente-fiel">Cliente Fiel</option>
              </select>
              <select className="input w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="default">Ordenar por Padrão</option>
                <option value="most-orders">Mais Pedidos</option>
                <option value="least-orders">Menos Pedidos</option>
                <option value="highest-spent">Maior Valor Gasto</option>
                <option value="lowest-spent">Menor Valor Gasto</option>
              </select>
              <button className="btn btn-success">
                <Download className="w-4 h-4" /> Exportar CSV
              </button>
            </div>
          </div>

          {/* Client cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* TODO: Client cards */}
          </div>

          {/* Empty state */}
          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-medium text-slate-800 dark:text-slate-200">Nenhum cliente encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Clique em &quot;Sincronizar Dados&quot; ou adicione um novo cliente.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
