-- カスタムマイグレーション(fees/plan.md 設計判断5)。
-- 月次の fee_record 自動生成を DB 関数にまとめ、GitHub Actions のジョブ(.github/workflows/fee-records.yml)から
-- アプリロール(hoopo_app 系)で呼び出せるようにする。全チームの有効な部員(active・非アーカイブ)に
-- 当該年月の「未」レコードを冪等に作る(既存は触らない)。RLS を跨ぐため SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.generate_fee_records(p_year integer, p_month integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted integer;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month out of range: %', p_month;
  END IF;
  INSERT INTO fee_records (team_id, child_id, year, month)
  SELECT c.team_id, c.id, p_year, p_month
  FROM children c
  WHERE c.archived = false AND c.status = 'active'
  ON CONFLICT (child_id, year, month) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END
$$;--> statement-breakpoint

-- ジョブ用: Asia/Tokyo の今月分を生成する(引数なしで psql から呼べる)
CREATE OR REPLACE FUNCTION public.generate_current_fee_records()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.generate_fee_records(
    EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo'))::integer,
    EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo'))::integer
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.generate_fee_records(integer, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.generate_fee_records(integer, integer) TO hoopo_app;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.generate_current_fee_records() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.generate_current_fee_records() TO hoopo_app;
