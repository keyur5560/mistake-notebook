-- Run this in Supabase SQL Editor to add the title column
alter table mistakes add column if not exists title text default '';
