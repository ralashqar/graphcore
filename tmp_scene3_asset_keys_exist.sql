select key, name, kind::text as kind, storage_path, created_at, left(metadata::text, 260) as metadata_head
from public.project_assets
where project_id = '4734a98a-2d77-40a6-bb25-178fdbbc0fca'
  and key in (
    'output.ritual_chamber_inner_ring_continuity_asset.ebb57999.continuity_asset_image',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_akane_opposite_position.sequence-animatic-continuity-asset',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_disc_cradle_over_basin.sequence-animatic-continuity-asset',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_door_watch_position.sequence-animatic-continuity-asset',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_kaji_close_in_position.sequence-animatic-continuity-asset',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_miyo_kneeling_position.sequence-animatic-continuity-asset',
    'output.akane_opposite_position_disc_cradle_above_basin_door_watch_posit.67c1f1e0.spot_rin_side_position.sequence-animatic-continuity-asset'
  )
order by created_at desc;
