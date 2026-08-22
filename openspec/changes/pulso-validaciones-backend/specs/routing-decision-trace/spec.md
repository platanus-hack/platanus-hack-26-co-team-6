# Routing Decision Trace Specification

### Requirement: Rank Destinations Deterministically

Matching MUST rank eligible destinations by minute-cost with stable tie-breaks. Identical inputs and configuration MUST produce the same order; unavailable primary estimates MUST record fallback provenance.

#### Scenario: Ranking is reproducible

- GIVEN the same destinations, minute-cost inputs, and configuration
- WHEN matching ranks the destinations twice
- THEN both orders are identical, including ties

#### Scenario: Primary estimate is unavailable

- GIVEN a destination lacks a primary estimate
- WHEN matching computes the ranking
- THEN the configured fallback is used
- AND provenance is returned

### Requirement: Persist Versioned Decision Evidence

Each ranking MUST persist model/configuration versions, inputs, candidates, selection, and fallback provenance in append-only evidence. Missing evidence or version metadata MUST prevent dispatch.

#### Scenario: Complete evidence permits dispatch

- GIVEN a ranking has versions, inputs, candidates, selection, and provenance
- WHEN the decision is committed
- THEN append-only evidence is stored
- AND dispatch may use the selected destination

#### Scenario: Incomplete evidence blocks dispatch

- GIVEN a ranking lacks version metadata or durable evidence
- WHEN the decision is committed
- THEN the service returns a PULSO-* error
- AND dispatch is not performed




