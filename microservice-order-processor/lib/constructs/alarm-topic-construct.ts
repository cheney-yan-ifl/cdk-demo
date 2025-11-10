import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface AlarmTopicConstructProps {
  readonly environment: string;
  readonly topicName?: string;
}

export class AlarmTopicConstruct extends Construct {
  public readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: AlarmTopicConstructProps) {
    super(scope, id);

    const topicName = props.topicName || 'alarm-notifications';

    // Create SNS topic for alarm notifications
    this.topic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${topicName}-${props.environment}`,
      displayName: `Alarm Notifications for ${props.environment}`,
      fifo: false,
    });

    // Output the topic ARN for users to subscribe
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.topic.topicArn,
      description: 'SNS Topic ARN for alarm notifications - Subscribe to receive alerts',
      exportName: `${props.environment}-alarm-topic-arn`,
    });

    new cdk.CfnOutput(this, 'AlarmTopicName', {
      value: this.topic.topicName,
      description: 'SNS Topic Name for alarm notifications',
      exportName: `${props.environment}-alarm-topic-name`,
    });

    // Tag the topic
    cdk.Tags.of(this.topic).add('Environment', props.environment);
    cdk.Tags.of(this.topic).add('Purpose', 'AlarmNotifications');
    cdk.Tags.of(this.topic).add('ManagedBy', 'CDK');
  }

  /**
   * Connect a CloudWatch alarm to this SNS topic
   */
  public addAlarmAction(alarm: cloudwatch.Alarm): void {
    alarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.topic));
  }
}