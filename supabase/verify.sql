-- Controleert of de migratie geslaagd is.
-- Plak dit in de Supabase SQL Editor en druk op Run.
--
-- Verwacht: 10 rijen, kolom rls_aan overal true, en policies overal minstens 1.
-- Staat rls_aan ergens op false, dan geeft je publieke sleutel iedereen die je
-- paginabron opent toegang tot die tabel. Draai de migratie dan opnieuw.

select
  c.relname                    as tabel,
  c.relrowsecurity             as rls_aan,
  count(distinct p.policyname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
