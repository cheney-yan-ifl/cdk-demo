import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';

export interface AutoscalingConstructProps {
  readonly service: ecs.FargateService;
  readonly environment: string;
  readonly minCapacity: number;
  readonly maxCapacity: number;
  readonly targetCpuUtilization?: number;
  readonly targetMemoryUtilization?: number;
  readonly scaleInCooldown?: cdk.Duration;
  readonly scaleOutCooldown?: cdk.Duration;
  readonly alarmTopic?: sns.ITopic;
}

export class AutoscalingConstruct extends Construct {
  public readonly scalableTarget: ecs.ScalableTaskCount;

  constructor(scope: Construct, id: string, props: AutoscalingConstructProps) {
    super(scope, id);

    const targetCpuUtilization = props.targetCpuUtilization || 70;
    const targetMemoryUtilization = props.targetMemoryUtilization || 80;
    const scaleInCooldown = props.scaleInCooldown || cdk.Duration.seconds(300);
    const scaleOutCooldown = props.scaleOutCooldown || cdk.Duration.seconds(60);

    // Create scalable target
    this.scalableTarget = props.service.autoScaleTaskCount({
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity,
    });

    // CPU-based auto-scaling
    this.scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: targetCpuUtilization,
      scaleInCooldown,
      scaleOutCooldown,
    });

    // Memory-based auto-scaling
    this.scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: targetMemoryUtilization,
      scaleInCooldown,
      scaleOutCooldown,
    });

    // Create CloudWatch alarms for scaling events
    this.createScalingAlarms(props);

    // Outputs
    new cdk.CfnOutput(this, 'MinCapacity', {
      value: props.minCapacity.toString(),
      description: 'Minimum task capacity',
    });

    new cdk.CfnOutput(this, 'MaxCapacity', {
      value: props.maxCapacity.toString(),
      description: 'Maximum task capacity',
    });
  }

  /**
   * Create CloudWatch alarms for scaling events
   */
  private createScalingAlarms(props: AutoscalingConstructProps): void {
    // Alarm for high CPU
    const highCpuAlarm = new cloudwatch.Alarm(this, 'HighCpuAlarm', {
      metric: props.service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when CPU utilization is very high',
      alarmName: `${props.environment}-${props.service.serviceName}-high-cpu`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for high memory
    const highMemoryAlarm = new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
      metric: props.service.metricMemoryUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when memory utilization is very high',
      alarmName: `${props.environment}-${props.service.serviceName}-high-memory`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for max capacity reached
    const maxCapacityAlarm = new cloudwatch.Alarm(this, 'MaxCapacityAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'RunningTasksCount',
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(1),
      }),
      threshold: props.maxCapacity,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alert when service reaches maximum capacity',
      alarmName: `${props.environment}-${props.service.serviceName}-max-capacity`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Connect alarms to SNS topic if provided
    if (props.alarmTopic) {
      highCpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
      highMemoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
      maxCapacityAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
    }
  }
}