import { z } from "zod";

export const MetaMcpLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  serverName: z.string(),
  level: z.enum(["error", "info", "warn"]),
  message: z.string(),
  error: z.string().optional(),
});

export const GetLogsRequestSchema = z.object({
  limit: z.number().int().positive().max(1000).optional(),
});

export const GetLogsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(MetaMcpLogEntrySchema),
  totalCount: z.number(),
});

export const ClearLogsResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const GetPodLogsRequestSchema = z.object({
  serverUuid: z.string().uuid(),
  tailLines: z.number().min(1).max(5000).optional().default(200),
  sinceSeconds: z.number().min(1).optional(),
});

export const GetPodLogsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    logs: z.string(),
    podName: z.string(),
    podPhase: z.string(),
    ready: z.boolean(),
  }),
});

export type MetaMcpLogEntry = z.infer<typeof MetaMcpLogEntrySchema>;
export type GetLogsRequest = z.infer<typeof GetLogsRequestSchema>;
export type GetLogsResponse = z.infer<typeof GetLogsResponseSchema>;
export type ClearLogsResponse = z.infer<typeof ClearLogsResponseSchema>;
export type GetPodLogsRequest = z.infer<typeof GetPodLogsRequestSchema>;
export type GetPodLogsResponse = z.infer<typeof GetPodLogsResponseSchema>;
