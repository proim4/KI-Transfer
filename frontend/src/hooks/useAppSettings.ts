import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { StatusThresholds } from '../lib/statusBadge';
import type { AppSettingsRow, StatusColor } from '../types/db';

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

export interface StatusThresholdSettings {
  status_high_pct: number;
  status_low_pct: number;
  status_high_color: StatusColor;
  status_mid_color: StatusColor;
  status_low_color: StatusColor;
}

/** StatusBadge's threshold shape, derived from app_settings — shared by every table that shows a status column. */
export function useStatusThresholds(): StatusThresholds | undefined {
  const { data: settings } = useAppSettings();
  return useMemo(
    () =>
      settings && {
        highPct: settings.status_high_pct,
        lowPct: settings.status_low_pct,
        highColor: settings.status_high_color,
        midColor: settings.status_mid_color,
        lowColor: settings.status_low_color,
      },
    [settings],
  );
}

export function useSetStatusThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: StatusThresholdSettings) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
