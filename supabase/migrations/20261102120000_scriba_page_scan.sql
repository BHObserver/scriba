-- C2 (docs/PLAN_V3.md): the page finder. Additive only.
--
-- Since C2 the phone finds the page in the photo, squares it up and uploads that flattened
-- page as the document's photo (`storage_path`): it is what gets read, cropped and shown.
-- The camera's own photo is kept beside it as evidence and for re-cropping later. The phone
-- uploads it after the reading has started, so a document may have no camera photo for a
-- while (or ever, if the upload fails). Documents from before C2, and photos that needed no
-- crop, have none.
--
-- page_corners: the page's four corners in the camera photo as displayed (EXIF orientation
-- applied), as fractions of its width and height: [[x, y] top-left, top-right, bottom-right,
-- bottom-left]. corners_source says who placed them: the detector, the detector locked on a
-- Scriba khata's corner squares, or the shopkeeper by dragging.

alter table public.ledger_documents
  add column camera_path text unique,
  add column camera_sha256 text check (camera_sha256 ~ '^[0-9a-f]{64}$'),
  add column camera_width integer check (camera_width > 0),
  add column camera_height integer check (camera_height > 0),
  add column page_corners jsonb
    check (page_corners is null or (jsonb_typeof(page_corners) = 'array' and jsonb_array_length(page_corners) = 4)),
  add column corners_source text check (corners_source in ('detected', 'khata', 'adjusted')),
  add constraint ledger_documents_camera_in_owner_folder
    check (camera_path is null or split_part(camera_path, '/', 1) = owner_id::text),
  add constraint ledger_documents_camera_complete
    check ((camera_path is null) = (camera_sha256 is null)
      and (camera_path is null) = (camera_width is null)
      and (camera_path is null) = (camera_height is null)
      and (camera_path is null) = (page_corners is null)
      and (camera_path is null) = (corners_source is null));

-- Written only by the server (service role) after it has checked the stored bytes; the
-- existing grants give the owner select (and delete of the row) but no update of these columns.
