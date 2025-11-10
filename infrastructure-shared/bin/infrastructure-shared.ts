#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureSharedStack } from '../lib/infrastructure-shared-stack';
import { loadSharedConfig } from '../lib/config/shared-config';

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'dev';

// Load configuration for the specified environment
const config = loadSharedConfig(environment);

// Create the shared infrastructure stack
new InfrastructureSharedStack(app, `InfrastructureSharedStack-${environment}`, {
  config,
  env: {
    account: config.account,
    region: config.region,
  },
  description: `Shared infrastructure for ${environment} environment`,
  tags: {
    Environment: environment,
    Project: 'OrderProcessor',
    ManagedBy: 'CDK',
  },
});

app.synth();