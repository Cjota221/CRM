import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Campaign } from '@/types';

const API_BASE = '/api';

async function fetchCampanhas(): Promise<Campaign[]> {
  const res = await fetch(`${API_BASE}/campanhas`);
  if (!res.ok) throw new Error('Erro ao buscar campanhas');
  const data = await res.json();
  return Array.isArray(data) ? data : data.campanhas || [];
}

async function createCampanha(campanha: Partial<Campaign>): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/campanhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(campanha),
  });
  if (!res.ok) throw new Error('Erro ao criar campanha');
  return res.json();
}

export function useCampanhas() {
  return useQuery({
    queryKey: ['campanhas'],
    queryFn: fetchCampanhas,
    staleTime: 30_000,
  });
}

export function useCreateCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCampanha,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
    },
  });
}
