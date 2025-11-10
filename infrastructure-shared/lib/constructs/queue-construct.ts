import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface QueueConstructProps {
  readonly environment: string;
  readonly queueName: string;
  readonly visibilityTimeout?: cdk.Duration;
  readonly messageRetention?: cdk.Duration;
  readonly maxReceiveCount?: number;
  readonly enableEncryption?: boolean;
  readonly createAlarms?: boolean;
}

export class QueueConstruct extends Construct {
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: QueueConstructProps) {
    super(scope, id);

    const visibilityTimeout = props.visibilityTimeout || cdk.Duration.seconds(300);
    const messageRetention = props.messageRetention || cdk.Duration.days(14);
    const maxReceiveCount = props.maxReceiveCount || 3;
    const enableEncryption = props.enableEncryption !== false;

    // Create KMS key for SQS encryption
    this.kmsKey = new kms.Key(this, 'QueueEncryptionKey', {
      description: `SQS encryption key for ${props.queueName} (${props.environment})`,
      enableKeyRotation: true,
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create Dead Letter Queue
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${props.queueName}-dlq-${props.environment}`,
      encryption: enableEncryption ? sqs.QueueEncryption.KMS : sqs.QueueEncryption.UNENCRYPTED,
      encryptionMasterKey: enableEncryption ? this.kmsKey : undefined,  // gitleaks:allow
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create main SQS Queue
    this.queue = new sqs.Queue(this, 'Queue', {
      queueName: `${props.queueName}-${props.environment}`,
      encryption: enableEncryption ? sqs.QueueEncryption.KMS : sqs.QueueEncryption.UNENCRYPTED,
      encryptionMasterKey: enableEncryption ? this.kmsKey : undefined, // gitleaks:allow
      visibilityTimeout,
      retentionPeriod: messageRetention,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount,
      },
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create CloudWatch alarms if requested
    if (props.createAlarms !== false) {
      this.createCloudWatchAlarms(props.environment);
    }

    // Tag resources
    cdk.Tags.of(this.queue).add('Environment', props.environment);
    cdk.Tags.of(this.queue).add('Component', 'Queue');
    cdk.Tags.of(this.queue).add('ManagedBy', 'CDK');

    // Outputs
    new cdk.CfnOutput(this, 'QueueUrl', {
      value: this.queue.queueUrl,
      description: 'SQS Queue URL',
      exportName: `${props.environment}-${props.queueName}-QueueUrl`,
    });

    new cdk.CfnOutput(this, 'QueueArn', {
      value: this.queue.queueArn,
      description: 'SQS Queue ARN',
      exportName: `${props.environment}-${props.queueName}-QueueArn`,
    });

    new cdk.CfnOutput(this, 'DlqUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'Dead Letter Queue URL',
      exportName: `${props.environment}-${props.queueName}-DlqUrl`,
    });
  }

  /**
   * Create CloudWatch alarms for the queue
   */
  private createCloudWatchAlarms(environment: string): void {
    // Alarm for queue depth
    const queueDepthAlarm = new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      metric: this.queue.metricApproximateNumberOfMessagesVisible(),
      threshold: 500,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when queue depth exceeds threshold',
      alarmName: `${environment}-queue-depth-high`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for DLQ messages
    const dlqMessagesAlarm = new cloudwatch.Alarm(this, 'DlqMessagesAlarm', {
      metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alert when messages appear in DLQ',
      alarmName: `${environment}-dlq-messages-present`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for old messages
    const oldMessagesAlarm = new cloudwatch.Alarm(this, 'OldMessagesAlarm', {
      metric: this.queue.metricApproximateAgeOfOldestMessage(),
      threshold: 600, // 10 minutes
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Alert when oldest message age exceeds threshold',
      alarmName: `${environment}-queue-old-messages`,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}