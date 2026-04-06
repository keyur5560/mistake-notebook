-- Run this in your Supabase SQL Editor to enable multi-user support
-- This adds a user_id column and updates RLS policies

-- 1. Add user_id column to mistakes table
alter table mistakes add column if not exists user_id uuid references auth.users(id);

-- 2. Backfill existing rows (optional — assigns them to nobody, or you can set a specific user)
-- update mistakes set user_id = 'YOUR-USER-UUID-HERE' where user_id is null;

-- 3. Drop old permissive policy
drop policy if exists "Allow all access" on mistakes;

-- 4. Create user-scoped RLS policies
create policy "Users can view own mistakes"
  on mistakes for select
  using (auth.uid() = user_id);

create policy "Users can insert own mistakes"
  on mistakes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own mistakes"
  on mistakes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own mistakes"
  on mistakes for delete
  using (auth.uid() = user_id);

-- 5. Update storage policies for user-scoped uploads
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public reads" on storage.objects;
drop policy if exists "Allow public deletes" on storage.objects;

create policy "Authenticated users can upload" on storage.objects
  for insert with check (bucket_id = 'screenshots' and auth.role() = 'authenticated');

create policy "Anyone can view screenshots" on storage.objects
  for select using (bucket_id = 'screenshots');

create policy "Authenticated users can delete own uploads" on storage.objects
  for delete using (bucket_id = 'screenshots' and auth.role() = 'authenticated');
