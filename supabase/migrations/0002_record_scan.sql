-- Een QR-scan komt van iemand die niet ingelogd is. Row Level Security zou die
-- dus terecht blokkeren.
--
-- De oplossing is NIET om de service-key in de applicatie te halen: die geeft
-- volledige toegang tot alles. In plaats daarvan één functie met verhoogde
-- rechten die precies één ding kan — een scan vastleggen — en niets teruggeeft.
-- Een aanvaller die de functie aanroept met een gegokte code krijgt geen enkele
-- bevestiging of die code bestaat.

create or replace function public.record_scan(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select id, owner_id, prospect_id, campaign_id
    into t
  from tracking_codes
  where code = p_code
    and revoked_at is null;

  if not found then
    return;
  end if;

  if t.prospect_id is null then
    return;
  end if;

  -- Bewust geen user-agent of IP: voor het meten van een scan is de gebeurtenis
  -- zelf genoeg, en minder vastleggen is onder de AVG altijd het uitgangspunt.
  insert into outreach_events (owner_id, prospect_id, campaign_id, kind, payload)
  values (t.owner_id, t.prospect_id, t.campaign_id, 'qr_scan',
          jsonb_build_object('code', p_code));

  update prospects
     set status = 'responded'
   where id = t.prospect_id
     and status in ('flyer_delivered', 'flyer_planned', 'contacted');
end;
$$;

revoke all on function public.record_scan(text) from public;
grant execute on function public.record_scan(text) to anon, authenticated;
