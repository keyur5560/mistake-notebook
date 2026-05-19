-- Migration: track whether each logged question was answered correctly.
-- Run once in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
--
-- Legacy rows have NULL — they predate this column and are treated as
-- wrongs (since the notebook only logged mistakes before).

alter table mistakes
  add column if not exists was_correct boolean;
