import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, tokenStore } from "@/lib/api";
import type { UserOut } from "@/lib/api";

export type AuthProfile = {
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  address: string | null;
  email: string;
};

export type AppUser = {
  user: UserOut;
  isAdmin: boolean;
  profile: AuthProfile;
};

const toAppUser = (u: UserOut): AppUser => ({
  user: u,
  isAdmin: u.is_admin,
  profile: {
    company_name: u.company_name,
    contact_name: u.contact_name,
    phone: u.phone,
    inn: u.inn,
    address: u.address,
    email: u.email,
  },
});

export const AUTH_ME_KEY = ["auth", "me"] as const;

/**
 * React hook that resolves the current user from the JWT in `localStorage`.
 *
 * Shape is kept deliberately close to a typical Supabase-style auth hook so
 * existing pages can stay thin:
 *
 * - `session`  — truthy when a token exists, `null` otherwise.
 * - `user`     — `AppUser | null`, shape identical to the old one.
 * - `loading`  — `true` while the first `/auth/me` fetch is in-flight.
 */
export const useAuth = () => {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean>(() => !!tokenStore.getAccess());

  useEffect(() => {
    return tokenStore.onChange(() => {
      const next = !!tokenStore.getAccess();
      setHasToken(next);
      if (!next) queryClient.removeQueries({ queryKey: AUTH_ME_KEY });
      else queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
    });
  }, [queryClient]);

  const query = useQuery({
    queryKey: AUTH_ME_KEY,
    queryFn: () => authApi.me(),
    enabled: hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const user: AppUser | null = query.data ? toAppUser(query.data) : null;
  const session = hasToken && user ? { user } : null;
  const loading = hasToken && !query.data && (query.isPending || query.isFetching);

  return { session, user, loading };
};

/** Clear persisted tokens; the matching `useAuth` instance will update. */
export const signOut = async (): Promise<void> => {
  authApi.logout();
};
