import { DatabaseMcpServer, McpServer } from "@repo/zod-types";

export class McpServersSerializer {
  static serializeMcpServer(dbServer: DatabaseMcpServer): McpServer {
    return {
      uuid: dbServer.uuid,
      name: dbServer.name,
      description: dbServer.description,
      type: dbServer.type,
      command: dbServer.command,
      args: dbServer.args,
      env: dbServer.env,
      url: dbServer.url,
      error_status: dbServer.error_status,
      created_at: dbServer.created_at.toISOString(),
      bearerToken: dbServer.bearerToken,
      headers: dbServer.headers,
      user_id: dbServer.user_id,
      k8s_resource_preset: dbServer.k8s_resource_preset ?? null,
      k8s_cpu_request: dbServer.k8s_cpu_request ?? null,
      k8s_cpu_limit: dbServer.k8s_cpu_limit ?? null,
      k8s_memory_request: dbServer.k8s_memory_request ?? null,
      k8s_memory_limit: dbServer.k8s_memory_limit ?? null,
    };
  }

  static serializeMcpServerList(dbServers: DatabaseMcpServer[]): McpServer[] {
    return dbServers.map(this.serializeMcpServer);
  }
}
