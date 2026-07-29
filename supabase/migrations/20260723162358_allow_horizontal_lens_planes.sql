alter table public.companion_lens_placements
  drop constraint if exists companion_lens_placements_facing_check;

alter table public.companion_lens_placements
  add constraint companion_lens_placements_facing_check
  check (facing in ('north', 'south', 'east', 'west', 'up', 'down'))
  not valid;

alter table public.companion_lens_placements
  validate constraint companion_lens_placements_facing_check;
