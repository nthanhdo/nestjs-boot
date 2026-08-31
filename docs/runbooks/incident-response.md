# Incident Response Runbook — nestjs-boot

## Severity Classifications

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P1** | Service down, data loss risk, all users affected | Immediate (< 15 min) | DB connection pool exhausted, OOM crash loop, auth system down |
| **P2** | Degraded service, subset of users affected | < 30 min | Circuit breakers open, queue backing up, elevated error rate |
| **P3** | Non-critical degradation, workaround exists | < 2 hours | Health check flapping, cache miss spike, slow queries |
| **P4** | Minor issue, no user impact | Next business day | Log noise, non-critical metric drift |

---

## 1. Circuit Breaker Open

**Severity:** P2 (P1 if all breakers open on critical path)

### Symptoms
- Requests returning 503 with `CircuitBreakerOpenError`
- Metrics show `circuit_breaker_state{state="open"}` for one or more services

### Triage Steps

1. **Identify which breaker(s) are open:**
   ```bash
   # Check metrics endpoint
   curl -s localhost:3000/metrics | grep circuit_breaker_state
   ```

2. **Check the downstream dependency:**
   ```bash
   # If DB breaker — test connection
   mongosh "$WRITER_URI" --eval "db.runCommand({ping:1})"

   # If external API — test reachability
   curl -sI https://api.example.com/health
   ```

3. **Check error logs for root cause:**
   ```bash
   # Look for the failure pattern that tripped the breaker
   docker logs <container> --since 10m 2>&1 | grep -i "circuit\|timeout\|ECONNREFUSED"
   ```

4. **Wait for half-open probe or force-close:**
   - Circuit breakers auto-transition to half-open after the configured `resetTimeout` (default: 30s).
   - A single successful request in half-open state closes the breaker.
   - If the downstream is confirmed healthy but the breaker won't close, restart the service.

### Resolution
- Fix the downstream dependency first, then let the breaker self-heal.
- If the breaker threshold is too sensitive, adjust `CircuitBreakerOptions.failureThreshold` and `resetTimeout` in BootOptions.

---

## 2. Health Check Failing

**Severity:** P3 (P1 if orchestrator is restarting pods)

### Symptoms
- `GET /health` returning non-200
- Kubernetes/Docker restarting containers due to failed liveness/readiness probes

### Triage Steps

1. **Hit the health endpoint directly:**
   ```bash
   curl -s localhost:3000/health | jq .
   ```
   Response shows per-dependency status. Identify which check is `down`.

2. **Check each dependency:**

   | Dependency | Check Command |
   |------------|---------------|
   | MongoDB | `mongosh "$URI" --eval "db.runCommand({ping:1})"` |
   | Redis | `redis-cli -u "$REDIS_URL" ping` |
   | Memcached | `echo stats | nc localhost 11211` |
   | External API | `curl -sI <url>` |

3. **If health flaps (up/down/up):**
   - Check network stability, DNS resolution, connection pool exhaustion.
   - Increase `serverSelectionTimeoutMS` if MongoDB is slow to elect a primary.

### Resolution
- Fix the failing dependency.
- If a non-critical dependency is down and causing unnecessary restarts, mark it as a non-liveness indicator in `HealthOptions`.

---

## 3. Queue Backing Up

**Severity:** P2 (P1 if DLQ growing and orders/events being lost)

### Symptoms
- Queue depth growing on monitoring dashboard
- `queue_waiting_count` metric increasing
- Consumer lag visible in Redis/BullMQ dashboard

### Triage Steps

1. **Check Redis memory:**
   ```bash
   redis-cli -u "$REDIS_URL" INFO memory | grep used_memory_human
   redis-cli -u "$REDIS_URL" INFO memory | grep maxmemory
   ```
   If near maxmemory, Redis will reject writes and jobs will be lost.

2. **Check worker count and status:**
   ```bash
   # Check if worker processes are alive
   docker ps | grep worker
   # Check worker logs for errors
   docker logs <worker-container> --since 10m 2>&1 | tail -50
   ```

3. **Check Dead Letter Queue (DLQ):**
   ```bash
   # BullMQ — count failed jobs
   redis-cli -u "$REDIS_URL" LLEN "bull:<queue-name>:failed"
   ```

4. **Check job processing rate vs arrival rate:**
   ```bash
   curl -s localhost:3000/metrics | grep -E "queue_(completed|waiting|active)_count"
   ```

### Resolution
- **Redis full:** Increase `maxmemory` or add nodes. Purge completed jobs.
- **Workers crashed:** Restart worker processes. Check for unhandled exceptions.
- **DLQ growing:** Inspect failed jobs for common error pattern. Fix and replay.
- **Throughput insufficient:** Scale worker replicas horizontally.

---

## 4. Memory Leak

**Severity:** P2 (P1 if OOM kills are happening)

### Symptoms
- RSS growing linearly over time without plateau
- Node.js process OOM-killed by container runtime
- `process_resident_memory_bytes` metric trending upward

### Triage Steps

1. **Confirm the leak (not just cache growth):**
   ```bash
   # Watch RSS over 5 minutes
   curl -s localhost:3000/metrics | grep process_resident_memory_bytes
   # Repeat after 5 min — if growing without load increase, it's a leak
   ```

2. **Take a heap snapshot:**
   ```bash
   # Send SIGUSR2 if --heapsnapshot-signal is configured
   kill -USR2 <pid>
   # Or use inspector
   node --inspect=0.0.0.0:9229 dist/main.js
   # Then connect Chrome DevTools → Memory → Take heap snapshot
   ```

3. **Check InFlightTracker (shutdown module):**
   ```bash
   # If shutdown module is enabled, check if requests are leaking
   curl -s localhost:3000/metrics | grep in_flight
   ```
   If `in_flight_requests` grows but never decreases, requests are not completing (likely stuck on an unresolved promise or stream).

4. **Check LoginTracker (auth module):**
   - If auth is enabled, the `LoginTracker` stores per-IP attempt counts in memory.
   - Verify it has TTL-based eviction configured. If not, IP entries accumulate forever.

5. **Check event listeners:**
   ```bash
   # Look for MaxListenersExceeded warnings in logs
   docker logs <container> 2>&1 | grep MaxListeners
   ```

### Resolution
- Identify the retaining object in the heap snapshot (usually event emitters, unclosed streams, or growing Maps/Sets without eviction).
- Apply fix, deploy, monitor RSS for 1 hour to confirm plateau.

---

## 5. Auth Failures Spike

**Severity:** P2 (P1 if legitimate users locked out)

### Symptoms
- Spike in 401/403 responses
- Users reporting "access denied" or "account locked"
- `auth_failures_total` metric spiking

### Triage Steps

1. **Check if it's a brute-force lockout vs system issue:**
   ```bash
   # Check LoginTracker lockout state
   docker logs <container> --since 30m 2>&1 | grep -i "lockout\|locked\|rate.limit\|login.fail"
   ```

2. **Check JWT secret rotation:**
   ```bash
   # If JWT_SECRET was rotated, all existing tokens become invalid
   # Verify the secret matches what was used to sign active tokens
   echo $JWT_SECRET | head -c 10  # compare prefix with expected
   ```
   If the secret was rotated without a grace period, all users must re-authenticate.

3. **Check token expiry configuration:**
   ```bash
   # Decode a failing token (without verifying signature)
   echo "<token>" | cut -d. -f2 | base64 -d 2>/dev/null | jq .exp
   # Compare exp with current Unix time
   date +%s
   ```

4. **Check API key validity (if ApiKeyGuard is enabled):**
   - Verify the API key store is accessible.
   - Check if keys were rotated or revoked.

5. **Check inter-service auth (if microservices):**
   - Verify `InterServiceAuthOptions.secret` is consistent across all services.
   - Check clock skew between services (JWT `iat`/`exp` validation fails with skew > 30s).

### Resolution
- **Lockout:** Clear the LoginTracker state (restart service or wait for TTL expiry). Consider increasing `maxAttempts` or `lockoutDuration` if threshold is too aggressive.
- **Secret rotation:** Deploy the new secret to all services simultaneously. Consider implementing dual-secret verification for zero-downtime rotation.
- **Clock skew:** Sync NTP across all nodes. Add `clockTolerance` to JWT verification options.

---

## General Incident Template

```
## Incident Report

**Date:** YYYY-MM-DD HH:MM UTC
**Severity:** P1/P2/P3/P4
**Duration:** X minutes
**Affected services:** [list]

### Timeline
- HH:MM — Alert fired / issue detected
- HH:MM — Triage started
- HH:MM — Root cause identified
- HH:MM — Fix applied
- HH:MM — Service restored
- HH:MM — Monitoring confirmed stable

### Root Cause
[Description]

### Resolution
[What was done to fix it]

### Prevention
[What changes will prevent recurrence]
```
