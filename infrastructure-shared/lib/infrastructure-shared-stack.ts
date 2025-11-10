import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { VpcConstruct } from './constructs/vpc-construct';
import { DatabaseConstruct } from './constructs/database-construct';
import { AlbConstruct } from './constructs/alb-construct';
import { EcsClusterConstruct } from './constructs/ecs-cluster-construct';
import { SharedInfraConfig } from './config/shared-config';

export interface InfrastructureSharedStackProps extends cdk.StackProps {
  readonly config: SharedInfraConfig;
}

export class InfrastructureSharedStack extends cdk.Stack {
  public readonly vpc: VpcConstruct;
  public readonly database: DatabaseConstruct;
  public readonly alb: AlbConstruct;
  public readonly ecsCluster: EcsClusterConstruct;

  constructor(scope: Construct, id: string, props: InfrastructureSharedStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create VPC
    this.vpc = new VpcConstruct(this, 'Vpc', {
      environment: config.environment,
      maxAzs: config.vpcMaxAzs,
      natGateways: config.vpcNatGateways,
      enableFlowLogs: config.vpcEnableFlowLogs,
      removalPolicyRetain: config.removalPolicyRetain,
    });

    // Create RDS Database
    // Master password is automatically generated and stored in AWS Secrets Manager
    this.database = new DatabaseConstruct(this, 'Database', {
      vpc: this.vpc.vpc,
      environment: config.environment,
      databaseName: config.rdsDatabaseName,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass[config.rdsInstanceClass.toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[config.rdsInstanceSize.toUpperCase() as keyof typeof ec2.InstanceSize]
      ),
      allocatedStorage: config.rdsAllocatedStorage,
      backupRetention: cdk.Duration.days(config.rdsBackupRetentionDays),
      multiAz: config.rdsMultiAz,
      removalPolicyRetain: config.removalPolicyRetain,
      removalPolicySnapshot: config.removalPolicySnapshot,
      deletionProtection: config.deletionProtection,
      enablePerformanceInsights: config.enablePerformanceInsights,
      performanceInsightsLongTerm: config.performanceInsightsLongTerm,
    });

    // Create Application Load Balancer
    this.alb = new AlbConstruct(this, 'Alb', {
      vpc: this.vpc.vpc,
      environment: config.environment,
      enableAccessLogs: config.albEnableAccessLogs,
      deletionProtection: config.albDeletionProtection,
      accessLogsRetentionDays: config.albAccessLogsRetentionDays,
      removalPolicyRetain: config.removalPolicyRetain,
      autoDeleteObjects: config.autoDeleteObjects,
    });

    // Create ECS Cluster
    this.ecsCluster = new EcsClusterConstruct(this, 'EcsCluster', {
      vpc: this.vpc.vpc,
      environment: config.environment,
      enableContainerInsights: config.ecsEnableContainerInsights,
      logRetentionDays: config.ecsLogRetentionDays,
      removalPolicyRetain: config.removalPolicyRetain,
    });

    // Tag stack resources
    cdk.Tags.of(this).add('Environment', config.environment);
    cdk.Tags.of(this).add('Project', 'OrderProcessor');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // Stack-level outputs
    new cdk.CfnOutput(this, 'StackName', {
      value: this.stackName,
      description: 'Shared Infrastructure Stack Name',
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: config.environment,
      description: 'Deployment Environment',
    });
  }
}