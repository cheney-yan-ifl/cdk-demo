#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MicroserviceOrderProcessorStack } from '../lib/microservice-order-processor-stack';

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';

new MicroserviceOrderProcessorStack(app, `MicroserviceOrderProcessorStack-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
