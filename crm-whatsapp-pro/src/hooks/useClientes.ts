import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Client, ApiResponse } from '@/types';

const API_BASE = '/api';

async function fetchClientes(params?: Record<string, string>): Promise<Client[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(`${API_BASE}/clientes${qs}`);
  if (!res.ok) throw new Error('Erro ao buscar clientes');
  const data = await res.json();
  return Array.isArray(data) ? data : data.clientes || [];
}

async function createCliente(cliente: Partial<Client>): Promise<Client> {
  const res = await fetch(`${API_BASE}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cliente),
  });
  if (!res.ok) throw new Error('Erro ao criar cliente');
  return res.json();
}

export function useClientes(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['clientes', params],
    queryFn: () => fetchClientes(params),
    staleTime: 30_000,
  });
}

export function useCreateCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}
