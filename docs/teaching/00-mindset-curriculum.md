# Programming Mindset & Software Engineering Curriculum

> **Mục tiêu:** Trang bị cho sinh viên không chỉ khả năng "viết code", mà còn khả năng **tư duy, thiết kế, kiểm thử, debug, triển khai và làm việc như một Software Engineer** trước khi tốt nghiệp.

---

## 1. Computational Thinking — Tư duy giải quyết vấn đề

### Kiến thức

* Problem Decomposition — chia nhỏ vấn đề
* Abstraction — trừu tượng hóa
* Pattern Recognition — nhận diện quy luật
* Algorithmic Thinking
* Input → Process → Output
* Edge Cases
* Trade-off
* Thinking by Example
* Debugging Mindset

### Mục tiêu

Sinh viên có thể nhận một bài toán chưa rõ ràng và:

```text
Problem
   ↓
Understand
   ↓
Break Down
   ↓
Identify Constraints
   ↓
Design Solution
   ↓
Implement
   ↓
Verify
```

---

## 2. Programming Thinking — Tư duy lập trình

### Kiến thức

* Data & State
* Control Flow
* Function
* Module
* Dependency
* Interface
* Abstraction
* Composition
* Error Handling
* Side Effect
* Immutability
* State Management

### Câu hỏi cần hình thành

* Code này đang giải quyết vấn đề gì?
* Input/Output là gì?
* Component này chịu trách nhiệm gì?
* Nếu requirement thay đổi thì code sẽ bị ảnh hưởng ở đâu?
* Có cách nào đơn giản hơn không?

---

## 3. Data Structures & Algorithms

### Kiến thức

* Array
* Linked List
* Stack
* Queue
* Hash Map
* Tree
* Graph
* Heap
* Sorting
* Searching
* Recursion
* BFS / DFS
* Basic Dynamic Programming
* Big O

### Mục tiêu

Không học thuật toán chỉ để làm bài LeetCode.

Sinh viên cần hiểu:

```text
Problem
   ↓
Data Structure
   ↓
Algorithm
   ↓
Complexity
   ↓
Trade-off
```

---

## 4. Clean Code & Code Quality

### Kiến thức

* Meaningful Naming
* Small Functions
* Single Responsibility
* DRY
* KISS
* YAGNI
* SOLID
* Cohesion
* Coupling
* Code Smell
* Refactoring
* Technical Debt
* Readability
* Maintainability

### Bài tập

Cho sinh viên một đoạn code:

> "Code chạy đúng nhưng rất tệ."

Yêu cầu:

1. Identify Code Smells
2. Refactor
3. Explain why
4. Write tests
5. Compare before/after

---

## 5. Design System

### Kiến thức

* Design Tokens
* Color System
* Typography
* Spacing
* Grid
* Components
* Variants
* States
* Responsive Design
* Accessibility
* Component Composition
* UI Consistency

### Mục tiêu

Sinh viên hiểu:

> Design System không chỉ là "bộ UI đẹp", mà là một hệ thống giúp sản phẩm **consistent, scalable và maintainable**.

---

## 6. Design Pattern

### Kiến thức

#### Creational

* Factory
* Abstract Factory
* Builder
* Singleton

#### Structural

* Adapter
* Decorator
* Facade
* Proxy
* Composite

#### Behavioral

* Strategy
* Observer
* Command
* State
* Chain of Responsibility

### Quan trọng

Không học Pattern bằng cách học thuộc tên.

Cần học:

```text
Problem
   ↓
Why existing solution is insufficient?
   ↓
Pattern
   ↓
Trade-off
   ↓
Implementation
```

---

## 7. Software Architecture

### Kiến thức

* Layered Architecture
* Modular Architecture
* Monolith
* Modular Monolith
* Microservices
* Clean Architecture
* Hexagonal Architecture
* Event-driven Architecture
* Separation of Concerns
* Dependency Direction
* Coupling / Cohesion
* Scalability
* Reliability

### Mục tiêu

Sinh viên có thể trả lời:

> "Tại sao chọn architecture này?"

Thay vì:

> "Em dùng Clean Architecture vì mọi người đều dùng."

---

## 8. Database Thinking

### Kiến thức

* Relational Database
* Entity / Relationship
* Data Modeling
* Normalization
* Index
* Query Optimization
* Transaction
* ACID
* Isolation Level
* Lock
* Deadlock
* Pagination
* N+1 Query
* Caching
* SQL vs NoSQL

### Bài tập

Thiết kế database:

```text
Mini E-commerce
   ↓
Users
Products
Orders
Order Items
Payments
Inventory
Reviews
```

Sau đó scale:

```text
100 users
   ↓
10K users
   ↓
1M users
   ↓
10M users
```

Sinh viên phải giải thích architecture thay đổi như thế nào.

---

## 9. API & Backend Fundamentals

### Kiến thức

* HTTP
* REST
* Request / Response
* HTTP Methods
* HTTP Status Codes
* Headers
* Cookies
* Sessions
* JWT
* Pagination
* Filtering
* Sorting
* Validation
* Error Handling
* API Versioning
* Rate Limiting
* Idempotency

### Mục tiêu

Sinh viên hiểu API là một **contract giữa các hệ thống**, không chỉ là endpoint.

---

## 10. Testing

### Kiến thức

* Unit Test
* Integration Test
* E2E Test
* Test Pyramid
* Mock
* Stub
* Spy
* Test Case Design
* Boundary Testing
* Edge Cases
* Regression Testing
* TDD Basics

### Mindset

> "Code chạy được" ≠ "Code đúng."

Flow:

```text
Implement
   ↓
Test
   ↓
Find Failure
   ↓
Fix
   ↓
Regression Test
```

---

## 11. Debugging & Root Cause Analysis

### Kiến thức

* Reproduce Bug
* Logs
* Stack Trace
* Debugger
* Network Inspection
* Database Inspection
* Profiling
* Git Bisect
* Root Cause Analysis
* 5 Whys

### Debugging Process

```text
Bug
 ↓
Reproduce
 ↓
Collect Evidence
 ↓
Create Hypothesis
 ↓
Experiment
 ↓
Find Root Cause
 ↓
Fix
 ↓
Add Regression Test
```

### Bài tập

Không đưa cho sinh viên bug description đầy đủ.

Chỉ đưa:

> "Production đang lỗi."

Sinh viên phải tự tìm nguyên nhân.

---

## 12. Git & Software Development Workflow

### Kiến thức

* Git Fundamentals
* Branch
* Commit
* Merge
* Rebase
* Cherry-pick
* Conflict Resolution
* Pull Request
* Code Review
* Release
* Semantic Versioning
* Changelog

### Team Workflow

```text
Requirement
   ↓
Task
   ↓
Branch
   ↓
Code
   ↓
Test
   ↓
Pull Request
   ↓
Code Review
   ↓
Merge
   ↓
CI/CD
```

---

## 13. DevOps & Deployment Mindset

### Kiến thức

* Linux Basics
* Shell
* Environment Variables
* Docker
* Container
* Reverse Proxy
* DNS
* HTTP / HTTPS
* CI/CD
* Cloud Basics
* Logs
* Monitoring
* Health Check
* Deployment
* Rollback

### Project

Sinh viên phải tự đưa application lên production:

```text
GitHub
   ↓
CI
   ↓
Build
   ↓
Test
   ↓
Docker
   ↓
Deploy
   ↓
Monitor
```

---

## 14. Security Mindset

### Kiến thức

* Authentication
* Authorization
* RBAC
* Password Hashing
* JWT / Session
* SQL Injection
* XSS
* CSRF
* CORS
* Rate Limiting
* Input Validation
* Secrets Management
* OWASP Top 10

### Bài tập

Cho sinh viên tự tìm cách attack application của mình.

Flow:

```text
Build
 ↓
Attack
 ↓
Find Vulnerability
 ↓
Fix
 ↓
Test
```

---

## 15. System Design

### Level 1

* URL Shortener
* File Upload System
* Notification System

### Level 2

* Chat System
* Booking System
* Food Delivery

### Level 3

* E-commerce
* Social Network
* Video Platform
* Payment System

### Design Process

```text
Requirements
   ↓
Constraints
   ↓
API
   ↓
Data Model
   ↓
Architecture
   ↓
Scaling
   ↓
Caching
   ↓
Queue
   ↓
Failure Handling
   ↓
Monitoring
```

---

## 16. AI-assisted Programming

> AI không thay thế Software Engineer. AI làm tăng tốc độ của Engineer.

### Kiến thức

* AI Coding Assistant
* Prompting for Coding
* Code Generation
* Code Review with AI
* Debugging with AI
* Test Generation
* Refactoring with AI
* Documentation Generation
* Context Engineering
* AI Agents
* Hallucination
* AI-generated Security Risks
* Verification

### Nguyên tắc

```text
AI generates
     ↓
Developer reviews
     ↓
Developer verifies
     ↓
Developer tests
     ↓
Developer owns the result
```

### Không nên dạy

> "Dùng AI để code nhanh."

### Nên dạy

> "Dùng AI để tăng productivity nhưng vẫn chịu trách nhiệm về technical correctness."

---

## 17. Engineering Workflow

### Kiến thức

* Requirement Reading
* Task Breakdown
* Estimation
* Agile
* Scrum
* Kanban
* Code Review
* Technical Discussion
* Documentation
* RFC
* ADR
* Technical Decision
* Communication
* Feedback

### Một Engineer cần làm được

```text
Requirement
   ↓
Understand Problem
   ↓
Ask Questions
   ↓
Design Solution
   ↓
Estimate
   ↓
Implement
   ↓
Test
   ↓
Review
   ↓
Deploy
   ↓
Monitor
```

---

## 18. Product Thinking

### Kiến thức

* User Problem
* Business Problem
* Requirement
* MVP
* UX Basics
* Product Metrics
* Cost vs Value
* Trade-off
* Product Lifecycle
* Technical vs Business Decision

### Mindset

Không chỉ hỏi:

> "Em phải code feature này như thế nào?"

Mà phải hỏi:

> "Tại sao chúng ta cần feature này?"

và:

> "Problem thực sự đang cần giải quyết là gì?"

---

## 19. Documentation & Technical Communication

### Kiến thức

* README
* API Documentation
* Architecture Diagram
* Sequence Diagram
* ERD
* ADR
* RFC
* Technical Specification
* Troubleshooting Guide

### Mục tiêu

Một Engineer phải có khả năng:

> "Giải thích hệ thống cho một Engineer khác mà không cần ngồi cạnh nhau."

---

## 20. Final Project — Production-ready Application

Sinh viên không nên kết thúc khóa học bằng một project:

> "Todo App."

Nên làm một **mini production system**.

Ví dụ:

```text
E-commerce Platform
```

Bao gồm:

* Authentication
* User Management
* Product
* Cart
* Order
* Payment Mock
* Inventory
* Search
* Review
* Notification
* Admin
* API
* Database
* Testing
* Docker
* CI/CD
* Monitoring
* Security

### Engineering Requirements

Project phải có:

- [ ] Architecture Diagram
- [ ] Database ERD
- [ ] API Documentation
- [ ] Git Repository
- [ ] Pull Requests
- [ ] Code Review
- [ ] Unit Tests
- [ ] Integration Tests
- [ ] E2E Tests
- [ ] Docker
- [ ] CI/CD
- [ ] Production Deployment
- [ ] Logging
- [ ] Monitoring
- [ ] Security Review
- [ ] Technical Documentation

---

## 21. Competency Map

| Competency             | Sinh viên cần đạt                       |
| ---------------------- | --------------------------------------- |
| Computational Thinking | Phân tích và decomposition problem      |
| Programming Thinking   | Thiết kế solution trước khi code        |
| Algorithms             | Chọn data structure & algorithm phù hợp |
| Clean Code             | Viết code maintainable                  |
| Design System          | Xây UI/system nhất quán                 |
| Design Pattern         | Nhận diện recurring problems            |
| Architecture           | Thiết kế software system                |
| Database               | Thiết kế và tối ưu data                 |
| API                    | Xây communication contract              |
| Testing                | Chứng minh software hoạt động đúng      |
| Debugging              | Tìm root cause                          |
| Git                    | Làm việc theo team workflow             |
| DevOps                 | Deploy và vận hành software             |
| Security               | Nhận diện security risks                |
| System Design          | Thiết kế hệ thống có khả năng scale     |
| AI                     | Sử dụng AI có kiểm soát                 |
| Product                | Hiểu business/user problem              |
| Communication          | Làm việc với team                       |
| Documentation          | Truyền đạt technical knowledge          |

---

## 22. Core Mindset

### Sinh viên trước khi tốt nghiệp cần chuyển từ:

```text
"Em biết code."           →  "Em biết giải quyết vấn đề bằng software."
"Code chạy."              →  "Code đúng."
"Feature hoạt động."      →  "Feature maintainable."
"Em làm được."            →  "Em giải thích được tại sao em làm như vậy."
"AI viết code cho em."    →  "Em sử dụng AI để tăng tốc engineering nhưng vẫn kiểm soát kết quả."
```

---

## 23. Overall Learning Roadmap

```text
PHASE 1 — THINK
│
├── Computational Thinking
├── Programming Thinking
├── Algorithms
└── Problem Solving
        ↓
PHASE 2 — BUILD
│
├── Clean Code
├── Design System
├── Design Pattern
├── Database
└── API
        ↓
PHASE 3 — ENGINEER
│
├── Architecture
├── Testing
├── Debugging
├── Git
├── Security
└── System Design
        ↓
PHASE 4 — PRODUCTION
│
├── Docker
├── CI/CD
├── Cloud
├── Monitoring
└── Deployment
        ↓
PHASE 5 — PROFESSIONAL
│
├── Product Thinking
├── Engineering Workflow
├── Communication
├── Documentation
└── AI-assisted Engineering
        ↓
FINAL PROJECT
        ↓
Production-ready Engineer
```

---

## 24. Core Philosophy

> **Don't teach students how to use today's technology.**
>
> **Teach students how to think when tomorrow's technology changes.**

Framework có thể thay đổi. Language có thể thay đổi. Database có thể thay đổi. AI có thể thay đổi.

Nhưng:

```text
Problem Solving
+
System Thinking
+
Engineering Principles
+
Critical Thinking
+
Learning Ability
```

vẫn là nền tảng của một Software Engineer.
