# Clinical Routing Validation Specification

### Requirement: Validate Triage and Gate Matching

The service MUST validate payloads against the shared contract and return a PULSO-* envelope for invalid input. Clinical policy MUST classify coherent, confident triage as ready_for_matching; low-confidence or inconsistent triage MUST be requires_human_review and MUST NOT enter matching.

#### Scenario: Valid triage reaches matching

- GIVEN a contract-valid, coherent payload meets the confidence threshold
- WHEN clinical validation evaluates it
- THEN the result is ready_for_matching and matching may consume it

#### Scenario: Unsafe triage is held for review

- GIVEN a payload is malformed, low-confidence, or inconsistent
- WHEN validation and clinical policy evaluate it
- THEN the service returns a PULSO-* error or requires_human_review
- AND matching is not invoked

### Requirement: Enforce Eligibility and CRUE Escalation

The service MUST evaluate hard eligibility rules and emit failure reasons. If no destination satisfies all rules, it MUST set escalated_to_crue and MUST NOT dispatch.

#### Scenario: Eligible destination survives

- GIVEN validated triage and destinations satisfying hard rules
- WHEN eligibility evaluates the case
- THEN eligible destinations and no failure reason are returned
- AND case remains eligible for ranking

#### Scenario: No destination is eligible

- GIVEN every destination fails at least one hard rule
- WHEN eligibility evaluates the case
- THEN all failure reason codes are returned
- AND the case is escalated_to_crue without dispatch




