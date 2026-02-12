'use client';

import Header from '@/components/layout/Header';
import { useState } from 'react';
import { Search, Package } from 'lucide-react';

export default function ProdutosPage() {
  const [search, setSearch] = useState('');
  const [filterStock, setFilterStock] = useState('todos');
  const [filterActive, setFilterActive] = useState('todos');

  return (
    <>
      <Header title="Painel de Produtos" />

      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto">
          <div className="card p-5 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[250px]">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    className="input pl-10"
                    placeholder="Buscar por nome, SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <select className="input w-auto" value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
                <option value="todos">Todo o Estoque</option>
                <option value="gerenciado">Gerenciado</option>
                <option value="nao-gerenciado">Não Gerenciado</option>
                <option value="em-estoque">Em Estoque</option>
                <option value="sem-estoque">Sem Estoque</option>
                <option value="com-variacoes">Com Variações</option>
              </select>
              <select className="input w-auto" value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
                <option value="todos">Todos os Status</option>
                <option value="ativado">Ativado</option>
                <option value="desativado">Desativado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* TODO: Product cards */}
          </div>

          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="font-medium text-slate-800 dark:text-slate-200">Nenhum produto encontrado</h3>
            <p className="text-sm text-slate-500 mt-1">
              Clique em &quot;Sincronizar Dados&quot; para carregar os produtos.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
