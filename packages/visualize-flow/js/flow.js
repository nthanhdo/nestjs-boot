/* ============================================
   nestjs-boot Visualize Flow — Interactivity
   ============================================ */

(function () {
  'use strict';

  // ── State ──
  let activeTab = 'boot';
  let animSpeed = 1;
  let animRunning = true;
  let activeAnimations = [];

  // ── DOM helpers ──
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];

  // ── Tab switching ──
  function initTabs() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.tab;
        if (id === activeTab) return;
        activeTab = id;
        $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
        $$('.flow-section').forEach(s => s.classList.toggle('active', s.id === `section-${id}`));
        stopAllAnimations();
        startSectionAnimation(id);
      });
    });
  }

  // ── Detail panel ──
  const detailData = {
    'env-load':     { title: '.env Load', desc: 'Reads .env files using dotenv. Supports .env, .env.local, .env.{NODE_ENV}. Variables available via ConfigService.', code: 'ConfigModule.forRoot({\n  envFilePath: [".env.local", ".env"],\n  isGlobal: true,\n})' },
    'joi-validate': { title: 'Joi Validation', desc: 'Validates ALL environment variables at startup. App refuses to boot if required vars are missing — fail fast, not at runtime.', code: 'validationSchema: Joi.object({\n  DATABASE_URL: Joi.string().required(),\n  REDIS_URL: Joi.string().optional(),\n  PORT: Joi.number().default(3000),\n})' },
    'otel-init':    { title: 'OpenTelemetry Init', desc: 'Initializes tracing SDK before NestJS boots. Spans, metrics, and logs are collected from the first request.', code: 'OTelModule.forRoot({\n  serviceName: "order-service",\n  exporter: "otlp",\n  endpoint: "http://jaeger:4318",\n})' },
    'boot-module':  { title: 'Build BootModule', desc: 'BootModule composes all feature modules based on config flags. If database=false, DatabaseModule is excluded entirely — zero overhead.', code: 'BootModule.register({\n  database: true,\n  cache: true,\n  auth: true,\n  events: true,\n  grpc: false,\n  cqrs: false,\n})' },
    'nest-create':  { title: 'NestFactory.create()', desc: 'Creates the NestJS application instance with the composed BootModule. Logger, CORS, and platform adapter configured here.', code: 'const app = await NestFactory.create(\n  BootModule,\n  { logger: otelLogger }\n);' },
    'apply-globals':{ title: 'Apply Globals', desc: 'Registers global pipes (validation), filters (exception), interceptors (timeout, transform), and guards (auth, RBAC).', code: 'app.useGlobalPipes(new ValidationPipe());\napp.useGlobalFilters(new AllExceptionsFilter());\napp.useGlobalInterceptors(\n  new TimeoutInterceptor(),\n  new TransformInterceptor(),\n);' },
    'connect-transport': { title: 'Connect Transports', desc: 'Connects microservice transports — gRPC, Redis, NATS. Each transport gets its own correlation ID propagation.', code: 'app.connectMicroservice({\n  transport: Transport.GRPC,\n  options: {\n    url: "0.0.0.0:5000",\n    package: "order",\n    protoPath: "order.proto",\n  },\n});' },
    'ready':        { title: 'Ready!', desc: 'Application is listening. Health endpoints active. Readiness probe returns 200. Boot time logged via OTel span.', code: 'await app.startAllMicroservices();\nawait app.listen(PORT);\n// Ready in 847ms' },
    'correlation':  { title: 'Correlation ID', desc: 'Every request gets a unique correlation ID (UUID v4). Propagated through all downstream calls, logs, and events for full traceability.', code: '@Injectable()\nexport class CorrelationInterceptor {\n  intercept(ctx, next) {\n    const id = ctx.getRequest().headers["x-correlation-id"]\n      ?? randomUUID();\n    CorrelationService.set(id);\n    return next.handle();\n  }\n}' },
    'auth-guard':   { title: 'Auth Guard', desc: 'JWT validation guard. Extracts and verifies Bearer token. Attaches decoded user to request context. 401 on invalid/expired token.', code: '@Injectable()\nexport class JwtAuthGuard extends AuthGuard("jwt") {\n  canActivate(context) {\n    return super.canActivate(context);\n  }\n}' },
    'rbac-guard':   { title: 'RBAC Guard', desc: 'Role-based access control. Checks user roles against route requirements. @Roles("admin", "manager") decorator defines access.', code: '@Roles("admin", "manager")\n@UseGuards(RbacGuard)\n@Get("orders")\nasync findAll() { ... }' },
    'timeout':      { title: 'Timeout Interceptor', desc: 'Wraps handler in a timeout (default 30s). Returns 408 if exceeded. Configurable per-route via @Timeout() decorator.', code: '@Injectable()\nexport class TimeoutInterceptor {\n  intercept(ctx, next) {\n    const ms = reflector.get(TIMEOUT_KEY) ?? 30000;\n    return next.handle().pipe(\n      timeout(ms),\n      catchError(err =>\n        err instanceof TimeoutError\n          ? throwError(() => new RequestTimeoutException())\n          : throwError(() => err)\n      ),\n    );\n  }\n}' },
    'controller':   { title: 'Controller', desc: 'Route handler. Validates DTO via class-validator, delegates to service layer. Returns raw data — envelope interceptor wraps it.', code: '@Post()\nasync create(@Body() dto: CreateOrderDto) {\n  return this.orderService.create(dto);\n}' },
    'service':      { title: 'Service', desc: 'Business logic layer. Orchestrates cache, database, events. Transactional when needed. Returns domain objects.', code: '@Injectable()\nexport class OrderService {\n  async create(dto: CreateOrderDto) {\n    const order = await this.repo.save(dto);\n    this.eventBus.emit(new OrderCreated(order));\n    await this.cache.del("orders:list");\n    return order;\n  }\n}' },
    'cache-check':  { title: 'Cache Layer', desc: 'Redis-backed cache with TTL. @Cacheable() decorator for automatic cache-aside pattern. Invalidation via @CacheEvict().', code: '@Cacheable({ key: "order:{id}", ttl: 300 })\nasync findOne(id: string) {\n  return this.repo.findById(id);\n}\n\n@CacheEvict({ key: "order:{id}" })\nasync update(id, dto) { ... }' },
    'database':     { title: 'Database', desc: 'MongoDB via Mongoose or PostgreSQL via TypeORM/Prisma. Connection pooling, read replicas, and query logging built in.', code: '@InjectModel(Order)\nprivate orderModel: Model<Order>;\n\nasync findById(id: string) {\n  return this.orderModel\n    .findById(id)\n    .lean()\n    .exec();\n}' },
    'envelope':     { title: 'Response Envelope', desc: 'Wraps all responses in a standard envelope: { success, data, meta, timestamp, correlationId }. Consistent API contract.', code: '{\n  "success": true,\n  "data": { "id": "ord_123", ... },\n  "meta": { "page": 1, "total": 42 },\n  "timestamp": "2026-08-06T...",\n  "correlationId": "uuid-here"\n}' },
    'event-emit':   { title: 'Event Emission', desc: 'Service emits domain event via EventBus. Event carries full payload + metadata (correlationId, timestamp, causationId).', code: 'this.eventBus.emit(\n  new OrderCreatedEvent({\n    orderId: order.id,\n    items: order.items,\n    total: order.total,\n  })\n);' },
    'event-handler':{ title: '@OnEvent Handler', desc: 'Subscribers listen via @OnEvent decorator. Each handler runs independently — one failure does not block others.', code: '@OnEvent("order.created")\nasync handleOrderCreated(event: OrderCreatedEvent) {\n  await this.sendConfirmation(event.orderId);\n}' },
    'grpc-client':  { title: 'ServiceClient<T>', desc: 'Type-safe gRPC client. Auto-generated from .proto files. Correlation ID and auth token injected into gRPC metadata automatically.', code: '@Injectable()\nexport class ProductClient {\n  @GrpcClient("PRODUCT_PACKAGE")\n  private client: ProductServiceClient;\n\n  findOne(id: string) {\n    return this.client.findOne({ id });\n  }\n}' },
    'grpc-handler': { title: 'RPC Handler', desc: 'Server-side gRPC handler. Receives call with metadata, processes request, returns typed response. Interceptors apply here too.', code: '@GrpcMethod("ProductService", "FindOne")\nasync findOne(data: ProductById, metadata: Metadata) {\n  const correlationId = metadata.get("x-correlation-id")[0];\n  return this.productService.findOne(data.id);\n}' },
    'command-bus':  { title: 'CommandBus', desc: 'Dispatches commands to their respective handlers. Commands are imperative — "CreateOrder", "UpdateInventory". One command = one handler.', code: 'await this.commandBus.execute(\n  new CreateOrderCommand({\n    userId: user.id,\n    items: dto.items,\n  })\n);' },
    'cmd-handler':  { title: 'Command Handler', desc: 'Handles a specific command. Loads aggregate, applies business rules, emits domain events. Transactional boundary.', code: '@CommandHandler(CreateOrderCommand)\nexport class CreateOrderHandler {\n  async execute(cmd: CreateOrderCommand) {\n    const order = new OrderAggregate();\n    order.create(cmd.userId, cmd.items);\n    await this.repo.save(order);\n  }\n}' },
    'aggregate':    { title: 'AggregateRoot', desc: 'Domain object that applies events to itself. Events are uncommitted until persisted. Enforces invariants before applying.', code: 'export class OrderAggregate extends AggregateRoot {\n  create(userId, items) {\n    this.apply(new OrderCreatedEvent({\n      orderId: this.id,\n      userId, items,\n      version: this.version + 1,\n    }));\n  }\n}' },
    'event-store':  { title: 'EventStore', desc: 'Append-only log of domain events. Each event is immutable with a version number. Source of truth for aggregate state.', code: 'await this.eventStore.append({\n  streamId: `order-${orderId}`,\n  events: aggregate.getUncommittedEvents(),\n  expectedVersion: aggregate.version,\n});' },
    'projection':   { title: 'Projection (Read Model)', desc: 'Builds denormalized read models from events. Optimized for queries. Eventually consistent with write side.', code: '@EventHandler(OrderCreatedEvent)\nasync project(event: OrderCreatedEvent) {\n  await this.readDb.upsert({\n    id: event.orderId,\n    status: "created",\n    total: event.total,\n    updatedAt: event.timestamp,\n  });\n}' },
    'outbox':       { title: 'Outbox Pattern', desc: 'Events persisted alongside aggregate in same transaction. Background poller publishes to message broker. Guarantees at-least-once delivery.', code: '// Same transaction:\nawait session.withTransaction(async () => {\n  await this.repo.save(order);\n  await this.outbox.insert(events);\n});\n// Poller:\nconst pending = await this.outbox.findPending();\nawait this.broker.publish(pending);\nawait this.outbox.markPublished(pending);' },
    'snapshot':     { title: 'Snapshot', desc: 'Periodically saves aggregate state to avoid replaying all events. Loaded on aggregate reconstruction, then replays only events after snapshot.', code: 'if (aggregate.version % 50 === 0) {\n  await this.snapshotStore.save({\n    streamId: aggregate.id,\n    version: aggregate.version,\n    state: aggregate.toSnapshot(),\n  });\n}' },
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

  function initDetailPanel() {
    $('.detail-overlay').addEventListener('click', closeDetail);
    $('.close-btn', $('.detail-panel')).addEventListener('click', closeDetail);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });
  }

  // ── Animation engine ──
  function stopAllAnimations() {
    activeAnimations.forEach(id => cancelAnimationFrame(id));
    activeAnimations = [];
    $$('.packet').forEach(p => p.remove());
    $$('.packet-label').forEach(l => l.remove());
    $$('.flow-node.lit').forEach(n => n.classList.remove('lit'));
    $$('.ripple').forEach(r => r.remove());
    // Reset connector glow
    $$('.connector-path.glow').forEach(p => p.classList.remove('glow'));
  }

  function animatePacketAlongNodes(canvas, nodeIds, options = {}) {
    const {
      packetClass = '',
      label = '',
      duration = 2000,
      onStep = null,
      loop = true,
      onComplete = null,
    } = options;

    const packet = createPacket(canvas);
    const labelEl = createPacketLabel(canvas);

    if (packetClass) { packet.className = `packet moving ${packetClass}`; }
    else { packet.className = 'packet moving'; }
    if (label) { labelEl.textContent = label; labelEl.classList.add('visible'); }

    const nodes = nodeIds.map(id => canvas.querySelector(`[data-id="${id}"]`)).filter(Boolean);
    if (nodes.length < 2) return;

    const positions = nodes.map(n => ({
      x: n.offsetLeft + n.offsetWidth / 2,
      y: n.offsetTop + n.offsetHeight / 2,
    }));

    let seg = 0;
    const segDur = (duration / (positions.length - 1)) / animSpeed;
    let startTime = null;

    function step(ts) {
      if (!animRunning) { const id = requestAnimationFrame(step); activeAnimations.push(id); return; }
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const t = Math.min(elapsed / segDur, 1);

      const from = positions[seg];
      const to = positions[seg + 1];
      const x = from.x + (to.x - from.x) * easeInOut(t);
      const y = from.y + (to.y - from.y) * easeInOut(t);

      packet.style.left = `${x - 5}px`;
      packet.style.top = `${y - 5}px`;
      labelEl.style.left = `${x + 10}px`;
      labelEl.style.top = `${y - 18}px`;

      // Glow the connector path segment
      glowConnectorSegment(canvas, nodeIds[seg], nodeIds[seg + 1]);

      // Light up current target node
      if (t > 0.5) {
        const targetNode = nodes[seg + 1];
        if (targetNode && !targetNode.classList.contains('lit')) {
          targetNode.classList.add('lit');
          if (onStep) onStep(seg + 1, nodeIds[seg + 1]);
        }
      }

      if (t >= 1) {
        seg++;
        startTime = null;
        if (seg >= positions.length - 1) {
          if (onComplete) onComplete();
          if (loop) {
            seg = 0;
            nodes.forEach(n => n.classList.remove('lit'));
            unglowAll(canvas);
            setTimeout(() => {
              const id = requestAnimationFrame(step);
              activeAnimations.push(id);
            }, 1000 / animSpeed);
            return;
          } else {
            packet.remove();
            labelEl.remove();
            return;
          }
        }
      }

      const id = requestAnimationFrame(step);
      activeAnimations.push(id);
    }

    const id = requestAnimationFrame(step);
    activeAnimations.push(id);
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function createPacket(canvas) {
    const el = document.createElement('div');
    el.className = 'packet';
    canvas.appendChild(el);
    return el;
  }
  function createPacketLabel(canvas) {
    const el = document.createElement('div');
    el.className = 'packet-label';
    canvas.appendChild(el);
    return el;
  }

  // ── SVG Connector System ──
  function getNodeCenter(canvas, id) {
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (!el) return null;
    return {
      x: el.offsetLeft + el.offsetWidth / 2,
      y: el.offsetTop + el.offsetHeight / 2,
      left: el.offsetLeft,
      right: el.offsetLeft + el.offsetWidth,
      top: el.offsetTop,
      bottom: el.offsetTop + el.offsetHeight,
      w: el.offsetWidth,
      h: el.offsetHeight,
    };
  }

  function getAnchor(fromRect, toRect) {
    // Determine best anchor points (right->left for horizontal, bottom->top for vertical)
    const dx = toRect.x - fromRect.x;
    const dy = toRect.y - fromRect.y;

    let fx, fy, tx, ty;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal flow
      if (dx > 0) {
        fx = fromRect.right; fy = fromRect.y;
        tx = toRect.left; ty = toRect.y;
      } else {
        fx = fromRect.left; fy = fromRect.y;
        tx = toRect.right; ty = toRect.y;
      }
    } else {
      // Vertical flow
      if (dy > 0) {
        fx = fromRect.x; fy = fromRect.bottom;
        tx = toRect.x; ty = toRect.top;
      } else {
        fx = fromRect.x; fy = fromRect.top;
        tx = toRect.x; ty = toRect.bottom;
      }
    }
    return { fx, fy, tx, ty };
  }

  function makeBezierPath(fx, fy, tx, ty) {
    const dx = tx - fx;
    const dy = ty - fy;
    const cx = Math.abs(dx) * 0.4;
    const cy = Math.abs(dy) * 0.4;

    let c1x, c1y, c2x, c2y;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominant
      c1x = fx + cx; c1y = fy;
      c2x = tx - cx; c2y = ty;
    } else {
      // Vertical dominant
      c1x = fx; c1y = fy + cy;
      c2x = tx; c2y = ty - cy;
    }
    return `M ${fx},${fy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
  }

  function ensureSvg(canvas) {
    let svg = canvas.querySelector('svg.connectors');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('connectors');
      canvas.insertBefore(svg, canvas.firstChild);
    }
    return svg;
  }

  function ensureDefs(svg) {
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.prepend(defs);

      // Arrow marker — default (slate)
      addArrowMarker(defs, 'arrow', 'rgba(100,116,139,0.6)');
      // Arrow marker — brand (blue)
      addArrowMarker(defs, 'arrow-brand', '#0ea5e9');
      // Arrow marker — green
      addArrowMarker(defs, 'arrow-green', '#10b981');
      // Arrow marker — yellow
      addArrowMarker(defs, 'arrow-yellow', '#f59e0b');
      // Arrow marker — pink (event)
      addArrowMarker(defs, 'arrow-pink', '#ec4899');
      // Arrow marker — red (return)
      addArrowMarker(defs, 'arrow-red', '#ef4444');
      // Arrow marker — purple
      addArrowMarker(defs, 'arrow-purple', '#8b5cf6');
      // Arrow marker — teal
      addArrowMarker(defs, 'arrow-teal', '#14b8a6');
      // Arrow marker — cqrs
      addArrowMarker(defs, 'arrow-cqrs', '#6366f1');
    }
    return defs;
  }

  function addArrowMarker(defs, id, color) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('orient', 'auto-start-reverse');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0,1 10,5 0,9');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    defs.appendChild(marker);
  }

  function createPath(svg, d, cssClass, arrowId, dataFrom, dataTo) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `connector-path ${cssClass}`);
    path.setAttribute('marker-end', `url(#${arrowId || 'arrow'})`);
    if (dataFrom) path.setAttribute('data-from', dataFrom);
    if (dataTo) path.setAttribute('data-to', dataTo);
    svg.appendChild(path);
    return path;
  }

  function glowConnectorSegment(canvas, fromId, toId) {
    const svg = canvas.querySelector('svg.connectors');
    if (!svg) return;
    const paths = svg.querySelectorAll('.connector-path');
    paths.forEach(p => {
      if (p.getAttribute('data-from') === fromId && p.getAttribute('data-to') === toId) {
        p.classList.add('glow');
      }
    });
  }

  function unglowAll(canvas) {
    const svg = canvas.querySelector('svg.connectors');
    if (!svg) return;
    svg.querySelectorAll('.connector-path.glow').forEach(p => p.classList.remove('glow'));
  }

  /**
   * drawFlowPaths — the main connector drawing function.
   * connections: Array of { from, to, type, arrow, cssClass }
   *   type: 'solid' | 'return' | 'optional' | 'fan-out' | 'branch-upper' | 'branch-lower'
   *   arrow: marker id (default 'arrow')
   */
  function drawFlowPaths(canvas, connections) {
    const svg = ensureSvg(canvas);
    ensureDefs(svg);

    // Clear old paths (keep defs)
    svg.querySelectorAll('.connector-path').forEach(p => p.remove());

    requestAnimationFrame(() => {
      connections.forEach(conn => {
        const targets = Array.isArray(conn.to) ? conn.to : [conn.to];
        targets.forEach(toId => {
          const fromRect = getNodeCenter(canvas, conn.from);
          const toRect = getNodeCenter(canvas, toId);
          if (!fromRect || !toRect) return;

          const { fx, fy, tx, ty } = getAnchor(fromRect, toRect);
          const d = makeBezierPath(fx, fy, tx, ty);
          const cssClass = conn.cssClass || conn.type || '';
          const arrowId = conn.arrow || 'arrow';
          createPath(svg, d, cssClass, arrowId, conn.from, toId);
        });
      });
    });
  }

  // ── Section: Boot Sequence ──
  function initBootSequence() {
    const canvas = $('#boot-canvas');
    if (!canvas) return;

    const steps = [
      { id: 'env-load', icon: '📄', label: '.env Load', timing: '~12ms', cat: 'core', x: 50, y: 180 },
      { id: 'joi-validate', icon: '✅', label: 'Joi Validate', timing: '~8ms', cat: 'core', x: 200, y: 180 },
      { id: 'otel-init', icon: '📡', label: 'OTel Init', timing: '~45ms', cat: 'observe', x: 350, y: 180 },
      { id: 'boot-module', icon: '📦', label: 'BootModule', timing: '~120ms', cat: 'core', x: 500, y: 180 },
      { id: 'nest-create', icon: '🏗️', label: 'NestFactory', timing: '~350ms', cat: 'core', x: 650, y: 180 },
      { id: 'apply-globals', icon: '🌐', label: 'Globals', timing: '~15ms', cat: 'auth', x: 800, y: 180 },
      { id: 'connect-transport', icon: '🔌', label: 'Transports', timing: '~200ms', cat: 'transport', x: 950, y: 180 },
      { id: 'ready', icon: '🚀', label: 'Ready!', timing: '~847ms total', cat: 'success', x: 1100, y: 180 },
    ];

    const optionalModules = [
      { id: 'db-module', label: 'DatabaseModule', cat: 'database', toggle: 'boot-db', x: 420, y: 60 },
      { id: 'cache-module', label: 'CacheModule', cat: 'cache', toggle: 'boot-cache', x: 560, y: 60 },
      { id: 'auth-module', label: 'AuthModule', cat: 'auth', toggle: 'boot-auth', x: 420, y: 300 },
      { id: 'event-module', label: 'EventModule', cat: 'event', toggle: 'boot-events', x: 560, y: 300 },
      { id: 'grpc-module', label: 'GrpcModule', cat: 'transport', toggle: 'boot-grpc', x: 700, y: 60 },
      { id: 'cqrs-module', label: 'CQRSModule', cat: 'cqrs', toggle: 'boot-cqrs', x: 700, y: 300 },
    ];

    renderNodes(canvas, steps);
    renderOptionalNodes(canvas, optionalModules);

    // Build connections
    function rebuildBootConnections() {
      const conns = [];
      // Main chain
      for (let i = 0; i < steps.length - 1; i++) {
        conns.push({ from: steps[i].id, to: steps[i + 1].id, arrow: 'arrow-brand' });
      }
      // Optional module connections to boot-module
      optionalModules.forEach(m => {
        const cb = $(`#${m.toggle}`);
        if (cb && cb.checked) {
          conns.push({
            from: m.id,
            to: 'boot-module',
            type: 'optional-path',
            arrow: m.cat === 'database' ? 'arrow-green' :
                   m.cat === 'cache' ? 'arrow-yellow' :
                   m.cat === 'auth' ? 'arrow-purple' :
                   m.cat === 'event' ? 'arrow-pink' :
                   m.cat === 'transport' ? 'arrow-teal' :
                   m.cat === 'cqrs' ? 'arrow-cqrs' : 'arrow',
          });
        }
      });
      drawFlowPaths(canvas, conns);
    }

    rebuildBootConnections();

    // Toggle handlers
    optionalModules.forEach(m => {
      const cb = $(`#${m.toggle}`);
      if (cb) {
        cb.addEventListener('change', () => {
          const node = canvas.querySelector(`[data-id="${m.id}"]`);
          if (node) node.style.display = cb.checked ? 'block' : 'none';
          rebuildBootConnections();
        });
      }
    });

    steps.forEach(s => {
      const node = canvas.querySelector(`[data-id="${s.id}"]`);
      if (node) node.addEventListener('click', () => openDetail(s.id));
    });

    const playBtn = $('#boot-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        const bar = $('.boot-progress-bar');
        if (bar) bar.style.width = '0';
        rebuildBootConnections();
        animateBootSequence(canvas, steps, bar);
      });
    }
  }

  function animateBootSequence(canvas, steps, progressBar) {
    const ids = steps.map(s => s.id);
    const total = ids.length;
    animatePacketAlongNodes(canvas, ids, {
      label: 'createApp()',
      duration: 4000,
      loop: true,
      onStep: (idx) => {
        if (progressBar) {
          progressBar.style.width = `${((idx + 1) / total) * 100}%`;
        }
      },
    });
  }

  // ── Section: Request Flow ──
  function initRequestFlow() {
    const canvas = $('#request-canvas');
    if (!canvas) return;

    const nodes = [
      { id: 'req-client', icon: '👤', label: 'Client', cat: 'core', x: 30, y: 180 },
      { id: 'correlation', icon: '🔗', label: 'Correlation ID', cat: 'observe', x: 150, y: 180 },
      { id: 'auth-guard', icon: '🔒', label: 'Auth Guard', cat: 'auth', x: 280, y: 180 },
      { id: 'rbac-guard', icon: '🛡️', label: 'RBAC Guard', cat: 'auth', x: 400, y: 180 },
      { id: 'timeout', icon: '⏱️', label: 'Timeout', cat: 'observe', x: 520, y: 180 },
      { id: 'controller', icon: '🎯', label: 'Controller', cat: 'core', x: 640, y: 180 },
      { id: 'service', icon: '⚙️', label: 'Service', cat: 'core', x: 760, y: 180 },
      { id: 'req-decision', icon: '?', label: 'Cache?', cat: 'decision', x: 870, y: 180 },
      { id: 'cache-check', icon: '💨', label: 'Cache', cat: 'cache', x: 970, y: 90 },
      { id: 'database', icon: '🗄️', label: 'Database', cat: 'database', x: 970, y: 270 },
      { id: 'envelope', icon: '📨', label: 'Envelope', cat: 'core', x: 1070, y: 180 },
      { id: 'res-client', icon: '👤', label: 'Response', cat: 'success', x: 1170, y: 180 },
    ];

    renderNodes(canvas, nodes);

    function rebuildRequestPaths(cacheHit) {
      const conns = [
        // Main pipeline
        { from: 'req-client', to: 'correlation', arrow: 'arrow-brand' },
        { from: 'correlation', to: 'auth-guard', arrow: 'arrow-brand' },
        { from: 'auth-guard', to: 'rbac-guard', arrow: 'arrow-purple' },
        { from: 'rbac-guard', to: 'timeout', arrow: 'arrow-brand' },
        { from: 'timeout', to: 'controller', arrow: 'arrow-brand' },
        { from: 'controller', to: 'service', arrow: 'arrow-brand' },
        { from: 'service', to: 'req-decision', arrow: 'arrow-brand' },
        // Branch: cache (upper)
        { from: 'req-decision', to: 'cache-check', cssClass: 'branch-upper', arrow: 'arrow-green' },
        // Branch: database (lower)
        { from: 'req-decision', to: 'database', cssClass: 'branch-lower', arrow: 'arrow-yellow' },
        // Rejoin
        { from: 'cache-check', to: 'envelope', cssClass: 'branch-upper', arrow: 'arrow-green' },
        { from: 'database', to: 'envelope', cssClass: 'branch-lower', arrow: 'arrow-yellow' },
        // Continue
        { from: 'envelope', to: 'res-client', arrow: 'arrow-green' },
        // Return path
        { from: 'res-client', to: 'req-client', type: 'return-path', arrow: 'arrow-red' },
      ];
      drawFlowPaths(canvas, conns);
    }

    rebuildRequestPaths(false);

    nodes.forEach(s => {
      const node = canvas.querySelector(`[data-id="${s.id}"]`);
      if (node) node.addEventListener('click', () => openDetail(s.id));
    });

    const cacheToggle = $('#req-cache-hit');
    const errorToggle = $('#req-error');

    if (cacheToggle) {
      cacheToggle.addEventListener('change', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        rebuildRequestPaths(cacheToggle.checked);
        startRequestAnimation(canvas, cacheToggle.checked);
      });
    }

    if (errorToggle) {
      errorToggle.addEventListener('change', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        if (errorToggle.checked) {
          rebuildRequestPaths(false);
          animatePacketAlongNodes(canvas, ['req-client', 'correlation', 'auth-guard'], {
            packetClass: 'error', label: '401 Unauthorized', duration: 1500, loop: true,
          });
        } else {
          rebuildRequestPaths(cacheToggle?.checked);
          startRequestAnimation(canvas, cacheToggle?.checked);
        }
      });
    }

    const playBtn = $('#req-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        rebuildRequestPaths(cacheToggle?.checked);
        startRequestAnimation(canvas, cacheToggle?.checked);
      });
    }
  }

  function startRequestAnimation(canvas, cacheHit) {
    const path = cacheHit
      ? ['req-client', 'correlation', 'auth-guard', 'rbac-guard', 'timeout', 'controller', 'service', 'req-decision', 'cache-check', 'envelope', 'res-client']
      : ['req-client', 'correlation', 'auth-guard', 'rbac-guard', 'timeout', 'controller', 'service', 'req-decision', 'database', 'envelope', 'res-client'];
    const label = cacheHit ? 'GET /orders (cache hit)' : 'GET /orders (cache miss)';
    animatePacketAlongNodes(canvas, path, {
      packetClass: 'success', label, duration: 5000, loop: true,
    });
  }

  // ── Section: Event Flow ──
  function initEventFlow() {
    const canvas = $('#event-canvas');
    if (!canvas) return;

    const nodes = [
      { id: 'event-source', icon: '⚙️', label: 'OrderService.create()', cat: 'core', x: 80, y: 200 },
      { id: 'event-bus', icon: '📢', label: 'EventBus.emit()', cat: 'event', x: 350, y: 200 },
      { id: 'evt-notification', icon: '📧', label: 'NotificationService', cat: 'transport', x: 650, y: 70 },
      { id: 'evt-fulfillment', icon: '📦', label: 'FulfillmentService', cat: 'core', x: 650, y: 200 },
      { id: 'evt-analytics', icon: '📊', label: 'AnalyticsService', cat: 'observe', x: 650, y: 330 },
    ];

    renderNodes(canvas, nodes);

    // Draw all connectors: source -> bus, bus -> 3 subscribers
    const conns = [
      { from: 'event-source', to: 'event-bus', arrow: 'arrow-pink' },
      { from: 'event-bus', to: 'evt-notification', cssClass: 'fan-out', arrow: 'arrow-teal' },
      { from: 'event-bus', to: 'evt-fulfillment', cssClass: 'fan-out', arrow: 'arrow-brand' },
      { from: 'event-bus', to: 'evt-analytics', cssClass: 'fan-out', arrow: 'arrow-yellow' },
    ];
    drawFlowPaths(canvas, conns);

    nodes.forEach(s => {
      const node = canvas.querySelector(`[data-id="${s.id}"]`);
      if (node) node.addEventListener('click', () => openDetail(s.id === 'event-source' ? 'event-emit' : s.id === 'event-bus' ? 'event-emit' : 'event-handler'));
    });

    const playBtn = $('#event-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        startEventAnimation(canvas);
      });
    }
  }

  function startEventAnimation(canvas) {
    animatePacketAlongNodes(canvas, ['event-source', 'event-bus'], {
      label: 'OrderCreatedEvent', duration: 1200, loop: false,
      onComplete: () => {
        const busNode = canvas.querySelector('[data-id="event-bus"]');
        if (busNode) {
          const ripple = document.createElement('div');
          ripple.className = 'ripple';
          ripple.style.left = `${busNode.offsetLeft + busNode.offsetWidth / 2}px`;
          ripple.style.top = `${busNode.offsetTop + busNode.offsetHeight / 2}px`;
          canvas.appendChild(ripple);
          setTimeout(() => ripple.remove(), 1200);
        }

        const targets = ['evt-notification', 'evt-fulfillment', 'evt-analytics'];
        targets.forEach((t, i) => {
          setTimeout(() => {
            const p = createPacket(canvas);
            p.className = 'packet moving';

            const from = canvas.querySelector('[data-id="event-bus"]');
            const to = canvas.querySelector(`[data-id="${t}"]`);
            if (!from || !to) return;

            const fx = from.offsetLeft + from.offsetWidth / 2;
            const fy = from.offsetTop + from.offsetHeight / 2;
            const tx = to.offsetLeft + to.offsetWidth / 2;
            const ty = to.offsetTop + to.offsetHeight / 2;

            // Glow the fan-out path
            glowConnectorSegment(canvas, 'event-bus', t);

            let start = null;
            function step(ts) {
              if (!start) start = ts;
              const progress = Math.min((ts - start) / (800 / animSpeed), 1);
              const x = fx + (tx - fx) * easeInOut(progress);
              const y = fy + (ty - fy) * easeInOut(progress);
              p.style.left = `${x - 5}px`;
              p.style.top = `${y - 5}px`;

              if (progress >= 1) {
                to.classList.add('lit');
                p.remove();
                if (i === targets.length - 1) {
                  setTimeout(() => {
                    $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
                    unglowAll(canvas);
                    startEventAnimation(canvas);
                  }, 1500 / animSpeed);
                }
                return;
              }
              const id = requestAnimationFrame(step);
              activeAnimations.push(id);
            }
            const id = requestAnimationFrame(step);
            activeAnimations.push(id);
          }, i * 200);
        });
      },
    });
  }

  // ── Section: gRPC Flow ──
  function initGrpcFlow() {
    const canvas = $('#grpc-canvas');
    if (!canvas) return;

    const nodes = [
      { id: 'grpc-gateway', icon: '🌐', label: 'API Gateway', cat: 'core', x: 30, y: 160 },
      { id: 'grpc-client', icon: '📡', label: 'ServiceClient<T>', cat: 'transport', x: 170, y: 160 },
      { id: 'grpc-corr', icon: '🔗', label: 'Correlation Inject', cat: 'observe', x: 340, y: 80 },
      { id: 'grpc-auth', icon: '🔒', label: 'Auth Inject', cat: 'auth', x: 340, y: 240 },
      { id: 'grpc-call', icon: '📞', label: 'gRPC Call', cat: 'transport', x: 510, y: 160 },
      { id: 'grpc-service', icon: '⚙️', label: 'Product Service', cat: 'core', x: 670, y: 160 },
      { id: 'grpc-handler', icon: '🎯', label: 'RPC Handler', cat: 'core', x: 830, y: 160 },
      { id: 'grpc-cache', icon: '💨', label: 'Cache', cat: 'cache', x: 970, y: 80 },
      { id: 'grpc-db', icon: '🗄️', label: 'Database', cat: 'database', x: 970, y: 240 },
      { id: 'grpc-response', icon: '📨', label: 'Response', cat: 'success', x: 1100, y: 160 },
    ];

    renderNodes(canvas, nodes);

    const conns = [
      // Forward path
      { from: 'grpc-gateway', to: 'grpc-client', arrow: 'arrow-brand' },
      { from: 'grpc-client', to: 'grpc-corr', arrow: 'arrow-yellow' },
      { from: 'grpc-client', to: 'grpc-auth', arrow: 'arrow-purple' },
      { from: 'grpc-corr', to: 'grpc-call', arrow: 'arrow-teal' },
      { from: 'grpc-auth', to: 'grpc-call', arrow: 'arrow-teal' },
      { from: 'grpc-call', to: 'grpc-service', arrow: 'arrow-teal' },
      { from: 'grpc-service', to: 'grpc-handler', arrow: 'arrow-brand' },
      // Fan-out from handler
      { from: 'grpc-handler', to: 'grpc-cache', cssClass: 'branch-upper', arrow: 'arrow-green' },
      { from: 'grpc-handler', to: 'grpc-db', cssClass: 'branch-lower', arrow: 'arrow-yellow' },
      // To response
      { from: 'grpc-cache', to: 'grpc-response', arrow: 'arrow-green' },
      { from: 'grpc-db', to: 'grpc-response', arrow: 'arrow-green' },
      // Return path: response back to gateway
      { from: 'grpc-response', to: 'grpc-gateway', type: 'return-path', arrow: 'arrow-red' },
    ];
    drawFlowPaths(canvas, conns);

    nodes.forEach(s => {
      const node = canvas.querySelector(`[data-id="${s.id}"]`);
      if (node) node.addEventListener('click', () => openDetail(s.id.replace('grpc-', '') === 'client' ? 'grpc-client' : s.id.replace('grpc-', '') === 'handler' ? 'grpc-handler' : s.id));
    });

    // Circuit breaker
    const cbStates = ['closed', 'half', 'open'];
    let cbIdx = 0;
    const cbBtn = $('#grpc-cb-toggle');
    if (cbBtn) {
      cbBtn.addEventListener('click', () => {
        cbIdx = (cbIdx + 1) % 3;
        const dot = $('.cb-dot');
        const lbl = $('#cb-label');
        dot.className = `cb-dot ${cbStates[cbIdx]}`;
        lbl.textContent = cbStates[cbIdx].charAt(0).toUpperCase() + cbStates[cbIdx].slice(1);
      });
    }

    const playBtn = $('#grpc-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        stopAllAnimations();
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        // Forward animation
        animatePacketAlongNodes(canvas,
          ['grpc-gateway', 'grpc-client', 'grpc-call', 'grpc-service', 'grpc-handler', 'grpc-db', 'grpc-response'],
          {
            label: 'FindProduct(id)',
            duration: 4000,
            loop: false,
            packetClass: 'success',
            onComplete: () => {
              // Return animation
              setTimeout(() => {
                animatePacketAlongNodes(canvas,
                  ['grpc-response', 'grpc-gateway'],
                  {
                    label: 'Response',
                    duration: 1500,
                    loop: false,
                    packetClass: 'error',
                    onComplete: () => {
                      setTimeout(() => {
                        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
                        unglowAll(canvas);
                        $('#grpc-play')?.click();
                      }, 1000 / animSpeed);
                    },
                  }
                );
              }, 300);
            },
          }
        );
      });
    }
  }

  // ── Section: CQRS Flow ──
  function initCqrsFlow() {
    const canvas = $('#cqrs-canvas');
    if (!canvas) return;

    const nodes = [
      { id: 'cqrs-cmd', icon: '📝', label: 'Command', cat: 'cqrs', x: 50, y: 200 },
      { id: 'cqrs-bus', icon: '🚌', label: 'CommandBus', cat: 'cqrs', x: 200, y: 200 },
      { id: 'cqrs-handler', icon: '⚙️', label: 'Handler', cat: 'cqrs', x: 350, y: 200 },
      { id: 'cqrs-agg', icon: '🧩', label: 'AggregateRoot', cat: 'cqrs', x: 520, y: 200 },
      { id: 'cqrs-store', icon: '📚', label: 'EventStore', cat: 'database', x: 700, y: 200 },
      { id: 'cqrs-proj', icon: '📊', label: 'Projection', cat: 'core', x: 920, y: 90 },
      { id: 'cqrs-outbox', icon: '📤', label: 'Outbox', cat: 'event', x: 920, y: 200 },
      { id: 'cqrs-snap', icon: '📸', label: 'Snapshot', cat: 'cache', x: 920, y: 310 },
    ];

    renderNodes(canvas, nodes);

    const conns = [
      // Main chain
      { from: 'cqrs-cmd', to: 'cqrs-bus', arrow: 'arrow-cqrs' },
      { from: 'cqrs-bus', to: 'cqrs-handler', arrow: 'arrow-cqrs' },
      { from: 'cqrs-handler', to: 'cqrs-agg', arrow: 'arrow-cqrs' },
      { from: 'cqrs-agg', to: 'cqrs-store', arrow: 'arrow-green' },
      // Fan-out from event store
      { from: 'cqrs-store', to: 'cqrs-proj', cssClass: 'fan-out', arrow: 'arrow-brand' },
      { from: 'cqrs-store', to: 'cqrs-outbox', cssClass: 'fan-out', arrow: 'arrow-pink' },
      { from: 'cqrs-store', to: 'cqrs-snap', cssClass: 'fan-out', arrow: 'arrow-yellow' },
    ];
    drawFlowPaths(canvas, conns);

    nodes.forEach(s => {
      const node = canvas.querySelector(`[data-id="${s.id}"]`);
      if (node) {
        const key = s.id.replace('cqrs-', '');
        const detailKey = {
          cmd: 'command-bus', bus: 'command-bus', handler: 'cmd-handler',
          agg: 'aggregate', store: 'event-store', proj: 'projection',
          outbox: 'outbox', snap: 'snapshot',
        }[key] || key;
        node.addEventListener('click', () => openDetail(detailKey));
      }
    });

    let version = 0;
    const versionEl = $('#ev-version');

    const playBtn = $('#cqrs-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        stopAllAnimations();
        version = 0;
        if (versionEl) versionEl.textContent = `v${version}`;
        $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
        animateCqrsFlow(canvas, versionEl);
      });
    }
  }

  function animateCqrsFlow(canvas, versionEl) {
    let version = parseInt((versionEl?.textContent || 'v0').replace('v', '')) || 0;
    animatePacketAlongNodes(canvas, ['cqrs-cmd', 'cqrs-bus', 'cqrs-handler', 'cqrs-agg', 'cqrs-store'], {
      label: 'CreateOrderCommand', duration: 3000, loop: false,
      onStep: (idx) => {
        if (idx === 4 && versionEl) {
          version++;
          versionEl.textContent = `v${version}`;
        }
      },
      onComplete: () => {
        const targets = ['cqrs-proj', 'cqrs-outbox', 'cqrs-snap'];
        targets.forEach((t, i) => {
          setTimeout(() => {
            const from = canvas.querySelector('[data-id="cqrs-store"]');
            const to = canvas.querySelector(`[data-id="${t}"]`);
            if (!from || !to) return;

            const p = createPacket(canvas);
            p.className = 'packet moving';

            const fx = from.offsetLeft + from.offsetWidth / 2;
            const fy = from.offsetTop + from.offsetHeight / 2;
            const tx = to.offsetLeft + to.offsetWidth / 2;
            const ty = to.offsetTop + to.offsetHeight / 2;

            glowConnectorSegment(canvas, 'cqrs-store', t);

            let start = null;
            function step(ts) {
              if (!start) start = ts;
              const progress = Math.min((ts - start) / (600 / animSpeed), 1);
              p.style.left = `${fx + (tx - fx) * easeInOut(progress) - 5}px`;
              p.style.top = `${fy + (ty - fy) * easeInOut(progress) - 5}px`;
              if (progress >= 1) {
                to.classList.add('lit');
                p.remove();
                if (i === targets.length - 1) {
                  setTimeout(() => {
                    $$('.flow-node', canvas).forEach(n => n.classList.remove('lit'));
                    unglowAll(canvas);
                    animateCqrsFlow(canvas, versionEl);
                  }, 1500 / animSpeed);
                }
                return;
              }
              const id = requestAnimationFrame(step);
              activeAnimations.push(id);
            }
            const id = requestAnimationFrame(step);
            activeAnimations.push(id);
          }, i * 150);
        });
      },
    });
  }

  // ── Section: Module Dependency Map ──
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
      moduleData.forEach(m => {
        if (!cats[m.cat]) cats[m.cat] = [];
        cats[m.cat].push(m);
      });

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
          nodes.push({
            ...m,
            x: cx + (Math.random() - 0.5) * 40,
            y: startY + i * rowHeight,
            w: 130, h: 26,
            color: catColors[cat],
          });
        });
        col++;
      });
    }

    function drawArrow(fromX, fromY, toX, toY, color, lineWidth) {
      // Draw line
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const headLen = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(panX, panY);

      // Draw edges with arrows
      nodes.forEach(node => {
        const m = moduleData.find(mm => mm.id === node.id);
        if (!m) return;
        m.deps.forEach(depId => {
          const dep = nodes.find(n => n.id === depId);
          if (!dep) return;

          const isHighlighted = selectedId && (selectedId === node.id || selectedId === depId);
          const isFiltered = searchTerm && !searchTerm.startsWith('::cat::') && (
            node.id.toLowerCase().includes(searchTerm) || dep.id.toLowerCase().includes(searchTerm)
          );
          const isCatMatch = searchTerm && searchTerm.startsWith('::cat::') && (
            node.cat === searchTerm.replace('::cat::', '') || dep.cat === searchTerm.replace('::cat::', '')
          );
          const dimmed = (selectedId || searchTerm) && !isHighlighted && !isFiltered && !isCatMatch;

          const color = dimmed ? 'rgba(30,30,42,.3)' : isHighlighted ? node.color : 'rgba(30,30,42,.6)';
          ctx.strokeStyle = color;
          ctx.lineWidth = isHighlighted ? 2 : 1;
          drawArrow(node.x, node.y, dep.x, dep.y, color, isHighlighted ? 2 : 1);
        });
      });

      // Draw nodes
      nodes.forEach(node => {
        const isSelected = selectedId === node.id;
        const isDep = selectedId && moduleData.find(m => m.id === selectedId)?.deps.includes(node.id);
        const isDepOf = selectedId && moduleData.find(m => m.id === node.id)?.deps.includes(selectedId);
        const isSearchMatch = searchTerm && !searchTerm.startsWith('::cat::') && node.id.toLowerCase().includes(searchTerm);
        const isCatMatch = searchTerm && searchTerm.startsWith('::cat::') && node.cat === searchTerm.replace('::cat::', '');
        const isHovered = hoveredId === node.id;
        const highlight = isSelected || isDep || isDepOf || isSearchMatch || isCatMatch;
        const dimmed = (selectedId || searchTerm) && !highlight;

        const x = node.x - node.w / 2;
        const y = node.y - node.h / 2;

        if (highlight || isHovered) {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 12;
        }

        ctx.fillStyle = dimmed ? 'rgba(17,17,24,.4)' : '#111118';
        ctx.strokeStyle = dimmed ? 'rgba(30,30,42,.3)' : highlight ? node.color : 'rgba(30,30,42,.8)';
        ctx.lineWidth = highlight ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, y, node.w, node.h, 4);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = dimmed ? 'rgba(100,116,139,.3)' : highlight ? '#fff' : '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id.replace('Module', ''), node.x, node.y);

        ctx.fillStyle = dimmed ? 'rgba(100,100,100,.2)' : node.color;
        ctx.beginPath();
        ctx.arc(x + 8, node.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }

    function hitTest(mx, my) {
      const x = mx - panX;
      const y = my - panY;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (x >= n.x - n.w / 2 && x <= n.x + n.w / 2 && y >= n.y - n.h / 2 && y <= n.y + n.h / 2) {
          return n.id;
        }
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
          panel.querySelector('code').textContent = `// ${selectedId}\nimport { ${selectedId} } from '@nestjs-boot/${m.cat}';\n\n@Module({\n  imports: [${deps !== 'none' ? deps : ''}],\n})\nexport class ${selectedId} {}`;
          panel.classList.add('open');
          $('.detail-overlay').classList.add('open');
        }
      }
    });

    canvasEl.addEventListener('mousemove', e => {
      const rect = canvasEl.getBoundingClientRect();
      const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (id !== hoveredId) {
        hoveredId = id;
        canvasEl.style.cursor = id ? 'pointer' : 'grab';
        draw();
      }

      if (isDragging) {
        panX += e.clientX - dragStart.x;
        panY += e.clientY - dragStart.y;
        dragStart = { x: e.clientX, y: e.clientY };
        draw();
      }
    });

    canvasEl.addEventListener('mousedown', e => {
      const rect = canvasEl.getBoundingClientRect();
      if (!hitTest(e.clientX - rect.left, e.clientY - rect.top)) {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        canvasEl.style.cursor = 'grabbing';
      }
    });
    canvasEl.addEventListener('mouseup', () => { isDragging = false; canvasEl.style.cursor = 'grab'; });
    canvasEl.addEventListener('mouseleave', () => { isDragging = false; });

    const searchInput = $('#dep-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        searchTerm = e.target.value.toLowerCase();
        selectedId = null;
        draw();
      });
    }

    $$('.dep-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          searchTerm = '';
        } else {
          $$('.dep-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          searchTerm = '::cat::' + cat;
          selectedId = null;
        }
        draw();
      });
    });

    resize();
    layoutNodes();
    draw();
    window.addEventListener('resize', () => { resize(); layoutNodes(); draw(); });
  }

  // ── Render helpers ──
  function renderNodes(canvas, nodes) {
    nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'flow-node' + (n.diamond ? ' diamond' : '');
      el.dataset.id = n.id;
      el.dataset.cat = n.cat;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.innerHTML = `
        ${n.icon ? `<span class="node-icon">${n.icon}</span>` : ''}
        <span class="node-label">${n.label}</span>
        ${n.timing ? `<span class="node-timing">${n.timing}</span>` : ''}
      `;
      canvas.appendChild(el);
    });
  }

  function renderOptionalNodes(canvas, nodes) {
    nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'flow-node';
      el.dataset.id = n.id;
      el.dataset.cat = n.cat;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.display = $(`#${n.toggle}`)?.checked ? 'block' : 'none';
      el.style.borderStyle = 'dashed';
      el.innerHTML = `<span class="node-label">${n.label}</span>`;
      canvas.appendChild(el);
    });
  }

  // ── Speed control ──
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

  // ── Pause/play ──
  function initPlayPause() {
    const btn = $('#global-pause');
    if (btn) {
      btn.addEventListener('click', () => {
        animRunning = !animRunning;
        btn.textContent = animRunning ? '\u23F8 Pause' : '\u25B6 Play';
      });
    }
  }

  // ── Start section animation ──
  function startSectionAnimation(id) {
    switch (id) {
      case 'boot':
        const bar = $('.boot-progress-bar');
        if (bar) bar.style.width = '0';
        setTimeout(() => $('#boot-play')?.click(), 300);
        break;
      case 'request':
        setTimeout(() => $('#req-play')?.click(), 300);
        break;
      case 'event':
        setTimeout(() => $('#event-play')?.click(), 300);
        break;
      case 'grpc':
        setTimeout(() => $('#grpc-play')?.click(), 300);
        break;
      case 'cqrs':
        setTimeout(() => $('#cqrs-play')?.click(), 300);
        break;
    }
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDetailPanel();
    initSpeedControl();
    initPlayPause();
    initBootSequence();
    initRequestFlow();
    initEventFlow();
    initGrpcFlow();
    initCqrsFlow();
    initDependencyMap();

    // Auto-play boot sequence
    setTimeout(() => startSectionAnimation('boot'), 500);
  });
})();
