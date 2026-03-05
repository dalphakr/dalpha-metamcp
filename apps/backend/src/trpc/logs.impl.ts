import {
  ClearLogsResponseSchema,
  GetLogsRequestSchema,
  GetLogsResponseSchema,
  GetPodLogsRequestSchema,
  GetPodLogsResponseSchema,
} from "@repo/zod-types";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import logger from "@/utils/logger";

import { mcpServersRepository } from "../db/repositories";
import { getPodLogs, getPodStatus } from "../lib/k8s";
import { metamcpLogStore } from "../lib/metamcp/log-store";

export const logsImplementations = {
  getLogs: async (
    input: z.infer<typeof GetLogsRequestSchema>,
  ): Promise<z.infer<typeof GetLogsResponseSchema>> => {
    try {
      const logs = metamcpLogStore.getLogs(input.limit);
      const totalCount = metamcpLogStore.getLogCount();

      return {
        success: true as const,
        data: logs,
        totalCount,
      };
    } catch (error) {
      logger.error("Error getting logs:", error);
      throw new Error("Failed to get logs");
    }
  },

  clearLogs: async (): Promise<z.infer<typeof ClearLogsResponseSchema>> => {
    try {
      metamcpLogStore.clearLogs();

      return {
        success: true as const,
        message: "All logs have been cleared successfully",
      };
    } catch (error) {
      logger.error("Error clearing logs:", error);
      throw new Error("Failed to clear logs");
    }
  },

  getPodLogs: async (
    input: z.infer<typeof GetPodLogsRequestSchema>,
  ): Promise<z.infer<typeof GetPodLogsResponseSchema>> => {
    const server = await mcpServersRepository.findByUuid(input.serverUuid);
    if (!server) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
    }
    if (server.type !== "STDIO" || !server.k8s_command_hash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pod logs are only available for STDIO servers",
      });
    }

    const status = await getPodStatus(server.k8s_command_hash);
    const logs = await getPodLogs(server.k8s_command_hash, {
      tailLines: input.tailLines,
      sinceSeconds: input.sinceSeconds,
      timestamps: true,
    });

    return {
      success: true as const,
      data: {
        logs: logs ?? "",
        podName: `metamcp-mcp-${server.k8s_command_hash}`,
        podPhase: status?.phase ?? "Unknown",
        ready: status?.ready ?? false,
      },
    };
  },
};
