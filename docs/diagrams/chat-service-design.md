# Chat Service Module - Detailed Design

> RAG-powered chatbot for DataViz Platform: understands natural language queries, generates SQL, returns data + chart configurations.

## Architecture Overview

```
User: "Cho tôi xem doanh thu Q3 theo từng khu vực"
         │
         ▼
   ┌─────────────┐
   │  Chat UI     │  (React + WebSocket)
   └─────┬───────┘
         │
         ▼
   ┌─────────────────┐
   │  Chat Service    │  (microservice mới)
   │  ┌─────────────┐ │
   │  │ Intent      │ │  ← Hiểu user muốn gì
   │  │ Detection   │ │
   │  └──────┬──────┘ │
   │         ▼        │
   │  ┌─────────────┐ │
   │  │ RAG Engine  │ │  ← Tra cứu metadata: schema, dataset, measures
   │  │ (context)   │ │
   │  └──────┬──────┘ │
   │         ▼        │
   │  ┌─────────────┐ │
   │  │ Query       │ │  ← Sinh SQL/API query từ ngữ cảnh
   │  │ Generator   │ │
   │  └──────┬──────┘ │
   └─────────┼────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
┌──────────┐  ┌──────────────┐
│ Data     │  │ Viz          │
│ Service  │  │ Recommender  │
│ (query)  │  │ (chart type) │
└────┬─────┘  └──────┬───────┘
     │               │
     └───────┬───────┘
             ▼
   ┌─────────────────┐
   │  Response:       │
   │  data + chart    │
   │  config          │
   └─────────────────┘
```

## Approach: Text-to-Query + RAG Hybrid

This is NOT pure document RAG. It's a hybrid that understands data queries and translates them to actual data retrieval.

| RAG truyền thống                    | DataViz RAG (this design)                                    |
| ----------------------------------- | ------------------------------------------------------------ |
| Tìm tài liệu text, trả lời câu hỏi | Hiểu ý định, **sinh query**, trả về **data + chart**        |
| Vector search → LLM summarize      | Metadata search → LLM generate SQL → Execute → Visualize    |
| Output: text                        | Output: **data table + chart config**                        |

---

## 1. Module Structure

```
chat-service/src/
├── main.ts                           # Bootstrap + gRPC hybrid
├── app.module.ts                     # Root module
│
├── chat/                             # === Chat Core ===
│   ├── chat.module.ts                # DynamicModule registration
│   ├── chat.gateway.ts               # WebSocket gateway (extends BootWsGateway)
│   ├── chat.controller.ts            # REST API (history, sessions)
│   ├── chat.service.ts               # Orchestrator: gateway → rag → query → response
│   ├── conversation.service.ts       # Conversation CRUD + context window
│   ├── interfaces.ts                 # ChatOptions, ChatMessage, ChatResponse
│   ├── decorators.ts                 # @InjectChatService, @ChatRateLimit
│   ├── constants.ts                  # CHAT_OPTIONS, CHAT_SERVICE tokens
│   └── dto/
│       ├── send-message.dto.ts       # { conversationId?, message, context? }
│       ├── chat-response.dto.ts      # { type, text?, data?, chart?, sql? }
│       └── conversation-query.dto.ts # Pagination + filters
│
├── rag/                              # === RAG Engine ===
│   ├── rag.module.ts                 # DynamicModule
│   ├── rag.service.ts                # Orchestrator: embed → search → rank
│   ├── embedding.service.ts          # Text → vector (OpenAI/local)
│   ├── vector-store.service.ts       # pgvector CRUD
│   ├── metadata-indexer.service.ts   # Schema/catalog → embeddings pipeline
│   ├── retriever.service.ts          # Query → relevant context chunks
│   ├── interfaces.ts                 # EmbeddingProvider, VectorSearchResult
│   └── constants.ts                  # RAG_OPTIONS, EMBEDDING_PROVIDER tokens
│
├── query/                            # === Query Generation & Execution ===
│   ├── query.module.ts               # DynamicModule
│   ├── query-generator.service.ts    # LLM prompt → structured SQL + chart config
│   ├── query-validator.service.ts    # SQL validation, injection prevention
│   ├── query-executor.service.ts     # READ-ONLY pool execution + timeout
│   ├── viz-recommender.service.ts    # Data shape → chart type recommendation
│   ├── prompt-templates/
│   │   ├── text-to-sql.ts            # Main SQL generation prompt
│   │   ├── clarify-intent.ts         # Ambiguity resolution prompt
│   │   └── viz-suggest.ts            # Chart recommendation prompt
│   ├── interfaces.ts                 # GeneratedQuery, QueryResult, VizConfig
│   └── constants.ts                  # QUERY_OPTIONS, LLM_PROVIDER tokens
│
├── llm/                              # === LLM Abstraction Layer ===
│   ├── llm.module.ts                 # DynamicModule
│   ├── llm.service.ts                # Unified interface (chat, stream, embed)
│   ├── providers/
│   │   ├── openai.provider.ts        # GPT-4o / GPT-4o-mini
│   │   ├── anthropic.provider.ts     # Claude API
│   │   └── ollama.provider.ts        # Self-hosted fallback
│   ├── interfaces.ts                 # LlmProvider, LlmResponse, StreamChunk
│   └── constants.ts                  # LLM_OPTIONS, LLM_PROVIDER token
│
├── schemas/                          # === Mongoose Schemas ===
│   ├── conversation.schema.ts
│   ├── message.schema.ts
│   ├── metadata-catalog.schema.ts
│   ├── query-history.schema.ts
│   └── feedback.schema.ts
│
└── repositories/                     # === Repositories (extends BaseRepository) ===
    ├── conversation.repository.ts
    ├── message.repository.ts
    ├── metadata-catalog.repository.ts
    ├── query-history.repository.ts
    └── feedback.repository.ts
```

---

## 2. Data Models & Schemas

### 2.1 Conversation Schema

```typescript
// schemas/conversation.schema.ts
@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ default: 'New Chat' })
  title: string;

  @Prop({ type: String, enum: ['active', 'archived', 'deleted'], default: 'active' })
  status: ConversationStatus;

  @Prop({ type: Object, default: {} })
  context: {
    dashboardId?: string;      // Nếu chat từ 1 dashboard cụ thể
    dataSourceId?: string;     // Data source đang active
    filters?: Record<string, any>; // Filter context user đang xem
  };

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastMessageAt: Date;
}
```

### 2.2 Message Schema

```typescript
// schemas/message.schema.ts
@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ type: String, enum: ['user', 'assistant', 'system'] })
  role: MessageRole;

  @Prop({ required: true })
  content: string;                  // Natural language text

  @Prop({ type: Object })
  queryResult?: {
    sql: string;                    // Generated SQL
    data: Record<string, any>[];    // Query result rows
    rowCount: number;
    executionTimeMs: number;
  };

  @Prop({ type: Object })
  vizConfig?: {
    chartType: ChartType;           // 'bar' | 'line' | 'pie' | 'table' | 'area' | 'scatter'
    xAxis: string;
    yAxis: string | string[];
    groupBy?: string;
    title: string;
    colorScheme?: string;
  };

  @Prop({ type: Object })
  metadata?: {
    model: string;                  // LLM model used
    tokensUsed: number;
    ragContextIds: string[];        // Which metadata chunks were used
    confidence: number;             // 0-1, how confident the SQL generation was
    clarificationNeeded?: boolean;  // If intent was ambiguous
  };

  @Prop({ type: String, enum: ['success', 'error', 'clarification', 'streaming'] })
  status: MessageStatus;

  @Prop()
  errorMessage?: string;
}
```

### 2.3 Metadata Catalog Schema (RAG indexing)

```typescript
// schemas/metadata-catalog.schema.ts
@Schema({ timestamps: true, collection: 'metadata_catalog' })
export class MetadataCatalog {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  dataSourceId: string;

  @Prop({ type: String, enum: ['table', 'column', 'relationship', 'glossary', 'saved_query'] })
  type: CatalogEntryType;

  @Prop({ required: true })
  name: string;                     // "sales", "revenue", "product_id"

  @Prop({ required: true })
  description: string;              // "Bảng chứa doanh thu bán hàng theo ngày"

  @Prop({ type: Object })
  schema?: {
    tableName: string;
    columnName?: string;
    dataType?: string;              // 'varchar', 'integer', 'timestamp', 'numeric'
    nullable?: boolean;
    isPrimaryKey?: boolean;
    foreignKey?: { table: string; column: string };
    sampleValues?: string[];        // ["HN", "HCM", "DN"] → giúp LLM hiểu domain
  };

  @Prop({ type: [Number] })
  embedding: number[];              // Vector embedding (1536 dims for OpenAI)

  @Prop({ default: true })
  isActive: boolean;
}
```

### 2.4 Query History Schema

```typescript
// schemas/query-history.schema.ts
@Schema({ timestamps: true, collection: 'query_history' })
export class QueryHistory {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  conversationId: string;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  naturalLanguageQuery: string;     // "doanh thu Q3 theo khu vực"

  @Prop({ required: true })
  generatedSql: string;

  @Prop({ type: String, enum: ['success', 'error', 'timeout'] })
  executionStatus: string;

  @Prop()
  executionTimeMs: number;

  @Prop()
  rowCount: number;

  @Prop({ type: Number, min: 1, max: 5 })
  userRating?: number;             // User feedback: 1-5 stars

  @Prop()
  userFeedback?: string;           // "SQL sai, nên group by month"
}
```

### 2.5 Feedback Schema (Reinforcement Loop)

```typescript
// schemas/feedback.schema.ts
@Schema({ timestamps: true, collection: 'chat_feedback' })
export class ChatFeedback {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ type: String, enum: ['thumbs_up', 'thumbs_down', 'correction'] })
  type: FeedbackType;

  @Prop()
  correctedSql?: string;           // User sửa SQL → dùng để fine-tune

  @Prop()
  correctedViz?: string;           // "Nên dùng pie chart thay vì bar"

  @Prop()
  comment?: string;
}
```

### 2.6 ER Diagram

```
┌─────────────────┐       ┌──────────────────┐
│  Conversation    │ 1───N │    Message        │
├─────────────────┤       ├──────────────────┤
│ _id             │       │ _id              │
│ userId          │       │ conversationId   │──→ Conversation._id
│ organizationId  │       │ role             │
│ title           │       │ content          │
│ status          │       │ queryResult?     │──→ { sql, data[], rowCount }
│ context{}       │       │ vizConfig?       │──→ { chartType, axes, title }
│ messageCount    │       │ metadata?        │──→ { model, tokens, confidence }
│ lastMessageAt   │       │ status           │
└─────────────────┘       └───────┬──────────┘
                                  │ 1
                                  │
                    ┌─────────────┴──────┐
                    │                    │
               ┌────┴──────┐    ┌───────┴────────┐
               │  Query     │    │  ChatFeedback   │
               │  History   │    ├────────────────┤
               ├───────────┤    │ messageId      │
               │ messageId │    │ userId         │
               │ userId    │    │ type           │
               │ nlQuery   │    │ correctedSql?  │
               │ genSql    │    │ correctedViz?  │
               │ status    │    │ comment?       │
               │ userRating│    └────────────────┘
               └───────────┘

┌──────────────────────┐
│  MetadataCatalog      │  (RAG knowledge base - standalone)
├──────────────────────┤
│ _id                  │
│ organizationId       │
│ dataSourceId         │
│ type                 │  ← table | column | relationship | glossary | saved_query
│ name                 │
│ description          │
│ schema{}             │  ← tableName, dataType, sampleValues, foreignKey
│ embedding[]          │  ← vector 1536 dims
│ isActive             │
└──────────────────────┘
```

---

## 3. RAG Engine Components

### 3.1 RAG Module Registration

```typescript
// rag/rag.module.ts
@Module({})
export class RagModule {
  static register(options: RagOptions): DynamicModule {
    return {
      module: RagModule,
      providers: [
        { provide: RAG_OPTIONS, useValue: options },
        EmbeddingService,
        VectorStoreService,
        MetadataIndexerService,
        RetrieverService,
        RagService,
      ],
      exports: [RagService, MetadataIndexerService],
    };
  }
}

// rag/interfaces.ts
export interface RagOptions {
  embedding: {
    provider: 'openai' | 'local';      // OpenAI hoặc self-hosted
    model: string;                       // 'text-embedding-3-small'
    dimensions: number;                  // 1536
    batchSize: number;                   // 100
  };
  vectorStore: {
    type: 'pgvector' | 'mongodb-atlas';  // Vector DB backend
    collectionName: string;
    similarityMetric: 'cosine' | 'euclidean';
  };
  retriever: {
    topK: number;                        // Default: 10
    scoreThreshold: number;              // Default: 0.7
    reranking: boolean;                  // Re-rank results by relevance
  };
}
```

### 3.2 Embedding Service

```typescript
// rag/embedding.service.ts
@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(RAG_OPTIONS) private readonly options: RagOptions,
    private readonly llmService: LlmService,
  ) {}

  /** Single text → vector */
  async embed(text: string): Promise<number[]> {
    return this.llmService.embed(text, this.options.embedding.model);
  }

  /** Batch embedding cho indexing pipeline */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const batches = chunk(texts, this.options.embedding.batchSize);
    const results: number[][] = [];
    for (const batch of batches) {
      const vectors = await this.llmService.embedBatch(batch, this.options.embedding.model);
      results.push(...vectors);
    }
    return results;
  }
}
```

### 3.3 Metadata Indexer Service

```typescript
// rag/metadata-indexer.service.ts
@Injectable()
export class MetadataIndexerService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly catalogRepo: MetadataCatalogRepository,
  ) {}

  /**
   * Index toàn bộ schema của 1 data source.
   * Gọi khi: user connect data source mới, hoặc schema thay đổi.
   */
  async indexDataSource(orgId: string, dataSourceId: string, schema: DataSourceSchema): Promise<void> {
    const entries: MetadataCatalogEntry[] = [];

    // 1. Index từng table
    for (const table of schema.tables) {
      entries.push({
        organizationId: orgId,
        dataSourceId,
        type: 'table',
        name: table.name,
        description: `Bảng ${table.name}: ${table.description || table.columns.map(c => c.name).join(', ')}`,
        schema: { tableName: table.name },
      });

      // 2. Index từng column
      for (const col of table.columns) {
        entries.push({
          organizationId: orgId,
          dataSourceId,
          type: 'column',
          name: `${table.name}.${col.name}`,
          description: `Cột ${col.name} trong bảng ${table.name}: ${col.description || col.dataType}${col.sampleValues ? '. Ví dụ: ' + col.sampleValues.join(', ') : ''}`,
          schema: {
            tableName: table.name,
            columnName: col.name,
            dataType: col.dataType,
            nullable: col.nullable,
            isPrimaryKey: col.isPrimaryKey,
            foreignKey: col.foreignKey,
            sampleValues: col.sampleValues,
          },
        });
      }

      // 3. Index relationships (foreign keys)
      for (const col of table.columns.filter(c => c.foreignKey)) {
        entries.push({
          organizationId: orgId,
          dataSourceId,
          type: 'relationship',
          name: `${table.name}.${col.name} → ${col.foreignKey.table}.${col.foreignKey.column}`,
          description: `Bảng ${table.name} join với ${col.foreignKey.table} qua ${col.name} = ${col.foreignKey.column}`,
          schema: { tableName: table.name, columnName: col.name, foreignKey: col.foreignKey },
        });
      }
    }

    // 4. Batch embed + upsert
    const descriptions = entries.map(e => e.description);
    const embeddings = await this.embeddingService.embedBatch(descriptions);

    const catalogEntries = entries.map((entry, i) => ({
      ...entry,
      embedding: embeddings[i],
      isActive: true,
    }));

    // Xóa entries cũ, insert mới (full re-index)
    await this.catalogRepo.deleteMany({ organizationId: orgId, dataSourceId });
    await this.catalogRepo.createMany(catalogEntries);
  }

  /**
   * Index business glossary (admin define).
   * Ví dụ: "doanh thu" = SUM(sales.amount), "Q3" = tháng 7-9
   */
  async indexGlossary(orgId: string, glossary: GlossaryEntry[]): Promise<void> {
    const entries = glossary.map(g => ({
      organizationId: orgId,
      dataSourceId: 'global',
      type: 'glossary' as const,
      name: g.term,
      description: `${g.term}: ${g.definition}. SQL: ${g.sqlExpression}`,
    }));

    const embeddings = await this.embeddingService.embedBatch(entries.map(e => e.description));
    const catalogEntries = entries.map((e, i) => ({ ...e, embedding: embeddings[i], isActive: true }));
    await this.catalogRepo.createMany(catalogEntries);
  }
}
```

### 3.4 Retriever Service

```typescript
// rag/retriever.service.ts
@Injectable()
export class RetrieverService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    @Inject(RAG_OPTIONS) private readonly options: RagOptions,
  ) {}

  /**
   * User query → relevant schema context.
   * "doanh thu Q3 theo khu vực" →
   *   [sales table, amount column, region_code column, "Q3" glossary, ...]
   */
  async retrieve(query: string, orgId: string, dataSourceId?: string): Promise<RetrievedContext> {
    // 1. Embed user query
    const queryVector = await this.embeddingService.embed(query);

    // 2. Vector similarity search
    const filter: VectorFilter = { organizationId: orgId };
    if (dataSourceId) filter.dataSourceId = dataSourceId;

    const results = await this.vectorStore.search({
      vector: queryVector,
      filter,
      topK: this.options.retriever.topK,
      scoreThreshold: this.options.retriever.scoreThreshold,
    });

    // 3. Group by type for structured context
    const tables = results.filter(r => r.type === 'table');
    const columns = results.filter(r => r.type === 'column');
    const relationships = results.filter(r => r.type === 'relationship');
    const glossary = results.filter(r => r.type === 'glossary');

    // 4. Build CREATE TABLE statements cho LLM context
    const schemaContext = this.buildSchemaContext(tables, columns, relationships);

    return {
      schemaContext,           // CREATE TABLE ... với relevant columns
      glossaryContext: glossary.map(g => g.description).join('\n'),
      sourceIds: results.map(r => r._id),
      confidence: this.calculateConfidence(results),
    };
  }

  private buildSchemaContext(tables, columns, relationships): string {
    const tableMap = new Map<string, string[]>();

    for (const col of columns) {
      const tableName = col.schema.tableName;
      if (!tableMap.has(tableName)) tableMap.set(tableName, []);
      const colDef = `  ${col.schema.columnName} ${col.schema.dataType}${col.schema.isPrimaryKey ? ' PRIMARY KEY' : ''}${col.schema.foreignKey ? ` REFERENCES ${col.schema.foreignKey.table}(${col.schema.foreignKey.column})` : ''} -- ${col.description}`;
      tableMap.get(tableName).push(colDef);
    }

    let sql = '';
    for (const [tableName, cols] of tableMap) {
      sql += `CREATE TABLE ${tableName} (\n${cols.join(',\n')}\n);\n\n`;
    }
    return sql;
  }
}
```

---

## 4. Query Generator & Executor

### 4.1 Query Generator Service

```typescript
// query/query-generator.service.ts
@Injectable()
export class QueryGeneratorService {
  constructor(
    private readonly llmService: LlmService,
    private readonly retriever: RetrieverService,
    @Inject(QUERY_OPTIONS) private readonly options: QueryOptions,
  ) {}

  async generate(request: QueryGenerateRequest): Promise<GeneratedQuery> {
    // 1. Retrieve relevant schema context via RAG
    const ragContext = await this.retriever.retrieve(
      request.message,
      request.organizationId,
      request.dataSourceId,
    );

    // 2. Build conversation history for multi-turn context
    const conversationContext = request.history
      .slice(-6)  // Last 6 messages only (context window management)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 3. Generate SQL via LLM
    const prompt = TEXT_TO_SQL_PROMPT({
      userMessage: request.message,
      schemaContext: ragContext.schemaContext,
      glossaryContext: ragContext.glossaryContext,
      conversationHistory: conversationContext,
      dialect: request.dialect || 'postgresql',
    });

    const response = await this.llmService.chat({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      responseFormat: 'json',
      temperature: 0,    // Deterministic SQL generation
    });

    const parsed = JSON.parse(response.content) as LlmQueryResponse;

    // 4. Handle clarification needed
    if (parsed.clarificationNeeded) {
      return {
        type: 'clarification',
        message: parsed.clarificationMessage,
        suggestions: parsed.suggestions,
        confidence: ragContext.confidence,
      };
    }

    return {
      type: 'query',
      sql: parsed.sql,
      params: parsed.params || [],
      explanation: parsed.explanation,
      vizConfig: parsed.vizConfig,
      confidence: ragContext.confidence,
      ragContextIds: ragContext.sourceIds,
    };
  }
}
```

### 4.2 Prompt Template (Text-to-SQL)

```typescript
// query/prompt-templates/text-to-sql.ts
export const TEXT_TO_SQL_PROMPT = (ctx: PromptContext) => ({
  system: `You are a SQL expert for a data visualization platform.
Your job: convert natural language questions into executable ${ctx.dialect} queries.

## Available Schema:
${ctx.schemaContext}

## Business Glossary:
${ctx.glossaryContext || 'None defined.'}

## Rules:
1. ONLY generate SELECT statements. Never INSERT/UPDATE/DELETE/DROP.
2. Always use table aliases for clarity.
3. When aggregating, include meaningful column aliases (e.g., "total_revenue").
4. Respect date formats: use date functions appropriate for ${ctx.dialect}.
5. Limit results to 1000 rows max unless user specifies otherwise.
6. If the question is ambiguous, set clarificationNeeded=true.

## Response Format (JSON):
{
  "sql": "SELECT ...",
  "params": [],
  "explanation": "Brief explanation in user's language",
  "clarificationNeeded": false,
  "clarificationMessage": null,
  "suggestions": [],
  "vizConfig": {
    "chartType": "bar|line|pie|table|area|scatter",
    "xAxis": "column_name",
    "yAxis": "column_name_or_array",
    "groupBy": "column_name_or_null",
    "title": "Chart title in user's language"
  }
}`,
  user: ctx.conversationHistory
    ? `Previous conversation:\n${ctx.conversationHistory}\n\nNew question: ${ctx.userMessage}`
    : ctx.userMessage,
});
```

### 4.3 Query Validator Service

```typescript
// query/query-validator.service.ts
@Injectable()
export class QueryValidatorService {
  private readonly FORBIDDEN_PATTERNS = [
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i,
    /\b(EXEC|EXECUTE|CALL)\b/i,
    /;\s*\w/,                    // Multiple statements (SQL injection)
    /\/\*[\s\S]*?\*\//,         // Block comments (obfuscation)
    /--.*$/m,                    // Line comments
    /\bINTO\s+OUTFILE\b/i,
    /\bLOAD_FILE\b/i,
    /\bpg_sleep\b/i,            // Time-based injection
  ];

  validate(sql: string): ValidationResult {
    const errors: string[] = [];

    // 1. Forbidden patterns check
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(sql)) {
        errors.push(`Forbidden SQL pattern detected: ${pattern.source}`);
      }
    }

    // 2. Must start with SELECT or WITH (CTE)
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      errors.push('Query must be a SELECT statement');
    }

    // 3. Must have LIMIT (prevent full table scan)
    if (!/\bLIMIT\b/i.test(sql)) {
      return {
        valid: errors.length === 0,
        sanitizedSql: `${sql} LIMIT 1000`,
        errors,
        warnings: ['Auto-added LIMIT 1000'],
      };
    }

    return { valid: errors.length === 0, sanitizedSql: sql, errors, warnings: [] };
  }
}
```

### 4.4 Query Executor Service

```typescript
// query/query-executor.service.ts
@Injectable()
export class QueryExecutorService {
  private readonly readonlyPool: Pool;  // pg Pool with READ-ONLY transaction

  constructor(@Inject(QUERY_OPTIONS) private readonly options: QueryOptions) {
    this.readonlyPool = new Pool({
      ...options.database,
      max: 5,                            // Limited connections for chat queries
      idleTimeoutMillis: 30_000,
      statement_timeout: '10000',        // 10s max per query
    });
  }

  async execute(sql: string, params: any[]): Promise<QueryExecutionResult> {
    const start = Date.now();
    const client = await this.readonlyPool.connect();

    try {
      // Force READ-ONLY transaction
      await client.query('BEGIN READ ONLY');
      await client.query(`SET statement_timeout = '${this.options.queryTimeoutMs || 10_000}'`);

      const result = await client.query(sql, params);

      await client.query('COMMIT');

      return {
        data: result.rows,
        rowCount: result.rowCount,
        fields: result.fields.map(f => ({ name: f.name, dataType: f.dataTypeID })),
        executionTimeMs: Date.now() - start,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new QueryExecutionError(error.message, sql);
    } finally {
      client.release();
    }
  }
}
```

### 4.5 Visualization Recommender

```typescript
// query/viz-recommender.service.ts
@Injectable()
export class VizRecommenderService {
  /**
   * Fallback logic khi LLM không suggest chart type,
   * hoặc để validate LLM suggestion dựa trên data shape thực tế.
   */
  recommend(data: Record<string, any>[], fields: FieldInfo[]): VizConfig {
    const numericFields = fields.filter(f => this.isNumeric(f.dataType));
    const categoricalFields = fields.filter(f => !this.isNumeric(f.dataType) && !this.isDate(f.dataType));
    const dateFields = fields.filter(f => this.isDate(f.dataType));
    const uniqueCategories = categoricalFields.length > 0
      ? new Set(data.map(r => r[categoricalFields[0].name])).size
      : 0;

    // Decision tree
    if (dateFields.length >= 1 && numericFields.length >= 1) {
      return { chartType: 'line', xAxis: dateFields[0].name, yAxis: numericFields.map(f => f.name) };
    }
    if (categoricalFields.length >= 1 && numericFields.length >= 1) {
      if (uniqueCategories <= 6 && numericFields.length === 1) {
        return { chartType: 'pie', xAxis: categoricalFields[0].name, yAxis: numericFields[0].name };
      }
      return { chartType: 'bar', xAxis: categoricalFields[0].name, yAxis: numericFields.map(f => f.name) };
    }
    if (numericFields.length >= 2) {
      return { chartType: 'scatter', xAxis: numericFields[0].name, yAxis: numericFields[1].name };
    }

    // Default: table
    return { chartType: 'table', xAxis: '', yAxis: '' };
  }
}
```

---

## 5. Chat Gateway & Conversation Manager

### 5.1 Chat Gateway (WebSocket)

```typescript
// chat/chat.gateway.ts
@WebSocketGateway({ namespace: '/chat', cors: true })
export class ChatGateway extends BootWsGateway {
  @WebSocketServer() server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationService,
  ) {
    super();
  }

  /**
   * Main message handler - user sends a question.
   * Client emits: { conversationId?, message, context? }
   * Server streams back: multiple 'chat:response' events.
   */
  @SubscribeMessage('chat:message')
  @WsAuthRequired()
  async handleMessage(
    @MessageBody() dto: SendMessageDto,
    @ConnectedSocket() client: BootSocket,
  ): Promise<void> {
    const userId = client.data.userId;
    const orgId = client.data.organizationId;

    // 1. Get or create conversation
    const conversation = dto.conversationId
      ? await this.conversationService.findById(dto.conversationId)
      : await this.conversationService.create({ userId, organizationId: orgId, context: dto.context });

    // 2. Emit "thinking" state
    client.emit('chat:status', { conversationId: conversation._id, status: 'thinking' });

    try {
      // 3. Process message through pipeline (streaming)
      const stream = this.chatService.processMessage({
        conversationId: conversation._id,
        userId,
        organizationId: orgId,
        message: dto.message,
        dataSourceId: dto.context?.dataSourceId || conversation.context.dataSourceId,
      });

      // 4. Stream response chunks back to client
      for await (const chunk of stream) {
        client.emit('chat:response', {
          conversationId: conversation._id,
          ...chunk,
        });
      }
    } catch (error) {
      client.emit('chat:response', {
        conversationId: conversation._id,
        type: 'error',
        content: 'Xin lỗi, tôi không thể xử lý câu hỏi này. Vui lòng thử lại.',
      });
    }
  }

  /**
   * User rates a response (feedback loop).
   */
  @SubscribeMessage('chat:feedback')
  @WsAuthRequired()
  async handleFeedback(
    @MessageBody() dto: { messageId: string; type: FeedbackType; comment?: string },
    @ConnectedSocket() client: BootSocket,
  ): Promise<void> {
    await this.chatService.saveFeedback({
      messageId: dto.messageId,
      userId: client.data.userId,
      ...dto,
    });
    client.emit('chat:feedback:ack', { messageId: dto.messageId });
  }

  /**
   * User stops a running query.
   */
  @SubscribeMessage('chat:cancel')
  @WsAuthRequired()
  async handleCancel(
    @MessageBody() dto: { conversationId: string },
    @ConnectedSocket() client: BootSocket,
  ): Promise<void> {
    await this.chatService.cancelQuery(dto.conversationId, client.data.userId);
    client.emit('chat:status', { conversationId: dto.conversationId, status: 'cancelled' });
  }
}
```

### 5.2 Chat Service (Orchestrator)

```typescript
// chat/chat.service.ts
@Injectable()
export class ChatService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly queryGenerator: QueryGeneratorService,
    private readonly queryValidator: QueryValidatorService,
    private readonly queryExecutor: QueryExecutorService,
    private readonly vizRecommender: VizRecommenderService,
    private readonly messageRepo: MessageRepository,
    private readonly queryHistoryRepo: QueryHistoryRepository,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Main pipeline - returns AsyncGenerator for streaming.
   */
  async *processMessage(request: ProcessMessageRequest): AsyncGenerator<ChatResponseChunk> {
    // 1. Save user message
    const userMessage = await this.messageRepo.create({
      conversationId: request.conversationId,
      role: 'user',
      content: request.message,
      status: 'success',
    });

    // 2. Load conversation history for multi-turn context
    const history = await this.messageRepo.findMany(
      { conversationId: request.conversationId },
      { sort: { createdAt: -1 }, limit: 10 },
    );

    // 3. Generate SQL via RAG + LLM
    yield { type: 'text', content: 'Đang phân tích câu hỏi...' };

    const generated = await this.queryGenerator.generate({
      message: request.message,
      organizationId: request.organizationId,
      dataSourceId: request.dataSourceId,
      history: history.data.reverse(),
    });

    // 4. Handle clarification
    if (generated.type === 'clarification') {
      const clarifyMsg = await this.messageRepo.create({
        conversationId: request.conversationId,
        role: 'assistant',
        content: generated.message,
        status: 'clarification',
        metadata: { confidence: generated.confidence },
      });
      yield { type: 'clarification', content: generated.message, suggestions: generated.suggestions };
      yield { type: 'done', messageId: clarifyMsg._id };
      return;
    }

    // 5. Validate SQL
    const validation = this.queryValidator.validate(generated.sql);
    if (!validation.valid) {
      yield { type: 'error', content: `Query không hợp lệ: ${validation.errors.join(', ')}` };
      return;
    }

    yield { type: 'text', content: generated.explanation };
    yield { type: 'sql', content: validation.sanitizedSql };

    // 6. Execute query
    yield { type: 'text', content: 'Đang truy vấn dữ liệu...' };
    const queryResult = await this.queryExecutor.execute(validation.sanitizedSql, generated.params);

    yield { type: 'data', content: queryResult.data, rowCount: queryResult.rowCount };

    // 7. Determine visualization
    const vizConfig = generated.vizConfig
      ?? this.vizRecommender.recommend(queryResult.data, queryResult.fields);

    yield { type: 'viz', content: vizConfig };

    // 8. Save assistant message with full context
    const assistantMessage = await this.messageRepo.create({
      conversationId: request.conversationId,
      role: 'assistant',
      content: generated.explanation,
      queryResult: {
        sql: validation.sanitizedSql,
        data: queryResult.data.slice(0, 100), // Store max 100 rows in message
        rowCount: queryResult.rowCount,
        executionTimeMs: queryResult.executionTimeMs,
      },
      vizConfig,
      status: 'success',
      metadata: {
        model: generated.model,
        tokensUsed: generated.tokensUsed,
        ragContextIds: generated.ragContextIds,
        confidence: generated.confidence,
      },
    });

    // 9. Save to query history
    await this.queryHistoryRepo.create({
      userId: request.userId,
      conversationId: request.conversationId,
      messageId: assistantMessage._id,
      naturalLanguageQuery: request.message,
      generatedSql: validation.sanitizedSql,
      executionStatus: 'success',
      executionTimeMs: queryResult.executionTimeMs,
      rowCount: queryResult.rowCount,
    });

    // 10. Update conversation
    await this.conversationService.incrementMessageCount(request.conversationId);

    // 11. Emit event for analytics
    await this.eventBus.emit(new ChatQueryCompletedEvent({
      userId: request.userId,
      organizationId: request.organizationId,
      queryTimeMs: queryResult.executionTimeMs,
    }));

    yield { type: 'done', messageId: assistantMessage._id };
  }
}
```

### 5.3 Chat Controller (REST - history)

```typescript
// chat/chat.controller.ts
@Controller('api/v1/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageRepo: MessageRepository,
    private readonly chatService: ChatService,
  ) {}

  /** List conversations */
  @Get('conversations')
  async listConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: ConversationQueryDto,
  ): Promise<PaginatedResult<Conversation>> {
    return this.conversationService.findByUser(user.id, query);
  }

  /** Get conversation messages */
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationDto,
  ): Promise<PaginatedResult<Message>> {
    await this.conversationService.assertOwnership(conversationId, user.id);
    return this.messageRepo.findMany(
      { conversationId },
      { page: query.page, limit: query.limit, sort: { createdAt: 1 } },
    );
  }

  /** Delete conversation */
  @Delete('conversations/:id')
  async deleteConversation(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.conversationService.assertOwnership(conversationId, user.id);
    await this.conversationService.softDelete(conversationId);
  }

  /** Submit feedback for a message */
  @Post('messages/:id/feedback')
  async submitFeedback(
    @Param('id') messageId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: FeedbackDto,
  ): Promise<ChatFeedback> {
    return this.chatService.saveFeedback({ messageId, userId: user.id, ...dto });
  }
}
```

---

## 6. Inter-Service Integration & Security

### 6.1 Service Integration Map

```
                          ┌─────────────────────────────────────┐
                          │          API Gateway :3000           │
                          │  JWT validation + route to services  │
                          └──────┬──────────────┬───────────────┘
                                 │              │
                    ┌────────────┘              └──────────────┐
                    │ gRPC                          WebSocket  │
                    ▼                                          ▼
            ┌───────────────┐                    ┌──────────────────┐
            │  Auth Service  │◄───── gRPC ──────│  Chat Service     │
            │  :5001         │   validateToken   │  :5010            │
            │                │   getUserPerms    │                   │
            └───────────────┘                    │  ┌──────────────┐│
                                                 │  │ Chat Gateway ││ ← WS /chat
            ┌───────────────┐                    │  │ RAG Engine   ││
            │  Data Service  │◄───── gRPC ──────│  │ Query Gen    ││
            │  :5002         │  getDataSource    │  │ Query Exec   ││
            │                │  getSchema        │  └──────────────┘│
            │                │  executeQuery     └──────────────────┘
            └───────────────┘          │
                                       │
                              ┌────────┴────────┐
                              │   PostgreSQL     │
                              │ ┌──────────────┐ │
                              │ │ app_data (RW) │ │ ← Data Service manages
                              │ │ app_data (RO) │ │ ← Chat Service queries (READ ONLY)
                              │ │ pgvector ext  │ │ ← Vector embeddings
                              │ └──────────────┘ │
                              └─────────────────┘
                              ┌─────────────────┐
                              │    MongoDB       │
                              │ conversations    │ ← Chat Service owns
                              │ messages         │
                              │ metadata_catalog │
                              │ query_history    │
                              │ chat_feedback    │
                              └─────────────────┘
```

### 6.2 gRPC Proto Definitions

```protobuf
// proto/chat.proto
syntax = "proto3";
package chat;

// Chat Service gọi Data Service
service DataQueryService {
  rpc GetDataSource(GetDataSourceRequest) returns (DataSourceResponse);
  rpc GetSchema(GetSchemaRequest) returns (SchemaResponse);
  rpc ValidateUserAccess(ValidateAccessRequest) returns (ValidateAccessResponse);
}

message GetDataSourceRequest {
  string data_source_id = 1;
  string organization_id = 2;
}

message DataSourceResponse {
  string id = 1;
  string name = 2;
  string type = 3;          // 'postgresql', 'mysql'
  string dialect = 4;
  SchemaInfo schema = 5;
}

message SchemaInfo {
  repeated TableInfo tables = 1;
}

message TableInfo {
  string name = 1;
  string description = 2;
  repeated ColumnInfo columns = 3;
}

message ColumnInfo {
  string name = 1;
  string data_type = 2;
  string description = 3;
  bool nullable = 4;
  bool is_primary_key = 5;
  ForeignKeyInfo foreign_key = 6;
  repeated string sample_values = 7;
}

message ValidateAccessRequest {
  string user_id = 1;
  string organization_id = 2;
  string data_source_id = 3;
  string action = 4;        // 'query'
}

message ValidateAccessResponse {
  bool allowed = 1;
  repeated string allowed_tables = 2;
  repeated string denied_tables = 3;
}
```

### 6.3 Permission-Aware Query Pipeline

```typescript
// Security layer in chat.service.ts processMessage()

async *processMessage(request: ProcessMessageRequest): AsyncGenerator<ChatResponseChunk> {
  // ── SECURITY GATE ──

  // 1. Validate user access to data source
  const access = await this.dataServiceClient.send<ValidateAccessResponse>(
    'ValidateUserAccess',
    {
      userId: request.userId,
      organizationId: request.organizationId,
      dataSourceId: request.dataSourceId,
      action: 'query',
    },
  );

  if (!access.allowed) {
    yield { type: 'error', content: 'Bạn không có quyền truy vấn nguồn dữ liệu này.' };
    return;
  }

  // 2. Inject allowed tables into RAG context
  //    → LLM chỉ "thấy" tables user có quyền
  const generated = await this.queryGenerator.generate({
    ...request,
    allowedTables: access.allowedTables,
  });

  // 3. Post-validate: check generated SQL only touches allowed tables
  const referencedTables = this.extractTablesFromSql(generated.sql);
  const forbidden = referencedTables.filter(t => access.deniedTables.includes(t));

  if (forbidden.length > 0) {
    yield { type: 'error', content: `Bạn không có quyền truy cập bảng: ${forbidden.join(', ')}` };
    return;
  }

  // ... continue pipeline
}
```

### 6.4 App Module (Root)

```typescript
// app.module.ts
@Module({
  imports: [
    // ── Framework modules ──
    ConfigModule.register(),
    DatabaseModule.register({ writer: { uri: process.env.MONGODB_URI } }),
    DatabaseModule.forFeature('master', [
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: MetadataCatalog.name, schema: MetadataCatalogSchema },
      { name: QueryHistory.name, schema: QueryHistorySchema },
      { name: ChatFeedback.name, schema: ChatFeedbackSchema },
    ]),
    WebSocketModule.register({
      cors: { origin: process.env.CORS_ORIGINS?.split(',') },
      redis: process.env.REDIS_URL ? { url: process.env.REDIS_URL } : undefined,
    }),
    EventBusModule.register({ transport: 'redis' }),
    CacheModule.register({ ttl: 300 }),
    TransportModule.register({
      clients: [
        { name: 'AUTH_SERVICE', transport: Transport.GRPC, options: { url: 'localhost:5001' } },
        { name: 'DATA_SERVICE', transport: Transport.GRPC, options: { url: 'localhost:5002' } },
      ],
    }),
    CorrelationModule.register(),
    MetricsModule.register({ prefix: 'chat_service' }),
    HealthModule.register(),

    // ── Chat-specific modules ──
    LlmModule.register({
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    }),
    RagModule.register({
      embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536, batchSize: 100 },
      vectorStore: { type: 'pgvector', collectionName: 'metadata_embeddings', similarityMetric: 'cosine' },
      retriever: { topK: 10, scoreThreshold: 0.7, reranking: false },
    }),
    QueryModule.register({
      database: { host: process.env.PG_HOST, port: 5432, database: process.env.PG_DB, user: 'readonly_user' },
      queryTimeoutMs: 10_000,
    }),
    ChatModule,
  ],
})
export class AppModule {}
```

---

## 7. Sequence Diagram - End-to-End Flow

### User hỏi "Doanh thu Q3 theo khu vực"

```
Browser                Gateway    Chat Service         RAG         LLM        Data DB
  │                       │            │                │           │            │
  │── WS connect ────────►│            │                │           │            │
  │   (JWT in handshake)  │            │                │           │            │
  │                       │── validate JWT ──►Auth Svc  │           │            │
  │                       │◄── ok, userId ───           │           │            │
  │◄── connected ─────────│            │                │           │            │
  │                                    │                │           │            │
  │── chat:message ───────────────────►│                │           │            │
  │   { message: "Doanh thu Q3        │                │           │            │
  │     theo khu vực" }               │                │           │            │
  │                                    │                │           │            │
  │◄── chat:status { thinking } ──────│                │           │            │
  │                                    │                │           │            │
  │                                    │── validate ───►│ Data Svc  │            │
  │                                    │   access       │ (gRPC)    │            │
  │                                    │◄── allowed ────│           │            │
  │                                    │                │           │            │
  │                                    │── retrieve ───►│           │            │
  │                                    │   context      │           │            │
  │                                    │                │── embed ──►│            │
  │                                    │                │   query    │            │
  │                                    │                │◄── vector ─│            │
  │                                    │                │           │            │
  │                                    │                │── pgvector search ────►│
  │                                    │                │◄── top 10 chunks ─────│
  │                                    │                │           │            │
  │                                    │◄── schema +   │           │            │
  │                                    │    glossary    │           │            │
  │                                    │    context     │           │            │
  │                                    │                │           │            │
  │◄── chat:response ─────────────────│                │           │            │
  │    { type: 'text',                │── generate ────────────────►│            │
  │      'Đang phân tích...' }        │   SQL                      │            │
  │                                    │◄── JSON response ─────────│            │
  │                                    │   { sql, vizConfig,       │            │
  │                                    │     explanation }         │            │
  │                                    │                │           │            │
  │◄── { type: 'text',               │── validate SQL │           │            │
  │      'Lấy tổng doanh thu...' }    │   (security)  │           │            │
  │                                    │                │           │            │
  │◄── { type: 'sql',                │── execute ─────────────────────────────►│
  │      'SELECT region...' }         │   READ ONLY                             │
  │                                    │◄── rows ──────────────────────────────│
  │                                    │                │           │            │
  │◄── { type: 'data',               │                │           │            │
  │      content: [{HN:1.2B},        │                │           │            │
  │       {HCM:2.5B}, ...] }         │                │           │            │
  │                                    │                │           │            │
  │◄── { type: 'viz',                │                │           │            │
  │      { chartType:'bar',          │                │           │            │
  │        xAxis:'region',           │                │           │            │
  │        yAxis:'revenue' } }       │                │           │            │
  │                                    │                │           │            │
  │◄── { type: 'done',               │── save msg ──► MongoDB     │            │
  │      messageId: '...' }           │── save history►            │            │
  │                                    │── emit event ► EventBus   │            │
  │                                    │                │           │            │
  │   [Render bar chart]              │                │           │            │
  │                                    │                │           │            │
  │── chat:feedback ──────────────────►│                │           │            │
  │   { messageId, type:'thumbs_up' } │── save ──────► MongoDB     │            │
  │◄── chat:feedback:ack ─────────────│                │           │            │
```

---

## 8. API Contracts

### 8.1 WebSocket Events

| Event               | Direction        | Payload                                           | Description              |
| ------------------- | ---------------- | ------------------------------------------------- | ------------------------ |
| `chat:message`      | Client → Server  | `{ conversationId?, message, context? }`          | User sends question      |
| `chat:status`       | Server → Client  | `{ conversationId, status }`                      | thinking / streaming     |
| `chat:response`     | Server → Client  | `{ conversationId, type, content, ... }`          | Streamed response chunks |
| `chat:feedback`     | Client → Server  | `{ messageId, type, comment? }`                   | User rates response      |
| `chat:feedback:ack` | Server → Client  | `{ messageId }`                                   | Feedback saved           |
| `chat:cancel`       | Client → Server  | `{ conversationId }`                              | Cancel running query     |

### 8.2 Response Chunk Types

```typescript
type ChatResponseChunk =
  | { type: 'text'; content: string }                                    // Explanation text
  | { type: 'sql'; content: string }                                     // Generated SQL
  | { type: 'data'; content: Record<string, any>[]; rowCount: number }   // Query results
  | { type: 'viz'; content: VizConfig }                                  // Chart configuration
  | { type: 'clarification'; content: string; suggestions: string[] }    // Need more info
  | { type: 'error'; content: string }                                   // Error message
  | { type: 'done'; messageId: string };                                 // Stream complete
```

### 8.3 REST API

| Method   | Endpoint                                | Description                         |
| -------- | --------------------------------------- | ----------------------------------- |
| `GET`    | `/api/v1/chat/conversations`            | List user's conversations           |
| `GET`    | `/api/v1/chat/conversations/:id/messages` | Get messages in conversation      |
| `DELETE` | `/api/v1/chat/conversations/:id`        | Soft delete conversation            |
| `POST`   | `/api/v1/chat/messages/:id/feedback`    | Submit feedback for a message       |
| `POST`   | `/api/v1/chat/admin/index-datasource`   | Trigger metadata re-indexing        |
| `POST`   | `/api/v1/chat/admin/glossary`           | Add business glossary terms         |
| `GET`    | `/api/v1/chat/admin/query-history`      | View query history + feedback       |

---

## 9. Tech Stack Summary

| Component          | Choice                   | Reason                                         |
| ------------------ | ------------------------ | ---------------------------------------------- |
| **LLM**            | OpenAI GPT-4o / Claude   | Text-to-SQL accuracy cao                       |
| **Vector DB**      | pgvector (PG extension)  | Đã dùng Prisma+PG, không cần thêm infra        |
| **Embedding**      | text-embedding-3-small   | Giá rẻ, chất lượng tốt cho metadata            |
| **Chat transport** | WebSocket (nestjs-boot)  | Real-time, streaming response                  |
| **Query sandbox**  | READ-ONLY pg pool        | An toàn, tránh SQL injection                   |
| **Message store**  | MongoDB                  | Flexible schema cho chat messages               |
| **Caching**        | Redis (nestjs-boot)      | Cache frequent queries + embeddings             |

## 10. Implementation Phases

### Phase 1: Basic Chat → SQL (3 tasks)
- Chat Service skeleton + WebSocket gateway
- Metadata indexing pipeline (schema → vector)
- Basic Text-to-SQL with LLM

### Phase 2: Smart Features (3 tasks)
- Viz recommendation (auto chart type selection)
- Conversation memory (follow-up: "drill down theo tháng")
- Query validation + permission check

### Phase 3: Production Hardening (3 tasks)
- Query caching + rate limiting
- Feedback loop (user ratings → improve accuracy)
- Multi-language support (VI/EN)
