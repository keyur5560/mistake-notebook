-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- 1. Create the mistakes table
create table mistakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  image_url text default '',
  extracted_text text default '',
  subject text not null,
  organ_system text not null,
  mistake_type text not null,
  question_stem text default '',
  wrong_answer text default '',
  correct_answer text default '',
  why_i_got_it_wrong text default '',
  key_learning_point text default '',
  mnemonic_or_tip text default '',
  topics_to_review jsonb default '[]'::jsonb,
  high_yield_facts jsonb default '[]'::jsonb,
  review_count int default 0 not null,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  confidence int default 1 not null
);

-- 2. Enable Row Level Security (optional — off for now for simplicity)
alter table mistakes enable row level security;

-- 3. Allow all operations for anonymous users (single-user app)
create policy "Allow all access" on mistakes
  for all
  using (true)
  with check (true);

-- 4. Create the storage bucket for screenshots
-- Go to Dashboard > Storage > New Bucket
-- Name: "screenshots"
-- Public: ON (so images can be displayed without auth)
--
-- Then add this storage policy in SQL:
insert into storage.buckets (id, name, public) values ('screenshots', 'screenshots', true)
  on conflict (id) do nothing;

create policy "Allow public uploads" on storage.objects
  for insert with check (bucket_id = 'screenshots');

create policy "Allow public reads" on storage.objects
  for select using (bucket_id = 'screenshots');

create policy "Allow public deletes" on storage.objects
  for delete using (bucket_id = 'screenshots');
