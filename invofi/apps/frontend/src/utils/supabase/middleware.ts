import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

type CookieToSet = Parameters<NonNullable<CookieMethodsServer['setAll']>>[0][number];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Offline demo mode (#177): no Supabase project configured — skip the
  // session refresh entirely so `npm run dev` works with no env vars.
  // Demos (issue #107) set NEXT_PUBLIC_DEMO_MODE=1 which implies mock mode.
  if (process.env.NEXT_PUBLIC_USE_MOCK === '1' || process.env.NEXT_PUBLIC_DEMO_MODE === '1') {
    return supabaseResponse;
  }

  // Lazy initialization of Supabase client to avoid build-time errors during static generation
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
