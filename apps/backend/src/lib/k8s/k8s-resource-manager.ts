import * as k8s from '@kubernetes/client-node';
import logger from '@/utils/logger';
import { getAppsApi, getCoreApi, getNamespace } from './k8s-client';
import { K8S_CONFIG } from './k8s-config';

export interface StdioPodConfig {
  commandHash: string;
  serverName: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface PodStatus {
  podName: string;
  phase: string;
  ready: boolean;
  restartCount: number;
  containerState?: string;
}

export interface K8sManagedResource {
  commandHash: string;
  podName: string;
  serviceName: string;
  serviceUrl: string;
  podPhase: string;
  ready: boolean;
}

const MANAGED_BY_LABEL = 'metamcp';
const LABEL_COMMAND_HASH = 'metamcp.io/command-hash';
const LABEL_MANAGED_BY = 'app.kubernetes.io/managed-by';

function isNotFound(err: any): boolean {
  return err?.code === 404 || err?.statusCode === 404 || err?.response?.statusCode === 404;
}

function sanitizeK8sName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // invalid chars → hyphen
    .replace(/-+/g, '-')           // collapse consecutive hyphens
    .replace(/^-|-$/g, '')         // trim leading/trailing hyphens
    .slice(0, 50);                 // truncate (leave room for hash suffix)
}

function getResourceName(serverName: string, commandHash: string): string {
  const sanitized = sanitizeK8sName(serverName);
  return `metamcp-${sanitized}-${commandHash}`;
}

function getDeploymentName(serverName: string, commandHash: string): string {
  return getResourceName(serverName, commandHash);
}

function getServiceName(serverName: string, commandHash: string): string {
  return getResourceName(serverName, commandHash);
}

function getServiceUrl(serverName: string, commandHash: string): string {
  const ns = getNamespace();
  return `http://${getServiceName(serverName, commandHash)}.${ns}.svc.cluster.local:${K8S_CONFIG.supergatewayPort}/mcp`;
}

function getLabelSelector(commandHash: string): string {
  return `${LABEL_MANAGED_BY}=${MANAGED_BY_LABEL},${LABEL_COMMAND_HASH}=${commandHash}`;
}

async function findPodByCommandHash(commandHash: string): Promise<k8s.V1Pod | null> {
  const api = getCoreApi();
  const ns = getNamespace();
  const labelSelector = getLabelSelector(commandHash);

  const result = await api.listNamespacedPod({ namespace: ns, labelSelector });
  if (result.items.length === 0) return null;

  // Prefer a Running pod
  const running = result.items.find(p => p.status?.phase === 'Running');
  return running || result.items[0];
}

function buildDeploymentSpec(config: StdioPodConfig): k8s.V1Deployment {
  const envVars: k8s.V1EnvVar[] = [
    { name: 'MCP_COMMAND', value: config.command },
    { name: 'MCP_ARGS', value: JSON.stringify(config.args) },
  ];

  if (config.env && Object.keys(config.env).length > 0) {
    envVars.push({ name: 'MCP_ENV_JSON', value: JSON.stringify(config.env) });
  }

  const labels = {
    [LABEL_MANAGED_BY]: MANAGED_BY_LABEL,
    [LABEL_COMMAND_HASH]: config.commandHash,
  };

  return {
    metadata: {
      name: getDeploymentName(config.serverName, config.commandHash),
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: labels,
      },
      template: {
        metadata: { labels },
        spec: {
          affinity: {
            nodeAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [
                  {
                    matchExpressions: [
                      {
                        key: 'kubernetes.io/arch',
                        operator: 'In',
                        values: ['arm64'],
                      },
                    ],
                  },
                ],
              },
            },
          },
          containers: [
            {
              name: 'supergateway',
              image: K8S_CONFIG.supergatewayImage,
              ports: [{ containerPort: K8S_CONFIG.supergatewayPort }],
              env: envVars,
              resources: {
                requests: {
                  cpu: K8S_CONFIG.podCpuRequest,
                  memory: K8S_CONFIG.podMemoryRequest,
                },
                limits: {
                  cpu: K8S_CONFIG.podCpuLimit,
                  memory: K8S_CONFIG.podMemoryLimit,
                },
              },
              readinessProbe: {
                httpGet: {
                  path: '/healthz',
                  port: K8S_CONFIG.supergatewayPort as any,
                },
                initialDelaySeconds: 5,
                periodSeconds: 10,
              },
            },
          ],
        },
      },
    },
  };
}

function buildServiceSpec(serverName: string, commandHash: string): k8s.V1Service {
  return {
    metadata: {
      name: getServiceName(serverName, commandHash),
      labels: {
        [LABEL_MANAGED_BY]: MANAGED_BY_LABEL,
        [LABEL_COMMAND_HASH]: commandHash,
      },
    },
    spec: {
      type: 'ClusterIP',
      selector: {
        [LABEL_MANAGED_BY]: MANAGED_BY_LABEL,
        [LABEL_COMMAND_HASH]: commandHash,
      },
      ports: [
        {
          port: K8S_CONFIG.supergatewayPort,
          targetPort: K8S_CONFIG.supergatewayPort as any,
          protocol: 'TCP',
        },
      ],
    },
  };
}

export async function ensurePodAndService(config: StdioPodConfig): Promise<string> {
  const apps = getAppsApi();
  const core = getCoreApi();
  const ns = getNamespace();
  const deployName = getDeploymentName(config.serverName, config.commandHash);
  const serviceName = getServiceName(config.serverName, config.commandHash);

  // Ensure Deployment (idempotent)
  try {
    await apps.readNamespacedDeployment({ name: deployName, namespace: ns });
    logger.info(`Deployment ${deployName} already exists`);
  } catch (err: any) {
    if (isNotFound(err)) {
      logger.info(`Creating Deployment ${deployName}`);
      await apps.createNamespacedDeployment({ namespace: ns, body: buildDeploymentSpec(config) });
    } else {
      throw err;
    }
  }

  // Ensure Service (idempotent)
  try {
    await core.readNamespacedService({ name: serviceName, namespace: ns });
    logger.info(`Service ${serviceName} already exists`);
  } catch (err: any) {
    if (isNotFound(err)) {
      logger.info(`Creating Service ${serviceName}`);
      await core.createNamespacedService({ namespace: ns, body: buildServiceSpec(config.serverName, config.commandHash) });
    } else {
      throw err;
    }
  }

  return getServiceUrl(config.serverName, config.commandHash);
}

export async function deletePodAndService(commandHash: string): Promise<void> {
  const apps = getAppsApi();
  const core = getCoreApi();
  const ns = getNamespace();
  const labelSelector = getLabelSelector(commandHash);

  // Find and delete Deployments by label
  try {
    const deployments = await apps.listNamespacedDeployment({ namespace: ns, labelSelector });
    for (const deploy of deployments.items) {
      const name = deploy.metadata?.name;
      if (!name) continue;
      await apps.deleteNamespacedDeployment({ name, namespace: ns });
      logger.info(`Deleted Deployment ${name}`);
    }
  } catch (err: any) {
    if (!isNotFound(err)) {
      logger.error(`Error deleting Deployments for hash ${commandHash}:`, err);
    }
  }

  // Find and delete Services by label
  try {
    const services = await core.listNamespacedService({ namespace: ns, labelSelector });
    for (const svc of services.items) {
      const name = svc.metadata?.name;
      if (!name) continue;
      await core.deleteNamespacedService({ name, namespace: ns });
      logger.info(`Deleted Service ${name}`);
    }
  } catch (err: any) {
    if (!isNotFound(err)) {
      logger.error(`Error deleting Services for hash ${commandHash}:`, err);
    }
  }
}

export async function getPodStatus(commandHash: string): Promise<PodStatus | null> {
  try {
    const pod = await findPodByCommandHash(commandHash);
    if (!pod) return null;

    const containerStatus = pod.status?.containerStatuses?.[0];
    const phase = pod.status?.phase || 'Unknown';
    const ready = containerStatus?.ready || false;
    const restartCount = containerStatus?.restartCount || 0;
    const podName = pod.metadata?.name || '';

    let containerState: string | undefined;
    if (containerStatus?.state?.waiting) {
      containerState = containerStatus.state.waiting.reason || 'Waiting';
    } else if (containerStatus?.state?.running) {
      containerState = 'Running';
    } else if (containerStatus?.state?.terminated) {
      containerState = containerStatus.state.terminated.reason || 'Terminated';
    }

    return { podName, phase, ready, restartCount, containerState };
  } catch (err: any) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

export async function waitForReady(commandHash: string, timeoutMs?: number): Promise<boolean> {
  const timeout = timeoutMs || K8S_CONFIG.podReadyTimeoutMs;
  const pollInterval = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getPodStatus(commandHash);
    if (status?.ready) {
      return true;
    }
    if (status?.containerState === 'CrashLoopBackOff' || status?.containerState === 'ImagePullBackOff') {
      logger.error(`Pod for hash ${commandHash} in ${status.containerState} state`);
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  logger.warn(`Timed out waiting for Pod with hash ${commandHash} to become ready`);
  return false;
}

export async function getPodLogs(commandHash: string, options?: {
  tailLines?: number;
  sinceSeconds?: number;
  timestamps?: boolean;
}): Promise<string | null> {
  const api = getCoreApi();
  const ns = getNamespace();

  try {
    const pod = await findPodByCommandHash(commandHash);
    if (!pod?.metadata?.name) return null;

    const response = await api.readNamespacedPodLog({
      name: pod.metadata.name,
      namespace: ns,
      container: 'supergateway',
      tailLines: options?.tailLines ?? 200,
      sinceSeconds: options?.sinceSeconds,
      timestamps: options?.timestamps ?? true,
    });
    return response;
  } catch (err: any) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function listManagedResources(): Promise<K8sManagedResource[]> {
  const apps = getAppsApi();
  const ns = getNamespace();
  const labelSelector = `${LABEL_MANAGED_BY}=${MANAGED_BY_LABEL}`;

  const deployments = await apps.listNamespacedDeployment({ namespace: ns, labelSelector });
  const resources: K8sManagedResource[] = [];

  for (const deploy of deployments.items) {
    const commandHash = deploy.metadata?.labels?.[LABEL_COMMAND_HASH];
    if (!commandHash) continue;

    const availableReplicas = deploy.status?.availableReplicas || 0;
    const ready = availableReplicas > 0;
    const conditions = deploy.status?.conditions || [];
    const progressingCondition = conditions.find(c => c.type === 'Progressing');
    const podPhase = ready ? 'Running' : (progressingCondition?.reason || 'Pending');

    const deployName = deploy.metadata?.name || '';
    const ns = getNamespace();
    resources.push({
      commandHash,
      podName: deployName,
      serviceName: deployName,
      serviceUrl: `http://${deployName}.${ns}.svc.cluster.local:${K8S_CONFIG.supergatewayPort}/mcp`,
      podPhase,
      ready,
    });
  }

  return resources;
}
