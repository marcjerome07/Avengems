# Product image uploads

Admins add, reorder and remove product photos in **Admin → Products → Add / Edit product → Images**.

## How it works

- `products.images` (existing `text[]` column) stores the ordered image list; the first entry is the cover.
  Uploaded images are stored as Storage object paths (`products/<productId>/<uuid>.<jpg|png|webp>`).
  Older `https://` URL entries keep working unchanged. No table or column was added.
- Public URLs are built in one place: `publicImageUrl()` in `server/src/productImages.js`
  (`<SUPABASE_URL>/storage/v1/object/public/product-images/<path>`). The storefront keeps
  receiving `images` as URLs, so `ProductMedia` and the product gallery are unchanged; products
  with no images still show the `GemVisual` illustration.
- Upload flow (no image bytes pass through Express):
  1. The browser checks type (by file signature), size (≤ 5 MB) and count (≤ 5), then
     downscales to ≤ 1600 px on the long edge (files already within limits are not re-encoded).
  2. `POST /api/admin/products/images/upload-url` (admin + CSRF, same middleware as every admin
     write) validates name/type/size/count and returns a `createSignedUploadUrl` URL for
     `products/tmp/<uuid>.<ext>` (Add) or `products/<id>/<uuid>.<ext>` (Edit).
  3. The browser `PUT`s the file to that signed URL (valid 2 hours, cannot overwrite).
  4. On **Add product**, the server re-downloads each upload, checks its magic bytes and size,
     moves `tmp` files under the new product id, then inserts the product. If the insert fails,
     the files are moved back.
  5. On **Save changes**, the request carries `images` plus `expectedImages` (the list the form
     was opened with), like `stock`/`expectedStock`. A stale list returns `409 IMAGES_CONFLICT`
     and the modal reloads. New uploads are verified, and files removed from the list are deleted
     from Storage only after the update succeeds.
- Closing or cancelling the modal calls `POST /api/admin/products/images/discard` for uploads
  made in that modal. The server never deletes a path still referenced by a product.
- Archiving does not touch images. There is no permanent product delete.
- Orders store no image snapshot (`order_items` has no image column) and no order screen shows
  product images, so image changes cannot affect order history.

## One-time Supabase setup

1. **Storage → New bucket**
   - Name: `product-images`
   - Public bucket: **on** (public read through public URLs)
   - Restrict file size: **on**, `5 MB`
   - Allowed MIME types: `image/jpeg, image/png, image/webp`

   SQL alternative (SQL Editor):

   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
   on conflict (id) do update set public = excluded.public,
     file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
   ```

2. **Policies: add none.** Leave `storage.objects` without INSERT, UPDATE, DELETE or SELECT
   policies for this bucket. Public URLs work without a SELECT policy, and adding one would let
   anyone list files. Express uses the secret key (bypasses RLS), and signed upload tokens
   authorize single uploads without a policy.

3. **Check that no broad policy grants writes** (for example "authenticated users can upload to any bucket"):

   ```sql
   select policyname, cmd, roles, qual, with_check
   from pg_policies where schemaname = 'storage' and tablename = 'objects';
   ```

   Any INSERT, UPDATE or DELETE policy for `anon`/`authenticated`/`public` that does not exclude
   `bucket_id = 'product-images'` must be narrowed or removed.

4. No new environment variables. The server uses the existing `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. Never put the secret key in a `VITE_*` variable.

## Maintenance

If a browser crashes mid-edit, unsaved uploads can remain in `products/tmp/` or under a product
folder. In **Storage → product-images**, files in `products/tmp/` older than a day are safe to
delete. Under `products/<id>/`, delete only files not listed in that product's `images`.
