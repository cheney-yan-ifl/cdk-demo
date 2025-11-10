import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface QueueConstructProps {
  readonly environment: string;
  readonly queueName: string;
  readonly visibilityTimeout?: cdk.Duration;
  readonly messageRetentionPeriod?: cdk.Duration;
  readonly maxReceiveCount?: number;
  readonly alarmTopic?: sns.ITopic;
}

export class QueueConstruct extends Construct {
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props: QueueConstructProps) {
    super(scope, id);

    const visibilityTimeout = props.visibilityTimeout || cdk.Duration.seconds(300);
    const messageRetentionPeriod = props.messageRetentionPeriod || cdk.Duration.days(14);
    const maxReceiveCount = props.maxReceiveCount || 3;

    // Create KMS key for queue encryption
    this.encryptionKey = new kms.Key(this, 'QueueEncryptionKey', {
      description: `Encryption key for ${props.queueName} SQS queue`,
      enableKeyRotation: true,
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create Dead Letter Queue
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${props.queueName}-dlq-${props.environment}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: this.encryptionKey,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create main queue
    this.queue = new sqs.Queue(this, 'Queue', {
      queueName: `${props.queueName}-${props.environment}`,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: this.encryptionKey,
      visibilityTimeout,
      retentionPeriod: messageRetentionPeriod,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount,
      },
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create CloudWatch alarms
    this.createAlarms(props);

    // Outputs
    new cdk.CfnOutput(this, 'QueueUrl', {
      value: this.queue.queueUrl,
      description: 'Main queue URL',
      exportName: `${props.environment}-${props.queueName}-QueueUrl`,
    });

    new cdk.CfnOutput(this, 'QueueArn', {
      value: this.queue.queueArn,
      description: 'Main queue ARN',
      exportName: `${props.environment}-${props.queueName}-QueueArn`,
    });

    new cdk.CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'Dead letter queue URL',
      exportName: `${props.environment}-${props.queueName}-DlqUrl`,
    });
  }

  /**
   * Create CloudWatch alarms for queue monitoring
   */
  private createAlarms(props: QueueConstructProps): void {
    // Alarm for high queue depth
    const queueDepthAlarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      metric: this.queue.metricApproximateNumberOfMessagesVisible(),
      threshold: 500,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when queue has too many messages',
      alarmName: `${props.environment}-${props.queueName}-high-depth`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for messages in DLQ (CRITICAL)
    const dlqAlarm = new cloudwatch.Alarm(this, 'DeadLetterQueueAlarm', {
      metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alert when messages appear in dead letter queue',
      alarmName: `${props.environment}-${props.queueName}-dlq-messages`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for old messages
    const oldMessagesAlarm = new cloudwatch.Alarm(this, 'OldMessagesAlarm', {
      metric: this.queue.metricApproximateAgeOfOldestMessage(),
      threshold: 600, // 10 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when messages are not being processed',
      alarmName: `${props.environment}-${props.queueName}-old-messages`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Connect alarms to SNS topic if provided
    if (props.alarmTopic) {
      queueDepthAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
      dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
      oldMessagesAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(props.alarmTopic));
    }
  }
}