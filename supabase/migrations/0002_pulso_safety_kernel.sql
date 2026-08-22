create table if not exists pulso_routing_cases (
  case_id text primary key,
  accepted_destination text,
  accepted_at timestamptz,
  routing_state text not null default 'ready_for_matching',
  decision_evidence jsonb
);

create table if not exists pulso_routing_idempotency (
  request_key text primary key,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists pulso_routing_decision_audit (
  audit_id bigint generated always as identity primary key,
  case_id text not null references pulso_routing_cases(case_id),
  destination_code text not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'object'),
  check (coalesce(evidence->>'modelVersion', '') <> ''),
  check (coalesce(evidence->>'configVersion', '') <> '')
);

create or replace function pulso_reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'pulso routing decision audit is append-only';
end;
$$;

drop trigger if exists pulso_routing_audit_append_only on pulso_routing_decision_audit;
create trigger pulso_routing_audit_append_only
before update or delete on pulso_routing_decision_audit
for each row execute function pulso_reject_audit_mutation();

drop trigger if exists pulso_routing_audit_no_truncate on pulso_routing_decision_audit;
create trigger pulso_routing_audit_no_truncate
before truncate on pulso_routing_decision_audit
for each statement execute function pulso_reject_audit_mutation();
