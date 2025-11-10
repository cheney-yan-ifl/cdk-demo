import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AlbConstructProps {
  readonly vpc: ec2.IVpc;
  readonly environment: string;
  readonly enableAccessLogs: boolean;
  readonly deletionProtection: boolean;
  readonly accessLogsRetentionDays: number;
  readonly removalPolicyRetain: boolean;
  readonly autoDeleteObjects: boolean;
  readonly certificateArn?: string; // Optional certificate ARN for HTTPS
}

export class AlbConstruct extends Construct {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener?: elbv2.ApplicationListener;
  public readonly httpListener: elbv2.ApplicationListener;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AlbConstructProps) {
    super(scope, id);

    // Create security group for ALB
    this.securityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Application Load Balancer',
      allowAllOutbound: true,
    });

    // Allow HTTP from internet
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from internet'
    );

    // Allow HTTPS from internet if certificate is provided
    if (props.certificateArn) {
      this.securityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        'Allow HTTPS from internet'
      );
    }

    // Create Application Load Balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ApplicationLoadBalancer', {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroup: this.securityGroup,
      deletionProtection: props.deletionProtection,
    });

    // Enable access logs if requested
    if (props.enableAccessLogs) {
      const logBucket = new s3.Bucket(this, 'AlbAccessLogsBucket', {
        bucketName: `${props.environment}-alb-access-logs-${cdk.Aws.ACCOUNT_ID}`,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: props.removalPolicyRetain
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: props.autoDeleteObjects,
        lifecycleRules: [
          {
            enabled: true,
            expiration: cdk.Duration.days(props.accessLogsRetentionDays),
            transitions: [
              {
                storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                transitionAfter: cdk.Duration.days(30),
              },
            ],
          },
        ],
      });

      this.alb.logAccessLogs(logBucket, 'alb-logs');
    }

    // Create HTTPS listener only if certificate is provided
    if (props.certificateArn) {
      const certificate = elbv2.ListenerCertificate.fromArn(props.certificateArn);
      
      this.httpsListener = this.alb.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultAction: elbv2.ListenerAction.fixedResponse(200, {
          contentType: 'text/plain',
          messageBody: 'OK',
        }),
      });

      // Create HTTP listener (redirect to HTTPS)
      this.httpListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });
    } else {
      // Create HTTP listener only (for dev/testing without certificate)
      this.httpListener = this.alb.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.fixedResponse(200, {
          contentType: 'text/plain',
          messageBody: 'OK - HTTP Only (No SSL Certificate)',
        }),
      });
    }

    // Tag resources
    cdk.Tags.of(this.alb).add('Environment', props.environment);
    cdk.Tags.of(this.alb).add('Component', 'LoadBalancer');
    cdk.Tags.of(this.alb).add('ManagedBy', 'CDK');

    // Outputs
    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.alb.loadBalancerArn,
      description: 'ALB ARN',
      exportName: `${props.environment}-AlbArn`,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
      exportName: `${props.environment}-AlbDnsName`,
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: this.securityGroup.securityGroupId,
      description: 'ALB Security Group ID',
      exportName: `${props.environment}-AlbSecurityGroupId`,
    });

    new cdk.CfnOutput(this, 'HttpListenerArn', {
      value: this.httpListener.listenerArn,
      description: 'HTTP Listener ARN',
      exportName: `${props.environment}-alb-http-listener-arn`,
    });

    if (this.httpsListener) {
      new cdk.CfnOutput(this, 'HttpsListenerArn', {
        value: this.httpsListener.listenerArn,
        description: 'HTTPS Listener ARN',
        exportName: `${props.environment}-alb-https-listener-arn`,
      });
    }
  }

  /**
   * Create a target group for ECS services
   */
  public createTargetGroup(
    id: string,
    port: number,
    healthCheckPath: string = '/health'
  ): elbv2.ApplicationTargetGroup {
    return new elbv2.ApplicationTargetGroup(this, id, {
      vpc: this.alb.vpc!,
      port,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: healthCheckPath,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });
  }
}