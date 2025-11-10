import * as dotenv from 'dotenv';
import * as path from 'path';

export interface ServiceConfig {
  serviceName: string;
  containerPort: number;
  cpu: number;
  memory: number;
  desiredCount: number;
  minCapacity: number;
  maxCapacity: number;
  imageTag: string;
  healthCheckPath: string;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  healthyThresholdCount: number;
  unhealthyThresholdCount: number;
  deregistrationDelay: number;
  cpuTargetUtilization: number;
  memoryTargetUtilization: number;
  scaleInCooldown: number;
  scaleOutCooldown: number;
  queueName: string;
  queueVisibilityTimeout: number;
  queueMessageRetention: number;
  queueMaxReceiveCount: number;
  // Log and resource retention
  logRetentionDays: number;
  removalPolicy: 'RETAIN' | 'DESTROY';
  // ECS specific
  enableExecuteCommand: boolean;
  healthCheckGracePeriod: number;
  containerHealthCheckInterval: number;
  containerHealthCheckTimeout: number;
  containerHealthCheckRetries: number;
  containerHealthCheckStartPeriod: number;
  // Queue alarms
  queueDepthAlarmThreshold: number;
  queueOldMessageAlarmThreshold: number;
  dlqRetentionDays: number;
}

export function loadServiceConfig(environment: string): ServiceConfig {
  // Load environment-specific config
  const envFile = path.join(__dirname, '../../', `.env.${environment}`);
  const result = dotenv.config({ path: envFile });

  if (result.error) {
    throw new Error(`Failed to load config for environment: ${environment}. Error: ${result.error.message}`);
  }

  const getEnv = (key: string, defaultValue?: string): string => {
    const value = process.env[key] || defaultValue;
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  const getNumber = (key: string, defaultValue?: number): number => {
    const value = process.env[key];
    if (!value && defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value ? parseInt(value, 10) : defaultValue!;
  };

  return {
    serviceName: getEnv('SERVICE_NAME', 'order-processor'),
    containerPort: getNumber('CONTAINER_PORT', 3000),
    cpu: getNumber('CPU'),
    memory: getNumber('MEMORY'),
    desiredCount: getNumber('DESIRED_COUNT'),
    minCapacity: getNumber('MIN_CAPACITY'),
    maxCapacity: getNumber('MAX_CAPACITY'),
    imageTag: getEnv('IMAGE_TAG', 'latest'),
    healthCheckPath: getEnv('HEALTH_CHECK_PATH', '/health'),
    healthCheckInterval: getNumber('HEALTH_CHECK_INTERVAL', 30),
    healthCheckTimeout: getNumber('HEALTH_CHECK_TIMEOUT', 5),
    healthyThresholdCount: getNumber('HEALTHY_THRESHOLD_COUNT', 2),
    unhealthyThresholdCount: getNumber('UNHEALTHY_THRESHOLD_COUNT', 3),
    deregistrationDelay: getNumber('DEREGISTRATION_DELAY', 30),
    cpuTargetUtilization: getNumber('CPU_TARGET_UTILIZATION', 70),
    memoryTargetUtilization: getNumber('MEMORY_TARGET_UTILIZATION', 80),
    scaleInCooldown: getNumber('SCALE_IN_COOLDOWN', 300),
    scaleOutCooldown: getNumber('SCALE_OUT_COOLDOWN', 60),
    queueName: getEnv('QUEUE_NAME', 'order-processing'),
    queueVisibilityTimeout: getNumber('QUEUE_VISIBILITY_TIMEOUT', 300),
    queueMessageRetention: getNumber('QUEUE_MESSAGE_RETENTION', 1209600),
    queueMaxReceiveCount: getNumber('QUEUE_MAX_RECEIVE_COUNT', 3),
    // Log and resource retention
    logRetentionDays: getNumber('LOG_RETENTION_DAYS'),
    removalPolicy: getEnv('REMOVAL_POLICY') as 'RETAIN' | 'DESTROY',
    // ECS specific
    enableExecuteCommand: getEnv('ENABLE_EXECUTE_COMMAND', 'false') === 'true',
    healthCheckGracePeriod: getNumber('HEALTH_CHECK_GRACE_PERIOD', 60),
    containerHealthCheckInterval: getNumber('CONTAINER_HEALTH_CHECK_INTERVAL', 30),
    containerHealthCheckTimeout: getNumber('CONTAINER_HEALTH_CHECK_TIMEOUT', 5),
    containerHealthCheckRetries: getNumber('CONTAINER_HEALTH_CHECK_RETRIES', 3),
    containerHealthCheckStartPeriod: getNumber('CONTAINER_HEALTH_CHECK_START_PERIOD', 60),
    // Queue alarms
    queueDepthAlarmThreshold: getNumber('QUEUE_DEPTH_ALARM_THRESHOLD', 500),
    queueOldMessageAlarmThreshold: getNumber('QUEUE_OLD_MESSAGE_ALARM_THRESHOLD', 600),
    dlqRetentionDays: getNumber('DLQ_RETENTION_DAYS', 14),
  };
}