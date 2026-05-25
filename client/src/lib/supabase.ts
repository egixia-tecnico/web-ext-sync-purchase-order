import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Edge function base URL
export const edgeFnUrl = `${supabaseUrl}/functions/v1/egixia-api`;

// Call the egixia-api edge function
export async function callEdge<T = unknown>(
  action: string,
  clientKey: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, clientKey, ...payload }),
  });

  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new Error(json?.error ?? `Edge function error: ${res.status}`);
  }
  return json as T;
}
