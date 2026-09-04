import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ProfileRow, UserRole, UserStatus } from '../types/db';

const USERS_QUERY_KEY = ['profiles'];

/** All users — RLS (profiles_select_admin) makes this return every row for an admin and nothing at all otherwise, so no extra client-side gating is needed. */
export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from('profiles').select('*').order('username');
      if (error) throw error;
      return data;
    },
  });
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body });
  if (error) {
    // supabase-js only surfaces the HTTP status on FunctionsHttpError, not the
    // JSON body — re-read it so the friendly Thai message from the function
    // (e.g. duplicate username) reaches the UI instead of a generic failure.
    const context = (error as { context?: Response }).context;
    let friendlyMessage: string | undefined;
    if (context) {
      try {
        const body = await context.clone().json();
        friendlyMessage = body?.error;
      } catch {
        // body wasn't JSON — fall through to the generic error below
      }
    }
    throw friendlyMessage ? new Error(friendlyMessage) : error;
  }
  return data as T;
}

export function useBootstrapAdmin() {
  return useMutation({
    mutationFn: (args: { username: string; password: string }) => invoke({ action: 'bootstrap', ...args }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { username: string; password: string; role: UserRole; status: UserStatus }) =>
      invoke({ action: 'create', ...args }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; role?: UserRole; status?: UserStatus; password?: string }) =>
      invoke({ action: 'update', ...args }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string }) => invoke({ action: 'delete', ...args }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}
