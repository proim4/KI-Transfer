import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { AppSettingsRow } from '../types/db';

const QUERY_KEY = ['app-settings'];

export function useAppSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<AppSettingsRow> => {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSetRequireLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requireLogin: boolean) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ require_login: requireLogin, updated_at: new Date().toISOString() })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
