import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { StatusThresholds } from '../lib/statusBadge';
import type { AppSettingsRow, StatusColor } from '../types/db';

const QUERY_KEY = ['app-settings'];

/** RLS filters an unauthorized update to 0 rows without an error — report it instead of "saved". */
const SETTINGS_NOT_SAVED = 'บันทึกไม่สำเร็จ — เฉพาะผู้ดูแลระบบ (Admin) ที่ Login อยู่เท่านั้นที่แก้การตั้งค่าได้';

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
      const { data, error } = await supabase
        .from('app_settings')
        .update({ require_login: requireLogin, updated_at: new Date().toISOString() })
        .eq('id', true)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(SETTINGS_NOT_SAVED);
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
  status_zero_color: StatusColor;
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
        zeroColor: settings.status_zero_color,
      },
    [settings],
  );
}

export function useSetStatusThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: StatusThresholdSettings) => {
      const { data, error } = await supabase
        .from('app_settings')
        .update({ ...settings, updated_at: new Date().toISOString() })
        .eq('id', true)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(SETTINGS_NOT_SAVED);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
