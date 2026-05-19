-- Migration: tag each mistake with its source (uworld | nbme | unknown).
-- Run once in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
--
-- "Sessions" are derived at query time as (source, created_at::date), so no
-- session_id column is needed yet.

alter table mistakes
  add column if not exists source text;
