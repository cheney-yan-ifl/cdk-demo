import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface EcsServiceConstructProps {
  readonly vpc: ec2.IVpc;
  readonly cluster: ecs.ICluster;
  readonly alb: elbv2.IApplicationLoadBalancer;
  readonly environment: string;
  readonly serviceName: string;
  readonly containerPort: number;
  readonly cpu: number;
  readonly memory: number;
  readonly desiredCount: number;
  readonly imageTag?: string;
  readonly environmentVariables?: { [key: string]: string };
  readonly secrets?: { [key: string]: ecs.Secret };
  readonly logRetentionDays: number;
  readonly removalPolicy: 'RETAIN' | 'DESTROY';
  readonly enableExecuteCommand: boolean;
  readonly healthCheckGracePeriod: number;
  readonly containerHealthCheckInterval: number;
  readonly containerHealthCheckTimeout: number;
  readonly containerHealthCheckRetries: number;
  readonly containerHealthCheckStartPeriod: number;
  readonly healthCheckPath: string;
  readonly healthCheckInterval: number;
  readonly healthCheckTimeout: number;
  readonly healthyThresholdCount: number;
  readonly unhealthyThresholdCount: number;
  readonly deregistrationDelay: number;
}

export class EcsServiceConstruct extends Construct {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly taskRole: iam.Role;
  public readonly executionRole: iam.Role;

  constructor(scope: Construct, id: string, props: EcsServiceConstructProps) {
    super(scope, id);

    // Create security group for ECS tasks
    this.securityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc: props.vpc,
      description: `Security group for ${props.serviceName} ECS service`,
      allowAllOutbound: true,
    });

    // Allow traffic from ALB
    this.securityGroup.addIngressRule(
      ec2.Peer.securityGroupId(props.alb.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(props.containerPort),
      'Allow traffic from ALB'
    );

    // Create task execution role
    this.executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Execution role for ${props.serviceName}`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant access to Secrets Manager for RDS credentials
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:secretsmanager:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:secret:${props.environment}/rds/*`,
      ],
    }));

    // Create task role for application
    this.taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: `Task role for ${props.serviceName}`,
    });

    // Grant CloudWatch Logs permissions
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: [
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/ecs/${props.environment}/*`,
      ],
    }));

    // Create CloudWatch log group
    const logGroup = new logs.LogGroup(this, 'ServiceLogGroup', {
      logGroupName: `/aws/ecs/${props.environment}/${props.serviceName}`,
      retention: props.logRetentionDays as logs.RetentionDays,
      removalPolicy: props.removalPolicy === 'RETAIN'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create task definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `${props.serviceName}-${props.environment}`,
      cpu: props.cpu,
      memoryLimitMiB: props.memory,
      taskRole: this.taskRole,
      executionRole: this.executionRole,
    });

    // Get ECR repository
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'Repository',
      `${props.serviceName}-${props.environment}`
    );

    // Add container to task definition
    const container = this.taskDefinition.addContainer('AppContainer', {
      containerName: props.serviceName,
      image: ecs.ContainerImage.fromEcrRepository(
        repository,
        props.imageTag || 'latest'
      ),
      logging: ecs.LogDriver.awsLogs({
        logGroup,
        streamPrefix: props.serviceName,
      }),
      environment: props.environmentVariables,
      secrets: props.secrets,
      healthCheck: {
        command: ['CMD-SHELL', `node -e "require('http').get('http://localhost:${props.containerPort}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"`],
        interval: cdk.Duration.seconds(props.containerHealthCheckInterval),
        timeout: cdk.Duration.seconds(props.containerHealthCheckTimeout),
        retries: props.containerHealthCheckRetries,
        startPeriod: cdk.Duration.seconds(props.containerHealthCheckStartPeriod),
      },
    });

    // Add port mapping
    container.addPortMappings({
      containerPort: props.containerPort,
      protocol: ecs.Protocol.TCP,
    });

    // Create Fargate service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
      serviceName: `${props.serviceName}-${props.environment}`,
      desiredCount: props.desiredCount,
      securityGroups: [this.securityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      enableExecuteCommand: props.enableExecuteCommand,
      circuitBreaker: {
        rollback: true,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(props.healthCheckGracePeriod),
    });

    // Create target group
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: props.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: props.healthCheckPath,
        interval: cdk.Duration.seconds(props.healthCheckInterval),
        timeout: cdk.Duration.seconds(props.healthCheckTimeout),
        healthyThresholdCount: props.healthyThresholdCount,
        unhealthyThresholdCount: props.unhealthyThresholdCount,
      },
      deregistrationDelay: cdk.Duration.seconds(props.deregistrationDelay),
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(this.targetGroup);

    // Tag resources
    cdk.Tags.of(this.service).add('Environment', props.environment);
    cdk.Tags.of(this.service).add('Service', props.serviceName);
    cdk.Tags.of(this.service).add('ManagedBy', 'CDK');

    // Outputs
    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service Name',
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'Task Definition ARN',
    });
  }
}