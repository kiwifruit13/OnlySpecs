export const summarizeSpecs = `

Please read the repository at this directory. It's a software project. Your role is to analyze the project and summarize the specifications of the project. The specifications should be in a markdown format.

The target of the specifications is to provide a VERY VERY detailed and informative description of the project, including its features, functionalities, and requirements. The specifications should be comprehensive and cover all aspects of the project, such as user interface, project management, and any other relevant components. 

You need to create a file called "output_specs.md" in the root directory of the project, and write the specifications in that file. 

User will use the specifications version v1 to understand the project and its requirements, modify the project, and do code implementation or code refactoring in version v2. So please follow the instructions below to write the specifications:

🧠 MASTER ARCHITECTURE ANALYSIS & DESIGN PROMPT

You are an expert systems architect, distributed systems engineer, and software design researcher.

Your task is to produce a complete, deeply reasoned, and formally structured architectural specification of a software system.

Your output must not be superficial. You must reason through the system layer by layer and explicitly describe boundaries, modules, communication flows, design rationale, trade-offs, and invariants.

Do not summarize. Do not generalize. Fully expand each section.

The final output must define the system so precisely that another engineering team could implement it without ambiguity.

1. SYSTEM BOUNDARY AND CONTEXT ANALYSIS

Begin by defining:

The system’s purpose and objectives.

The ecosystem in which it operates.

All external actors (users, systems, services).

All upstream and downstream dependencies.

What is explicitly inside the system boundary.

What is explicitly outside the system boundary.

Data that crosses the boundary and in which direction.

Trust boundaries and security boundaries.

Clarify ownership and responsibility at each boundary.

2. OVERALL ARCHITECTURE DESIGN

Describe the global architecture:

Architecture style (monolith, modular monolith, microservices, event-driven, hybrid).

Justification for the chosen style.

High-level structural diagram description (in text).

Runtime topology (nodes, services, containers).

Scalability model.

Fault tolerance strategy.

Deployment model.

Multi-region considerations if applicable.

Explain architectural trade-offs and alternatives considered.

3. COMPLETE MODULE BREAKDOWN

Identify ALL modules and subsystems. No implicit components.

For each module:

Name

Responsibility

Scope

What it owns (data, logic, state)

What it does NOT own

Public interface

Internal interface

Inputs

Outputs

Data transformations performed

State management approach

Persistence strategy

Error handling behavior

Concurrency model

Security model within the module

Performance constraints

Explain why this module exists and why it is separated.

If services are used, describe service boundaries explicitly.

4. INTER-MODULE RELATIONSHIPS AND COMMUNICATION

For every pair of interacting modules, describe:

Direction of communication

Protocol (HTTP, gRPC, message queue, shared DB, etc.)

Sync vs async

Data schema exchanged

Retry strategy

Timeout policy

Failure propagation behavior

Circuit breaking

Idempotency expectations

Transaction boundaries

Ordering guarantees

Consistency guarantees

Describe full communication flow for:

Normal execution path

Failure scenarios

Retry scenarios

Partial system outages

Explain why this communication model was chosen.

5. DOMAIN MODEL AND BEHAVIOR DESIGN

Define:

Core entities

Value objects

Aggregates

Relationships

Ownership rules

Invariants

State machines for key entities

Allowed and forbidden transitions

Business rules

Validation rules

Derived data rules

Side effects

Event triggers

Workflow orchestration logic

Describe how domain logic is protected from infrastructure leakage.

Explain consistency boundaries and transaction scoping.

6. DATA ARCHITECTURE

Describe:

Database technology and justification

Schema structure

Data partitioning strategy

Indexing strategy

Migration strategy

Backward compatibility rules

Data lifecycle management

Archival strategy

Data retention policies

Caching layers

Cache invalidation rules

Read/write separation if applicable

Explain data consistency model (strong, eventual, hybrid).

7. API AND CONTRACT DESIGN

Fully define:

Public API structure

Endpoint grouping

Request/response schemas

Error model

Versioning policy

Deprecation policy

Authentication and authorization integration

Rate limiting strategy

If internal APIs exist, describe those separately.

If events are published or consumed, describe:

Topic naming strategy

Event schema

Schema evolution rules

Consumer isolation guarantees

8. SECURITY ARCHITECTURE

Define:

Authentication mechanism

Token structure

Session model

Authorization model

Role hierarchy

Permission granularity

Multi-tenant isolation

Encryption in transit

Encryption at rest

Key management

Audit logging model

Threat model analysis

Describe attack surface and mitigation strategies.

9. NON-FUNCTIONAL DESIGN

Detail:

Performance targets

Scalability strategy

Load handling behavior

Backpressure strategy

Resilience mechanisms

Availability targets

Observability architecture

Logging format

Metrics model

Tracing model

Alerting model

Explain bottlenecks and scaling limits.

10. CONFIGURATION AND ENVIRONMENT DESIGN

Describe:

Environment separation

Configuration injection model

Feature flag architecture

Rollout strategy

CI/CD pipeline structure

Infrastructure as Code model

Blue/green or canary deployment strategy

11. DEPENDENCY GRAPH AND TECHNOLOGY STACK

Explicitly describe:

Programming language(s)

Framework(s)

Library dependencies

External services

Version constraints

Upgrade strategy

Breaking change policy

Map internal dependency graph and layering rules.

12. FAILURE ANALYSIS

For each critical component:

Single point of failure analysis

Failure cascade analysis

Partial degradation mode

Disaster recovery plan

Backup and restore model

Explain recovery time objectives and recovery point objectives.

13. VERSIONING AND EVOLUTION STRATEGY

Describe:

Semantic versioning policy

API evolution strategy

Database migration governance

Backward compatibility validation method

Contract testing model

Deprecation timelines

Explain how compatibility is enforced.

14. FORMAL CONSISTENCY AND INVARIANTS

Explicitly list:

System-wide invariants

Data invariants

Transaction invariants

Security invariants

Operational invariants

Explain how each invariant is enforced and verified.

OUTPUT REQUIREMENTS

Use structured sections with clear headings.

No bullet-point-only answers — explain reasoning.

Explicitly justify design decisions.

Explicitly describe communication paths.

Explicitly describe module boundaries.

Include failure reasoning.

Include scaling reasoning.

Include security reasoning.

Include evolution reasoning.

Your output must be architecturally complete and internally consistent.

`;