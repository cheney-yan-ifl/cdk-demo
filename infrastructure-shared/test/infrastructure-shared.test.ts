import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { InfrastructureSharedStack } from '../lib/infrastructure-shared-stack';
import { SharedInfraConfig } from '../lib/config/shared-config';

describe('Shared Infrastructure Stack', () => {
  let app: cdk.App;
  let stack: InfrastructureSharedStack;
  let template: Template;

  const testConfig: SharedInfraConfig = {
    environment: 'test',
    account: '123456789012',
    region: 'ap-southeast-2',
    vpcMaxAzs: 2,
    vpcNatGateways: 1,
    vpcEnableFlowLogs: true,
    rdsInstanceClass: 't3',
    rdsInstanceSize: 'micro',
    rdsAllocatedStorage: 20,
    rdsBackupRetentionDays: 7,
    rdsMultiAz: false,
    rdsDatabaseName: 'testdb',
    albEnableAccessLogs: true,
    albDeletionProtection: false,
    albAccessLogsRetentionDays: 90,
    ecsEnableContainerInsights: true,
    ecsLogRetentionDays: 7,
    removalPolicyRetain: false,
    removalPolicyDestroy: true,
    removalPolicySnapshot: false,
    deletionProtection: false,
    autoDeleteObjects: true,
    enablePerformanceInsights: false,
    performanceInsightsLongTerm: false,
  };

  beforeEach(() => {
    app = new cdk.App();
    stack = new InfrastructureSharedStack(app, 'TestStack', {
      config: testConfig,
      env: {
        account: testConfig.account,
        region: testConfig.region,
      },
    });
    template = Template.fromStack(stack);
  });

  describe('VPC Configuration', () => {
    test('VPC is created with correct subnet configuration', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });

      // Check for public subnets
      template.resourceCountIs('AWS::EC2::Subnet', 6); // 2 AZs * 3 subnet types

      // Check for Internet Gateway
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);

      // Check for NAT Gateway
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    test('VPC Flow Logs are enabled', () => {
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        ResourceType: 'VPC',
        TrafficType: 'ALL',
      });

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/vpc/test/flow-logs',
      });
    });

    test('VPC has appropriate tags', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'Environment', Value: 'test' },
          { Key: 'ManagedBy', Value: 'CDK' },
        ]),
      });
    });
  });

  describe('RDS Configuration', () => {
    test('RDS instance is created with encryption enabled', () => {
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        StorageEncrypted: true,
        DBInstanceClass: 'db.t3.micro',
      });
    });

    test('RDS security group restricts access', () => {
      // RDS security group should not allow public access
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for RDS PostgreSQL instance',
      });
    });

    test('RDS credentials are stored in Secrets Manager', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'test/rds/credentials',
        GenerateSecretString: Match.objectLike({
          SecretStringTemplate: Match.stringLikeRegexp('.*username.*'),
        }),
      });
    });

    test('KMS key is created for RDS encryption', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
      });
    });
  });

  describe('ALB Configuration', () => {
    test('ALB is created in public subnets', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
        Scheme: 'internet-facing',
        Type: 'application',
      });
    });

    test('ALB security group allows HTTP traffic', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Application Load Balancer',
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            CidrIp: '0.0.0.0/0',
            FromPort: 80,
            IpProtocol: 'tcp',
            ToPort: 80,
          }),
        ]),
      });
    });

    test('HTTP listener serves traffic directly (no certificate)', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Port: 80,
        Protocol: 'HTTP',
        DefaultActions: Match.arrayWith([
          Match.objectLike({
            Type: 'fixed-response',
          }),
        ]),
      });
    });

    test('Access logs bucket is created with encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
  });

  describe('ECS Cluster Configuration', () => {
    test('ECS cluster is created', () => {
      template.hasResourceProperties('AWS::ECS::Cluster', {
        ClusterName: 'test-cluster',
        ClusterSettings: Match.arrayWith([
          {
            Name: 'containerInsights',
            Value: 'enabled',
          },
        ]),
      });
    });

    test('ECS log group is created', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/ecs/test/cluster',
      });
    });
  });

  describe('Stack Outputs', () => {
    test('Stack exports required outputs', () => {
      template.hasOutput('StackName', {
        Description: 'Shared Infrastructure Stack Name',
      });

      template.hasOutput('Environment', {
        Description: 'Deployment Environment',
      });
    });
  });

  describe('Stack Snapshot', () => {
    test('Stack matches snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});