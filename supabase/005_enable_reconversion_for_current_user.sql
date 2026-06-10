-- Habilita la herramienta "Reconversion Archivo" para el usuario actual del portal.
-- Antes de correrlo:
-- 1. Reemplazar target_email y el email del SELECT final por el email del usuario actual.
-- 2. Asegurarse de que ese usuario ya exista en Supabase Auth / public.profiles.

do $$
declare
  target_email text := 'cliente.demo@technized.com';
  target_user_id uuid;
  target_client_id uuid;
  reconversion_app_id uuid;
begin
  select id
  into target_user_id
  from public.profiles
  where email = target_email
  limit 1;

  if target_user_id is null then
    raise exception 'No existe un profile para el email % . Primero crea el usuario en Supabase Auth.', target_email;
  end if;

  select c.id
  into target_client_id
  from public.clients c
  join public.client_memberships cm on cm.client_id = c.id
  where cm.user_id = target_user_id
    and cm.is_active = true
    and c.is_active = true
  order by c.created_at asc nulls last
  limit 1;

  if target_client_id is null then
    raise exception 'El usuario % no tiene un cliente activo asociado. Primero asigna la membresia del portal.', target_email;
  end if;

  insert into public.applications (
    name,
    slug,
    url,
    description,
    icon,
    category,
    area_tags,
    access_tier,
    availability_status,
    badge_label,
    sort_order,
    is_active
  )
  values (
    'Reconversion Archivo',
    'reconversion-archivo',
    '/clientes/aplicaciones/reconversion-archivo',
    'Reconversion y validacion de archivos Time Tracking para clientes.',
    'bolt',
    'Operacion',
    array['Time Tracking', 'Reconversion'],
    'included',
    'available',
    'Operativa',
    2,
    true
  )
  on conflict (slug) do update
  set name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      icon = excluded.icon,
      category = excluded.category,
      area_tags = excluded.area_tags,
      access_tier = excluded.access_tier,
      availability_status = excluded.availability_status,
      badge_label = excluded.badge_label,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active
  returning id into reconversion_app_id;

  if reconversion_app_id is null then
    select id
    into reconversion_app_id
    from public.applications
    where slug = 'reconversion-archivo'
    limit 1;
  end if;

  insert into public.client_application_access (client_id, application_id, is_enabled)
  values (target_client_id, reconversion_app_id, true)
  on conflict (client_id, application_id) do update
  set is_enabled = excluded.is_enabled;
end $$;

select
  p.email as user_email,
  c.name as client_name,
  a.name as application_name,
  a.slug,
  caa.is_enabled
from public.client_application_access caa
join public.clients c on c.id = caa.client_id
join public.applications a on a.id = caa.application_id
join public.client_memberships cm on cm.client_id = c.id
join public.profiles p on p.id = cm.user_id
where p.email = 'cliente.demo@technized.com'
  and a.slug = 'reconversion-archivo';
