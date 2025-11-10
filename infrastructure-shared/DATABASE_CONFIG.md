# Database Configuration

## Overview

The RDS PostgreSQL database is configured with automatic credential management and environment-specific performance monitoring.

## Master Password Management

### Automatic Generation and Storage

The database master password is **automatically generated and securely stored** in AWS Secrets Manager for all environments. You don't need to manually create or manage database passwords.

**How it works:**

1. When the database construct is deployed, a secret is created in AWS Secrets Manager at:
   - Secret Name: `{environment}/rds/credentials`
   - Example: `prod/rds/credentials`, `dev/rds/credentials`, `staging/rds/credentials`

2. The secret contains:
   - `username`: `dbadmin` (fixed username)
   - `password`: Auto-generated 32-character alphanumeric password (excludes special characters for compatibility)

3. The RDS instance is configured to use these credentials from Secrets Manager

4. The secret ARN is exported as a CloudFormation output for easy reference

### Accessing Database Credentials

To retrieve the database credentials:

```bash
# Using AWS CLI
aws secretsmanager get-secret-value \
  --secret-id prod/rds/credentials \
  --query SecretString \
  --output text | jq -r

# Or get just the password
aws secretsmanager get-secret-value \
  --secret-id prod/rds/credentials \
  --query SecretString \
  --output text | jq -r '.password'
```

### Secret Rotation

The secrets are configured with AWS Secrets Manager, which supports automatic rotation if needed. For production environments, consider enabling automatic rotation by adding a rotation Lambda function.

## Performance Insights

### Environment-Specific Configuration

Performance Insights is configured based on the environment to optimize costs:

| Environment | Performance Insights | Long-Term Retention | Rationale |
|------------|---------------------|-------------------|-----------|
| **Production** | ✅ Enabled | ✅ Enabled | Critical for monitoring production database performance and troubleshooting |
| **Staging** | ❌ Disabled | ❌ Disabled | Cost optimization - use CloudWatch metrics instead |
| **Development** | ❌ Disabled | ❌ Disabled | Cost optimization - not needed for development work |

### Configuration Variables

The Performance Insights feature is controlled by environment variables:

```bash
# Enable/disable Performance Insights (defaults to true only for 'prod' environment)
ENABLE_PERFORMANCE_INSIGHTS=true

# Use long-term retention (7 days vs 731 days)
PERFORMANCE_INSIGHTS_LONG_TERM=true
```

### Cost Implications

- **Performance Insights (Default Retention - 7 days)**: Free
- **Performance Insights (Long-Term Retention - 731 days)**: ~$0.10 per vCPU per day
- Enabling only for production saves ~$6-12/month per non-production environment (depending on instance size)

## Database Security

### Encryption

All databases are encrypted at rest using AWS KMS keys:
- Separate KMS key per environment
- Automatic key rotation enabled
- Storage and backups encrypted

### Network Security

- Databases are deployed in **private isolated subnets** (no internet access)
- Security groups restrict access to specific sources only
- Use the `allowConnectionsFrom()` method to grant access from ECS tasks or other services

### Credentials Security

- Passwords never appear in CloudFormation templates or logs
- Stored encrypted in Secrets Manager
- Accessed via IAM permissions at runtime
- Can be rotated without code changes

## Example Usage in Application Code

### Node.js/TypeScript

```typescript
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager({ region: 'ap-southeast-2' });

async function getDatabaseCredentials() {
  const response = await secretsManager.getSecretValue({
    SecretId: `${process.env.ENVIRONMENT}/rds/credentials`
  });
  
  const credentials = JSON.parse(response.SecretString!);
  return {
    host: process.env.DB_HOST,
    port: 5432,
    database: 'orderdb',
    username: credentials.username,
    password: credentials.password
  };
}
```

### Connection String

```typescript
const { host, port, database, username, password } = await getDatabaseCredentials();
const connectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`;
```

## Monitoring and Observability

### CloudWatch Logs

All environments export these PostgreSQL logs to CloudWatch:
- `postgresql` - General database logs
- `upgrade` - Database upgrade logs

### Performance Insights (Production Only)

When enabled, Performance Insights provides:
- Real-time database performance dashboard
- Query-level performance metrics
- Wait event analysis
- Top SQL queries by load
- Historical performance data (up to 2 years with long-term retention)

### CloudWatch Metrics

All environments have standard CloudWatch metrics:
- CPU utilization
- Database connections
- Read/write IOPS
- Storage space
- Replication lag (Multi-AZ)

## Best Practices

1. **Never hardcode database credentials** - Always retrieve from Secrets Manager
2. **Use IAM roles** for applications to access Secrets Manager (no access keys)
3. **Enable Performance Insights in production** for troubleshooting capabilities
4. **Monitor secret access** via CloudTrail for security auditing
5. **Consider secret rotation** for production databases
6. **Use connection pooling** to avoid exhausting database connections
7. **Regular backup testing** - Verify you can restore from snapshots

## Database Migrations

Database schema migrations are managed separately in the `database-migrations/` directory. After deploying the shared infrastructure, you need to apply migrations to set up the database schema.

### Quick Start

```bash
# View database connection information
cd database-migrations
make info ENV=dev

# List available migrations
make list

# Get instructions to apply migrations
make apply ENV=dev
```

For detailed migration instructions, see [`database-migrations/README.md`](../database-migrations/README.md).

## Deployment

The database configuration is automatically applied when deploying the infrastructure:

```bash
# Deploy to development
make deploy ENV=dev

# Deploy to production (with Performance Insights enabled)
make deploy ENV=prod
```

The deployment will:
1. Create the KMS encryption key
2. Generate and store the master password in Secrets Manager
3. Create the RDS instance with the credentials
4. Configure Performance Insights based on environment
5. Export the secret ARN for application use

**Note:** After deploying the infrastructure, you must apply database migrations separately. See the [Database Migrations](#database-migrations) section above.