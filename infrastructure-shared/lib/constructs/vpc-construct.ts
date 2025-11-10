import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface VpcConstructProps {
  readonly environment: string;
  readonly maxAzs: number;
  readonly natGateways: number;
  readonly enableFlowLogs: boolean;
  readonly removalPolicyRetain: boolean;
}

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly isolatedSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    // Create VPC with 3 subnet types
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: props.maxAzs,
      natGateways: props.natGateways,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Store subnet references
    this.publicSubnets = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
    this.isolatedSubnets = this.vpc.isolatedSubnets;

    // Enable VPC Flow Logs to CloudWatch
    if (props.enableFlowLogs) {
      const logGroup = new logs.LogGroup(this, 'VpcFlowLogsGroup', {
        logGroupName: `/aws/vpc/${props.environment}/flow-logs`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: props.removalPolicyRetain
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      });

      new ec2.FlowLog(this, 'VpcFlowLog', {
        resourceType: ec2.FlowLogResourceType.fromVpc(this.vpc),
        destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup),
        trafficType: ec2.FlowLogTrafficType.ALL,
      });
    }

    // Tag resources for cost allocation
    cdk.Tags.of(this.vpc).add('Environment', props.environment);
    cdk.Tags.of(this.vpc).add('Component', 'SharedInfrastructure');
    cdk.Tags.of(this.vpc).add('ManagedBy', 'CDK');

    // Add outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${props.environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR Block',
    });
    
    // Export subnet IDs
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: cdk.Fn.join(',', this.vpc.privateSubnets.map(s => s.subnetId)),
      description: 'Private Subnet IDs',
      exportName: `${props.environment}-private-subnet-ids`,
    });
    
    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: cdk.Fn.join(',', this.vpc.publicSubnets.map(s => s.subnetId)),
      description: 'Public Subnet IDs',
      exportName: `${props.environment}-public-subnet-ids`,
    });
    
    new cdk.CfnOutput(this, 'IsolatedSubnetIds', {
      value: cdk.Fn.join(',', this.vpc.isolatedSubnets.map(s => s.subnetId)),
      description: 'Isolated Subnet IDs',
      exportName: `${props.environment}-isolated-subnet-ids`,
    });
  }
}