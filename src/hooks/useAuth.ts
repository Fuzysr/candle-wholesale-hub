import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppUser = {
  user: User;
  isAdmin: boolean;
  profile: {
    company_name: string | null;
    contact_name: string | null;
    phone: string | null;
    inn: string | null;
    address: string | null;
    email: string;
  } | null;
};

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (!s) {
        setAppUser(null);
      } else {
        // fetch role + profile in microtask to avoid deadlocks
        setTimeout(async () => {
          const [{ data: roles }, { data: profile }] = await Promise.all([
            supabase.from("user_roles").select("role").eq("user_id", s.user.id),
            supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
          ]);
          setAppUser({
            user: s.user,
            isAdmin: !!roles?.some((r) => r.role === "admin"),
            profile: profile ?? null,
          });
        }, 0);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const [{ data: roles }, { data: profile }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", data.session.user.id),
          supabase.from("profiles").select("*").eq("id", data.session.user.id).maybeSingle(),
        ]);
        setAppUser({
          user: data.session.user,
          isAdmin: !!roles?.some((r) => r.role === "admin"),
          profile: profile ?? null,
        });
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: appUser, loading };
};

export const signOut = () => supabase.auth.signOut();
