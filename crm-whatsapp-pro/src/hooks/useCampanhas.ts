'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campanhasApi } from '@/lib/api';
import type { Campaign } from '@/types';

export function useCampanhas() {
  return useQuery<Campaign[]>({
    queryKey: ['campanhas'],
    queryFn: campanhasApi.list,
    staleTime: 30_000,
  });
}

export function useCreateCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) => campanhasApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) => campanhasApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
    },
  });
}

export function useDeleteCampanha() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campanhasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campanhas'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
