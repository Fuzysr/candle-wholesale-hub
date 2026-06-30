import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { onAuthChanged } from "@/lib/api/auth-session";
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
 * Resolve the current user from server-managed HttpOnly cookies.
 *
 * Shape is kept deliberately close to a typical Supabase-style auth hook so
 * existing pages can stay thin:
 *
 * - `session`  — truthy when `/auth/me` resolves, `null` otherwise.
 * - `user`     — `AppUser | null`, shape identical to the old one.
 * - `loading`  — `true` while the first `/auth/me` fetch is in-flight.
 */
export const useAuth = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAuthChanged((authenticated) => {
      if (authenticated) {
        queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
      } else {
        // Keep the observer in a settled state. Removing an in-flight `/me`
        // query makes `useQuery` immediately create another pending query,
        // which can leave anonymous pages stuck on their auth skeleton.
        queryClient.setQueryData(AUTH_ME_KEY, null);
      }
    });
  }, [queryClient]);

  const query = useQuery<UserOut | null>({
    queryKey: AUTH_ME_KEY,
    queryFn: () => authApi.me(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const user: AppUser | null = query.data ? toAppUser(query.data) : null;
  const session = user ? { user } : null;
  const loading = !query.data && (query.isPending || query.isFetching);

  return { session, user, loading };
};

/** Revoke the server-side refresh and expire all browser auth cookies. */
export const signOut = async (): Promise<void> => {
  await authApi.logout();
};
