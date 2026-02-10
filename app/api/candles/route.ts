import { getSupabase } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h';
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 500, 2000);
  const before = req.nextUrl.searchParams.get('before');
  const after = req.nextUrl.searchParams.get('after');
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('candles')
      .select('ts, o, h, l, c, v')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .limit(limit);
    if (before) {
      query = query.lt('ts', before).order('ts', { ascending: false });
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json((data ?? []).reverse());
    }
    if (after) {
      query = query.gt('ts', after).order('ts', { ascending: true });
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data ?? []);
    }
    query = query.order('ts', { ascending: false });
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data ?? []).reverse());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
