import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EcsClusterConstructProps {
  readonly vpc: ec2.IVpc;
  readonly environment: string;
  readonly enableContainerInsights: boolean;
  readonly logRetentionDays: number;
  readonly removalPolicyRetain: boolean;
}

export class EcsClusterConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EcsClusterConstructProps) {
    super(scope, id);

    // Map days to retention enum
    const getRetention = (days: number): logs.RetentionDays => {
      const retentionMap: Record<number, logs.RetentionDays> = {
        1: logs.RetentionDays.ONE_DAY,
        3: logs.RetentionDays.THREE_DAYS,
        5: logs.RetentionDays.FIVE_DAYS,
        7: logs.RetentionDays.ONE_WEEK,
        14: logs.RetentionDays.TWO_WEEKS,
        30: logs.RetentionDays.ONE_MONTH,
        60: logs.RetentionDays.TWO_MONTHS,
        90: logs.RetentionDays.THREE_MONTHS,
        120: logs.RetentionDays.FOUR_MONTHS,
        150: logs.RetentionDays.FIVE_MONTHS,
        180: logs.RetentionDays.SIX_MONTHS,
        365: logs.RetentionDays.ONE_YEAR,
      };
      return retentionMap[days] || logs.RetentionDays.ONE_WEEK;
    };

    // Create CloudWatch log group for ECS
    this.logGroup = new logs.LogGroup(this, 'EcsLogGroup', {
      logGroupName: `/aws/ecs/${props.environment}/cluster`,
      retention: getRetention(props.logRetentionDays),
      removalPolicy: props.removalPolicyRetain
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: props.vpc,
      clusterName: `${props.environment}-cluster`,
      containerInsights: props.enableContainerInsights,
      enableFargateCapacityProviders: true,
    });

    // Tag resources
    cdk.Tags.of(this.cluster).add('Environment', props.environment);
    cdk.Tags.of(this.cluster).add('Component', 'ECS');
    cdk.Tags.of(this.cluster).add('ManagedBy', 'CDK');

    // Outputs
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS Cluster ARN',
      exportName: `${props.environment}-EcsClusterArn`,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${props.environment}-EcsClusterName`,
    });
  }
}