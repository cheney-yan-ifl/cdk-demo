import * as dotenv from 'dotenv';
import * as path from 'path';

export interface SharedInfraConfig {
  environment: string;
  account: string;
  region: string;
  
  // VPC Configuration
  vpcMaxAzs: number;
  vpcNatGateways: number;
  vpcEnableFlowLogs: boolean;
  
  // RDS Configuration
  rdsInstanceClass: string;
  rdsInstanceSize: string;
  rdsAllocatedStorage: number;
  rdsBackupRetentionDays: number;
  rdsMultiAz: boolean;
  rdsDatabaseName: string;
  
  // ALB Configuration
  albEnableAccessLogs: boolean;
  albDeletionProtection: boolean;
  albAccessLogsRetentionDays: number;
  
  // ECS Configuration
  ecsEnableContainerInsights: boolean;
  ecsLogRetentionDays: number;
  
  // Resource Removal Policies
  removalPolicyRetain: boolean;
  removalPolicyDestroy: boolean;
  removalPolicySnapshot: boolean;
  deletionProtection: boolean;
  autoDeleteObjects: boolean;
  
  // Performance Insights
  enablePerformanceInsights: boolean;
  performanceInsightsLongTerm: boolean;
}

export function loadSharedConfig(environment: string): SharedInfraConfig {
  // Load environment-specific .env file
  const envPath = path.join(__dirname, '../../', `.env.${environment}`);
  dotenv.config({ path: envPath });
  
  // Helper to parse boolean from env
  const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    return value === 'true';
  };
  
  return {
    environment,
    account: process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'ap-southeast-2',
    
    // VPC Configuration
    vpcMaxAzs: parseInt(process.env.VPC_MAX_AZS || '2'),
    vpcNatGateways: parseInt(process.env.VPC_NAT_GATEWAYS || '1'),
    vpcEnableFlowLogs: parseBoolean(process.env.VPC_ENABLE_FLOW_LOGS, true),
    
    // RDS Configuration
    rdsInstanceClass: process.env.RDS_INSTANCE_CLASS || 't3',
    rdsInstanceSize: process.env.RDS_INSTANCE_SIZE || 'micro',
    rdsAllocatedStorage: parseInt(process.env.RDS_ALLOCATED_STORAGE || '20'),
    rdsBackupRetentionDays: parseInt(process.env.RDS_BACKUP_RETENTION_DAYS || '7'),
    rdsMultiAz: parseBoolean(process.env.RDS_MULTI_AZ, false),
    rdsDatabaseName: process.env.RDS_DATABASE_NAME || 'orderdb',
    
    // ALB Configuration
    albEnableAccessLogs: parseBoolean(process.env.ALB_ENABLE_ACCESS_LOGS, true),
    albDeletionProtection: parseBoolean(process.env.ALB_DELETION_PROTECTION, false),
    albAccessLogsRetentionDays: parseInt(process.env.ALB_ACCESS_LOGS_RETENTION_DAYS || '90'),
    
    // ECS Configuration
    ecsEnableContainerInsights: parseBoolean(process.env.ECS_ENABLE_CONTAINER_INSIGHTS, true),
    ecsLogRetentionDays: parseInt(process.env.ECS_LOG_RETENTION_DAYS || '7'),
    
    // Resource Removal Policies
    removalPolicyRetain: parseBoolean(process.env.REMOVAL_POLICY_RETAIN, false),
    removalPolicyDestroy: parseBoolean(process.env.REMOVAL_POLICY_DESTROY, true),
    removalPolicySnapshot: parseBoolean(process.env.REMOVAL_POLICY_SNAPSHOT, false),
    deletionProtection: parseBoolean(process.env.DELETION_PROTECTION, false),
    autoDeleteObjects: parseBoolean(process.env.AUTO_DELETE_OBJECTS, true),
    
    // Performance Insights
    // Enable Performance Insights only for production environment
    enablePerformanceInsights: parseBoolean(
      process.env.ENABLE_PERFORMANCE_INSIGHTS,
      environment === 'prod'
    ),
    performanceInsightsLongTerm: parseBoolean(process.env.PERFORMANCE_INSIGHTS_LONG_TERM, false),
  };
}