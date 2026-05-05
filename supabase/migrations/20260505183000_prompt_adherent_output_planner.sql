alter type public.output_workflow_preset
  add value if not exists 'story_bible_from_world';

alter table public.output_requests
  drop constraint if exists output_requests_output_kind_check;

alter table public.output_requests
  add constraint output_requests_output_kind_check
  check (
    output_kind in (
      'concept_art_image',
      'poster_image',
      'story_bible_from_world',
      'world_reference_document',
      'lore_guide',
      'character_dossier_pack',
      'short_story',
      'narrative_chapter_or_ebook',
      'ebook_from_world',
      'comic_issue_from_sequence',
      'cinematic_episode',
      'cinematic_trailer',
      'ugc_episode',
      'unknown'
    )
  );
