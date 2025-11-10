import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { EcsServiceConstruct } from './constructs/ecs-service-construct';
import { AutoscalingConstruct } from './constructs/autoscaling-construct';
import { QueueConstruct } from './constructs/queue-construct';
import { AlarmTopicConstruct } from './constructs/alarm-topic-construct';
import { loadServiceConfig } from './config/service-config';

export interface MicroserviceOrderProcessorStackProps extends cdk.StackProps {
  environment: string;
}

export class MicroserviceOrderProcessorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MicroserviceOrderProcessorStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const config = loadServiceConfig(environment);

    // Import shared infrastructure outputs
    const vpcId = cdk.Fn.importValue(`${environment}-vpc-id`);
    const privateSubnetIds = cdk.Fn.split(',', cdk.Fn.importValue(`${environment}-private-subnet-ids`));
    const publicSubnetIds = cdk.Fn.split(',', cdk.Fn.importValue(`${environment}-public-subnet-ids`));
    const isolatedSubnetIds = cdk.Fn.split(',', cdk.Fn.importValue(`${environment}-isolated-subnet-ids`));
    
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId,
      availabilityZones: cdk.Fn.getAzs(),
      privateSubnetIds,
      publicSubnetIds,
      isolatedSubnetIds,
    });

    const clusterName = cdk.Fn.importValue(`${environment}-EcsClusterName`);
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'EcsCluster', {
      clusterName,
      vpc,
      securityGroups: [],
    });

    const albArn = cdk.Fn.importValue(`${environment}-AlbArn`);
    const albDnsName = cdk.Fn.importValue(`${environment}-AlbDnsName`);
    const albSecurityGroupId = cdk.Fn.importValue(`${environment}-AlbSecurityGroupId`);
    
    const alb = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'Alb', {
      loadBalancerArn: albArn,
      loadBalancerDnsName: albDnsName,
      securityGroupId: albSecurityGroupId,
    });

    // Import HTTP listener
    const httpListenerArn = cdk.Fn.importValue(`${environment}-alb-http-listener-arn`);
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'HttpListener', {
      listenerArn: httpListenerArn,
      securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSecurityGroup', albSecurityGroupId),
    });

    // Get DB Secret ARN - either from environment variable or from infrastructure stack output
    const dbSecretArn = process.env.DB_SECRET_ARN || cdk.Fn.importValue(`${environment}-RdsSecretArn`);
    const dbSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'DbSecret', dbSecretArn);

    // Create SNS Topic for alarm notifications
    const alarmTopic = new AlarmTopicConstruct(this, 'AlarmTopic', {
      environment,
      topicName: 'order-processor-alarms',
    });

    // Create SQS Queue for order processing
    const queue = new QueueConstruct(this, 'OrderQueue', {
      environment,
      queueName: config.queueName,
      visibilityTimeout: cdk.Duration.seconds(config.queueVisibilityTimeout),
      messageRetentionPeriod: cdk.Duration.seconds(config.queueMessageRetention),
      maxReceiveCount: config.queueMaxReceiveCount,
      alarmTopic: alarmTopic.topic,
    });

    // Create ECS Service
    const ecsService = new EcsServiceConstruct(this, 'OrderProcessorService', {
      environment,
      vpc,
      cluster,
      alb,
      serviceName: config.serviceName,
      containerPort: config.containerPort,
      cpu: config.cpu,
      memory: config.memory,
      desiredCount: config.desiredCount,
      imageTag: config.imageTag,
      environmentVariables: {
        QUEUE_URL: queue.queue.queueUrl,
        NODE_ENV: 'production',
        AWS_REGION: cdk.Aws.REGION,
        DB_SECRET_ARN: dbSecretArn,
      },
      secrets: {},
      logRetentionDays: config.logRetentionDays,
      removalPolicy: config.removalPolicy,
      enableExecuteCommand: config.enableExecuteCommand,
      healthCheckGracePeriod: config.healthCheckGracePeriod,
      containerHealthCheckInterval: config.containerHealthCheckInterval,
      containerHealthCheckTimeout: config.containerHealthCheckTimeout,
      containerHealthCheckRetries: config.containerHealthCheckRetries,
      containerHealthCheckStartPeriod: config.containerHealthCheckStartPeriod,
      healthCheckPath: config.healthCheckPath,
      healthCheckInterval: config.healthCheckInterval,
      healthCheckTimeout: config.healthCheckTimeout,
      healthyThresholdCount: config.healthyThresholdCount,
      unhealthyThresholdCount: config.unhealthyThresholdCount,
      deregistrationDelay: config.deregistrationDelay,
    });

    // Grant full SQS permissions to ECS task (read, write, and attributes)
    queue.queue.grantConsumeMessages(ecsService.taskRole); // ReceiveMessage, DeleteMessage, ChangeMessageVisibility
    queue.queue.grantSendMessages(ecsService.taskRole); // SendMessage
    queue.queue.grant(ecsService.taskRole, 'sqs:GetQueueAttributes'); // GetQueueAttributes
    queue.queue.grant(ecsService.taskRole, 'sqs:GetQueueUrl'); // GetQueueUrl
    
    // Grant Secrets Manager read permission to ECS task execution role (for fetching secrets at runtime)
    dbSecret.grantRead(ecsService.taskRole);
    
    // Add routing rule for /users path
    listener.addTargetGroups('UsersRoute', {
      targetGroups: [ecsService.targetGroup],
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/users*']),
      ],
    });

    // Add routing rule for /health path
    listener.addTargetGroups('HealthRoute', {
      targetGroups: [ecsService.targetGroup],
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/health*']),
      ],
    });

    // Add auto-scaling
    new AutoscalingConstruct(this, 'OrderProcessorAutoScaling', {
      environment,
      service: ecsService.service,
      minCapacity: config.minCapacity,
      maxCapacity: config.maxCapacity,
      targetCpuUtilization: config.cpuTargetUtilization,
      targetMemoryUtilization: config.memoryTargetUtilization,
      scaleInCooldown: cdk.Duration.seconds(config.scaleInCooldown),
      scaleOutCooldown: cdk.Duration.seconds(config.scaleOutCooldown),
      alarmTopic: alarmTopic.topic,
    });

    // Stack outputs
    new cdk.CfnOutput(this, 'ServiceName', {
      value: ecsService.service.serviceName,
      description: 'ECS Service Name',
      exportName: `${environment}-order-processor-service-name`,
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: ecsService.taskDefinition.taskDefinitionArn,
      description: 'Task Definition ARN',
      exportName: `${environment}-order-processor-task-definition-arn`,
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: ecsService.targetGroup.targetGroupArn,
      description: 'Target Group ARN',
      exportName: `${environment}-order-processor-target-group-arn`,
    });

    // Output clickable URLs for easy access
    new cdk.CfnOutput(this, 'ServiceRootUrl', {
      value: `http://${alb.loadBalancerDnsName}/`,
      description: '🌐 Service Root URL (click to open)',
    });

    new cdk.CfnOutput(this, 'ServiceHealthUrl', {
      value: `http://${alb.loadBalancerDnsName}/health`,
      description: '✅ Health Check URL (click to test)',
    });
    
    new cdk.CfnOutput(this, 'ServiceUsersUrl', {
      value: `http://${alb.loadBalancerDnsName}/users`,
      description: '👥 Users API URL (click to view users)',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS Name',
    });

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: queue.queue.queueUrl,
      description: 'SQS Queue URL',
      exportName: `${environment}-order-queue-url`,
    });
  }
}