-- Meals table
create table meals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  name text not null,
  tags jsonb default '[]',
  time timestamptz not null,
  notes text default '',
  created_at timestamptz default now()
);

-- Symptoms table
create table symptoms (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  symptom_type text not null,
  severity integer not null check (severity between 1 and 10),
  time timestamptz not null,
  notes text default '',
  created_at timestamptz default now()
);

-- Bowel movements table
create table bowel_movements (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null default auth.uid(),
  bristol_type integer not null check (bristol_type between 1 and 7),
  urgency text default 'none',
  time timestamptz not null,
  notes text default '',
  created_at timestamptz default now()
);

-- Enable Row Level Security on all tables
alter table meals enable row level security;
alter table symptoms enable row level security;
alter table bowel_movements enable row level security;

-- Policies: users can only access their own data
create policy "Users can view own meals" on meals for select using (auth.uid() = user_id);
create policy "Users can insert own meals" on meals for insert with check (auth.uid() = user_id);
create policy "Users can delete own meals" on meals for delete using (auth.uid() = user_id);

create policy "Users can view own symptoms" on symptoms for select using (auth.uid() = user_id);
create policy "Users can insert own symptoms" on symptoms for insert with check (auth.uid() = user_id);
create policy "Users can delete own symptoms" on symptoms for delete using (auth.uid() = user_id);

create policy "Users can view own bowel_movements" on bowel_movements for select using (auth.uid() = user_id);
create policy "Users can insert own bowel_movements" on bowel_movements for insert with check (auth.uid() = user_id);
create policy "Users can delete own bowel_movements" on bowel_movements for delete using (auth.uid() = user_id);
