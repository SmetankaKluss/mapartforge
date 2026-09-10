-- Business conflicts must not use serialization_failure: PostgREST can retry it forever.
-- Preserve deployed function bodies, permissions and all ownership/lease guards.
do $$
declare
  fn text;
  definition text;
begin
  foreach fn in array array[
    'companion_live_build_control',
    'companion_live_build_observations',
    'companion_live_build_batch',
    'companion_live_build_source',
    'companion_tracker_web_control'
  ] loop
    definition := pg_get_functiondef(to_regprocedure('public.' || fn || '(uuid,text,jsonb)'));
    if definition is null then raise exception 'Missing build function: %', fn; end if;
    if position('errcode=''40001''' in definition) = 0 then
      raise exception 'Expected conflict guards not found: %', fn;
    end if;
    execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
  end loop;
end $$;
