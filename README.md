# Overall

Quick guide for my homework. 

In the real world, I should separate all these into separate GitHub repos.

# Infrastructure Deployment

This is a running application that can be deployed to a target account. It will be more useful if you look at the generated resources to evaluate its effects.

## Prerequisites

- Node.js 18+, AWS CLI, Docker, Make, psql
- AWS account with permissions for VPC, ECS, RDS, ALB, CloudWatch, IAM
- AWS CLI configured with profile `personal-sydney`. Populate the credentials for it. 

---

## Quick Deploy

**I only tested dev**. Stage and production use much more expensive configurations. 
```bash
# 1. Verify AWS access
aws sts get-caller-identity --profile personal-sydney

# 2. Bootstrap CDK (one-time, 5 min) and deploy infrastructure (15 min)
cd infrastructure-shared
make test
make bootstrap ENV=dev
make deploy ENV=dev
# Creates: VPC, ECS Cluster, RDS PostgreSQL, ALB, CloudWatch
# Note: npm install is handled automatically by the Makefile

# 3. Apply database migrations 
cd ../database-migrations
make test
make info ENV=dev
# Follow instructions to apply migrations via psql (requires network access to RDS)

# 4. Deploy microservice (7 min)
cd ../microservice-order-processor
make deploy ENV=dev
# Builds Docker image, deploys ECS service, creates SQS queue

# You will see the application URLs at the end of the deployment.
```

---

## Verify Deployment

Just click the Users (mock app) endpoint. It will demonstrate that the app checks the SQS queue size for available messages and lists the database for available users (demonstration purpose).

---

## Architecture

```
Internet → ALB (Public) → ECS Fargate (Private) → RDS + SQS (Isolated)
```

**Components**:
- VPC: Multi-AZ with public/private/isolated subnets
- ECS: Fargate with CPU-based auto-scaling
- RDS: PostgreSQL with encryption and automated backups
- SQS: Queue with DLQ for failed messages
- CloudWatch: Logs, metrics, alarms

---

---

## Cleanup

```bash
# Destroy in order
cd microservice-order-processor && make destroy ENV=dev
cd ../infrastructure-shared && make destroy ENV=dev
```

---

## What it generates

### Deployed Resources Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS ACCOUNT (ap-southeast-2)                    │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         VPC (10.0.0.0/16)                             │   │
│  │                                                                        │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │              PUBLIC SUBNETS (2 AZs)                           │   │   │
│  │  │  ┌──────────▼──────────────────────────▼──────────┐         │   │   │
│  │  │  │   Application Load Balancer (ALB)               │         │   │   │
│  │  │  │   - HTTP Listener (Port 80)                     │         │   │   │
│  │  │  │   - Security Group: Allow 0.0.0.0/0:80          │         │   │   │
│  │  │  │   - Access Logs → S3 Bucket                     │         │   │   │
│  │  │  └─────────────────────┬──────────────────────────┘         │   │   │
│  │  └──────────────────────────┼────────────────────────────────────┘   │   │
│  │                             │                                          │   │
│  │  ┌──────────────────────────▼──────────────────────────────────┐   │   │
│  │  │              PRIVATE SUBNETS (2 AZs)                         │   │   │
│  │  │  ┌──────────────────────────────────────────────┐           │   │   │
│  │  │  │         ECS CLUSTER (Fargate)                │           │   │   │
│  │  │  │  ┌────────────────────────────────────┐     │           │   │   │
│  │  │  │  │  ECS Service: order-processor       │     │           │   │   │
│  │  │  │  │  - Fargate Tasks (1-5 instances)    │     │           │   │   │
│  │  │  │  │  - Auto-scaling: CPU-based          │     │           │   │   │
│  │  │  │  │  - Container: Node.js App           │     │           │   │   │
│  │  │  │  │  - Health Check: /health            │     │           │   │   │
│  │  │  │  │  - Target Group → ALB               │     │           │   │   │
│  │  │  │  │  - Task Role: IAM Permissions       │     │           │   │   │
│  │  │  │  └────────┬───────────────────────────┘     │           │   │   │
│  │  │  │           │                                  │           │   │   │
│  │  │  └───────────┼──────────────────────────────────┘           │   │   │
│  │  └──────────────┼──────────────────────────────────────────────┘   │   │
│  │                 │                                                    │   │
│  │  ┌──────────────▼──────────────────────────────────────────────┐   │   │
│  │  │              ISOLATED SUBNETS (2 AZs)                        │   │   │
│  │  │  ┌────────────────────────────────────────┐                 │   │   │
│  │  │  │  RDS PostgreSQL (orderdb)               │                 │   │   │
│  │  │  │  - Instance: t3.micro                   │                 │   │   │
│  │  │  │  - Storage: 20GB gp3                    │                 │   │   │
│  │  │  │  - Multi-AZ: Disabled (dev)             │                 │   │   │
│  │  │  │  - Backup: 7 days retention             │                 │   │   │
│  │  │  │  - Encryption: At rest                  │                 │   │   │
│  │  │  │  - Security Group: Allow Private only   │                 │   │   │
│  │  │  └────────────────────────────────────────┘                 │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REGIONAL SERVICES                                 │   │
│  │  ┌──────────────────────┐    ┌──────────────────────────────┐     │   │
│  │  │  SQS QUEUE           │    │  SNS TOPIC                    │     │   │
│  │  │  - order-queue       │    │  - order-processor-alarms     │     │   │
│  │  │  - Visibility: 30s   │    │  - Email/SMS notifications    │     │   │
│  │  │  - DLQ: Enabled      │    │  - Connected to CloudWatch    │     │   │
│  │  └──────────────────────┘    └──────────────────────────────┘     │   │
│  │                                                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  AWS SECRETS MANAGER                                         │  │   │
│  │  │  - RDS Master Credentials (auto-generated)                   │  │   │
│  │  │  - Rotation: Not configured                                  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  CLOUDWATCH                                                   │  │   │
│  │  │  ┌─────────────────┐  ┌──────────────────┐                  │  │   │
│  │  │  │  Log Groups     │  │  CloudWatch      │                  │  │   │
│  │  │  │  - ECS Logs     │  │  Alarms:         │                  │  │   │
│  │  │  │  - ALB Logs     │  │  - ECS CPU >90%  │                  │  │   │
│  │  │  │  - VPC FlowLogs │  │  - Memory >90%   │                  │  │   │
│  │  │  │  Retention: 7d  │  │  - SQS DLQ depth │                  │  │   │
│  │  │  └─────────────────┘  │  - Queue >1000   │                  │  │   │
│  │  │                        └────────┬─────────┘                  │  │   │
│  │  │                                 │                             │  │   │
│  │  │                                 └──────→ SNS Topic            │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  IAM ROLES & POLICIES                                         │  │   │
│  │  │  - ECS Task Execution Role (pull images, write logs)          │  │   │
│  │  │  - ECS Task Role (SQS, Secrets Manager, RDS access)           │  │   │
│  │  │  - Auto Scaling Service Role                                  │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  ECR (Elastic Container Registry)                             │  │   │
│  │  │  - Repository: order-processor                                │  │   │
│  │  │  - Image Scanning: On Push                                    │  │   │
│  │  │  - Image Tag: latest                                          │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────┘

TRAFFIC FLOW:
User → Internet → ALB (Public Subnet) → ECS Tasks (Private Subnet) →
RDS PostgreSQL (Isolated Subnet) + SQS Queue (Regional)
```


**What's Included**:
- Single codebase, multi-environment architecture (dev/staging/prod)
- Well-architected network
- Infrastructure as Code (AWS CDK + TypeScript)
- Serverless containers (ECS Fargate)
- Managed database (RDS PostgreSQL)
- CPU-based auto-scaling
- Observability (CloudWatch Logs, Metrics, Alarms)
- Security (Private subnets, security groups, IAM roles)

**What's NOT Included** (mainly due to time/resource limits):
- No Route53 hosted zone defined, so domain-related functions are not included
  - SSL certificates, HTTPS endpoint on ALB
  - ALB rules are based on path (hack) rather than domain name
- IAM database authentication (uses static secrets in Secrets Manager)
- Blue-green deployments (rolling updates only)
- WAF/API Gateway/Access control

**Known Limitations**:
- If developers need to access the database, a dedicated EC2 instance for port forwarding is needed.
- Docker image tagging uses `latest` (should use semantic versioning)
- No automated secret rotation for RDS database -- but not needed if we use IAM database authentication

---

# Azure DevOps Pipeline

## Overview

This project includes a **minimal, Makefile-driven CI/CD pipeline** for Azure DevOps that automates infrastructure and microservice deployments across three environments (dev, staging, production).

## Design Philosophy

**Simplicity First**: The pipeline design prioritizes:
- ✅ **Minimal complexity** - Simple YAML files that delegate to Makefiles
- ✅ **No hardcoded values** - All configuration in Makefiles and environment variables
- ✅ **Consistent deployment** - Same commands work locally and in CI/CD
- ✅ **Git-based workflow** - Branch-driven deployments
- ✅ **Security** - No credentials in code, using Azure DevOps secret variables

## Git Workflow Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     GIT BRANCHING STRATEGY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  develop branch  ────────→  Automatic Deploy to DEV                 │
│      ↓                                                           │
│      │                                                           │
│  merge to master                                                 │
│      ↓                                                           │
│  master branch ───────→  Automatic Deploy to STAGING            │
│      ↓                                                           │
│      │                                                           │
│  manual trigger                                                  │
│      ↓                                                           │
│  master branch ───────→  Manual Deploy to PRODUCTION            │
│                          (with approval gate)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Deployment Flow**:
1. **Development**: Push to `dev` branch → Auto-deploys to dev environment
2. **Staging**: Merge `dev` to `master` → Auto-deploys to staging environment
3. **Production**: Manual trigger from `master` → Deploys to production (requires approval)

## Pipeline Architecture

### Three Pipeline Files

```
azure-pipelines/
├── deploy-to-dev.yml          # Triggers: push to develop branch
├── deploy-to-staging.yml      # Triggers: push to master branch
├── deploy-to-production.yml   # Triggers: manual only
```

## Key Design Decisions

### 1. Makefile-Driven Approach
**Why**: Centralizes deployment logic in one place. All steps are debuggable if you have permission. In other words, what you see in your Makefile is what you get in the pipeline.

### 2. No Hardcoded Credentials
We even avoid using Azure DevOps credentials to avoid duplicating secrets. As long as the running agent has configured the AWS_SERVICE_CONNECTION, the job should run correctly.
If we have to use Azure DevOps credentials, we need to be careful that multiple places of credentials might cause management issues.

### 3. Branch-Based Deployment
**Why**: Clear, predictable deployment workflow
- Developers work on `dev` branch → immediate feedback
- `master` branch represents staging-ready code
- Production requires explicit manual action
- Reduces accidental production deployments

## Limitations

This is for demonstration purposes. In reality, all infrastructure code would be in dedicated separate GitHub repos. In that case, the pipelines would be split repo by repo, so everything wouldn't be mangled together as it is now. Also, we would use semantic versioning, so production deployment would rely on deploying particular versions rather than always deploying the latest. This is easy to extend because we already have Makefiles ready, and Make already provides quite a lot of targets, so it's totally flexible for us to add them as needed.

---

# Database Migration

**Note: This part is only for concept demonstration. I haven't tested it!**

## Why Database Migrations Are NOT Automated

Database migrations are intentionally **excluded from the CI/CD pipeline** for the following critical reasons:

### 1. Shared Database Impact
- The database serves multiple services, not just one application
- A single migration can affect multiple services across the organization
- Changes should be centralized in a shared repository for visibility and coordination
- Cross-service impact requires careful planning and communication

### 2. Downtime Risk Management
- Database migrations have numerous edge cases that can cause unexpected downtime
- Automated pipeline failures in production lead to delayed incident discovery and response
- Manual execution allows immediate human intervention when issues occur
- Direct control enables faster troubleshooting and recovery
- **Lesson learned from production incidents**: Human oversight prevents cascading failures

### 3. Operational Complexity
- Database operations involve more complexity than standard deployments:
  - **Performance impact**: Long-running migrations can lock tables
  - **Backward compatibility**: Must support rolling deployments
  - **Rollback safety**: Requires careful planning and testing
  - **Network security**: Database access is restricted and requires secure execution environment

### 4. Cross-Team Collaboration Required
- **Developers**: Write migration scripts and ensure functional correctness
- **DevOps/DBA**: Review performance impact, estimate execution time, assess risks
- **QA**: Validate changes in staging environment
- **Security**: Ensure proper access controls and audit trails

### 5. Production Safety
- Production databases are isolated and require privileged access, which we tend not to trust random runners
- DevOps teams have the expertise to handle exceptions quickly
- Manual execution provides an additional safety gate
- Allows for maintenance windows and stakeholder coordination

**Note**: This approach is based on operational experience and may vary by organization. There is no one-size-fits-all solution. **WE CAN AUTOMATE, for sure, but should we?**

## Migration Strategy

### Execution Commands

```bash
cd database-migrations

# 1. Test on database copy (validates against real data)
make rehearsal ENV=dev

# 2. Apply to development
make apply ENV=dev

# 3. Point-in-time restore (if urgent rollback needed)
make revert TIMESTAMP=2025-11-10T08:00:00Z ENV=dev
```

**Note on `revert` command**:
- Creates a NEW database instance from AWS RDS point-in-time backup
- Original database remains untouched and running
- No reconfiguration of the current instance needed
- You get TWO databases temporarily (original + restored)
- Manually verify restored data, then update application endpoints
- Choose to keep restored DB or discard it based on verification

## Git Workflow and Review Process

### Development Phase
1. **Developer creates migration scripts**:
   - Write forward migration (upgrade)
   - Write backward migration (undo) for quick rollback
   - Use transactional queries where possible
   - Ensure scripts are idempotent and robust
   - Test locally against realistic data

2. **Code review via Pull Request**:
   - **Tech Lead**: Reviews logic and functional correctness
   - **DevOps/DBA**: Assesses performance impact and operational risks
   - **Checklist**:
     - ✅ Is the migration backward compatible?
     - ✅ Does it support rolling deployments?
     - ✅ What's the estimated execution time?
     - ✅ Are there any locking concerns?
     - ✅ Is there a tested rollback plan?

### Testing Phase
3. **Merge to develop branch**:
   - Developer runs `make rehearsal ENV=dev` (test on database copy)
   - Developer runs `make apply ENV=dev` (apply to dev environment)
   - Validates all application services work correctly
   - Eliminates functional issues before staging

4. **Merge to master branch**:
   - QA deploys to staging: `make apply ENV=staging`
   - QA performs comprehensive testing
   - Validates production readiness
   - Measures actual performance impact

### Production Deployment
5. **DevOps executes production migration**:
   
   **Pre-execution**:
   - Run rehearsal: `make rehearsal ENV=prod`
   - Estimate risks and execution time
   - Define rollback criteria and time limits
   - Schedule maintenance window if needed
   - Coordinate with development and QA teams
   
   **Execution** (with developer and QA present):
   - Monitor progress in real-time
   - Watch for performance degradation
   - Check application health continuously
   
   **If issues occur**:
   - Assess severity and impact
   - If critical or exceeds time limit:
     - Use point-in-time restore: `make revert TIMESTAMP=<before-migration> ENV=prod`
     - Creates NEW database from backup (original stays running)
     - Verify restored data integrity
     - Update application endpoints to restored database
     - Notify stakeholders
     - Schedule post-mortem analysis, with the NEW database containing the wrong DB scene

### Best Practices

**Migration Scripts**:
- ✅ Always include both upgrade and downgrade scripts
- ✅ Use transactions where possible
- ✅ Make scripts idempotent (safe to run multiple times)
- ✅ Test on production-scale data
- ✅ Version migrations sequentially (V1, V2, V3...)
- ✅ Document breaking changes clearly

**Execution**:
- ✅ Always test on rehearsal environment first
- ✅ Run during low-traffic periods when possible
- ✅ Have rollback plan ready before starting
- ✅ Monitor system health continuously
- ✅ Keep communication channels open with teams
- ✅ Document the execution process and any issues

**Point-in-Time Restore (Emergency Recovery)**:
- ✅ Understand RDS creates a NEW instance (original stays intact)
- ✅ No reconfiguration needed - restore creates separate database
- ✅ Test restore procedures in staging first
- ✅ Have predefined criteria for restore decision
- ✅ Practice restore scenarios regularly
- ✅ RDS maintains automatic backups (default: 7 days retention)
- ✅ Can restore to any point within backup retention period
- ✅ Document restore procedures and application endpoint updates

---


# Further Discussions

## Security Considerations & Enhancements

### Current Security Posture
The current implementation includes baseline security:
- ✅ Private subnets for compute and isolated subnets for data
- ✅ Security groups with least-privilege access
- ✅ IAM roles with minimal required permissions
- ✅ Secrets Manager for database credentials
- ✅ Encryption at rest for RDS

### Recommended Security Improvements

#### 1. API Gateway vs Application Load Balancer
**Current**: ALB directly exposed to internet
**Recommendation**: API Gateway as front-end layer

**Benefits**:
- ✅ **Native API authentication**: API keys, OAuth, Cognito integration
- ✅ **DDoS protection**: Built-in AWS Shield Standard
- ✅ **Request throttling**: Per-client rate limiting
- ✅ **Real-time logging**: CloudWatch Logs with request/response details
- ✅ **Cost optimization**: Pay per request vs hourly ALB charges
- ✅ **Request validation**: Schema validation before reaching application

**Implementation**: API Gateway → ALB → ECS Fargate

---

#### 2. AWS WAF Integration
**Purpose**: Application-layer protection against common web exploits

**Recommended Rules**:
- ✅ SQL injection prevention
- ✅ Cross-site scripting (XSS) protection
- ✅ Rate-based rules (limit requests per IP)
- ✅ Geo-blocking (if needed)
- ✅ Bad bot protection
- ✅ Known malicious IP blocking (AWS Managed Rules)

---

#### 3. Secrets Management Strategy
**Current**: Static credentials in Secrets Manager
**Recommended**: Multi-layered credential management

**Option A: IAM Database Authentication** (Recommended)
- ✅ No stored passwords - temporary tokens generated from IAM
- ✅ Automatic credential rotation (15-minute token lifetime)
- ✅ Audit trail via CloudTrail
- ✅ Integration with IAM policies and roles

**Option B: Automated Secret Rotation**
- Lambda function rotates RDS master password
- Dual-credential strategy: Keep both old and new credentials active during rotation period
- Applications gradually transition to new credentials
- Old credentials invalidated after grace period (e.g., 24 hours)

**API Key Management**:
- Store in Secrets Manager or Parameter Store
- Reference by ARN in environment variables (not raw values)
- ECS supports direct secret injection via `secrets` configuration
- Consider API Gateway API keys for public API authentication

---

#### 4. Database Connection Limits & Circuit Breakers
**Problem**: Database can become bottleneck under high load

**Solution**:
- ✅ Set maximum connections per ECS task (prevent connection exhaustion)
- ✅ Implement application-level circuit breakers
- ✅ Connection pooling with proper timeout settings
- ✅ CloudWatch alarm for high connection count
- ✅ Reject requests early when database is at capacity (fail fast)

**Philosophy**: Better to reject new requests than crash the database and affect all users

---

## Scalability Considerations

### Phase 1: Vertical Scaling (Current)
**Status**: Implemented
- ECS Fargate: CPU/memory-based auto-scaling (1-5 tasks)
- RDS: Manual vertical scaling (instance size changes)
- No read replicas yet

---

### Phase 2: Horizontal Database Scaling
**Timeline**: 2-4 weeks

**Read Replicas**:
- ✅ Offload read traffic from primary database
- ✅ Support reporting and analytics workloads
- ✅ Reduce latency for read-heavy operations
- ✅ Disaster recovery standby

**Implementation**:
- Create 1-2 read replicas in different AZs
- Application reads from replicas, writes to primary
- Connection string routing based on query type

---

## Observability & Monitoring Strategy

### Current State
Basic CloudWatch integration:
- ✅ ECS container logs, cluster level as well as container level
- ✅ Basic metrics
- ✅ ALB access logs to S3
- ✅ RDS Performance Insights (basic)
- ✅ SNS topic for alarm notifications
- ❌ No centralized dashboard
- ❌ No advanced anomaly detection
- ❌ No distributed tracing
- ❌ No flexible way of notification for priority differences
  
### Recommended: Centralized Observability Platform

#### Option 1: Datadog/alike
**Benefits**:
- ✅ Unified timeline view across all services
- ✅ Automatic anomaly detection and intelligent alerting
- ✅ APM (Application Performance Monitoring) with distributed tracing
- ✅ Log aggregation with powerful query language
- ✅ Custom dashboards with trend analysis
- ✅ Alert prioritization (critical vs warning vs info)

**Implementation**:
- Datadog Agent as ECS sidecar container
- CloudWatch Logs → Lambda → Datadog forwarder
- RDS metrics integration
- Custom application metrics
- Code instruments for more detailed business level custom log and metrics

### Alert Priority Strategy

*Use dedicated alerting system rather than email* 

System like pagerduty is desired for proper, timely notifications.

**P0 - Critical (Immediate Response)**:
- Service completely down (no healthy tasks)
- Database connection failures
- 5xx error rate >5%
- Response time >10 seconds
- **Action**: Page on-call engineer, escalate to team

**P1 - High (30-minute Response)**:
- ECS at maximum capacity for >5 minutes
- Database CPU >80% for >10 minutes
- SQS queue depth >1000 messages
- **Action**: Notify via Slack/email, investigate within 30 minutes

**P2 - Medium (Next Business Day)**:
- Increased 4xx error rate
- Slow query performance
- Elevated memory usage
- **Action**: Create ticket, address during business hours

**P3 - Low (Monitor)**:
- Minor configuration drift
- Log volume increase
- Non-critical metric trends
- **Action**: Review during weekly operations meeting

### Health board

- Provide a health board for all the services for transparency of our services. Our engieers feels proude, and our customers feel comfort.
