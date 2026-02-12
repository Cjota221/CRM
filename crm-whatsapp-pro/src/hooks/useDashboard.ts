'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';

export interface DashboardData {
  total_clientes: number;
  clientes_ativos: number;
  clientes_risco: number;
  clientes_inativos: number;
  clientes_vip: number;
  ltv_medio: number;
  ltv_risco: number;
  ltv_inativos: number;
  ticket_medio: number;
  campanhas_total: number;
  campanhas_ativas: number;
  mensagens_enviadas: number;
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await dashboardApi.getMetrics();
      return res.metrics || res;
    },
    staleTime: 60_000, // 1 min
    refetchInterval: 120_000, // auto-refresh 2 min
  });
}
