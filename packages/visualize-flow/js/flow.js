/* ============================================
   nestjs-boot Visualize Flow — All Flows Engine
   ============================================ */

(function () {
  'use strict';

  let activeTab = 'boot';
  let animSpeed = 1;

  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  // ══════════════════════════════════════════
  // Flow Rendering Engine (responsive, flexbox)
  // ══════════════════════════════════════════

  /**
   * Render a horizontal flow inside a canvas element.
   * nodes: Array of { id, icon, label, cat, timing?, classes? }
   * arrows between consecutive nodes are auto-generated.
   * Options:
   *   branches: Array of { afterId, paths: [{ label, nodes, arrowClass }] }
   *   rejoinId: node id where branches rejoin
   */
  function renderFlow(canvasId, nodes, options = {}) {
    const canvas = $(`#${canvasId}`);
    if (!canvas) return;
    canvas.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'flow-row';

    nodes.forEach((n, i) => {
      // Insert arrow before node (except first)
      if (i > 0) {
        const arrow = document.createElement('span');
        arrow.className = `flow-arrow ${n.arrowClass || ''}`;
        arrow.textContent = '\u2192';
        row.appendChild(arrow);
      }

      // Check if there's a branch point after this node
      const branch = options.branches?.find(b => b.afterId === n.id);

      const el = createNodeEl(n);
      row.appendChild(el);

      if (branch) {
        const branchContainer = document.createElement('div');
        branchContainer.className = 'flow-branch';
        branchContainer.style.marginLeft = '4px';

        branch.paths.forEach(path => {
          const pathRow = document.createElement('div');
          pathRow.className = 'flow-row';
          pathRow.style.fontSize = '.7rem';

          if (path.label) {
            const lbl = document.createElement('span');
            lbl.className = `branch-label ${path.labelClass || ''}`;
            lbl.textContent = path.label;
            pathRow.appendChild(lbl);
          }

          path.nodes.forEach((pn, pi) => {
            if (pi > 0 || path.label) {
              const a = document.createElement('span');
              a.className = `flow-arrow ${path.arrowClass || 'branch-arrow'}`;
              a.textContent = '\u2192';
              pathRow.appendChild(a);
            }
            pathRow.appendChild(createNodeEl(pn));
          });

          branchContainer.appendChild(pathRow);
        });

        // Arrow into branch
        const ba = document.createElement('span');
        ba.className = 'flow-arrow branch-arrow';
        ba.textContent = '\u2192';
        row.appendChild(ba);
        row.appendChild(branchContainer);

        // If rejoin, add rejoin nodes
        if (options.rejoinAfterBranch && branch === options.branches[options.branches.length - 1]) {
          options.rejoinAfterBranch.forEach(rn => {
            const ra = document.createElement('span');
            ra.className = 'flow-arrow';
            ra.textContent = '\u2192';
            row.appendChild(ra);
            row.appendChild(createNodeEl(rn));
          });
        }
      }
    });

    canvas.appendChild(row);

    // Additional rows (for multi-row flows)
    if (options.extraRows) {
      options.extraRows.forEach(er => {
        const extraRow = document.createElement('div');
        extraRow.className = 'flow-row';
        extraRow.style.paddingLeft = er.indent ? `${er.indent}px` : '0';
        if (er.prefix) {
          const pfx = document.createElement('span');
          pfx.className = `branch-label ${er.prefixClass || ''}`;
          pfx.textContent = er.prefix;
          extraRow.appendChild(pfx);
        }
        er.nodes.forEach((n, i) => {
          if (i > 0 || er.prefix) {
            const a = document.createElement('span');
            a.className = `flow-arrow ${er.arrowClass || ''}`;
            a.textContent = '\u2192';
            extraRow.appendChild(a);
          }
          extraRow.appendChild(createNodeEl(n));
        });
        canvas.appendChild(extraRow);
      });
    }
  }

  let _nodeAutoId = 0;
  function createNodeEl(n) {
    if (!n.id) n.id = `auto-${_nodeAutoId++}`;
    const el = document.createElement('div');
    el.className = `flow-node ${n.classes || ''}`;
    if (n.cat) el.dataset.cat = n.cat;
    el.dataset.id = n.id;
    el.innerHTML =
      (n.icon ? `<span class="node-icon">${n.icon}</span>` : '') +
      `<span class="node-label">${n.label}</span>` +
      (n.timing ? `<span class="node-timing">${n.timing}</span>` : '');
    if (n.detail) {
      el.addEventListener('click', () => openDetail(n.detail));
    }
    return el;
  }

  // Shorthand node constructors
  const N = (label, cat, icon, extra) => ({ label, cat, icon, ...extra });

  // ══════════════════════════════════════════
  // Detail Panel
  // ══════════════════════════════════════════
  const detailData = {
    'env-load':     { title: '.env Load', desc: 'Reads .env files using dotenv. Supports .env, .env.local, .env.{NODE_ENV}.', code: 'BOOT_ENV=production\nNODE_ENV=production\n# Loads: .env → .env.production → .env.local' },
    'joi-validate': { title: 'Joi Validation', desc: 'Validates ALL environment variables at startup. Fail fast, not at runtime.', code: 'validationSchema: Joi.object({\n  DATABASE_URL: Joi.string().required(),\n  PORT: Joi.number().default(3000),\n})' },
    'otel-init':    { title: 'OpenTelemetry Init', desc: 'Initializes tracing SDK before NestJS boots so spans are collected from first request.', code: 'initTracing({\n  serviceName: "order-service",\n  exporter: "otlp",\n  endpoint: "http://jaeger:4318",\n})' },
    'boot-module':  { title: 'Build BootModule', desc: 'Composes all feature modules based on config. Omitted config = module excluded.', code: 'BootModule.register({\n  database: true,\n  cache: true,\n  auth: true,\n})' },
    'nest-create':  { title: 'NestFactory.create()', desc: 'Creates NestJS app with composed BootModule + DI error enrichment.', code: 'const app = await NestFactory.create(\n  BootModule,\n  { logger: bootLogger }\n);' },
    'apply-globals':{ title: 'Apply Globals', desc: 'Global pipes, filters, interceptors, and guards.', code: 'app.useGlobalPipes(new ValidationPipe());\napp.useGlobalFilters(new AllExceptionsFilter());\napp.useGlobalInterceptors(new TimeoutInterceptor());' },
    'connect-transport': { title: 'Connect Transports', desc: 'gRPC, Redis, NATS microservice transports.', code: 'app.connectMicroservice({\n  transport: Transport.GRPC,\n  options: { url: "0.0.0.0:5000" },\n});' },
    'jwt-login':    { title: 'JWT Login', desc: 'Validates credentials, signs access + refresh tokens.', code: 'const { access, refresh } = await authService.login({\n  email, password\n});\n// access: 15m, refresh: 7d' },
    'jwt-refresh':  { title: 'JWT Refresh', desc: 'Verifies refresh token, rotates, returns new pair.', code: 'const tokens = await authService.refresh(refreshToken);\n// Old refresh token is revoked' },
    'revocation':   { title: 'Token Revocation', desc: 'Guard checks isRevoked callback before accepting token.', code: 'jwt: {\n  secret: "...",\n  isRevoked: async (token) => {\n    return await redis.exists(`revoked:${token.jti}`);\n  }\n}' },
    'oauth2':       { title: 'OAuth2/Social Login', desc: 'Google/GitHub strategy redirects, callback extracts profile.', code: '@UseGuards(AuthGuard("google"))\n@Get("auth/google/callback")\nasync googleCallback(@Req() req) {\n  return req.user; // SocialProfile\n}' },
    'apikey':       { title: 'API Key Validation', desc: 'Extracts key from header, validates via callback.', code: 'apiKey: {\n  enabled: true,\n  header: "X-API-Key",\n  validate: async (key) => isValid(key)\n}' },
    'rbac':         { title: 'RBAC Check', desc: 'Extracts user roles, compares with @Roles() decorator.', code: '@Roles("admin", "manager")\n@UseGuards(RbacGuard)\n@Get("orders")\nasync findAll() { ... }' },
    'session':      { title: 'Session Auth', desc: 'Cookie → session store lookup → validate.', code: '@UseGuards(SessionGuard)\n@Get("profile")\nasync getProfile(@Session() session) {\n  return session.user;\n}' },
    'totp':         { title: 'TOTP 2FA', desc: 'After password login, require TOTP code verification.', code: 'const secret = totpService.generateSecret();\nconst valid = totpService.verify(token, secret);\n// valid → issue JWT' },
    'rw-split':     { title: 'Reader/Writer Split', desc: 'Read queries route to replica, writes to primary.', code: 'connections: {\n  master: {\n    writerUri: "mongodb://primary:27017",\n    readerUri: "mongodb://replica:27017"\n  }\n}' },
    'cached-repo':  { title: 'CachedRepository', desc: 'L1 (memory) → L2 (Redis) → DB → write-back to cache.', code: '@Injectable()\nexport class ProductRepo extends CachedBaseRepository<Product> {\n  // findById checks L1 → L2 → DB automatically\n}' },
    'uow':          { title: 'Unit of Work', desc: 'Start transaction, run operations, commit or rollback.', code: 'await unitOfWork.run(async (session) => {\n  await orderRepo.save(order, { session });\n  await inventoryRepo.decrement(sku, { session });\n});' },
    'stampede':     { title: 'Cache Stampede Prevention', desc: 'Lock prevents multiple concurrent DB calls for same key.', code: 'cache.getOrSet("product:123", async () => {\n  return db.findById("123");\n}, { lock: true, ttl: 300 });' },
    'grpc-lifecycle': { title: 'gRPC Call', desc: 'ServiceClient auto-injects correlation + auth into gRPC metadata.', code: 'const product = await this.productClient.findOne({\n  id: "prod_123"\n});\n// Correlation ID + JWT auto-injected' },
    'resilient':    { title: 'ResilientClient', desc: 'Wraps calls with timeout → retry → circuit breaker.', code: 'const client = createResilientClient(productClient, {\n  timeout: 5000,\n  retry: { attempts: 3, backoff: "exponential" },\n  circuitBreaker: { failureThreshold: 5 },\n});' },
    'inter-auth':   { title: 'Inter-Service Auth', desc: 'Auth context flows via AsyncLocalStorage across services.', code: 'interServiceAuth: {\n  propagation: true,\n  serviceToken: "internal-secret"\n}' },
    'event-bus':    { title: 'EventBus', desc: 'In-memory or Redis pub/sub. Fire-and-forget or request/response.', code: 'this.eventBus.emit(\n  new OrderCreatedEvent({ orderId, total })\n);\n// All @OnEvent("order.created") handlers fire' },
    'emit-wait':    { title: 'emitAndWait', desc: 'Query pattern: emit event, wait for single handler response.', code: 'const result = await this.eventBus.emitAndWait(\n  new GetInventoryQuery({ sku: "ABC" })\n);\n// Returns handler result' },
    'cqrs':         { title: 'CQRS Cycle', desc: 'Command → Bus → Handler → Aggregate → EventStore.', code: 'await this.commandBus.execute(\n  new CreateOrderCommand({ userId, items })\n);\n// Handler loads aggregate, applies events' },
    'outbox':       { title: 'Outbox Pattern', desc: 'Events persisted in same transaction, polled and published.', code: 'await session.withTransaction(async () => {\n  await this.repo.save(order);\n  await this.outbox.insert(events);\n});\n// Poller publishes pending events' },
    'saga':         { title: 'Saga Orchestration', desc: 'Multi-step process with compensation on failure.', code: 'saga.step("reserve", reserveInventory, cancelReservation)\n  .step("charge", chargePayment, refundPayment)\n  .step("ship", createShipment, cancelShipment)\n  .execute();' },
    'correlation':  { title: 'Correlation ID', desc: 'UUID propagated via AsyncLocalStorage across all calls.', code: 'const id = req.headers["x-correlation-id"] ?? uuid();\nCorrelationService.set(id);\n// Available everywhere via getCorrelationId()' },
    'tracing':      { title: 'Tracing', desc: 'OpenTelemetry spans auto-created via @BootTrace decorator.', code: '@BootTrace("findProduct")\nasync findOne(id: string) {\n  // Span auto-created with timing + attributes\n}' },
    'metrics':      { title: 'Metrics', desc: 'Prometheus counters + histograms exposed at /metrics.', code: 'metrics: {\n  enabled: true,\n  path: "/metrics",\n  prefix: "myapp_"\n}\n// http_request_duration_seconds, etc.' },
    'logging':      { title: 'Structured Logging', desc: 'Pino JSON logs with correlation, trace, and redaction.', code: 'logging: {\n  level: "info",\n  pretty: true,\n  redact: ["req.headers.authorization"]\n}' },
    'error-report': { title: 'Error Reporting', desc: 'ErrorReporter hooks into Sentry/Datadog for exceptions.', code: 'monitoring: {\n  errorReporter: (error, context) => {\n    Sentry.captureException(error, { extra: context });\n  }\n}' },
    'tenant':       { title: 'Tenant Resolution', desc: 'Extract tenant from header, subdomain, or path segment.', code: '// X-Tenant-Id header → AsyncLocalStorage\n// OR subdomain: acme.app.com → "acme"\n// OR path: /api/acme/... → "acme"' },
    'file-upload':  { title: 'File Upload', desc: 'Validate → generate key → adapter.save → metadata.', code: 'const result = await fileService.upload(file, {\n  maxSize: "10MB",\n  allowedTypes: ["image/*"],\n  adapter: "s3", // or "local", "gcs"\n});' },
    'webhook':      { title: 'Webhook Verification', desc: 'HMAC signature verify → normalize → deduplicate → handle.', code: 'const valid = webhookService.verify(\n  payload,\n  signature,\n  secret\n);\n// Checks idempotency key for dedup' },
    'shutdown':     { title: 'Graceful Shutdown', desc: 'SIGTERM → drain → close connections → exit.', code: 'shutdown: {\n  timeout: 10000,\n  signals: ["SIGTERM", "SIGINT"]\n}\n// Health returns 503 during drain' },
    'circular-dep': { title: 'Circular Dep Detection', desc: 'parseDiError turns cryptic errors into fix suggestions.', code: '// Boot error:\n// "Circular dependency: A → B → C → A"\n// Fix: Use forwardRef() or extract shared interface' },
    'contract':     { title: 'Contract Injection', desc: 'Interface-based DI with createContract<T>().', code: 'const PAYMENT = createContract<PaymentService>();\n\n// Provider:\nprovideContract(PAYMENT, StripePaymentService)\n\n// Consumer:\n@Inject(PAYMENT) private payment: PaymentService' },
    'module-graph': { title: 'Module Graph', desc: 'Tarjan SCC algorithm detects circular dependencies.', code: 'const graph = analyzeModules(AppModule);\nconst cycles = detectCycles(graph);\nconsole.log(renderMermaid(graph));' },
    'layer-valid':  { title: 'Layer Validation', desc: '@Layer decorator prevents upward dependencies.', code: '@Layer(ModuleLayer.INFRASTRUCTURE)\nexport class DatabaseModule {}\n\n@Layer(ModuleLayer.APPLICATION)\nexport class OrderModule {}\n// Infra importing Application → ERROR' },
  };

  function openDetail(key) {
    const d = detailData[key];
    if (!d) return;
    const panel = $('.detail-panel');
    const overlay = $('.detail-overlay');
    panel.querySelector('h3').textContent = d.title;
    panel.querySelector('p').textContent = d.desc;
    panel.querySelector('code').textContent = d.code;
    panel.classList.add('open');
    overlay.classList.add('open');
  }

  function closeDetail() {
    $('.detail-panel').classList.remove('open');
    $('.detail-overlay').classList.remove('open');
  }

  // ══════════════════════════════════════════
  // Tab System
  // ══════════════════════════════════════════
  function initTabs() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        if (id === activeTab) return;
        activeTab = id;
        $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
        $$('.flow-section').forEach(s => s.classList.toggle('active', s.id === `section-${id}`));
      });
    });
  }

  // ══════════════════════════════════════════
  // SECTION 1: Boot & Config
  // ══════════════════════════════════════════
  function initBootSection() {
    // Sub-flow 1: createApp boot sequence
    const bootNodes = [
      { id: 'env-load', icon: '\uD83D\uDCC4', label: '.env Load', cat: 'core', timing: '~12ms', detail: 'env-load' },
      { id: 'joi-validate', icon: '\u2705', label: 'Joi Validate', cat: 'core', timing: '~8ms', detail: 'joi-validate' },
      { id: 'otel-init', icon: '\uD83D\uDCE1', label: 'OTel Init', cat: 'observe', timing: '~45ms', detail: 'otel-init' },
      { id: 'boot-module', icon: '\uD83D\uDCE6', label: 'BootModule', cat: 'core', timing: '~120ms', detail: 'boot-module' },
      { id: 'nest-create', icon: '\uD83C\uDFD7\uFE0F', label: 'NestFactory', cat: 'core', timing: '~350ms', detail: 'nest-create' },
      { id: 'apply-globals', icon: '\uD83C\uDF10', label: 'Globals', cat: 'auth', timing: '~15ms', detail: 'apply-globals' },
      { id: 'connect-transport', icon: '\uD83D\uDD0C', label: 'Transports', cat: 'transport', timing: '~200ms', detail: 'connect-transport' },
      { id: 'ready', icon: '\uD83D\uDE80', label: 'Ready!', cat: 'success', timing: '~847ms', classes: 'success-node' },
    ];
    renderFlow('boot-canvas', bootNodes);

    // Optional modules display
    const optModules = [
      { toggle: 'boot-db', label: 'DatabaseModule', cat: 'database' },
      { toggle: 'boot-cache', label: 'CacheModule', cat: 'cache' },
      { toggle: 'boot-auth', label: 'AuthModule', cat: 'auth' },
      { toggle: 'boot-events', label: 'EventBusModule', cat: 'event' },
      { toggle: 'boot-queue', label: 'QueueModule', cat: 'core' },
      { toggle: 'boot-grpc', label: 'GrpcModule', cat: 'transport' },
      { toggle: 'boot-metrics', label: 'MetricsModule', cat: 'observe' },
      { toggle: 'boot-logging', label: 'LoggingModule', cat: 'observe' },
      { toggle: 'boot-cqrs', label: 'CQRSModule', cat: 'cqrs' },
    ];

    const canvas = $('#boot-canvas');
    const optRow = document.createElement('div');
    optRow.className = 'flow-row';
    optRow.style.flexWrap = 'wrap';
    optRow.style.marginTop = '8px';
    optRow.style.gap = '6px';

    const lbl = document.createElement('span');
    lbl.className = 'branch-label';
    lbl.textContent = 'Conditional:';
    lbl.style.marginRight = '4px';
    optRow.appendChild(lbl);

    optModules.forEach(m => {
      const el = document.createElement('div');
      el.className = 'flow-node dashed';
      el.dataset.cat = m.cat;
      el.dataset.toggle = m.toggle;
      el.innerHTML = `<span class="node-label">${m.label}</span>`;
      el.style.display = $(`#${m.toggle}`)?.checked ? '' : 'none';
      optRow.appendChild(el);

      const cb = $(`#${m.toggle}`);
      if (cb) cb.addEventListener('change', () => { el.style.display = cb.checked ? '' : 'none'; });
    });
    canvas.appendChild(optRow);

    // Sub-flow 2: Module conditional loading overview
    renderFlow('module-loading-canvas', [
      { icon: '\u2699\uFE0F', label: 'BootOptions', cat: 'core' },
    ], {
      branches: [{
        afterId: undefined,
        paths: []
      }],
      extraRows: [
        { prefix: 'database?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { icon: '\uD83D\uDDC4\uFE0F', label: 'DatabaseModule', cat: 'database' },
          { label: 'MongooseModule', cat: 'database' },
          { label: 'RepositoryModule', cat: 'database' },
        ]},
        { prefix: 'cache?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'RedisModule', cat: 'cache' },
          { label: 'CacheModule', cat: 'cache' },
        ]},
        { prefix: 'auth?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'AuthModule', cat: 'auth' },
          { label: 'JwtModule', cat: 'auth' },
          { label: 'RbacModule', cat: 'auth' },
        ]},
        { prefix: 'transport?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'TransportModule', cat: 'transport' },
          { label: 'CorrelationModule', cat: 'observe' },
          { label: 'RpcModule', cat: 'transport' },
        ]},
        { prefix: 'events?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'EventBusModule', cat: 'event' },
        ]},
        { prefix: 'queue?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'QueueModule (BullMQ)', cat: 'core' },
        ]},
        { prefix: 'metrics?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'MetricsModule', cat: 'observe' },
        ]},
        { prefix: 'logging?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'LoggingModule (pino)', cat: 'observe' },
        ]},
        { prefix: 'tracing?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'TracingModule', cat: 'observe' },
        ]},
        { prefix: 'resilience?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'CircuitBreakerModule', cat: 'transport' },
          { label: 'RetryModule', cat: 'transport' },
        ]},
        { prefix: 'health?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'HealthModule', cat: 'core' },
        ]},
        { prefix: 'shutdown?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'ShutdownModule', cat: 'core' },
        ]},
        { prefix: 'interServiceAuth?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'AuthPropagationModule', cat: 'auth' },
        ]},
        { prefix: 'monitoring?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'ErrorReporter', cat: 'observe' },
        ]},
        { prefix: 'correlation?', prefixClass: 'yes', nodes: [
          { label: 'Yes', cat: 'decision', classes: 'diamond-inline' },
          { label: 'CorrelationModule', cat: 'observe' },
        ]},
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 2: Request & Response
  // ══════════════════════════════════════════
  function initRequestSection() {
    // HTTP lifecycle
    renderFlow('http-lifecycle-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client', cat: 'core' },
      { icon: '\uD83D\uDD17', label: 'Correlation ID', cat: 'observe', detail: 'correlation' },
      { icon: '\uD83D\uDD12', label: 'Auth Guard', cat: 'auth' },
      { icon: '\uD83D\uDEE1\uFE0F', label: 'RBAC Guard', cat: 'auth', detail: 'rbac' },
      { icon: '\u23F1\uFE0F', label: 'Timeout', cat: 'observe' },
      { icon: '\uD83C\uDFAF', label: 'Controller', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core' },
      { icon: '\uD83D\uDCA8', label: 'Cache Check', cat: 'cache' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'Database', cat: 'database' },
      { icon: '\uD83D\uDCE8', label: 'Envelope', cat: 'core' },
      { icon: '\u2705', label: 'Response', cat: 'success', classes: 'success-node' },
    ]);

    // Cache hit vs miss
    renderFlow('cache-paths-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core' },
      { icon: '\u2753', label: 'Cache?', cat: 'decision', classes: 'diamond-inline' },
    ], {
      extraRows: [
        { prefix: 'HIT', prefixClass: 'hit', nodes: [
          { icon: '\uD83D\uDCA8', label: 'L1/L2 Cache', cat: 'cache' },
          { icon: '\uD83D\uDCE8', label: 'Envelope', cat: 'core' },
          { icon: '\u2705', label: 'Response', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'MISS', prefixClass: 'miss', nodes: [
          { icon: '\uD83D\uDDC4\uFE0F', label: 'Database', cat: 'database' },
          { icon: '\uD83D\uDCA8', label: 'Write-back Cache', cat: 'cache' },
          { icon: '\uD83D\uDCE8', label: 'Envelope', cat: 'core' },
          { icon: '\u2705', label: 'Response', cat: 'success', classes: 'success-node' },
        ]},
      ],
    });

    // Error paths
    renderFlow('error-paths-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client Request', cat: 'core' },
    ], {
      extraRows: [
        { prefix: '401', prefixClass: 'no', nodes: [
          { label: 'Auth Guard', cat: 'auth' },
          { label: 'Invalid/missing token', cat: 'error', classes: 'error-node' },
          { label: '401 Unauthorized', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: '403', prefixClass: 'no', nodes: [
          { label: 'RBAC Guard', cat: 'auth' },
          { label: 'Insufficient roles', cat: 'error', classes: 'error-node' },
          { label: '403 Forbidden', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: '404', prefixClass: 'no', nodes: [
          { label: 'Controller', cat: 'core' },
          { label: 'Entity not found', cat: 'error', classes: 'error-node' },
          { label: '404 Not Found', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: '408', prefixClass: 'no', nodes: [
          { label: 'TimeoutInterceptor', cat: 'observe' },
          { label: 'Handler exceeds limit', cat: 'error', classes: 'error-node' },
          { label: '408 Timeout', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: '500', prefixClass: 'no', nodes: [
          { label: 'Service / DB', cat: 'core' },
          { label: 'Unhandled exception', cat: 'error', classes: 'error-node' },
          { label: 'AllExceptionsFilter', cat: 'error', classes: 'error-node' },
          { label: '500 Internal', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // Validation pipe rejection
    renderFlow('validation-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Auth Guard', cat: 'auth' },
      { icon: '\uD83D\uDCCB', label: 'ValidationPipe', cat: 'core' },
      { icon: '\u2718', label: 'DTO invalid', cat: 'error', classes: 'error-node' },
      { icon: '\uD83D\uDCE8', label: '400 Bad Request', cat: 'error', classes: 'error-node' },
    ], {
      extraRows: [
        { prefix: 'Response:', nodes: [
          { label: '{ statusCode: 400, message: ["field must be..."], error: "Bad Request" }', cat: 'error', classes: 'error-node' },
        ]},
      ],
    });

    // Response envelope
    renderFlow('envelope-canvas', [
      { icon: '\u2699\uFE0F', label: 'Handler returns data', cat: 'core' },
      { icon: '\uD83D\uDCE8', label: 'TransformInterceptor', cat: 'core' },
      { label: 'Wrap in envelope', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'Output:', nodes: [
          { label: '{ success, data, meta, timestamp, correlationId }', cat: 'success', classes: 'success-node' },
        ]},
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 3: Auth Flows
  // ══════════════════════════════════════════
  function initAuthSection() {
    // JWT Login
    renderFlow('jwt-login-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client', cat: 'core' },
      { icon: '\uD83D\uDCE7', label: 'POST /auth/login', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Validate credentials', cat: 'auth', detail: 'jwt-login' },
      { icon: '\u2705', label: 'User found + password match', cat: 'success', classes: 'success-node' },
      { icon: '\uD83D\uDD11', label: 'Sign access token', cat: 'auth' },
      { icon: '\uD83D\uDD11', label: 'Sign refresh token', cat: 'auth' },
      { icon: '\uD83D\uDCE8', label: '{ access, refresh }', cat: 'success', classes: 'success-node' },
    ]);

    // JWT Refresh
    renderFlow('jwt-refresh-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client', cat: 'core' },
      { icon: '\uD83D\uDD04', label: 'POST /auth/refresh', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Verify refresh token', cat: 'auth', detail: 'jwt-refresh' },
      { icon: '\uD83D\uDEAB', label: 'Revoke old refresh', cat: 'auth' },
      { icon: '\uD83D\uDD11', label: 'Sign new access', cat: 'auth' },
      { icon: '\uD83D\uDD11', label: 'Sign new refresh', cat: 'auth' },
      { icon: '\uD83D\uDCE8', label: '{ access, refresh }', cat: 'success', classes: 'success-node' },
    ]);

    // Token revocation
    renderFlow('token-revoke-canvas', [
      { icon: '\uD83D\uDC64', label: 'Request', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'JwtAuthGuard', cat: 'auth' },
      { icon: '\uD83D\uDD0D', label: 'isRevoked(token)', cat: 'auth', detail: 'revocation' },
    ], {
      extraRows: [
        { prefix: 'Not revoked', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Accept', cat: 'success', classes: 'success-node' },
          { label: 'Continue to controller', cat: 'core' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Revoked', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: 'Reject', cat: 'error', classes: 'error-node' },
          { label: '401 Unauthorized', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // OAuth2 Social
    renderFlow('oauth-canvas', [
      { icon: '\uD83D\uDC64', label: 'User', cat: 'core' },
      { icon: '\uD83C\uDF10', label: 'GET /auth/google', cat: 'core' },
      { icon: '\u21AA\uFE0F', label: 'Redirect to Google', cat: 'transport', detail: 'oauth2' },
      { icon: '\uD83C\uDF10', label: 'Google consent', cat: 'transport' },
      { icon: '\u21A9\uFE0F', label: 'Callback + code', cat: 'core' },
      { icon: '\uD83D\uDC64', label: 'SocialProfile', cat: 'auth' },
      { icon: '\u2699\uFE0F', label: 'findOrCreate user', cat: 'core' },
      { icon: '\uD83D\uDD11', label: 'Sign JWT', cat: 'auth' },
      { icon: '\uD83D\uDCE8', label: '{ access, refresh }', cat: 'success', classes: 'success-node' },
    ]);

    // API Key
    renderFlow('apikey-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client', cat: 'core' },
      { icon: '\uD83D\uDCE9', label: 'X-API-Key header', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Extract key', cat: 'auth', detail: 'apikey' },
      { icon: '\u2699\uFE0F', label: 'validate(key)', cat: 'auth' },
    ], {
      extraRows: [
        { prefix: 'Valid', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Accept', cat: 'success', classes: 'success-node' },
          { label: 'Continue to controller', cat: 'core' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Invalid', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: '401 Unauthorized', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // RBAC
    renderFlow('rbac-canvas', [
      { icon: '\uD83D\uDC64', label: 'Authenticated user', cat: 'auth' },
      { icon: '\uD83D\uDCCB', label: 'Extract roles from JWT', cat: 'auth', detail: 'rbac' },
      { icon: '\uD83C\uDFAF', label: '@Roles() metadata', cat: 'core' },
      { icon: '\u2696\uFE0F', label: 'Compare roles', cat: 'auth' },
    ], {
      extraRows: [
        { prefix: 'Match', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Allow', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'No match', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: '403 Forbidden', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // Session auth
    renderFlow('session-canvas', [
      { icon: '\uD83C\uDF6A', label: 'Cookie', cat: 'core', detail: 'session' },
      { icon: '\uD83D\uDD0D', label: 'Extract session ID', cat: 'auth' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'SessionStore.get()', cat: 'cache' },
      { icon: '\u2699\uFE0F', label: 'Validate session', cat: 'auth' },
    ], {
      extraRows: [
        { prefix: 'Valid', prefixClass: 'yes', nodes: [
          { label: '@Session() injected', cat: 'success', classes: 'success-node' },
          { label: 'Continue', cat: 'core' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Expired/Invalid', prefixClass: 'no', nodes: [
          { label: '401 Unauthorized', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // TOTP 2FA
    renderFlow('totp-canvas', [
      { icon: '\uD83D\uDC64', label: 'User', cat: 'core', detail: 'totp' },
      { icon: '\uD83D\uDD12', label: 'Login (email+pass)', cat: 'auth' },
      { icon: '\u2705', label: 'Credentials valid', cat: 'success', classes: 'success-node' },
      { icon: '\u2753', label: '2FA enabled?', cat: 'decision', classes: 'diamond-inline' },
    ], {
      extraRows: [
        { prefix: 'Yes', prefixClass: 'yes', nodes: [
          { label: 'Require TOTP code', cat: 'auth' },
          { label: 'User submits code', cat: 'core' },
          { label: 'TotpService.verify()', cat: 'auth' },
          { icon: '\u2705', label: 'Access granted', cat: 'success', classes: 'success-node' },
        ]},
        { prefix: 'No', prefixClass: 'no', nodes: [
          { icon: '\u2705', label: 'Access granted directly', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 4: Database & Cache
  // ══════════════════════════════════════════
  function initDbCacheSection() {
    // Reader/Writer split
    renderFlow('rw-split-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core' },
      { icon: '\u2753', label: 'Read or Write?', cat: 'decision', classes: 'diamond-inline', detail: 'rw-split' },
    ], {
      extraRows: [
        { prefix: 'READ', prefixClass: 'hit', nodes: [
          { label: 'readerUri', cat: 'database' },
          { icon: '\uD83D\uDDC4\uFE0F', label: 'Replica', cat: 'database' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'WRITE', prefixClass: 'miss', nodes: [
          { label: 'writerUri', cat: 'database' },
          { icon: '\uD83D\uDDC4\uFE0F', label: 'Primary', cat: 'database' },
        ]},
      ],
    });

    // Multi-connection
    renderFlow('multi-conn-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core' },
      { icon: '\uD83D\uDD17', label: 'Connection name', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'master', prefixClass: 'yes', nodes: [
          { label: 'writerUri + readerUri', cat: 'database' },
          { label: 'Main app DB', cat: 'database' },
        ]},
        { prefix: 'analytics', prefixClass: 'yes', nodes: [
          { label: 'writerUri only', cat: 'database' },
          { label: 'Metrics DB', cat: 'database' },
        ]},
        { prefix: 'logs', prefixClass: 'yes', nodes: [
          { label: 'writerUri only', cat: 'database' },
          { label: 'Log DB', cat: 'database' },
        ]},
      ],
    });

    // BaseRepository CRUD
    renderFlow('base-repo-canvas', [
      { icon: '\u2699\uFE0F', label: 'CrudService', cat: 'core' },
      { icon: '\uD83D\uDCDA', label: 'BaseRepository<T>', cat: 'database' },
    ], {
      extraRows: [
        { prefix: 'create()', nodes: [{ label: 'beforeCreate hook', cat: 'core' }, { label: 'model.create()', cat: 'database' }, { label: 'afterCreate hook', cat: 'core' }] },
        { prefix: 'findById()', nodes: [{ label: 'reader connection', cat: 'database' }, { label: 'model.findById().lean()', cat: 'database' }] },
        { prefix: 'update()', nodes: [{ label: 'beforeUpdate hook', cat: 'core' }, { label: 'writer connection', cat: 'database' }, { label: 'afterUpdate hook', cat: 'core' }] },
        { prefix: 'delete()', nodes: [{ label: 'beforeDelete hook', cat: 'core' }, { label: 'model.deleteOne()', cat: 'database' }, { label: 'afterDelete hook', cat: 'core' }] },
        { prefix: 'paginate()', nodes: [{ label: 'reader connection', cat: 'database' }, { label: '{ items, total, page, pages }', cat: 'database' }] },
      ],
    });

    // CachedRepository
    renderFlow('cached-repo-canvas', [
      { icon: '\uD83D\uDD0D', label: 'findById(id)', cat: 'core', detail: 'cached-repo' },
      { icon: '\uD83D\uDCA8', label: 'L1 Memory', cat: 'cache' },
    ], {
      extraRows: [
        { prefix: 'L1 HIT', prefixClass: 'hit', nodes: [{ icon: '\u2705', label: 'Return', cat: 'success', classes: 'success-node' }], arrowClass: 'success-arrow' },
        { prefix: 'L1 MISS', prefixClass: 'miss', nodes: [
          { icon: '\uD83D\uDCA8', label: 'L2 Redis', cat: 'cache' },
        ]},
        { prefix: 'L2 HIT', prefixClass: 'hit', indent: 40, nodes: [
          { label: 'Write-back L1', cat: 'cache' },
          { icon: '\u2705', label: 'Return', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'L2 MISS', prefixClass: 'miss', indent: 40, nodes: [
          { icon: '\uD83D\uDDC4\uFE0F', label: 'Database', cat: 'database' },
          { label: 'Write-back L1+L2', cat: 'cache' },
          { icon: '\u2705', label: 'Return', cat: 'success', classes: 'success-node' },
        ]},
      ],
    });

    // Unit of Work
    renderFlow('uow-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core', detail: 'uow' },
      { icon: '\uD83D\uDD12', label: 'Start transaction', cat: 'database' },
      { icon: '\u2699\uFE0F', label: 'Operation 1', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Operation 2', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Operation N', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'Success', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Commit', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Error', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: 'Rollback', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // Migration
    renderFlow('migration-canvas', [
      { icon: '\uD83D\uDCBB', label: 'migrate:run', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Check _migrations', cat: 'database' },
      { icon: '\uD83D\uDCC4', label: 'Find pending', cat: 'database' },
      { icon: '\u2699\uFE0F', label: 'Run up()', cat: 'core' },
      { icon: '\uD83D\uDCDD', label: 'Record in _migrations', cat: 'database' },
      { icon: '\u2705', label: 'Done', cat: 'success', classes: 'success-node' },
    ]);

    // Specification pattern
    renderFlow('spec-canvas', [
      { icon: '\uD83D\uDD0D', label: 'Spec: isActive()', cat: 'core' },
      { label: '+', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Spec: hasCategory(cat)', cat: 'core' },
      { label: '+', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Spec: priceRange(min,max)', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Compose filters', cat: 'core' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'Execute query', cat: 'database' },
      { icon: '\u2705', label: 'Filtered results', cat: 'success', classes: 'success-node' },
    ]);

    // Multi-layer cache lookup
    renderFlow('cache-lookup-canvas', [
      { icon: '\uD83D\uDD0D', label: 'cache.get(key)', cat: 'core' },
      { icon: '\uD83D\uDCA8', label: 'L1 Memory LRU', cat: 'cache' },
    ], {
      extraRows: [
        { prefix: 'L1 HIT', prefixClass: 'hit', nodes: [{ icon: '\u2705', label: 'Return (fastest)', cat: 'success', classes: 'success-node' }], arrowClass: 'success-arrow' },
        { prefix: 'L1 MISS', prefixClass: 'miss', nodes: [
          { icon: '\uD83D\uDCA8', label: 'L2 Redis', cat: 'cache' },
        ]},
        { prefix: 'L2 HIT', prefixClass: 'hit', indent: 40, nodes: [{ icon: '\u2705', label: 'Return + promote to L1', cat: 'success', classes: 'success-node' }], arrowClass: 'success-arrow' },
        { prefix: 'L2 MISS', prefixClass: 'miss', indent: 40, nodes: [{ icon: '\u274C', label: 'MISS (caller fetches)', cat: 'error', classes: 'error-node' }], arrowClass: 'error-arrow' },
      ],
    });

    // Write-through
    renderFlow('cache-write-canvas', [
      { icon: '\u270F\uFE0F', label: 'cache.set(key, value)', cat: 'core' },
      { icon: '\u2753', label: 'Size check', cat: 'decision', classes: 'diamond-inline' },
    ], {
      extraRows: [
        { prefix: '<1MB', prefixClass: 'yes', nodes: [
          { label: 'Write L1 + L2', cat: 'cache' },
          { icon: '\u2705', label: 'Both layers updated', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: '>1MB', prefixClass: 'miss', nodes: [
          { label: 'Write L2 only', cat: 'cache' },
          { label: '(skip L1 — too large)', cat: 'cache' },
        ]},
      ],
    });

    // Stampede prevention
    renderFlow('stampede-canvas', [
      { icon: '\uD83D\uDD0D', label: 'getOrSet(key, factory)', cat: 'core', detail: 'stampede' },
      { icon: '\uD83D\uDCA8', label: 'Check cache', cat: 'cache' },
    ], {
      extraRows: [
        { prefix: 'HIT', prefixClass: 'hit', nodes: [{ icon: '\u2705', label: 'Return cached', cat: 'success', classes: 'success-node' }], arrowClass: 'success-arrow' },
        { prefix: 'MISS', prefixClass: 'miss', nodes: [
          { icon: '\uD83D\uDD12', label: 'Acquire lock', cat: 'cache' },
          { icon: '\u2699\uFE0F', label: 'Run factory()', cat: 'core' },
          { label: 'Store result', cat: 'cache' },
          { icon: '\uD83D\uDD13', label: 'Release lock', cat: 'cache' },
          { icon: '\u2705', label: 'Distribute to waiters', cat: 'success', classes: 'success-node' },
        ]},
      ],
    });

    // Cache warming
    renderFlow('cache-warm-canvas', [
      { icon: '\uD83D\uDE80', label: 'App startup', cat: 'core' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'Load hot keys list', cat: 'database' },
      { icon: '\u2699\uFE0F', label: 'Fetch values', cat: 'core' },
      { icon: '\uD83D\uDCA8', label: 'Pre-populate L1+L2', cat: 'cache' },
      { icon: '\u2705', label: 'Cache warm', cat: 'success', classes: 'success-node' },
      { icon: '\uD83D\uDE80', label: 'Ready (cold-start free)', cat: 'success', classes: 'success-node' },
    ]);

    // Tag invalidation
    renderFlow('tag-invalidate-canvas', [
      { icon: '\uD83C\uDFF7\uFE0F', label: 'invalidateTag("products")', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Find all keys with tag', cat: 'cache' },
      { icon: '\uD83D\uDDD1\uFE0F', label: 'Delete matching keys', cat: 'cache' },
      { icon: '\u2705', label: 'Tag cleared', cat: 'success', classes: 'success-node' },
    ]);

    // getOrSet
    renderFlow('get-or-set-canvas', [
      { icon: '\uD83D\uDD0D', label: 'cache.getOrSet(key, fn, ttl)', cat: 'core' },
      { icon: '\uD83D\uDCA8', label: 'Try cache', cat: 'cache' },
    ], {
      extraRows: [
        { prefix: 'EXISTS', prefixClass: 'hit', nodes: [{ icon: '\u2705', label: 'Return cached value', cat: 'success', classes: 'success-node' }], arrowClass: 'success-arrow' },
        { prefix: 'NOT EXISTS', prefixClass: 'miss', nodes: [
          { icon: '\u2699\uFE0F', label: 'Call fn()', cat: 'core' },
          { label: 'cache.set(key, result, ttl)', cat: 'cache' },
          { icon: '\u2705', label: 'Return fresh value', cat: 'success', classes: 'success-node' },
        ]},
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 5: Transport & Communication
  // ══════════════════════════════════════════
  function initTransportSection() {
    // gRPC lifecycle
    renderFlow('grpc-lifecycle-canvas', [
      { icon: '\uD83C\uDF10', label: 'API Gateway', cat: 'core', detail: 'grpc-lifecycle' },
      { icon: '\uD83D\uDCE1', label: 'ServiceClient<T>', cat: 'transport' },
      { icon: '\uD83D\uDD17', label: 'Inject correlation', cat: 'observe' },
      { icon: '\uD83D\uDD12', label: 'Inject auth', cat: 'auth' },
      { icon: '\uD83D\uDCE6', label: 'gRPC metadata', cat: 'transport' },
      { icon: '\uD83D\uDCE1', label: 'Send over wire', cat: 'transport' },
      { icon: '\u2699\uFE0F', label: 'Remote service', cat: 'core' },
      { icon: '\uD83C\uDFAF', label: 'RPC Handler', cat: 'core' },
      { icon: '\uD83D\uDCE8', label: 'Serialize response', cat: 'transport' },
      { icon: '\u2705', label: 'Deserialize at caller', cat: 'success', classes: 'success-node' },
    ]);

    // ResilientClient
    renderFlow('resilient-canvas', [
      { icon: '\uD83D\uDCE1', label: 'ResilientClient', cat: 'transport', detail: 'resilient' },
      { icon: '\u23F1\uFE0F', label: 'Timeout check', cat: 'observe' },
      { icon: '\uD83D\uDD04', label: 'Retry logic', cat: 'transport' },
      { icon: '\u26A1', label: 'Circuit breaker', cat: 'transport' },
    ], {
      extraRows: [
        { prefix: 'CLOSED', prefixClass: 'yes', nodes: [
          { label: 'Send request', cat: 'transport' },
          { icon: '\u2705', label: 'Response', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'OPEN', prefixClass: 'no', nodes: [
          { label: 'Fail fast (no call)', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: 'HALF-OPEN', prefixClass: 'miss', nodes: [
          { label: 'Allow 1 test call', cat: 'transport' },
          { label: 'Success \u2192 CLOSED / Fail \u2192 OPEN', cat: 'decision', classes: 'diamond-inline' },
        ]},
      ],
    });

    // Inter-service auth
    renderFlow('inter-auth-canvas', [
      { icon: '\uD83D\uDC64', label: 'Incoming request', cat: 'core', detail: 'inter-auth' },
      { icon: '\uD83D\uDD12', label: 'AuthPropagationInterceptor', cat: 'auth' },
      { icon: '\uD83D\uDCE5', label: 'Extract JWT/API key', cat: 'auth' },
      { icon: '\uD83D\uDCE6', label: 'AsyncLocalStorage.set()', cat: 'observe' },
      { icon: '\u2699\uFE0F', label: 'Business logic', cat: 'core' },
      { icon: '\uD83D\uDCE1', label: 'Outgoing RPC call', cat: 'transport' },
      { icon: '\uD83D\uDD12', label: 'buildAuthHeaders()', cat: 'auth' },
      { icon: '\uD83D\uDCE8', label: 'Auth injected in metadata', cat: 'success', classes: 'success-node' },
    ]);

    // RPC error handling
    renderFlow('rpc-error-canvas', [
      { icon: '\u2699\uFE0F', label: 'Remote handler throws', cat: 'core' },
      { icon: '\u26A0\uFE0F', label: 'BootRpcExceptionFilter', cat: 'error', classes: 'error-node' },
      { icon: '\uD83D\uDCE6', label: 'Serialize to gRPC status', cat: 'transport' },
      { icon: '\uD83D\uDCE1', label: 'Transport', cat: 'transport' },
      { icon: '\uD83D\uDCE5', label: 'Deserialize at caller', cat: 'transport' },
      { icon: '\uD83D\uDCA5', label: 'Re-throw as HttpException', cat: 'error', classes: 'error-node' },
    ], {
      extraRows: [
        { prefix: 'Status map:', nodes: [
          { label: 'NOT_FOUND \u2192 404', cat: 'error', classes: 'error-node' },
          { label: 'PERMISSION_DENIED \u2192 403', cat: 'error', classes: 'error-node' },
          { label: 'UNAVAILABLE \u2192 503', cat: 'error', classes: 'error-node' },
          { label: 'INTERNAL \u2192 500', cat: 'error', classes: 'error-node' },
        ]},
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 6: Events & CQRS
  // ══════════════════════════════════════════
  function initEventsSection() {
    // Event fan-out
    renderFlow('event-fanout-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service.create()', cat: 'core' },
      { icon: '\uD83D\uDCE2', label: 'EventBus.emit()', cat: 'event', detail: 'event-bus' },
    ], {
      extraRows: [
        { prefix: 'memory', prefixClass: 'yes', nodes: [
          { icon: '\uD83D\uDCE7', label: 'NotificationHandler', cat: 'transport' },
        ]},
        { prefix: 'memory', prefixClass: 'yes', nodes: [
          { icon: '\uD83D\uDCE6', label: 'FulfillmentHandler', cat: 'core' },
        ]},
        { prefix: 'Redis pub', prefixClass: 'yes', nodes: [
          { icon: '\uD83D\uDCCA', label: 'AnalyticsHandler', cat: 'observe' },
        ]},
        { prefix: 'Redis pub', prefixClass: 'yes', nodes: [
          { icon: '\uD83D\uDDC4\uFE0F', label: 'AuditLogHandler', cat: 'observe' },
        ]},
      ],
    });

    // emitAndWait
    renderFlow('emit-wait-canvas', [
      { icon: '\u2699\uFE0F', label: 'Caller', cat: 'core', detail: 'emit-wait' },
      { icon: '\uD83D\uDCE2', label: 'emitAndWait(query)', cat: 'event' },
      { icon: '\u2699\uFE0F', label: '@OnQuery handler', cat: 'core' },
      { icon: '\uD83D\uDCE8', label: 'Return result', cat: 'success', classes: 'success-node' },
      { icon: '\u2B05\uFE0F', label: 'Resolve to caller', cat: 'core' },
    ]);

    // CQRS full cycle
    renderFlow('cqrs-canvas', [
      { icon: '\uD83D\uDCDD', label: 'Command', cat: 'cqrs', detail: 'cqrs' },
      { icon: '\uD83D\uDE8C', label: 'CommandBus', cat: 'cqrs' },
      { icon: '\u2699\uFE0F', label: 'Handler', cat: 'cqrs' },
      { icon: '\uD83E\uDDE9', label: 'AggregateRoot', cat: 'cqrs' },
      { icon: '\uD83D\uDCDA', label: 'EventStore', cat: 'database' },
    ], {
      extraRows: [
        { prefix: 'Fan-out:', nodes: [
          { icon: '\uD83D\uDCCA', label: 'Projection (read model)', cat: 'core' },
        ]},
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCE4', label: 'Outbox (publish)', cat: 'event' },
        ]},
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCF8', label: 'Snapshot (every N events)', cat: 'cache' },
        ]},
      ],
    });

    // Event replay
    renderFlow('event-replay-canvas', [
      { icon: '\uD83D\uDCDA', label: 'EventStore', cat: 'database' },
      { icon: '\u23EA', label: 'ReplayService', cat: 'core' },
      { icon: '\uD83D\uDCCA', label: 'Projection 1 rebuild', cat: 'core' },
    ], {
      extraRows: [
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCCA', label: 'Projection 2 rebuild', cat: 'core' },
        ]},
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCCA', label: 'Projection N rebuild', cat: 'core' },
        ]},
        { prefix: 'Result:', nodes: [
          { icon: '\u2705', label: 'Read models fully reconstructed from events', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
      ],
    });

    // Outbox pattern
    renderFlow('outbox-canvas', [
      { icon: '\u2699\uFE0F', label: 'Service', cat: 'core', detail: 'outbox' },
      { icon: '\uD83D\uDD12', label: 'Begin transaction', cat: 'database' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'Save aggregate', cat: 'database' },
      { icon: '\uD83D\uDCE4', label: 'Insert outbox events', cat: 'event' },
      { icon: '\u2705', label: 'Commit', cat: 'success', classes: 'success-node' },
    ], {
      extraRows: [
        { prefix: 'Background:', nodes: [
          { icon: '\u23F0', label: 'Poller', cat: 'core' },
          { label: 'Find pending events', cat: 'event' },
          { label: 'Publish to broker', cat: 'transport' },
          { label: 'Mark as published', cat: 'event' },
        ]},
      ],
    });

    // Saga
    renderFlow('saga-canvas', [
      { icon: '\uD83C\uDFAD', label: 'Saga start', cat: 'event', detail: 'saga' },
      { icon: '\u2699\uFE0F', label: 'Step 1: Reserve', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Step 2: Charge', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Step 3: Ship', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'All OK', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Saga complete', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Step 3 fails', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: 'Compensate Step 2', cat: 'error', classes: 'error-node' },
          { icon: '\u274C', label: 'Compensate Step 1', cat: 'error', classes: 'error-node' },
          { label: 'Saga rolled back', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 7: Observability
  // ══════════════════════════════════════════
  function initObserveSection() {
    // Correlation ID propagation
    renderFlow('correlation-canvas', [
      { icon: '\uD83D\uDC64', label: 'HTTP Request', cat: 'core', detail: 'correlation' },
      { icon: '\uD83D\uDD17', label: 'X-Correlation-Id header', cat: 'observe' },
      { icon: '\uD83D\uDCE6', label: 'AsyncLocalStorage', cat: 'observe' },
      { icon: '\uD83D\uDCDD', label: 'All logs tagged', cat: 'observe' },
      { icon: '\uD83D\uDCE1', label: 'Outgoing RPC', cat: 'transport' },
      { icon: '\uD83D\uDD17', label: 'Inject into metadata', cat: 'observe' },
      { icon: '\u2699\uFE0F', label: 'Downstream service', cat: 'core' },
      { icon: '\uD83D\uDD17', label: 'Same correlation ID', cat: 'success', classes: 'success-node' },
    ]);

    // Trace span lifecycle
    renderFlow('tracing-canvas', [
      { icon: '\uD83D\uDE80', label: 'initTracing()', cat: 'observe', detail: 'tracing' },
      { icon: '\u2699\uFE0F', label: 'Auto-instrument HTTP', cat: 'observe' },
      { icon: '\u2699\uFE0F', label: 'Auto-instrument DB', cat: 'observe' },
      { icon: '\uD83C\uDFAF', label: '@BootTrace spans', cat: 'observe' },
      { icon: '\uD83D\uDCE1', label: 'OTLP Exporter', cat: 'transport' },
      { icon: '\uD83D\uDCCA', label: 'Jaeger / Tempo', cat: 'observe' },
    ]);

    // Metrics collection
    renderFlow('metrics-canvas', [
      { icon: '\uD83D\uDC64', label: 'HTTP Request', cat: 'core', detail: 'metrics' },
      { icon: '\uD83D\uDCCA', label: 'HttpMetricsInterceptor', cat: 'observe' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'DbMetricsInterceptor', cat: 'observe' },
      { icon: '\uD83D\uDCA8', label: 'CacheMetricsInterceptor', cat: 'observe' },
      { icon: '\u2699\uFE0F', label: 'counter++ / histogram', cat: 'observe' },
      { icon: '\uD83C\uDF10', label: '/metrics endpoint', cat: 'core' },
      { icon: '\uD83D\uDCCA', label: 'Prometheus scrape', cat: 'observe' },
    ]);

    // Structured logging
    renderFlow('logging-canvas', [
      { icon: '\uD83D\uDC64', label: 'Request', cat: 'core', detail: 'logging' },
      { icon: '\uD83D\uDCDD', label: 'LoggingInterceptor', cat: 'observe' },
      { icon: '\u2699\uFE0F', label: 'BootLogger', cat: 'observe' },
    ], {
      extraRows: [
        { prefix: 'Fields:', nodes: [
          { label: 'correlationId', cat: 'observe' },
          { label: 'traceId', cat: 'observe' },
          { label: 'context', cat: 'observe' },
          { label: 'duration', cat: 'observe' },
        ]},
        { prefix: 'Output:', nodes: [
          { label: 'JSON \u2192 stdout (pino)', cat: 'observe' },
          { label: 'Redacted fields excluded', cat: 'observe' },
        ]},
      ],
    });

    // Error reporting
    renderFlow('error-reporting-canvas', [
      { icon: '\uD83D\uDCA5', label: 'Exception thrown', cat: 'error', classes: 'error-node', detail: 'error-report' },
      { icon: '\u26A0\uFE0F', label: 'AllExceptionsFilter', cat: 'core' },
      { icon: '\uD83D\uDCE1', label: 'ErrorReporter callback', cat: 'observe' },
    ], {
      extraRows: [
        { prefix: 'Targets:', nodes: [
          { label: 'Sentry', cat: 'observe' },
          { label: 'Datadog', cat: 'observe' },
          { label: 'Custom webhook', cat: 'observe' },
        ]},
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 8: Platform
  // ══════════════════════════════════════════
  function initPlatformSection() {
    // Tenant resolution
    renderFlow('tenant-resolve-canvas', [
      { icon: '\uD83D\uDC64', label: 'Request', cat: 'core', detail: 'tenant' },
      { icon: '\u2699\uFE0F', label: 'TenantMiddleware', cat: 'platform' },
    ], {
      extraRows: [
        { prefix: 'Header', prefixClass: 'yes', nodes: [{ label: 'X-Tenant-Id: acme', cat: 'platform' }] },
        { prefix: 'Subdomain', prefixClass: 'yes', nodes: [{ label: 'acme.app.com', cat: 'platform' }] },
        { prefix: 'Path', prefixClass: 'yes', nodes: [{ label: '/api/acme/...', cat: 'platform' }] },
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCE6', label: 'AsyncLocalStorage.set(tenant)', cat: 'observe' },
          { icon: '\u2705', label: 'tenantId available everywhere', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
      ],
    });

    // Row isolation
    renderFlow('row-isolation-canvas', [
      { icon: '\u2699\uFE0F', label: 'Repository.find()', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Auto-add tenantId filter', cat: 'platform' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'Query: { ...filter, tenantId }', cat: 'database' },
      { icon: '\u2705', label: 'Scoped results only', cat: 'success', classes: 'success-node' },
    ]);

    // DB isolation
    renderFlow('db-isolation-canvas', [
      { icon: '\uD83D\uDC64', label: 'Request (tenant: acme)', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Resolve tenant', cat: 'platform' },
      { icon: '\uD83D\uDD17', label: 'Connection pool manager', cat: 'database' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'acme_db (dedicated)', cat: 'database' },
    ], {
      extraRows: [
        { prefix: 'Other tenant:', nodes: [
          { icon: '\uD83D\uDDC4\uFE0F', label: 'globex_db (isolated)', cat: 'database' },
        ]},
      ],
    });

    // File upload
    renderFlow('file-upload-canvas', [
      { icon: '\uD83D\uDC64', label: 'Client upload', cat: 'core', detail: 'file-upload' },
      { icon: '\u2705', label: 'Validate (type, size)', cat: 'core' },
      { icon: '\uD83D\uDD11', label: 'Generate key', cat: 'core' },
      { icon: '\uD83D\uDDC4\uFE0F', label: 'adapter.save()', cat: 'database' },
    ], {
      extraRows: [
        { prefix: 'Adapters:', nodes: [
          { label: 'Local disk', cat: 'database' },
          { label: 'S3', cat: 'transport' },
          { label: 'GCS', cat: 'transport' },
        ]},
        { prefix: '', nodes: [
          { icon: '\uD83D\uDCDD', label: 'Store metadata', cat: 'database' },
          { icon: '\uD83D\uDD17', label: 'Return URL', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
      ],
    });

    // Webhook verification
    renderFlow('webhook-canvas', [
      { icon: '\uD83D\uDCE9', label: 'Receive webhook', cat: 'core', detail: 'webhook' },
      { icon: '\uD83D\uDD0D', label: 'Extract signature', cat: 'auth' },
      { icon: '\uD83D\uDD12', label: 'HMAC verify', cat: 'auth' },
      { icon: '\u2699\uFE0F', label: 'Normalize payload', cat: 'core' },
      { icon: '\uD83D\uDD0D', label: 'Deduplicate (idempotency)', cat: 'core' },
      { icon: '\uD83C\uDFAF', label: 'Handler', cat: 'core' },
      { icon: '\u2705', label: '200 OK', cat: 'success', classes: 'success-node' },
    ]);

    // Migration CLI
    renderFlow('migration-cli-canvas', [
      { icon: '\uD83D\uDCBB', label: 'migrate:create name', cat: 'core' },
      { icon: '\uD83D\uDCC4', label: 'Generate migration file', cat: 'core' },
      { icon: '\u270F\uFE0F', label: 'Edit up() / down()', cat: 'core' },
      { icon: '\uD83D\uDCBB', label: 'migrate:run', cat: 'core' },
      { icon: '\uD83D\uDDC4\uFE0F', label: '_migrations updated', cat: 'database' },
      { icon: '\u2705', label: 'Schema migrated', cat: 'success', classes: 'success-node' },
    ]);

    // Resource generation
    renderFlow('resource-gen-canvas', [
      { icon: '\uD83D\uDCBB', label: 'nestjs-boot g resource product', cat: 'core' },
      { icon: '\u2699\uFE0F', label: 'Template engine', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'Generated:', nodes: [
          { label: 'product.module.ts', cat: 'core' },
          { label: 'product.controller.ts', cat: 'core' },
          { label: 'product.service.ts', cat: 'core' },
        ]},
        { prefix: '', nodes: [
          { label: 'product.schema.ts', cat: 'database' },
          { label: 'create-product.dto.ts', cat: 'core' },
          { label: 'update-product.dto.ts', cat: 'core' },
        ]},
      ],
    });

    // Graceful shutdown
    renderFlow('shutdown-canvas', [
      { icon: '\uD83D\uDED1', label: 'SIGTERM', cat: 'error', classes: 'error-node', detail: 'shutdown' },
      { icon: '\u26D4', label: 'Stop accepting new', cat: 'core' },
      { icon: '\uD83C\uDFE5', label: 'Health \u2192 503', cat: 'core' },
      { icon: '\u23F3', label: 'Drain in-flight', cat: 'core' },
      { icon: '\uD83D\uDD12', label: 'Close DB connections', cat: 'database' },
      { icon: '\uD83D\uDCA8', label: 'Flush queues', cat: 'cache' },
      { icon: '\uD83D\uDCE1', label: 'Close transports', cat: 'transport' },
      { icon: '\u2705', label: 'Exit 0', cat: 'success', classes: 'success-node' },
    ]);
  }

  // ══════════════════════════════════════════
  // SECTION 9: DI & Architecture
  // ══════════════════════════════════════════
  function initDiSection() {
    // Circular dep detection
    renderFlow('circular-dep-canvas', [
      { icon: '\uD83D\uDE80', label: 'Boot', cat: 'core', detail: 'circular-dep' },
      { icon: '\u274C', label: 'DI error thrown', cat: 'error', classes: 'error-node' },
      { icon: '\u2699\uFE0F', label: 'parseDiError()', cat: 'di' },
      { icon: '\u2699\uFE0F', label: 'formatDiError()', cat: 'di' },
      { icon: '\uD83D\uDCCB', label: 'Actionable message', cat: 'success', classes: 'success-node' },
    ], {
      extraRows: [
        { prefix: 'Output:', nodes: [
          { label: '"A \u2192 B \u2192 C \u2192 A: use forwardRef() in B"', cat: 'di' },
        ]},
      ],
    });

    // Contract injection
    renderFlow('contract-canvas', [
      { icon: '\uD83D\uDCDC', label: 'createContract<T>()', cat: 'di', detail: 'contract' },
      { icon: '\uD83D\uDD11', label: 'DI token created', cat: 'di' },
      { icon: '\u2699\uFE0F', label: 'provideContract(token, impl)', cat: 'di' },
      { icon: '\uD83D\uDCE6', label: 'Module registers provider', cat: 'core' },
    ], {
      extraRows: [
        { prefix: 'Consumer:', nodes: [
          { label: '@Inject(token)', cat: 'di' },
          { label: 'Gets concrete implementation', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Startup:', nodes: [
          { label: 'validateContracts()', cat: 'di' },
          { label: 'Catch missing bindings', cat: 'error', classes: 'error-node' },
        ]},
      ],
    });

    // Module graph analysis
    renderFlow('module-graph-canvas', [
      { icon: '\uD83D\uDD0D', label: 'analyzeModules(AppModule)', cat: 'di', detail: 'module-graph' },
      { icon: '\uD83D\uDD78\uFE0F', label: 'Build dependency graph', cat: 'di' },
      { icon: '\u2699\uFE0F', label: 'Tarjan SCC algorithm', cat: 'di' },
      { icon: '\uD83D\uDD0D', label: 'Detect cycles', cat: 'di' },
    ], {
      extraRows: [
        { prefix: 'No cycles:', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'Graph is DAG', cat: 'success', classes: 'success-node' },
          { label: 'renderMermaid(graph)', cat: 'di' },
        ], arrowClass: 'success-arrow' },
        { prefix: 'Cycles found:', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: 'Report SCCs', cat: 'error', classes: 'error-node' },
          { label: 'Exit 1 (--strict)', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
      ],
    });

    // Layer validation
    renderFlow('layer-validate-canvas', [
      { icon: '\uD83D\uDCCF', label: '@Layer(INFRASTRUCTURE)', cat: 'di', detail: 'layer-valid' },
      { icon: '\uD83D\uDCCF', label: '@Layer(APPLICATION)', cat: 'di' },
      { icon: '\uD83D\uDCCF', label: '@Layer(PRESENTATION)', cat: 'di' },
    ], {
      extraRows: [
        { prefix: 'validateLayers():', nodes: [
          { label: 'Check import directions', cat: 'di' },
        ]},
        { prefix: 'INFRA \u2192 APP', prefixClass: 'no', nodes: [
          { icon: '\u274C', label: 'BLOCKED (upward dep)', cat: 'error', classes: 'error-node' },
        ], arrowClass: 'error-arrow' },
        { prefix: 'APP \u2192 INFRA', prefixClass: 'yes', nodes: [
          { icon: '\u2705', label: 'OK (downward dep)', cat: 'success', classes: 'success-node' },
        ], arrowClass: 'success-arrow' },
      ],
    });
  }

  // ══════════════════════════════════════════
  // SECTION 10: Module Dependency Map (canvas)
  // ══════════════════════════════════════════
  const moduleData = [
    { id: 'BootModule', cat: 'core', deps: ['ConfigModule', 'LoggerModule', 'HealthModule'] },
    { id: 'ConfigModule', cat: 'core', deps: [] },
    { id: 'LoggerModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'HealthModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'ValidationModule', cat: 'core', deps: [] },
    { id: 'TransformModule', cat: 'core', deps: [] },
    { id: 'MongooseModule', cat: 'database', deps: ['ConfigModule'] },
    { id: 'TypeOrmModule', cat: 'database', deps: ['ConfigModule'] },
    { id: 'PrismaModule', cat: 'database', deps: ['ConfigModule'] },
    { id: 'RepositoryModule', cat: 'database', deps: ['MongooseModule'] },
    { id: 'MigrationModule', cat: 'database', deps: ['MongooseModule'] },
    { id: 'SeedModule', cat: 'database', deps: ['RepositoryModule'] },
    { id: 'RedisModule', cat: 'cache', deps: ['ConfigModule'] },
    { id: 'CacheModule', cat: 'cache', deps: ['RedisModule'] },
    { id: 'SessionModule', cat: 'cache', deps: ['RedisModule'] },
    { id: 'RateLimitModule', cat: 'cache', deps: ['RedisModule'] },
    { id: 'AuthModule', cat: 'auth', deps: ['ConfigModule', 'RedisModule'] },
    { id: 'JwtModule', cat: 'auth', deps: ['ConfigModule'] },
    { id: 'RbacModule', cat: 'auth', deps: ['AuthModule'] },
    { id: 'ApiKeyModule', cat: 'auth', deps: ['ConfigModule'] },
    { id: 'OAuth2Module', cat: 'auth', deps: ['AuthModule', 'JwtModule'] },
    { id: 'PermissionModule', cat: 'auth', deps: ['RbacModule', 'RepositoryModule'] },
    { id: 'GrpcModule', cat: 'transport', deps: ['ConfigModule', 'AuthModule'] },
    { id: 'GrpcClientModule', cat: 'transport', deps: ['GrpcModule'] },
    { id: 'NatsModule', cat: 'transport', deps: ['ConfigModule'] },
    { id: 'RedisTransportModule', cat: 'transport', deps: ['RedisModule'] },
    { id: 'WebSocketModule', cat: 'transport', deps: ['AuthModule'] },
    { id: 'HttpClientModule', cat: 'transport', deps: ['ConfigModule'] },
    { id: 'EventBusModule', cat: 'event', deps: ['ConfigModule'] },
    { id: 'EventStoreModule', cat: 'event', deps: ['MongooseModule'] },
    { id: 'SagaModule', cat: 'event', deps: ['EventBusModule'] },
    { id: 'OutboxModule', cat: 'event', deps: ['EventStoreModule', 'NatsModule'] },
    { id: 'OTelModule', cat: 'observe', deps: ['ConfigModule'] },
    { id: 'MetricsModule', cat: 'observe', deps: ['OTelModule'] },
    { id: 'TracingModule', cat: 'observe', deps: ['OTelModule'] },
    { id: 'CorrelationModule', cat: 'observe', deps: ['LoggerModule'] },
    { id: 'AuditLogModule', cat: 'observe', deps: ['RepositoryModule', 'CorrelationModule'] },
    { id: 'CqrsModule', cat: 'cqrs', deps: ['EventBusModule'] },
    { id: 'CommandBusModule', cat: 'cqrs', deps: [] },
    { id: 'QueryBusModule', cat: 'cqrs', deps: [] },
    { id: 'ProjectionModule', cat: 'cqrs', deps: ['EventStoreModule', 'RepositoryModule'] },
    { id: 'SnapshotModule', cat: 'cqrs', deps: ['EventStoreModule', 'CacheModule'] },
    { id: 'FileUploadModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'MailModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'NotificationModule', cat: 'core', deps: ['EventBusModule', 'MailModule'] },
    { id: 'SchedulerModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'QueueModule', cat: 'core', deps: ['RedisModule'] },
    { id: 'I18nModule', cat: 'core', deps: ['ConfigModule'] },
    { id: 'ThrottleModule', cat: 'core', deps: ['RedisModule'] },
    { id: 'TenantModule', cat: 'core', deps: ['ConfigModule', 'RepositoryModule'] },
    { id: 'FeatureFlagModule', cat: 'core', deps: ['ConfigModule', 'CacheModule'] },
    { id: 'CryptoModule', cat: 'core', deps: [] },
    { id: 'PaginationModule', cat: 'core', deps: [] },
    { id: 'SlugModule', cat: 'core', deps: [] },
    { id: 'CircuitBreakerModule', cat: 'transport', deps: ['ConfigModule', 'MetricsModule'] },
    { id: 'RetryModule', cat: 'transport', deps: ['ConfigModule'] },
    { id: 'BulkheadModule', cat: 'transport', deps: ['ConfigModule'] },
  ];

  function initDependencyMap() {
    const canvasEl = $('#dep-canvas');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W, H;
    let nodes = [];
    let selectedId = null;
    let searchTerm = '';
    let hoveredId = null;
    let panX = 0, panY = 0, isDragging = false, dragStart = { x: 0, y: 0 };

    const catColors = {
      core: '#0ea5e9', database: '#10b981', cache: '#f59e0b',
      auth: '#8b5cf6', transport: '#14b8a6', event: '#ec4899',
      observe: '#f97316', cqrs: '#6366f1',
    };

    function resize() {
      const rect = canvasEl.parentElement.getBoundingClientRect();
      W = rect.width;
      H = 600;
      canvasEl.width = W * dpr;
      canvasEl.height = H * dpr;
      canvasEl.style.width = `${W}px`;
      canvasEl.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function layoutNodes() {
      const cats = {};
      moduleData.forEach(m => { if (!cats[m.cat]) cats[m.cat] = []; cats[m.cat].push(m); });
      const catOrder = ['core', 'database', 'cache', 'auth', 'transport', 'event', 'observe', 'cqrs'];
      const colWidth = W / 4;
      const rowHeight = 36;
      let col = 0;
      nodes = [];
      catOrder.forEach(cat => {
        const mods = cats[cat] || [];
        const cx = (col % 4) * colWidth + colWidth / 2;
        let startY = Math.floor(col / 4) * (rowHeight * 10) + 50;
        mods.forEach((m, i) => {
          nodes.push({ ...m, x: cx + (Math.random() - 0.5) * 40, y: startY + i * rowHeight, w: 130, h: 26, color: catColors[cat] });
        });
        col++;
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(panX, panY);

      // Edges
      nodes.forEach(node => {
        const m = moduleData.find(mm => mm.id === node.id);
        if (!m) return;
        m.deps.forEach(depId => {
          const dep = nodes.find(n => n.id === depId);
          if (!dep) return;
          const isHighlighted = selectedId && (selectedId === node.id || selectedId === depId);
          const isFiltered = searchTerm && !searchTerm.startsWith('::cat::') && (node.id.toLowerCase().includes(searchTerm) || dep.id.toLowerCase().includes(searchTerm));
          const isCatMatch = searchTerm && searchTerm.startsWith('::cat::') && (node.cat === searchTerm.replace('::cat::', '') || dep.cat === searchTerm.replace('::cat::', ''));
          const dimmed = (selectedId || searchTerm) && !isHighlighted && !isFiltered && !isCatMatch;
          const color = dimmed ? 'rgba(30,30,42,.3)' : isHighlighted ? node.color : 'rgba(30,30,42,.6)';
          ctx.strokeStyle = color;
          ctx.lineWidth = isHighlighted ? 2 : 1;
          ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(dep.x, dep.y); ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(dep.y - node.y, dep.x - node.x);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(dep.x, dep.y);
          ctx.lineTo(dep.x - 8 * Math.cos(angle - Math.PI / 6), dep.y - 8 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(dep.x - 8 * Math.cos(angle + Math.PI / 6), dep.y - 8 * Math.sin(angle + Math.PI / 6));
          ctx.closePath(); ctx.fill();
        });
      });

      // Nodes
      nodes.forEach(node => {
        const isSelected = selectedId === node.id;
        const isDep = selectedId && moduleData.find(m => m.id === selectedId)?.deps.includes(node.id);
        const isDepOf = selectedId && moduleData.find(m => m.id === node.id)?.deps.includes(selectedId);
        const isSearchMatch = searchTerm && !searchTerm.startsWith('::cat::') && node.id.toLowerCase().includes(searchTerm);
        const isCatMatch = searchTerm && searchTerm.startsWith('::cat::') && node.cat === searchTerm.replace('::cat::', '');
        const isHovered = hoveredId === node.id;
        const highlight = isSelected || isDep || isDepOf || isSearchMatch || isCatMatch;
        const dimmed = (selectedId || searchTerm) && !highlight;
        const x = node.x - node.w / 2, y = node.y - node.h / 2;

        if (highlight || isHovered) { ctx.shadowColor = node.color; ctx.shadowBlur = 12; }
        ctx.fillStyle = dimmed ? 'rgba(17,17,24,.4)' : '#111118';
        ctx.strokeStyle = dimmed ? 'rgba(30,30,42,.3)' : highlight ? node.color : 'rgba(30,30,42,.8)';
        ctx.lineWidth = highlight ? 2 : 1;
        ctx.beginPath(); ctx.roundRect(x, y, node.w, node.h, 4); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = dimmed ? 'rgba(100,116,139,.3)' : highlight ? '#fff' : '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(node.id.replace('Module', ''), node.x, node.y);

        ctx.fillStyle = dimmed ? 'rgba(100,100,100,.2)' : node.color;
        ctx.beginPath(); ctx.arc(x + 8, node.y, 3, 0, Math.PI * 2); ctx.fill();
      });

      ctx.restore();
    }

    function hitTest(mx, my) {
      const x = mx - panX, y = my - panY;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (x >= n.x - n.w / 2 && x <= n.x + n.w / 2 && y >= n.y - n.h / 2 && y <= n.y + n.h / 2) return n.id;
      }
      return null;
    }

    canvasEl.addEventListener('click', e => {
      const rect = canvasEl.getBoundingClientRect();
      const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      selectedId = selectedId === id ? null : id;
      draw();
      if (selectedId) {
        const m = moduleData.find(mm => mm.id === selectedId);
        if (m) {
          const deps = m.deps.length ? m.deps.join(', ') : 'none';
          const dependants = moduleData.filter(mm => mm.deps.includes(selectedId)).map(mm => mm.id).join(', ') || 'none';
          const panel = $('.detail-panel');
          panel.querySelector('h3').textContent = selectedId;
          panel.querySelector('p').textContent = `Category: ${m.cat}\nDependencies: ${deps}\nUsed by: ${dependants}`;
          panel.querySelector('code').textContent = `import { ${selectedId} } from 'nestjs-boot';\n\n@Module({\n  imports: [${deps !== 'none' ? deps : ''}],\n})\nexport class ${selectedId} {}`;
          panel.classList.add('open');
          $('.detail-overlay').classList.add('open');
        }
      }
    });

    canvasEl.addEventListener('mousemove', e => {
      const rect = canvasEl.getBoundingClientRect();
      const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (id !== hoveredId) { hoveredId = id; canvasEl.style.cursor = id ? 'pointer' : 'grab'; draw(); }
      if (isDragging) {
        panX += e.clientX - dragStart.x; panY += e.clientY - dragStart.y;
        dragStart = { x: e.clientX, y: e.clientY }; draw();
      }
    });

    canvasEl.addEventListener('mousedown', e => {
      const rect = canvasEl.getBoundingClientRect();
      if (!hitTest(e.clientX - rect.left, e.clientY - rect.top)) {
        isDragging = true; dragStart = { x: e.clientX, y: e.clientY }; canvasEl.style.cursor = 'grabbing';
      }
    });
    canvasEl.addEventListener('mouseup', () => { isDragging = false; canvasEl.style.cursor = 'grab'; });
    canvasEl.addEventListener('mouseleave', () => { isDragging = false; });

    const searchInput = $('#dep-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => { searchTerm = e.target.value.toLowerCase(); selectedId = null; draw(); });
    }

    $$('.dep-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (btn.classList.contains('active')) { btn.classList.remove('active'); searchTerm = ''; }
        else { $$('.dep-cat-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); searchTerm = '::cat::' + cat; selectedId = null; }
        draw();
      });
    });

    resize(); layoutNodes(); draw();
    window.addEventListener('resize', () => { resize(); layoutNodes(); draw(); });
  }

  // ══════════════════════════════════════════
  // Speed control
  // ══════════════════════════════════════════
  function initSpeedControl() {
    const slider = $('#speed-slider');
    const label = $('#speed-label');
    if (slider) {
      slider.addEventListener('input', () => {
        animSpeed = parseFloat(slider.value);
        if (label) label.textContent = `${animSpeed}x`;
      });
    }
  }

  // ══════════════════════════════════════════
  // Animation Engine
  // ══════════════════════════════════════════

  let paused = false;
  const activeAnimations = [];

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /**
   * Animate a glowing packet traveling through flow nodes inside a canvas.
   * Reads actual DOM positions (works with flexbox responsive layout).
   *
   * @param {string} canvasId - ID of the .flow-canvas element
   * @param {string[]} nodeIds - data-id values of nodes to traverse (in order)
   * @param {object} options - { label, duration, loop, packetClass, onStep, onComplete }
   * @returns {{ stop: Function }} handle to cancel
   */
  function animateFlow(canvasId, nodeIds, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return { stop() {} };

    // Collect nodes from data-id attributes
    const nodes = nodeIds.map(id => canvas.querySelector(`[data-id="${id}"]`)).filter(Boolean);
    if (nodes.length < 2) return { stop() {} };

    // Ensure positioning context
    canvas.style.position = 'relative';

    // Create packet element
    const packet = document.createElement('div');
    packet.className = `packet ${options.packetClass || ''}`;
    packet.style.display = 'none';
    canvas.appendChild(packet);

    // Optional label
    let labelEl = null;
    if (options.label) {
      labelEl = document.createElement('div');
      labelEl.className = 'packet-label';
      labelEl.textContent = options.label;
      canvas.appendChild(labelEl);
    }

    let cancelled = false;
    let currentSeg = 0;
    let startTime = null;
    const totalDuration = options.duration || 3000;
    const segDuration = totalDuration / (nodes.length - 1);

    function getNodeCenter(node) {
      const rect = node.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        x: rect.left - canvasRect.left + rect.width / 2 + canvas.scrollLeft,
        y: rect.top - canvasRect.top + rect.height / 2 + canvas.scrollTop,
      };
    }

    // Find arrow elements between consecutive nodes
    function getArrowBetween(nodeA, nodeB) {
      let el = nodeA.nextElementSibling;
      while (el && el !== nodeB) {
        if (el.classList.contains('flow-arrow')) return el;
        el = el.nextElementSibling;
      }
      return null;
    }

    function dimLitNodes() {
      nodes.forEach(n => {
        n.classList.remove('lit');
        n.classList.add('lit-fade');
        setTimeout(() => n.classList.remove('lit-fade'), 800);
      });
      // Clear active arrows
      canvas.querySelectorAll('.flow-arrow.active').forEach(a => a.classList.remove('active'));
    }

    function step(timestamp) {
      if (cancelled) return;
      if (paused) { startTime = null; requestAnimationFrame(step); return; }
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const effectiveDuration = segDuration / animSpeed;
      const t = Math.min(elapsed / effectiveDuration, 1);

      const from = getNodeCenter(nodes[currentSeg]);
      const to = getNodeCenter(nodes[currentSeg + 1]);

      const x = from.x + (to.x - from.x) * easeInOut(t);
      const y = from.y + (to.y - from.y) * easeInOut(t);

      packet.style.left = `${x - 4}px`;
      packet.style.top = `${y - 4}px`;
      packet.style.display = 'block';

      if (labelEl) {
        labelEl.style.left = `${x + 12}px`;
        labelEl.style.top = `${y - 14}px`;
        labelEl.style.display = 'block';
      }

      // Activate the arrow between current pair
      const arrow = getArrowBetween(nodes[currentSeg], nodes[currentSeg + 1]);
      if (arrow && t > 0.1) arrow.classList.add('active');

      // Highlight source node immediately
      if (t > 0.05) nodes[currentSeg].classList.add('lit');
      // Highlight target node near arrival
      if (t > 0.8) {
        nodes[currentSeg + 1].classList.add('lit');
        if (options.onStep) options.onStep(nodeIds[currentSeg + 1]);
      }

      if (t >= 1) {
        currentSeg++;
        startTime = null;

        if (currentSeg >= nodes.length - 1) {
          if (options.loop && !cancelled) {
            currentSeg = 0;
            setTimeout(() => {
              dimLitNodes();
              if (!cancelled) requestAnimationFrame(step);
            }, 1200);
          } else {
            // Keep lit for 2s then dim
            setTimeout(() => {
              dimLitNodes();
              cleanup();
              if (options.onComplete) options.onComplete();
            }, 2000);
          }
          return;
        }
      }

      requestAnimationFrame(step);
    }

    function cleanup() {
      if (packet.parentNode) packet.remove();
      if (labelEl && labelEl.parentNode) labelEl.remove();
      const idx = activeAnimations.indexOf(handle);
      if (idx !== -1) activeAnimations.splice(idx, 1);
    }

    const handle = {
      stop() {
        cancelled = true;
        dimLitNodes();
        cleanup();
      }
    };
    activeAnimations.push(handle);
    requestAnimationFrame(step);
    return handle;
  }

  /**
   * Animate a sequence of sub-flows one after another.
   * @param {Array<{canvasId: string, nodeIds: string[], options?: object}>} flows
   * @returns {{ stop: Function }}
   */
  function animateFlowSequence(flows, index) {
    if (index === undefined) index = 0;
    if (index >= flows.length) return { stop() {} };
    const f = flows[index];
    const opts = { ...(f.options || {}), loop: false };
    let handle;
    opts.onComplete = () => {
      handle = animateFlowSequence(flows, index + 1);
    };
    handle = animateFlow(f.canvasId, f.nodeIds, opts);
    return { stop() { if (handle) handle.stop(); } };
  }

  function stopAllAnimations() {
    while (activeAnimations.length) activeAnimations[0].stop();
  }

  // ══════════════════════════════════════════
  // Sub-flow Definitions (node IDs per canvas)
  // ══════════════════════════════════════════

  // We need data-id on nodes. renderFlow already sets data-id from node.id.
  // For nodes without explicit id, we'll use indices. But let's define flows
  // only for nodes that have id set in the init functions above.

  // We'll collect all flow definitions per section and wire play buttons.
  // For canvases where nodes don't have data-id, we auto-assign during render.

  // Section flow definitions — built after DOM render
  const sectionFlows = {};

  function collectFlowNodeIds(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return [];
    // Collect all nodes with data-id in DOM order (first row only for main flow)
    const firstRow = canvas.querySelector('.flow-row');
    if (!firstRow) return [];
    return [...firstRow.querySelectorAll('.flow-node[data-id]')].map(n => n.dataset.id);
  }

  function collectAllFlowNodeIds(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return [];
    return [...canvas.querySelectorAll('.flow-node[data-id]')].map(n => n.dataset.id);
  }

  function buildSectionFlows() {
    sectionFlows.boot = [
      { canvasId: 'boot-canvas', nodeIds: ['env-load','joi-validate','otel-init','boot-module','nest-create','apply-globals','connect-transport','ready'], options: { label: 'createApp()', duration: 4000 } },
      { canvasId: 'module-loading-canvas', nodeIds: collectAllFlowNodeIds('module-loading-canvas').slice(0, 8), options: { label: 'Module loading', duration: 3000 } },
    ];
    sectionFlows.request = [
      { canvasId: 'http-lifecycle-canvas', nodeIds: collectFlowNodeIds('http-lifecycle-canvas'), options: { label: 'GET /api/orders', duration: 5000 } },
      { canvasId: 'cache-paths-canvas', nodeIds: collectFlowNodeIds('cache-paths-canvas'), options: { duration: 2000 } },
      { canvasId: 'error-paths-canvas', nodeIds: collectAllFlowNodeIds('error-paths-canvas').slice(0, 4), options: { label: 'Error', duration: 2000, packetClass: 'error' } },
      { canvasId: 'validation-canvas', nodeIds: collectFlowNodeIds('validation-canvas'), options: { label: 'Validation', duration: 2500, packetClass: 'error' } },
      { canvasId: 'envelope-canvas', nodeIds: collectFlowNodeIds('envelope-canvas'), options: { label: 'Envelope', duration: 2000 } },
    ];
    sectionFlows.auth = [
      { canvasId: 'jwt-login-canvas', nodeIds: collectFlowNodeIds('jwt-login-canvas'), options: { label: 'JWT Login', duration: 3500, packetClass: 'success' } },
      { canvasId: 'jwt-refresh-canvas', nodeIds: collectFlowNodeIds('jwt-refresh-canvas'), options: { label: 'Refresh', duration: 3000 } },
      { canvasId: 'token-revoke-canvas', nodeIds: collectFlowNodeIds('token-revoke-canvas'), options: { label: 'Revoke check', duration: 2000 } },
      { canvasId: 'oauth-canvas', nodeIds: collectFlowNodeIds('oauth-canvas'), options: { label: 'OAuth2', duration: 4000 } },
      { canvasId: 'apikey-canvas', nodeIds: collectFlowNodeIds('apikey-canvas'), options: { label: 'API Key', duration: 2000 } },
      { canvasId: 'rbac-canvas', nodeIds: collectFlowNodeIds('rbac-canvas'), options: { label: 'RBAC', duration: 2000 } },
      { canvasId: 'session-canvas', nodeIds: collectFlowNodeIds('session-canvas'), options: { label: 'Session', duration: 2000 } },
      { canvasId: 'totp-canvas', nodeIds: collectFlowNodeIds('totp-canvas'), options: { label: '2FA', duration: 2500 } },
    ];
    sectionFlows.dbcache = [
      { canvasId: 'rw-split-canvas', nodeIds: collectFlowNodeIds('rw-split-canvas'), options: { label: 'R/W Split', duration: 2000 } },
      { canvasId: 'multi-conn-canvas', nodeIds: collectFlowNodeIds('multi-conn-canvas'), options: { duration: 2000 } },
      { canvasId: 'base-repo-canvas', nodeIds: collectFlowNodeIds('base-repo-canvas'), options: { label: 'CRUD', duration: 2000 } },
      { canvasId: 'cached-repo-canvas', nodeIds: collectFlowNodeIds('cached-repo-canvas'), options: { label: 'Cached Repo', duration: 2500 } },
      { canvasId: 'uow-canvas', nodeIds: collectFlowNodeIds('uow-canvas'), options: { label: 'UoW', duration: 2500 } },
      { canvasId: 'migration-canvas', nodeIds: collectFlowNodeIds('migration-canvas'), options: { label: 'Migration', duration: 3000 } },
      { canvasId: 'spec-canvas', nodeIds: collectFlowNodeIds('spec-canvas'), options: { label: 'Spec', duration: 3000 } },
      { canvasId: 'cache-lookup-canvas', nodeIds: collectFlowNodeIds('cache-lookup-canvas'), options: { label: 'Cache Lookup', duration: 2000 } },
      { canvasId: 'cache-write-canvas', nodeIds: collectFlowNodeIds('cache-write-canvas'), options: { label: 'Write-through', duration: 2000 } },
      { canvasId: 'stampede-canvas', nodeIds: collectFlowNodeIds('stampede-canvas'), options: { label: 'Stampede', duration: 2500 } },
      { canvasId: 'cache-warm-canvas', nodeIds: collectFlowNodeIds('cache-warm-canvas'), options: { label: 'Warming', duration: 3000, packetClass: 'success' } },
      { canvasId: 'tag-invalidate-canvas', nodeIds: collectFlowNodeIds('tag-invalidate-canvas'), options: { label: 'Invalidate', duration: 2000, packetClass: 'error' } },
      { canvasId: 'get-or-set-canvas', nodeIds: collectFlowNodeIds('get-or-set-canvas'), options: { label: 'getOrSet', duration: 2000 } },
    ];
    sectionFlows.transport = [
      { canvasId: 'grpc-lifecycle-canvas', nodeIds: collectFlowNodeIds('grpc-lifecycle-canvas'), options: { label: 'gRPC Call', duration: 5000 } },
      { canvasId: 'resilient-canvas', nodeIds: collectFlowNodeIds('resilient-canvas'), options: { label: 'Resilient', duration: 3000 } },
      { canvasId: 'inter-auth-canvas', nodeIds: collectFlowNodeIds('inter-auth-canvas'), options: { label: 'Auth Propagation', duration: 4000 } },
      { canvasId: 'rpc-error-canvas', nodeIds: collectFlowNodeIds('rpc-error-canvas'), options: { label: 'RPC Error', duration: 3000, packetClass: 'error' } },
    ];
    sectionFlows.events = [
      { canvasId: 'event-fanout-canvas', nodeIds: collectFlowNodeIds('event-fanout-canvas'), options: { label: 'Event Emit', duration: 2500 } },
      { canvasId: 'emit-wait-canvas', nodeIds: collectFlowNodeIds('emit-wait-canvas'), options: { label: 'emitAndWait', duration: 2500 } },
      { canvasId: 'cqrs-canvas', nodeIds: collectFlowNodeIds('cqrs-canvas'), options: { label: 'CQRS', duration: 3000 } },
      { canvasId: 'event-replay-canvas', nodeIds: collectFlowNodeIds('event-replay-canvas'), options: { label: 'Replay', duration: 2500 } },
      { canvasId: 'outbox-canvas', nodeIds: collectFlowNodeIds('outbox-canvas'), options: { label: 'Outbox', duration: 3000 } },
      { canvasId: 'saga-canvas', nodeIds: collectFlowNodeIds('saga-canvas'), options: { label: 'Saga', duration: 3000 } },
    ];
    sectionFlows.observe = [
      { canvasId: 'correlation-canvas', nodeIds: collectFlowNodeIds('correlation-canvas'), options: { label: 'Correlation ID', duration: 4000 } },
      { canvasId: 'tracing-canvas', nodeIds: collectFlowNodeIds('tracing-canvas'), options: { label: 'Tracing', duration: 3000 } },
      { canvasId: 'metrics-canvas', nodeIds: collectFlowNodeIds('metrics-canvas'), options: { label: 'Metrics', duration: 3500 } },
      { canvasId: 'logging-canvas', nodeIds: collectFlowNodeIds('logging-canvas'), options: { label: 'Logging', duration: 2500 } },
      { canvasId: 'error-reporting-canvas', nodeIds: collectFlowNodeIds('error-reporting-canvas'), options: { label: 'Error Report', duration: 2500, packetClass: 'error' } },
    ];
    sectionFlows.platform = [
      { canvasId: 'tenant-resolve-canvas', nodeIds: collectFlowNodeIds('tenant-resolve-canvas'), options: { label: 'Tenant', duration: 2500 } },
      { canvasId: 'row-isolation-canvas', nodeIds: collectFlowNodeIds('row-isolation-canvas'), options: { label: 'Row Isolation', duration: 2000 } },
      { canvasId: 'db-isolation-canvas', nodeIds: collectFlowNodeIds('db-isolation-canvas'), options: { label: 'DB Isolation', duration: 2500 } },
      { canvasId: 'file-upload-canvas', nodeIds: collectFlowNodeIds('file-upload-canvas'), options: { label: 'Upload', duration: 3000 } },
      { canvasId: 'webhook-canvas', nodeIds: collectFlowNodeIds('webhook-canvas'), options: { label: 'Webhook', duration: 3500 } },
      { canvasId: 'migration-cli-canvas', nodeIds: collectFlowNodeIds('migration-cli-canvas'), options: { label: 'Migrate CLI', duration: 3000 } },
      { canvasId: 'resource-gen-canvas', nodeIds: collectFlowNodeIds('resource-gen-canvas'), options: { label: 'Generate', duration: 2500 } },
      { canvasId: 'shutdown-canvas', nodeIds: collectFlowNodeIds('shutdown-canvas'), options: { label: 'Shutdown', duration: 4000, packetClass: 'error' } },
    ];
    sectionFlows.di = [
      { canvasId: 'circular-dep-canvas', nodeIds: collectFlowNodeIds('circular-dep-canvas'), options: { label: 'Circular Dep', duration: 2500, packetClass: 'error' } },
      { canvasId: 'contract-canvas', nodeIds: collectFlowNodeIds('contract-canvas'), options: { label: 'Contract', duration: 2500 } },
      { canvasId: 'module-graph-canvas', nodeIds: collectFlowNodeIds('module-graph-canvas'), options: { label: 'Graph Analysis', duration: 3000 } },
      { canvasId: 'layer-validate-canvas', nodeIds: collectFlowNodeIds('layer-validate-canvas'), options: { label: 'Layer Check', duration: 2500 } },
    ];
  }

  // Add play buttons to every sub-flow title + "Play All" per section
  function addPlayButtons() {
    // Per sub-flow: add individual play button
    document.querySelectorAll('.sub-flow').forEach(sf => {
      const canvas = sf.querySelector('.flow-canvas');
      if (!canvas || !canvas.id) return;
      const titleEl = sf.querySelector('.sub-flow-title');
      if (!titleEl) return;

      const btn = document.createElement('button');
      btn.className = 'play-btn';
      btn.textContent = '\u25B6 Play';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeIds = collectFlowNodeIds(canvas.id);
        if (nodeIds.length < 2) return;
        // Find matching flow def for label/options
        let opts = { duration: 3000 };
        for (const secKey in sectionFlows) {
          const match = sectionFlows[secKey].find(f => f.canvasId === canvas.id);
          if (match) { opts = { ...match.options }; break; }
        }
        animateFlow(canvas.id, nodeIds, opts);
      });
      titleEl.appendChild(btn);
    });

    // Per section: add "Play All" button
    document.querySelectorAll('.flow-section').forEach(section => {
      const sectionId = section.id.replace('section-', '');
      if (sectionId === 'deps') return; // Module map has no packet animation
      const flows = sectionFlows[sectionId];
      if (!flows || flows.length === 0) return;

      const titleEl = section.querySelector('.section-title');
      if (!titleEl) return;
      const btn = document.createElement('button');
      btn.className = 'play-btn';
      btn.textContent = '\u25B6 Play All';
      btn.style.fontSize = '.75rem';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopAllAnimations();
        animateFlowSequence(flows, 0);
      });
      titleEl.appendChild(btn);
    });
  }

  // Auto-play first sub-flow on tab switch
  function initTabAutoPlay() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        if (tabId === 'deps') return;
        stopAllAnimations();
        const flows = sectionFlows[tabId];
        if (flows && flows.length > 0) {
          // Small delay for section fade-in
          setTimeout(() => {
            const f = flows[0];
            animateFlow(f.canvasId, f.nodeIds, { ...f.options, loop: false });
          }, 400);
        }
      });
    });
  }

  // Pause button
  function initPauseButton() {
    const btn = document.getElementById('pause-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      paused = !paused;
      btn.textContent = paused ? '\u25B6 Resume' : '\u23F8 Pause';
      btn.classList.toggle('active', paused);
    });
  }

  // ══════════════════════════════════════════
  // Init
  // ══════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();

    // Detail panel
    $('.detail-overlay').addEventListener('click', closeDetail);
    $('.close-btn', $('.detail-panel')).addEventListener('click', closeDetail);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

    initSpeedControl();

    // Render all sections
    initBootSection();
    initRequestSection();
    initAuthSection();
    initDbCacheSection();
    initTransportSection();
    initEventsSection();
    initObserveSection();
    initPlatformSection();
    initDiSection();
    initDependencyMap();

    // Build flow definitions after all sections are rendered
    buildSectionFlows();
    addPlayButtons();
    initTabAutoPlay();
    initPauseButton();

    // Auto-play boot section on load
    setTimeout(() => {
      const bootFlows = sectionFlows.boot;
      if (bootFlows && bootFlows.length > 0) {
        animateFlow(bootFlows[0].canvasId, bootFlows[0].nodeIds, { ...bootFlows[0].options, loop: false });
      }
    }, 600);
  });
})();
