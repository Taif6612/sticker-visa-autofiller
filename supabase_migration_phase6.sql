-- Phase 6 migration — adds the 18 demographic / travel columns the multi-page
-- form needs. Run once in Supabase Dashboard → SQL Editor → New Query → Run.
-- Mirrors the new keys in content.js (FIELD_MAP / RADIO_FIELD_MAP / CHECKBOX_FIELD_MAP)
-- and the shape of MOCK_CLIENTS in mock_clients.js.

-- 1) Add columns (idempotent — safe to re-run).
alter table public.clients
  add column if not exists gender               text,
  add column if not exists marital_status       text,
  add column if not exists address_line_1       text,
  add column if not exists city                 text,
  add column if not exists state                text,
  add column if not exists postal_code          text,
  add column if not exists country_of_residence text,
  add column if not exists occupation           text,
  add column if not exists visa_type            text,
  add column if not exists travel_date          date,
  add column if not exists length_of_stay       int,
  add column if not exists purpose_of_visit     text,
  add column if not exists hotel_name           text,
  add column if not exists hotel_address        text,
  add column if not exists sponsor_name         text,
  add column if not exists sponsor_email        text,
  add column if not exists emergency_contact    text,
  add column if not exists skills               text[];

-- 2) Backfill the four demo profiles (matched by passport_number).
update public.clients set
  gender='female', marital_status='single',
  address_line_1='House 12, Road 5, Dhanmondi', city='Dhaka', state='Dhaka',
  postal_code='1209', country_of_residence='Bangladesh', occupation='Software Engineer',
  visa_type='tourist', travel_date='2026-09-15', length_of_stay=14,
  purpose_of_visit='Tourism and sightseeing', hotel_name='Hotel Sarina',
  hotel_address='Plot 27, Banani, Dhaka', sponsor_name='Self',
  sponsor_email='ayesha.rahman@example.com', emergency_contact='Karim Rahman +8801711000001',
  skills=array['english','bangla']
where passport_number='BD1234567';

update public.clients set
  gender='male', marital_status='married',
  address_line_1='Flat 4B, House 30, Gulshan-2', city='Dhaka', state='Dhaka',
  postal_code='1212', country_of_residence='Bangladesh', occupation='Business Analyst',
  visa_type='business', travel_date='2026-10-02', length_of_stay=7,
  purpose_of_visit='Business conference', hotel_name='Pan Pacific Sonargaon',
  hotel_address='107 Kazi Nazrul Islam Ave, Dhaka', sponsor_name='Acme Corp Ltd',
  sponsor_email='hr@acmecorp.example.com', emergency_contact='Nadia Hossain +8801812000002',
  skills=array['english','bangla','hindi']
where passport_number='BD7654321';

update public.clients set
  gender='female', marital_status='single',
  address_line_1='House 9, Road 11, Uttara Sector 4', city='Dhaka', state='Dhaka',
  postal_code='1230', country_of_residence='Bangladesh', occupation='Student',
  visa_type='student', travel_date='2026-08-20', length_of_stay=180,
  purpose_of_visit='University enrollment', hotel_name='Campus Residence Hall',
  hotel_address='University Ave, Toronto', sponsor_name='Md Akter',
  sponsor_email='md.akter@example.com', emergency_contact='Md Akter +8801913000003',
  skills=array['english','bangla','french']
where passport_number='BD9988776';

update public.clients set
  gender='male', marital_status='married',
  address_line_1='House 21, Road 7, Banani', city='Dhaka', state='Dhaka',
  postal_code='1213', country_of_residence='Bangladesh', occupation='Civil Engineer',
  visa_type='work', travel_date='2026-11-10', length_of_stay=365,
  purpose_of_visit='Employment contract', hotel_name='Corporate Housing',
  hotel_address='Sheikh Zayed Rd, Dubai', sponsor_name='Gulf Construction LLC',
  sponsor_email='visa@gulfconstruction.example.com', emergency_contact='Sadia Chowdhury +8801611000004',
  skills=array['english','bangla','arabic']
where passport_number='BD5544332';

-- 3) Verify.
select passport_number, gender, visa_type, length_of_stay, skills from public.clients order by id;
