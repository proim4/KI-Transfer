import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ProfileRow } from '../types/db';
import { useSession } from './useAuth';

export function profileQueryKey(userId: string | undefined) {
  return ['profile', userId];
}

/** The signed-in user's own profile (role/status/username) — separate from Supabase Auth's session, which knows nothing about either. */
export function useCurrentUser() {
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: profileQueryKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return {
    session,
    profile: profile ?? null,
    isAdmin: profile?.role === 'admin' && profile.status === 'active',
    loading: sessionLoading || (!!userId && profileLoading),
  };
}
