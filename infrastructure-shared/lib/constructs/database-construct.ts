import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  readonly vpc: ec2.IVpc;
  readonly environment: string;
  readonly databaseName: string;
  readonly instanceType: ec2.InstanceType;
  readonly allocatedStorage: number;
  readonly backupRetention: cdk.Duration;
  readonly multiAz: boolean;
  readonly removalPolicyRetain: boolean;
  readonly removalPolicySnapshot: boolean;
  readonly deletionProtection: boolean;
  readonly enablePerformanceInsights: boolean;
  readonly performanceInsightsLongTerm: boolean;
}

export class DatabaseConstruct extends Construct {
  public readonly instance: rds.DatabaseInstance;
  public readonly secret: secretsmanager.ISecret;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    // Create KMS key for RDS encryption
    this.kmsKey = new kms.Key(this, 'RdsEncryptionKey', {
      description: `RDS encryption key for ${props.environment}`,
      enableKeyRotation: true,
      removalPolicy: props.removalPolicyRetain
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create security group for RDS
    this.securityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS PostgreSQL instance',
      allowAllOutbound: false,
    });

    // Allow PostgreSQL access only from private subnets (where ECS tasks run)
    // This is the least-privilege approach - only private subnet CIDR can access DB
    props.vpc.privateSubnets.forEach((subnet, index) => {
      this.securityGroup.addIngressRule(
        ec2.Peer.ipv4(subnet.ipv4CidrBlock),
        ec2.Port.tcp(5432),
        `Allow PostgreSQL access from private subnet ${index + 1}`
      );
    });

    // Create RDS credentials in Secrets Manager
    // The master password is automatically generated and securely stored
    this.secret = new secretsmanager.Secret(this, 'RdsCredentials', {
      secretName: `${props.environment}/rds/credentials`,
      description: `RDS master credentials for ${props.environment} - Auto-generated password`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'dbadmin',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Create RDS PostgreSQL instance
    this.instance = new rds.DatabaseInstance(this, 'PostgresInstance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: props.instanceType,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [this.securityGroup],
      databaseName: props.databaseName,
      credentials: rds.Credentials.fromSecret(this.secret),
      allocatedStorage: props.allocatedStorage,
      maxAllocatedStorage: props.allocatedStorage * 2,
      storageEncrypted: true,
      storageEncryptionKey: this.kmsKey,
      multiAz: props.multiAz,
      backupRetention: props.backupRetention,
      deletionProtection: props.deletionProtection,
      // Enable Performance Insights only for production environment
      enablePerformanceInsights: props.enablePerformanceInsights,
      // Only set performanceInsightRetention if Performance Insights is enabled
      ...(props.enablePerformanceInsights && {
        performanceInsightRetention: props.performanceInsightsLongTerm
          ? rds.PerformanceInsightRetention.LONG_TERM
          : rds.PerformanceInsightRetention.DEFAULT,
      }),
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      removalPolicy: props.removalPolicyRetain
        ? cdk.RemovalPolicy.RETAIN
        : (props.removalPolicySnapshot ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY),
    });

    // Tag resources
    cdk.Tags.of(this.instance).add('Environment', props.environment);
    cdk.Tags.of(this.instance).add('Component', 'Database');
    cdk.Tags.of(this.instance).add('ManagedBy', 'CDK');

    // Outputs
    new cdk.CfnOutput(this, 'RdsEndpoint', {
      value: this.instance.dbInstanceEndpointAddress,
      description: 'RDS endpoint address',
      exportName: `${props.environment}-RdsEndpoint`,
    });

    new cdk.CfnOutput(this, 'RdsPort', {
      value: this.instance.dbInstanceEndpointPort,
      description: 'RDS port',
      exportName: `${props.environment}-RdsPort`,
    });

    new cdk.CfnOutput(this, 'RdsSecretArn', {
      value: this.secret.secretArn,
      description: 'RDS credentials secret ARN',
      exportName: `${props.environment}-RdsSecretArn`,
    });
  }

  /**
   * Allow connections from a security group
   */
  public allowConnectionsFrom(securityGroup: ec2.ISecurityGroup): void {
    this.securityGroup.addIngressRule(
      securityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from ECS tasks'
    );
  }
}