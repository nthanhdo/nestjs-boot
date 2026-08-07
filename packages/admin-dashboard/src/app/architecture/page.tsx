"use client";

import { useState } from "react";
import { Server, Database, Radio, Shield, Eye, Copy, Check } from "lucide-react";

interface Service {
  name: string;
  port: number;
  db: string;
  cache: string;
  transport: string;
  features: string[];
  description: string;
}

const services: Service[] = [
  { name: "api-gateway", port: 3000, db: "none", cache: "redis", transport: "HTTP", features: ["Rate Limiting", "JWT Auth", "Load Balancing"], description: "Entry point for all client requests. Routes to internal services." },
  { name: "user-service", port: 3001, db: "PostgreSQL", cache: "redis", transport: "gRPC", features: ["JWT Auth", "RBAC", "Validation"], description: "Manages user accounts, authentication, and authorization." },
  { name: "product-service", port: 3002, db: "MongoDB", cache: "redis", transport: "gRPC", features: ["Full-text Search", "Pagination", "Caching"], description: "Product catalog with search and filtering." },
  { name: "order-service", port: 3003, db: "PostgreSQL", cache: "redis", transport: "gRPC + NATS", features: ["CQRS", "Event Sourcing", "Saga"], description: "Order processing with event-driven workflow." },
  { name: "payment-service", port: 3004, db: "PostgreSQL", cache: "none", transport: "gRPC", features: ["Circuit Breaker", "Retry", "Idempotency"], description: "Payment processing with fault tolerance." },
  { name: "notification-service", port: 3005, db: "MongoDB", cache: "none", transport: "NATS", features: ["Email", "SMS", "Push"], description: "Multi-channel notification delivery." },
  { name: "inventory-service", port: 3006, db: "MongoDB", cache: "redis", transport: "gRPC + NATS", features: ["Real-time Stock", "Reservations"], description: "Real-time inventory tracking and reservations." },
  { name: "search-service", port: 3007, db: "Elasticsearch", cache: "none", transport: "gRPC", features: ["Full-text", "Aggregations", "Suggestions"], description: "Search engine with Elasticsearch backend." },
  { name: "analytics-service", port: 3008, db: "DynamoDB", cache: "none", transport: "NATS", features: ["Metrics", "Events", "Reports"], description: "Event collection and analytics reporting." },
  { name: "config-service", port: 3009, db: "MongoDB", cache: "redis", transport: "gRPC", features: ["Feature Flags", "A/B Testing", "Hot Reload"], description: "Centralized configuration and feature flags." },
];

const mermaidDiagram = `graph TD
  Client[Client Apps] --> GW[API Gateway :3000]

  GW -- gRPC --> US[User Service :3001]
  GW -- gRPC --> PS[Product Service :3002]
  GW -- gRPC --> OS[Order Service :3003]
  GW -- gRPC --> PAY[Payment Service :3004]
  GW -- gRPC --> SS[Search Service :3007]

  OS -- NATS --> NS[Notification Service :3005]
  OS -- NATS --> IS[Inventory Service :3006]
  OS -- NATS --> AS[Analytics Service :3008]

  PS -- gRPC --> SS
  IS -- NATS --> OS

  GW -- gRPC --> CS[Config Service :3009]

  US --> PG1[(PostgreSQL)]
  PS --> MG1[(MongoDB)]
  OS --> PG2[(PostgreSQL)]
  PAY --> PG3[(PostgreSQL)]
  NS --> MG2[(MongoDB)]
  IS --> MG3[(MongoDB)]
  SS --> ES[(Elasticsearch)]
  AS --> DDB[(DynamoDB)]
  CS --> MG4[(MongoDB)]

  GW --> Redis[(Redis Cache)]
  US --> Redis
  PS --> Redis
  OS --> Redis
  IS --> Redis
  CS --> Redis`;

export default function ArchitecturePage() {
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(mermaidDiagram);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Architecture Visualizer</h1>
      <p className="text-gray-400 mb-8">10-service microservice architecture powered by nestjs-boot</p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Mermaid Diagram */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-300">Architecture Diagram (Mermaid)</h2>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-md transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy Mermaid"}
            </button>
          </div>
          <div className="p-4 overflow-auto max-h-[500px]">
            <pre className="text-sm text-gray-300 font-mono whitespace-pre leading-relaxed">{mermaidDiagram}</pre>
          </div>
        </div>

        {/* Service Detail */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">
            {selectedService ? selectedService.name : "Select a service"}
          </h2>
          {selectedService ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">{selectedService.description}</p>
              <div>
                <div className="text-xs text-gray-500 mb-1">Port</div>
                <div className="text-sm text-sky-400 font-mono">:{selectedService.port}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Database</div>
                <div className="text-sm text-white">{selectedService.db}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Cache</div>
                <div className="text-sm text-white">{selectedService.cache}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Transport</div>
                <div className="text-sm text-white">{selectedService.transport}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Features</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedService.features.map((f) => (
                    <span key={f} className="px-2 py-0.5 text-xs bg-sky-500/10 text-sky-400 rounded border border-sky-500/20">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Click a service card below to see details.</p>
          )}
        </div>
      </div>

      {/* Service Cards */}
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {services.map((svc) => (
          <button
            key={svc.name}
            onClick={() => setSelectedService(svc)}
            className={`text-left p-3 rounded-lg border transition-all ${
              selectedService?.name === svc.name
                ? "bg-sky-500/10 border-sky-500/30"
                : "bg-gray-900 border-gray-800 hover:border-gray-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-mono text-white truncate">{svc.name}</span>
            </div>
            <div className="text-xs text-gray-500">:{svc.port} | {svc.db !== "none" ? svc.db : "No DB"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
