"use client";

import { useState, useCallback } from "react";
import {
  Database,
  HardDrive,
  Shield,
  Radio,
  Box,
  Ship,
  TestTube,
  FileCode,
  Download,
  Copy,
  Check,
  Eye,
} from "lucide-react";
import {
  ProjectConfig,
  defaultConfig,
  generateMainTs,
  generateDockerCompose,
  generateCliCommand,
  generateMermaidDiagram,
} from "@/lib/generator";

const dbOptions = [
  { value: "none", label: "None", icon: "---" },
  { value: "mongodb", label: "MongoDB", icon: "M" },
  { value: "postgres", label: "PostgreSQL", icon: "P" },
  { value: "mysql", label: "MySQL", icon: "My" },
  { value: "dynamodb", label: "DynamoDB", icon: "D" },
  { value: "elasticsearch", label: "Elasticsearch", icon: "ES" },
];

const cacheOptions = [
  { value: "none", label: "None", icon: "---" },
  { value: "redis", label: "Redis", icon: "R" },
  { value: "memcached", label: "Memcached", icon: "Mc" },
];

const authOptions = [
  { value: "none", label: "None", icon: "---" },
  { value: "jwt", label: "JWT", icon: "J" },
];

const transportOptions = [
  { value: "http", label: "HTTP Only", icon: "H" },
  { value: "grpc", label: "+ gRPC", icon: "gR" },
  { value: "tcp", label: "+ TCP", icon: "T" },
  { value: "nats", label: "+ NATS", icon: "N" },
  { value: "rabbitmq", label: "+ RabbitMQ", icon: "RQ" },
];

type PreviewTab = "main.ts" | "docker-compose.yml" | "diagram" | "cli";

function OptionGrid({
  label,
  icon: Icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  options: { value: string; label: string; icon: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
        <Icon className="w-4 h-4 text-sky-400" />
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 rounded-lg text-sm border transition-all ${
              value === opt.value
                ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
            }`}
          >
            <div className="text-xs font-mono text-gray-500 mb-0.5">{opt.icon}</div>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GeneratePage() {
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("main.ts");
  const [copied, setCopied] = useState(false);

  const update = useCallback(
    (key: keyof ProjectConfig, value: string | boolean) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const previewContent = () => {
    switch (previewTab) {
      case "main.ts":
        return generateMainTs(config);
      case "docker-compose.yml":
        return generateDockerCompose(config);
      case "diagram":
        return generateMermaidDiagram(config);
      case "cli":
        return generateCliCommand(config);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    zip.file("src/main.ts", generateMainTs(config));
    zip.file("docker-compose.yml", generateDockerCompose(config));
    zip.file("package.json", JSON.stringify({ name: config.name, version: "0.1.0", private: true }, null, 2));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Project Generator</h1>
      <p className="text-gray-400 mb-8">Configure and generate a nestjs-boot project visually</p>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config Form */}
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
            {/* Project Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <FileCode className="w-4 h-4 text-sky-400" />
                Project Name
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => update("name", e.target.value.replace(/[^a-z0-9-]/g, ""))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-sky-500"
                placeholder="my-service"
              />
            </div>

            <OptionGrid label="Database" icon={Database} options={dbOptions} value={config.db} onChange={(v) => update("db", v)} />
            <OptionGrid label="Cache" icon={HardDrive} options={cacheOptions} value={config.cache} onChange={(v) => update("cache", v)} />
            <OptionGrid label="Authentication" icon={Shield} options={authOptions} value={config.auth} onChange={(v) => update("auth", v)} />
            <OptionGrid label="Transport" icon={Radio} options={transportOptions} value={config.transport} onChange={(v) => update("transport", v)} />

            {/* Extras */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <Box className="w-4 h-4 text-sky-400" />
                Extras
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "docker" as const, label: "Docker", icon: Ship },
                  { key: "k8s" as const, label: "Kubernetes", icon: Box },
                  { key: "tests" as const, label: "Tests", icon: TestTube },
                  { key: "eslint" as const, label: "ESLint", icon: FileCode },
                ].map((extra) => (
                  <label
                    key={extra.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border cursor-pointer transition-all ${
                      config[extra.key]
                        ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={config[extra.key]}
                      onChange={(e) => update(extra.key, e.target.checked)}
                      className="sr-only"
                    />
                    <extra.icon className="w-3.5 h-3.5" />
                    {extra.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Download ZIP
            </button>
            <button
              onClick={() => handleCopy(generateCliCommand(config))}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium border border-gray-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy CLI Command"}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex border-b border-gray-800">
            {(["main.ts", "docker-compose.yml", "diagram", "cli"] as PreviewTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setPreviewTab(tab)}
                className={`px-4 py-2.5 text-sm transition-colors ${
                  previewTab === tab
                    ? "text-sky-400 border-b-2 border-sky-400 bg-gray-800/50"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab === "cli" ? "CLI Command" : tab === "diagram" ? "Diagram" : tab}
              </button>
            ))}
          </div>
          <div className="p-4 max-h-[600px] overflow-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
              {previewContent()}
            </pre>
          </div>
          <div className="border-t border-gray-800 px-4 py-2 flex justify-end">
            <button
              onClick={() => handleCopy(previewContent())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-md transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
