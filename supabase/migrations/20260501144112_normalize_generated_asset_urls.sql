-- Generated assets live in the private `project-assets` bucket.  Older asset
-- rows may carry storage paths in URL-like metadata fields, which prevents the
-- frontend from requesting signed URLs and leaves broken `generated/...` image
-- sources in the UI.  Normalize path prefixes and remove those relative
-- pseudo-URLs so hydration can sign them dynamically.

with normalized as (
  select
    id,
    case
      when storage_path like '/project-assets/%' then substring(storage_path from length('/project-assets/') + 1)
      when storage_path like 'project-assets/%' then substring(storage_path from length('project-assets/') + 1)
      when storage_path like '/generate/%' then 'generated/' || substring(storage_path from length('/generate/') + 1)
      when storage_path like 'generate/%' then 'generated/' || substring(storage_path from length('generate/') + 1)
      when storage_path like '/generated/%' then substring(storage_path from 2)
      else storage_path
    end as normalized_storage_path,
    metadata
  from public.project_assets
  where
    storage_path like '/project-assets/%'
    or storage_path like 'project-assets/%'
    or storage_path like '/generate/%'
    or storage_path like 'generate/%'
    or storage_path like '/generated/%'
    or metadata->>'sourceUrl' like 'generate/%'
    or metadata->>'sourceUrl' like 'generated/%'
    or metadata->>'sourceUrl' like '/generate/%'
    or metadata->>'sourceUrl' like '/generated/%'
    or metadata->>'sourceUrl' like 'project-assets/%'
    or metadata->>'sourceUrl' like '/project-assets/%'
    or metadata->>'previewUrl' like 'generate/%'
    or metadata->>'previewUrl' like 'generated/%'
    or metadata->>'previewUrl' like '/generate/%'
    or metadata->>'previewUrl' like '/generated/%'
    or metadata->>'previewUrl' like 'project-assets/%'
    or metadata->>'previewUrl' like '/project-assets/%'
    or metadata->>'storagePath' like 'generate/%'
    or metadata->>'storagePath' like '/generate/%'
    or metadata->>'storagePath' like '/generated/%'
    or metadata->>'storagePath' like 'project-assets/%'
    or metadata->>'storagePath' like '/project-assets/%'
),
cleaned as (
  select
    id,
    normalized_storage_path,
    case
      when metadata->>'sourceUrl' like 'generate/%'
        or metadata->>'sourceUrl' like 'generated/%'
        or metadata->>'sourceUrl' like '/generate/%'
        or metadata->>'sourceUrl' like '/generated/%'
        or metadata->>'sourceUrl' like 'project-assets/%'
        or metadata->>'sourceUrl' like '/project-assets/%'
      then metadata - 'sourceUrl'
      else metadata
    end as metadata_without_source
  from normalized
),
cleaned_preview as (
  select
    id,
    normalized_storage_path,
    case
      when metadata_without_source->>'previewUrl' like 'generate/%'
        or metadata_without_source->>'previewUrl' like 'generated/%'
        or metadata_without_source->>'previewUrl' like '/generate/%'
        or metadata_without_source->>'previewUrl' like '/generated/%'
        or metadata_without_source->>'previewUrl' like 'project-assets/%'
        or metadata_without_source->>'previewUrl' like '/project-assets/%'
      then metadata_without_source - 'previewUrl'
      else metadata_without_source
    end as cleaned_metadata
  from cleaned
)
update public.project_assets as asset
set
  storage_path = cleaned_preview.normalized_storage_path,
  metadata = jsonb_set(
    jsonb_set(
      coalesce(cleaned_preview.cleaned_metadata, '{}'::jsonb),
      '{storageBucket}',
      to_jsonb('project-assets'::text),
      true
    ),
    '{storagePath}',
    to_jsonb(cleaned_preview.normalized_storage_path),
    true
  )
from cleaned_preview
where asset.id = cleaned_preview.id;
