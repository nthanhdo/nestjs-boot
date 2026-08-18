# SE Mindset — File Structure Map

> Mỗi concept = 1 file HTML nhỏ (~300-500 lines). Load nhanh, focus 1 chủ đề.

## Phase 1: THINK

```
phase-1-think/
├── index.html                          ← overview Phase 1 + links
│
├── 01-computational-thinking/
│   ├── 01a-decomposition.html          ← Phân rã vấn đề (animated tree expand)
│   ├── 01b-abstraction.html            ← Trừu tượng hóa (before/after code, map vs reality)
│   ├── 01c-pattern-recognition.html    ← Nhận diện pattern (drag-drop matching, 3 problem sets)
│   ├── 01d-algorithmic-thinking.html   ← Input→Process→Output (3 bài step-by-step flowchart)
│   ├── 01e-edge-cases.html             ← Góc tối (interactive quiz: tìm edge case)
│   ├── 01f-tradeoff.html               ← Đánh đổi (comparison table, real scenarios)
│   └── 01g-debugging-mindset.html      ← Debug = khoa học (animated scenario walkthrough)
│
├── 02-programming-thinking/
│   ├── 02a-data-state.html             ← Biến & State (live state diagram, state changes over time)
│   ├── 02b-control-flow.html           ← Luồng điều khiển (animated if/else/loop flowchart chạy step-by-step)
│   ├── 02c-function-design.html        ← Hàm (black box, composition, pure vs impure animated)
│   ├── 02d-module-dependency.html      ← Module & Dependency (diagram coupling/cohesion, before/after refactor)
│   ├── 02e-interface-abstraction.html  ← Interface (outlet/plug analogy animated, contract concept)
│   └── 02f-side-effects.html           ← Side Effects & Immutability (pure vs impure function visual)
│
├── 03-clean-code/
│   ├── 03a-naming.html                 ← Đặt tên (10 before/after, interactive rename quiz)
│   ├── 03b-small-functions.html        ← Hàm nhỏ (animated: 100-line → 5 small functions)
│   ├── 03c-solid.html                  ← SOLID 5 principles (animated card, code ví dụ mỗi cái)
│   ├── 03d-dry-kiss-yagni.html         ← 3 nguyên tắc (code violations + fix, quiz)
│   ├── 03e-code-smells.html            ← Mùi code (8 snippets quiz: tìm smell + fix)
│   ├── 03f-refactoring.html            ← Refactoring step-by-step (animated code transformation)
│   └── 03g-technical-debt.html         ← Nợ kỹ thuật (interactive timeline, velocity graph)
│
├── 04-design-pattern/
│   ├── 04a-why-patterns.html           ← Tại sao cần pattern (Problem→Solution→Trade-off flow)
│   ├── 04b-factory.html                ← Factory (animated factory machine, 3 product types)
│   ├── 04c-singleton-builder.html      ← Singleton + Builder (diagram + code)
│   ├── 04d-adapter-decorator.html      ← Adapter + Decorator (power plug animation, gift wrapping)
│   ├── 04e-facade-proxy.html           ← Facade + Proxy (remote control → complex system)
│   ├── 04f-strategy.html               ← Strategy (live swap algorithm runtime, comparison)
│   ├── 04g-observer.html               ← Observer (pub/sub animated: newspaper subscription)
│   └── 04h-anti-patterns.html          ← Anti-patterns (when NOT to use patterns)
```

## Phase 2: BUILD

```
phase-2-build/
├── index.html
│
├── 05-design-system/
│   ├── 05a-tokens.html                 ← Design Tokens (live theme switcher)
│   ├── 05b-color-typography.html       ← Color System + Typography (interactive palette, scale)
│   ├── 05c-components.html             ← Atomic Design (atoms→molecules→organisms animated)
│   ├── 05d-states-responsive.html      ← Component States + Responsive (viewport resize)
│
├── 06-architecture/
│   ├── 06a-layered.html                ← Layered Architecture (click-to-reveal stack)
│   ├── 06b-clean-hex.html              ← Clean + Hexagonal (concentric circles animated)
│   ├── 06c-monolith-vs-micro.html      ← Monolith vs Microservices (comparison + decision tree)
│   ├── 06d-event-driven.html           ← Event-driven (pub/sub animated diagram)
│
├── 07-database/
│   ├── 07a-erd-modeling.html           ← ERD + Data Modeling (interactive builder)
│   ├── 07b-normalization.html          ← 1NF→2NF→3NF (table transformation animated)
│   ├── 07c-index-optimization.html     ← Index + Query Optimization (B-tree visual, EXPLAIN)
│   ├── 07d-acid-transactions.html      ← ACID + Transaction (money transfer animated scenario)
│   ├── 07e-n1-caching.html             ← N+1 Query + Caching (counter animation, before/after)
│
├── 08-api/
│   ├── 08a-http-rest.html              ← HTTP + REST basics (request/response flow animated)
│   ├── 08b-status-codes.html           ← Status Codes (interactive card grid, scenario quiz)
│   ├── 08c-auth-jwt.html               ← Authentication + JWT (flow diagram, decode demo)
│   ├── 08d-pagination-validation.html  ← Pagination + Validation + Versioning
```

## Phase 3: ENGINEER

```
phase-3-engineer/
├── index.html
│
├── 09-testing/
│   ├── 09a-why-test.html               ← Tại sao test (production crash story, cost-of-bugs chart)
│   ├── 09b-test-pyramid.html           ← Test Pyramid (animated pyramid, click each level)
│   ├── 09c-unit-test.html              ← Unit Test (AAA pattern, mock/stub/spy comparison)
│   ├── 09d-tdd.html                    ← TDD Red→Green→Refactor (cycle animated, live exercise)
│
├── 10-debugging/
│   ├── 10a-process.html                ← 8-step debugging process (animated flowchart)
│   ├── 10b-5-whys.html                 ← 5 Whys (interactive drill-down)
│   ├── 10c-tools.html                  ← Tools: console.log vs Debugger vs Network (comparison)
│   ├── 10d-stack-trace.html            ← Reading Stack Traces (annotated, click-to-explain)
│   ├── 10e-git-bisect.html             ← Git Bisect (binary search through commits animated)
│
├── 11-git/
│   ├── 11a-mental-model.html           ← Git 4 areas (WD→Staging→Local→Remote animated)
│   ├── 11b-branch-merge.html           ← Branch + Merge vs Rebase (animated diagram)
│   ├── 11c-pr-review.html              ← Pull Request + Code Review (checklist, feedback examples)
│   ├── 11d-versioning.html             ← Semantic Versioning + Changelog
│
├── 12-security/
│   ├── 12a-owasp-top10.html            ← OWASP Top 10 (interactive cards, NestJS examples)
│   ├── 12b-auth-jwt.html               ← Password hashing + JWT anatomy (decode demo)
│   ├── 12c-injection.html              ← SQL/NoSQL Injection (live attack demo)
│   ├── 12d-path-traversal.html         ← Path Traversal case study (nestjs-boot real bug)
│   ├── 12e-ctf.html                    ← CTF exercises (4 challenges)
│
├── 13-system-design/
│   ├── 13a-process.html                ← 10-step design process (stepper)
│   ├── 13b-url-shortener.html          ← URL Shortener walkthrough
│   ├── 13c-scaling.html                ← Vertical vs Horizontal + Load Balancer
│   ├── 13d-cache-queue.html            ← Caching + Message Queue (animated diagram)
│   ├── 13e-cap-circuit.html            ← CAP Theorem + Circuit Breaker
```

## Phase 4: PRODUCTION

```
phase-4-production/
├── index.html
│
├── 14-devops/
│   ├── 14a-docker.html                 ← Docker (container vs VM, Dockerfile, layer caching)
│   ├── 14b-compose.html                ← Docker Compose (multi-container diagram)
│   ├── 14c-cicd.html                   ← CI/CD pipeline (GitHub Actions animated flow)
│   ├── 14d-deploy.html                 ← Deploy strategies (rolling, blue-green, canary)
│
├── 15-ai-programming/
│   ├── 15a-augmented-engineer.html     ← AI = tool not replacement (capability matrix)
│   ├── 15b-prompting.html             ← Good vs bad prompts (side-by-side)
│   ├── 15c-verification.html          ← Verification loop + Hallucination (animated)
│   ├── 15d-security-risks.html        ← AI-generated security risks
```

## Phase 5: PROFESSIONAL

```
phase-5-professional/
├── index.html
│
├── 16-workflow/
│   ├── 16a-agile-scrum.html            ← Agile + Sprint cycle
│   ├── 16b-estimation.html             ← Task breakdown + T-shirt sizing
│   ├── 16c-rfc-adr.html                ← RFC + ADR (technical proposals)
│
├── 17-product/
│   ├── 17a-user-problem.html           ← User Problem vs Business Problem
│   ├── 17b-mvp.html                    ← MVP strip-down (animated)
│   ├── 17c-metrics.html                ← Product Metrics + Funnel
│
├── 18-documentation/
│   ├── 18a-readme-api.html             ← README + API Docs
│   ├── 18b-diagrams.html               ← C4 + Sequence + ERD
│   ├── 18c-adr-rfc.html                ← ADR + RFC templates
│
├── 19-capstone/
│   ├── 19a-requirements.html           ← Project requirements + checklist
│   ├── 19b-career.html                 ← CV + Interview + Open Source
│   └── 19c-graduation.html            ← Final transformation + learning path
```

## Tổng: ~85 sub-files HTML

| Phase | Topics | Sub-files |
|-------|--------|-----------|
| 1. Think | 4 | 27 |
| 2. Build | 4 | 17 |
| 3. Engineer | 5 | 22 |
| 4. Production | 2 | 8 |
| 5. Professional | 4 | 11 |
| **Total** | **19** | **~85** |

## Template cho mỗi sub-file

Mỗi file ~300-500 lines, structure:

```html
<!-- Nav: ← prev sub | Topic X.Y | next sub → -->
<!-- Title + concept name -->
<!-- WHY section: tại sao cần học concept này -->
<!-- WHAT section: concept là gì, animated diagram -->
<!-- HOW section: code examples, before/after -->
<!-- PRACTICE section: interactive exercise -->
<!-- QUIZ section: 2-3 câu kiểm tra hiểu biết -->
<!-- TAKEAWAY: key points -->
<!-- NEXT: link to next sub-file -->
```
