'use client';

import Header from '@/components/layout/Header';
import { useState, useMemo } from 'react';
import { useClientes } from '@/hooks';
import {
  Plus,
  Search,
  Download,
  Users,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    ativo: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Ativo' },
    inativo: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Inativo' },
    risco: { bg: 'bg-red-50', text: 'text-red-700', label: 'Em Risco' },
    vip: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'VIP' },
    novo: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Novo' },
  };
  const s = map[status] || map['ativo'];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterTag, setFilterTag] = useState('todos');
  const [sortBy, setSortBy] = useState('default');

  const { data: clientes = [], isLoading, error, refetch } = useClientes();

  // Filtragem e ordenação client-side
  const filtered = useMemo(() => {
    let list = [...clientes];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.nome || c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.telefone || c.celular || c.phone || '').includes(q) ||
          (c.cidade || c.city || '').toLowerCase().includes(q)
      );
    }

    // Status
    if (filterStatus !== 'todos') {
      const statusMap: Record<string, string> = {
        ativo: 'ativo',
        'em-risco': 'risco',
        inativo: 'inativo',
        'sem-historico': 'novo',
      };
      const mapped = statusMap[filterStatus] || filterStatus;
      list = list.filter((c) => c.status === mapped);
    }

    // Tag
    if (filterTag !== 'todos') {
      list = list.filter((c) => c.tags?.includes(filterTag));
    }

    // Sort
    switch (sortBy) {
      case 'most-orders':
        list.sort((a, b) => (b.total_pedidos || 0) - (a.total_pedidos || 0));
        break;
      case 'least-orders':
        list.sort((a, b) => (a.total_pedidos || 0) - (b.total_pedidos || 0));
        break;
      case 'highest-spent':
        list.sort((a, b) => (b.ltv || 0) - (a.ltv || 0));
        break;
      case 'lowest-spent':
        list.sort((a, b) => (a.ltv || 0) - (b.ltv || 0));
        break;
    }

    return list;
  }, [clientes, search, filterStatus, filterTag, sortBy]);

  // Tags únicas
  const uniqueTags = useMemo(() => {
    const tags = new Set<string>();
    clientes.forEach((c) => c.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clientes]);

  return (
    <>
      <Header
        title="Painel de Clientes"
        subtitle={isLoading ? 'Carregando...' : `${clientes.length} clientes cadastrados`}
        actions={
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Atualizar
            </button>
            <button className="btn btn-primary">
              <Plus className="w-4 h-4" /> Adicionar Cliente
            </button>
          </div>
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
                    placeholder="Buscar por nome, e-mail, telefone..."
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
                {uniqueTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
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
            {search && (
              <p className="text-xs text-slate-400 mt-2">
                {filtered.length} resultado(s) para &quot;{search}&quot;
              </p>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="card p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-4" />
              <p className="text-sm text-slate-500">Carregando clientes...</p>
            </div>
          )}

          {/* Error */}
          {error && !isLoading && (
            <div className="card p-12 text-center">
              <p className="text-sm text-red-500 mb-4">Erro ao carregar clientes</p>
              <button onClick={() => refetch()} className="btn btn-primary">
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
            </div>
          )}

          {/* Client cards grid */}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((cliente) => {
                const nome = cliente.nome || cliente.name || 'Sem nome';
                const phone = cliente.telefone || cliente.celular || cliente.phone;
                const city = cliente.cidade || cliente.city;
                const initials = nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

                return (
                  <div key={String(cliente.id)} className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{nome}</p>
                        <StatusBadge status={cliente.status} />
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-500 mb-3">
                      {phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3" />
                          <span>{phone}</span>
                        </div>
                      )}
                      {cliente.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3" />
                          <span className="truncate">{cliente.email}</span>
                        </div>
                      )}
                      {city && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          <span>{city}{cliente.estado ? ` - ${cliente.estado}` : ''}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <ShoppingBag className="w-3 h-3" />
                        <span>{cliente.total_pedidos || 0} pedidos</span>
                      </div>
                      {(cliente.ltv !== undefined && cliente.ltv > 0) && (
                        <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <TrendingUp className="w-3 h-3" />
                          <span>{cliente.ltv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                      )}
                    </div>

                    {cliente.tags && cliente.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {cliente.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                        {cliente.tags.length > 3 && (
                          <span className="text-xs text-slate-400">+{cliente.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="card p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="font-medium text-slate-800 dark:text-slate-200">
                {clientes.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum resultado encontrado'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {clientes.length === 0
                  ? 'Clique em "Sincronizar Dados" ou adicione um novo cliente.'
                  : 'Tente ajustar os filtros de busca.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
