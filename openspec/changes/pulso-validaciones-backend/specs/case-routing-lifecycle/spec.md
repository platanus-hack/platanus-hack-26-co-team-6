# Case Routing Lifecycle Specification

### Requirement: Enforce Legal Case and Handshake Transitions

The lifecycle MUST allow only declared transitions. An invalid transition MUST preserve state and return a structured PULSO-* rejection.

#### Scenario: Declared transition succeeds

- GIVEN a case and handshake have a declared next transition
- WHEN the authorized lifecycle action is submitted
- THEN both move to the declared next state
- AND resulting state is returned

#### Scenario: Illegal transition is rejected

- GIVEN a case or handshake is terminal or otherwise incompatible
- WHEN an undeclared transition is submitted
- THEN the service returns a structured PULSO-* rejection
- AND state is unchanged

### Requirement: Make Responses Idempotent and Single-Acceptance

Responses MUST be idempotent by request key and evidence. Retrying an accepted response MUST return its original result without duplicate effects; each case MUST accept at most one destination.

#### Scenario: Repeated confirmation is idempotent

- GIVEN a response with a request key and valid evidence was accepted
- WHEN the identical response is submitted again
- THEN the original result is returned
- AND no duplicate effect occurs

#### Scenario: Competing destinations cannot both win

- GIVEN concurrent responses claim one case for different destinations
- WHEN both attempts are processed
- THEN exactly one is accepted
- AND other is rejected




