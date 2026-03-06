ALTER TABLE "mcp_servers" ADD COLUMN "k8s_resource_preset" text DEFAULT 'MEDIUM';
ALTER TABLE "mcp_servers" ADD COLUMN "k8s_cpu_request" text;
ALTER TABLE "mcp_servers" ADD COLUMN "k8s_cpu_limit" text;
ALTER TABLE "mcp_servers" ADD COLUMN "k8s_memory_request" text;
ALTER TABLE "mcp_servers" ADD COLUMN "k8s_memory_limit" text;
