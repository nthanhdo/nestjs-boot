/**
 * generator.js — Core logic for the nestjs-boot web generator.
 * Reads config from the UI, generates previews, file trees, diagrams, CLI commands, and ZIP downloads.
 */

import * as T from './templates.js';

// ── Config reader ──────────────────────────────────────────────

export function readConfig() {
  return {
    name: document.getElementById('project-name').value.trim() || 'my-service',
    db: document.getElementById('database').value,
    cache: document.getElementById('cache').value,
    auth: document.getElementById('auth').value,
    transport: document.getElementById('transport').value,
    docker: document.getElementById('extra-docker').checked,
    k8s: document.getElementById('extra-k8s').checked,
    lint: document.getElementById('extra-lint').checked,
    tests: document.getElementById('extra-tests').checked,
  };
}

// ── File tree ──────────────────────────────────────────────────

export function generateFileTree(c) {
  const files = [
    { path: 'src/main.ts', type: 'file' },
    { path: 'src/app.module.ts', type: 'file' },
    { path: 'src/app.controller.ts', type: 'file' },
    { path: 'src/app.service.ts', type: 'file' },
    { path: 'package.json', type: 'file' },
    { path: 'tsconfig.json', type: 'file' },
    { path: '.env.example', type: 'file' },
    { path: 'README.md', type: 'file' },
  ];
  if (c.tests) {
    files.push({ path: 'test/app.e2e-spec.ts', type: 'file' });
    files.push({ path: 'vitest.config.ts', type: 'file' });
  }
  if (c.docker) {
    files.push({ path: 'Dockerfile', type: 'file' });
    files.push({ path: 'docker-compose.yml', type: 'file' });
  }
  if (c.k8s) {
    files.push({ path: 'k8s/deployment.yaml', type: 'file' });
    files.push({ path: 'k8s/service.yaml', type: 'file' });
    files.push({ path: 'k8s/configmap.yaml', type: 'file' });
    files.push({ path: 'k8s/hpa.yaml', type: 'file' });
  }
  if (c.lint) {
    files.push({ path: '.eslintrc.js', type: 'file' });
    files.push({ path: '.prettierrc', type: 'file' });
  }
  if (c.transport === 'grpc') {
    files.push({ path: `proto/${c.name}.proto`, type: 'file' });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// ── Render file tree as HTML ───────────────────────────────────

export function renderFileTree(files, name) {
  // Build a nested structure
  const root = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        node[p] = null; // leaf
      } else {
        if (!node[p]) node[p] = {};
        node = node[p];
      }
    }
  }

  function renderNode(obj, indent) {
    let html = '';
    const entries = Object.entries(obj).sort(([a, av], [b, bv]) => {
      // dirs first
      const aDir = av !== null ? 0 : 1;
      const bDir = bv !== null ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.localeCompare(b);
    });
    for (const [key, val] of entries) {
      const pad = '  '.repeat(indent);
      if (val !== null) {
        html += `<div class="tree-dir">${pad}<span class="text-sky-400">&#x1F4C1;</span> ${key}/</div>`;
        html += renderNode(val, indent + 1);
      } else {
        html += `<div class="tree-file">${pad}<span class="text-gray-500">&#x1F4C4;</span> ${key}</div>`;
      }
    }
    return html;
  }

  return `<div class="tree-dir"><span class="text-sky-400">&#x1F4C1;</span> ${name}/</div>` + renderNode(root, 1);
}

// ── Mermaid diagram ────────────────────────────────────────────

export function generateMermaidDiagram(c) {
  let lines = ['graph LR'];
  lines.push(`  APP["${c.name}<br/>NestJS"]`);
  lines.push(`  style APP fill:#0ea5e9,stroke:#0284c7,color:#fff`);

  if (c.db === 'mongodb') {
    lines.push('  DB[("MongoDB")]');
    lines.push('  APP --> DB');
    lines.push('  style DB fill:#00684a,stroke:#00ed64,color:#fff');
  } else if (c.db === 'postgres') {
    lines.push('  DB[("PostgreSQL")]');
    lines.push('  APP --> DB');
    lines.push('  style DB fill:#336791,stroke:#fff,color:#fff');
  } else if (c.db === 'mysql') {
    lines.push('  DB[("MySQL")]');
    lines.push('  APP --> DB');
    lines.push('  style DB fill:#4479a1,stroke:#fff,color:#fff');
  } else if (c.db === 'dynamodb') {
    lines.push('  DB[("DynamoDB")]');
    lines.push('  APP --> DB');
    lines.push('  style DB fill:#4053d6,stroke:#fff,color:#fff');
  } else if (c.db === 'elasticsearch') {
    lines.push('  DB[("Elasticsearch")]');
    lines.push('  APP --> DB');
    lines.push('  style DB fill:#fed10a,stroke:#333,color:#333');
  }

  if (c.cache === 'redis') {
    lines.push('  CACHE["Redis"]');
    lines.push('  APP --> CACHE');
    lines.push('  style CACHE fill:#dc382d,stroke:#fff,color:#fff');
  } else if (c.cache === 'memcached') {
    lines.push('  CACHE["Memcached"]');
    lines.push('  APP --> CACHE');
    lines.push('  style CACHE fill:#6b7280,stroke:#fff,color:#fff');
  }

  if (c.auth === 'jwt') {
    lines.push('  AUTH["JWT Auth"]');
    lines.push('  APP --- AUTH');
    lines.push('  style AUTH fill:#7c3aed,stroke:#fff,color:#fff');
  }

  if (c.transport !== 'http') {
    const label = c.transport === 'grpc' ? 'gRPC' :
                  c.transport === 'tcp' ? 'TCP' :
                  c.transport === 'nats' ? 'NATS' : 'RabbitMQ';
    lines.push(`  TRANSPORT["${label}"]`);
    lines.push('  APP <--> TRANSPORT');
    lines.push('  style TRANSPORT fill:#f59e0b,stroke:#fff,color:#333');
  }

  lines.push('  CLIENT(("Client"))');
  lines.push('  CLIENT -->|HTTP :3000| APP');
  lines.push('  style CLIENT fill:#374151,stroke:#9ca3af,color:#fff');

  return lines.join('\n');
}

// ── CLI command ────────────────────────────────────────────────

export function generateCliCommand(c) {
  let cmd = `npx nestjs-boot new ${c.name}`;
  if (c.db !== 'none') cmd += ` --db=${c.db}`;
  if (c.cache !== 'none') cmd += ` --cache=${c.cache}`;
  if (c.auth !== 'none') cmd += ` --auth=${c.auth}`;
  if (c.transport !== 'http') cmd += ` --transport=${c.transport}`;
  if (c.docker) cmd += ' --docker';
  if (c.k8s) cmd += ' --k8s';
  if (c.lint) cmd += ' --lint';
  if (c.tests) cmd += ' --tests';
  return cmd;
}

// ── ZIP generation ─────────────────────────────────────────────

export async function generateZip(c) {
  const zip = new JSZip();
  const root = zip.folder(c.name);

  // Source files
  const src = root.folder('src');
  src.file('main.ts', T.mainTs(c));
  src.file('app.module.ts', T.appModule());
  src.file('app.controller.ts', T.appController());
  src.file('app.service.ts', T.appService(c));

  // Root config
  root.file('package.json', T.packageJson(c));
  root.file('tsconfig.json', T.tsconfig());
  root.file('.env.example', T.envExample(c));
  root.file('README.md', T.readmeMd(c));

  // Tests
  if (c.tests) {
    const test = root.folder('test');
    test.file('app.e2e-spec.ts', T.e2eSpec(c));
    root.file('vitest.config.ts', T.vitestConfig());
  }

  // Docker
  if (c.docker) {
    root.file('Dockerfile', T.dockerfile());
    root.file('docker-compose.yml', T.dockerCompose(c));
  }

  // K8s
  if (c.k8s) {
    const k8s = root.folder('k8s');
    k8s.file('deployment.yaml', T.k8sDeployment(c));
    k8s.file('service.yaml', T.k8sService(c));
    k8s.file('configmap.yaml', T.k8sConfigMap(c));
    k8s.file('hpa.yaml', T.k8sHpa(c));
  }

  // Lint
  if (c.lint) {
    root.file('.eslintrc.js', T.eslintConfig());
    root.file('.prettierrc', T.prettierConfig());
  }

  // gRPC proto
  if (c.transport === 'grpc') {
    const protoDir = root.folder('proto');
    protoDir.file(`${c.name}.proto`, T.proto(c));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${c.name}.zip`);
}

// ── Preview generators (return strings for display) ────────────

export function generateMainTsPreview(c) {
  return T.mainTs(c);
}

export function generateDockerComposePreview(c) {
  return T.dockerCompose(c);
}
