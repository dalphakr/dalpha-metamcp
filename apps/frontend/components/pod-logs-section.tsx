"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const TAIL_OPTIONS = [100, 200, 500, 1000] as const;

interface PodLogsSectionProps {
  serverUuid: string;
}

export function PodLogsSection({ serverUuid }: PodLogsSectionProps) {
  const [tailLines, setTailLines] = useState<number>(200);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } =
    trpc.frontend.logs.getPodLogs.useQuery(
      { serverUuid, tailLines },
      { refetchInterval: 5000 },
    );

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.data.logs, autoScroll]);

  const podData = data?.data;

  const phaseColor =
    podData?.podPhase === "Running"
      ? "text-green-600 dark:text-green-400"
      : podData?.podPhase === "Pending"
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border p-6 md:col-span-2">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Pod Logs</h3>
          {podData && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground font-mono">
                {podData.podName}
              </span>
              <Badge
                variant={podData.ready ? "success" : "secondary"}
                className="text-xs"
              >
                <span className={phaseColor}>{podData.podPhase}</span>
              </Badge>
              {podData.ready && (
                <div
                  className="w-2 h-2 bg-green-500 rounded-full"
                  title="Ready"
                />
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {TAIL_OPTIONS.map((n) => (
              <Button
                key={n}
                variant={tailLines === n ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTailLines(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant={autoScroll ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              ↓ Auto-scroll
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="relative rounded-md bg-zinc-950 text-zinc-200 font-mono text-xs overflow-auto max-h-[500px] min-h-[200px]">
        {error ? (
          <div className="p-4 text-red-400">
            {error.message}
          </div>
        ) : isLoading && !podData ? (
          <div className="p-4 text-zinc-500">Loading logs...</div>
        ) : !podData?.logs ? (
          <div className="p-4 text-zinc-500">No logs available</div>
        ) : (
          <pre className="p-4 whitespace-pre-wrap break-all leading-5">
            {podData.logs}
            <span ref={logsEndRef} />
          </pre>
        )}
      </div>
    </div>
  );
}
