export type SupabaseConfig = {
  url: URL;
  publishableKey: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const base = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !publishableKey) return null;

  try {
    const url = new URL(base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      return null;
    }
    return { url, publishableKey };
  } catch {
    return null;
  }
}
