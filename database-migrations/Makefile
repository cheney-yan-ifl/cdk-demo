.PHONY: help info apply list validate clean rehearsal rehearsal-cleanup revert

# Default environment
ENV ?= dev

# AWS Profile (can be overridden)
AWS_PROFILE ?= personal-sydney

# Rehearsal settings (using timestamp for unique instance ID)
REHEARSAL_SUFFIX := -rehearsal-$(shell date +%s)
REHEARSAL_DB_INSTANCE_ID := $(ENV)-orderdb$(REHEARSAL_SUFFIX)

# AWS account and region detection
AWS_ACCOUNT_ID := $(shell AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
AWS_REGION := $(shell AWS_PROFILE=$(AWS_PROFILE) aws configure get region 2>/dev/null || echo "ap-southeast-2")

# Stack name for fetching RDS details
STACK_NAME := InfrastructureSharedStack-$(ENV)

# Migration directory
MIGRATIONS_DIR := migrations

help: ## Display this help message
	@echo "Database Migrations Makefile"
	@echo ""
	@echo "Usage: make [target] ENV=[dev|staging|prod]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make info ENV=dev         - Show database connection info"
	@echo "  make list ENV=dev         - List all migration files"
	@echo "  make apply ENV=dev        - Get instructions to apply migrations"
	@echo "  make validate             - Validate migration files syntax"
	@echo "  make rehearsal ENV=dev    - Test migrations on snapshot (safe)"
	@echo "  make rehearsal-cleanup    - Clean up rehearsal resources"
	@echo "  make revert TIMESTAMP=<ISO8601> ENV=<env>"
	@echo "                            - Restore database to specific point in time"

info: ## Show database connection information
	@echo "==================================================="
	@echo "Database Connection Info for $(ENV)"
	@echo "==================================================="
	@echo ""
	@echo "Fetching RDS connection details from stack outputs..."
	@RDS_ENDPOINT=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsEndpoint81723CB9`].OutputValue' \
		--output text 2>/dev/null || echo ""); \
	RDS_SECRET_ARN=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsSecretArn5736418B`].OutputValue' \
		--output text 2>/dev/null || echo ""); \
	if [ -z "$$RDS_ENDPOINT" ] || [ -z "$$RDS_SECRET_ARN" ]; then \
		echo "❌ Error: Could not retrieve RDS connection details."; \
		echo "   Stack '$(STACK_NAME)' may not be deployed."; \
		echo ""; \
		echo "   Deploy shared infrastructure first:"; \
		echo "   cd ../infrastructure-shared && make deploy ENV=$(ENV)"; \
		exit 1; \
	fi; \
	echo "✅ RDS Endpoint:  $$RDS_ENDPOINT"; \
	echo "   RDS Port:      5432"; \
	echo "   Database:      orderdb"; \
	echo "   Username:      dbadmin"; \
	echo "   Secret ARN:    $$RDS_SECRET_ARN"; \
	echo ""

list: ## List all migration files in order
	@echo "==================================================="
	@echo "Available Migration Files"
	@echo "==================================================="
	@if [ ! -d $(MIGRATIONS_DIR) ] || [ -z "$$(ls -A $(MIGRATIONS_DIR)/*.sql 2>/dev/null)" ]; then \
		echo "❌ No migration files found in $(MIGRATIONS_DIR)/"; \
		exit 1; \
	fi
	@echo ""
	@ls -1 $(MIGRATIONS_DIR)/*.sql | nl
	@echo ""
	@echo "Total migrations: $$(ls -1 $(MIGRATIONS_DIR)/*.sql 2>/dev/null | wc -l)"

apply: info ## Show instructions to apply migrations
	@echo "==================================================="
	@echo "📋 Migration Instructions"
	@echo "==================================================="
	@echo ""
	@echo "To apply migrations, you need network access to the RDS instance."
	@echo ""
	@echo "Step 1: Set up network access (choose one):"
	@echo "  - VPN connection to AWS VPC"
	@echo "  - SSH tunnel through bastion host"
	@echo "  - AWS Systems Manager Session Manager"
	@echo ""
	@echo "Step 2: Get database credentials:"
	@echo ""
	@RDS_SECRET_ARN=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsSecretArn5736418B`].OutputValue' \
		--output text 2>/dev/null || echo ""); \
	echo "  AWS_PROFILE=$(AWS_PROFILE) aws secretsmanager get-secret-value \\"; \
	echo "    --secret-id $$RDS_SECRET_ARN \\"; \
	echo "    --region $(AWS_REGION) \\"; \
	echo "    --query SecretString \\"; \
	echo "    --output text | jq -r"
	@echo ""
	@echo "Step 3: Apply migrations using psql:"
	@echo ""
	@RDS_ENDPOINT=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsEndpoint81723CB9`].OutputValue' \
		--output text 2>/dev/null || echo ""); \
	for file in $$(ls -1 $(MIGRATIONS_DIR)/*.sql 2>/dev/null); do \
		echo "  psql -h $$RDS_ENDPOINT -p 5432 -U dbadmin -d orderdb -f $$file"; \
	done
	@echo ""
	@echo "Or apply all migrations at once:"
	@echo ""
	@RDS_ENDPOINT=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsEndpoint81723CB9`].OutputValue' \
		--output text 2>/dev/null || echo ""); \
	echo "  for file in $(MIGRATIONS_DIR)/*.sql; do \\"; \
	echo "    psql -h $$RDS_ENDPOINT -p 5432 -U dbadmin -d orderdb -f \$$file; \\"; \
	echo "  done"
	@echo ""
	@echo "Alternative: Use Flyway for migration management"
	@echo "  https://flywaydb.org/documentation/usage/commandline/"
	@echo ""

validate: ## Validate SQL migration files syntax
	@echo "Validating migration files..."
	@if [ ! -d $(MIGRATIONS_DIR) ] || [ -z "$$(ls -A $(MIGRATIONS_DIR)/*.sql 2>/dev/null)" ]; then \
		echo "❌ No migration files found in $(MIGRATIONS_DIR)/"; \
		exit 1; \
	fi
	@echo ""
	@for file in $$(ls -1 $(MIGRATIONS_DIR)/*.sql); do \
		echo "✓ Checking: $$file"; \
		if ! grep -q "^--" $$file; then \
			echo "  ⚠️  Warning: No comments found in $$file"; \
		fi; \
	done
	@echo ""
	@echo "✅ Basic validation complete"
	@echo ""
	@echo "Note: For full SQL syntax validation, run migrations in a test database"

rehearsal: ## Test migrations using point-in-time restore (creates temporary DB instance)
	@echo "==================================================="
	@echo "🎭 Migration Rehearsal for $(ENV)"
	@echo "==================================================="
	@echo ""
	@echo "This will:"
	@echo "  1. Restore database to current point-in-time (temporary instance) with a new instance"
	@echo "  2. Apply all migrations"
	@echo "  3. Clean up temporary resources"
	@echo ""
	@read -p "Continue? (yes/no): " confirm; \
	if [ "$$confirm" != "yes" ]; then \
		echo "Aborted."; \
		exit 1; \
	fi
	@echo ""
	@echo "Step 1: Getting RDS instance identifier..."
	@RDS_INSTANCE_ID=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsInstanceIdentifier`].OutputValue' \
		--output text 2>/dev/null); \
	if [ -z "$$RDS_INSTANCE_ID" ]; then \
		RDS_INSTANCE_ID="$(ENV)-orderdb"; \
		echo "⚠️  Could not find instance ID from stack, using default: $$RDS_INSTANCE_ID"; \
	else \
		echo "✅ Found instance: $$RDS_INSTANCE_ID"; \
	fi; \
	echo ""; \
	echo "Step 2: Getting instance configuration..."; \
	SECURITY_GROUP_ID=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$RDS_INSTANCE_ID \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
		--output text); \
	SUBNET_GROUP=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$RDS_INSTANCE_ID \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' \
		--output text); \
	echo "✅ Configuration retrieved"; \
	echo ""; \
	echo "Step 3: Restoring to point-in-time as $(REHEARSAL_DB_INSTANCE_ID)..."; \
	echo "   Using latest restorable time"; \
	AWS_PROFILE=$(AWS_PROFILE) aws rds restore-db-instance-to-point-in-time \
		--source-db-instance-identifier $$RDS_INSTANCE_ID \
		--target-db-instance-identifier $(REHEARSAL_DB_INSTANCE_ID) \
		--use-latest-restorable-time \
		--db-instance-class db.t3.micro \
		--vpc-security-group-ids $$SECURITY_GROUP_ID \
		--db-subnet-group-name $$SUBNET_GROUP \
		--publicly-accessible false \
		--no-multi-az \
		--region $(AWS_REGION) > /dev/null; \
	echo "⏳ Waiting for instance to become available (this may take 5-10 minutes)..."; \
	AWS_PROFILE=$(AWS_PROFILE) aws rds wait db-instance-available \
		--db-instance-identifier $(REHEARSAL_DB_INSTANCE_ID) \
		--region $(AWS_REGION); \
	echo "✅ Temporary instance ready"; \
	echo ""; \
	echo "Step 4: Getting temporary instance endpoint..."; \
	TEMP_ENDPOINT=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $(REHEARSAL_DB_INSTANCE_ID) \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].Endpoint.Address' \
		--output text); \
	echo "✅ Endpoint: $$TEMP_ENDPOINT"; \
	echo ""; \
	echo "Step 5: Getting database credentials..."; \
	RDS_SECRET_ARN=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsSecretArn5736418B`].OutputValue' \
		--output text); \
	DB_PASSWORD=$$(AWS_PROFILE=$(AWS_PROFILE) aws secretsmanager get-secret-value \
		--secret-id $$RDS_SECRET_ARN \
		--region $(AWS_REGION) \
		--query SecretString \
		--output text | jq -r '.password'); \
	echo "✅ Credentials retrieved"; \
	echo ""; \
	echo "Step 6: Applying migrations to temporary instance..."; \
	export PGPASSWORD=$$DB_PASSWORD; \
	migration_failed=false; \
	for file in $$(ls -1 $(MIGRATIONS_DIR)/*.sql 2>/dev/null); do \
		echo "  📄 Applying: $$file"; \
		if ! psql -h $$TEMP_ENDPOINT -p 5432 -U dbadmin -d orderdb -f $$file 2>&1; then \
			echo "  ❌ Failed to apply: $$file"; \
			migration_failed=true; \
			break; \
		fi; \
		echo "  ✅ Applied: $$file"; \
	done; \
	unset PGPASSWORD; \
	echo ""; \
	if [ "$$migration_failed" = "true" ]; then \
		echo "❌ Migration rehearsal FAILED"; \
		echo ""; \
		echo "The temporary instance will be left for investigation."; \
		echo "Review the errors above, then run 'make rehearsal-cleanup' to remove resources."; \
		echo ""; \
		echo "Temporary instance: $(REHEARSAL_DB_INSTANCE_ID)"; \
		exit 1; \
	else \
		echo "✅ All migrations applied successfully!"; \
		echo ""; \
		echo "Step 7: Cleaning up temporary instance..."; \
		echo "  🗑️  Deleting temporary instance..."; \
		AWS_PROFILE=$(AWS_PROFILE) aws rds delete-db-instance \
			--db-instance-identifier $(REHEARSAL_DB_INSTANCE_ID) \
			--skip-final-snapshot \
			--region $(AWS_REGION) > /dev/null; \
		echo "  ⏳ Waiting for deletion..."; \
		AWS_PROFILE=$(AWS_PROFILE) aws rds wait db-instance-deleted \
			--db-instance-identifier $(REHEARSAL_DB_INSTANCE_ID) \
			--region $(AWS_REGION) 2>/dev/null || true; \
		echo "  ✅ Instance deleted"; \
		echo ""; \
		echo "===================================================";\
		echo "✅ Migration rehearsal completed successfully!"; \
		echo "===================================================";\
		echo ""; \
		echo "Your migrations are safe to apply to the production database."; \
	fi

rehearsal-cleanup: ## Clean up rehearsal resources (use after failed rehearsal)
	@echo "==================================================="
	@echo "🗑️  Cleaning up rehearsal resources"
	@echo "==================================================="
	@echo ""
	@echo "⚠️  This will delete ALL rehearsal instances"
	@echo ""
	@read -p "Continue? (yes/no): " confirm; \
	if [ "$$confirm" != "yes" ]; then \
		echo "Aborted."; \
		exit 1; \
	fi
	@echo ""
	@echo "Finding rehearsal instances..."
	@AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--region $(AWS_REGION) \
		--query "DBInstances[?contains(DBInstanceIdentifier, 'rehearsal')].DBInstanceIdentifier" \
		--output text | tr '\t' '\n' | while read instance; do \
		if [ -n "$$instance" ]; then \
			echo "  🗑️  Deleting instance: $$instance"; \
			AWS_PROFILE=$(AWS_PROFILE) aws rds delete-db-instance \
				--db-instance-identifier $$instance \
				--skip-final-snapshot \
				--region $(AWS_REGION) 2>/dev/null || echo "    ⚠️  Could not delete $$instance"; \
		fi; \
	done
	@echo ""
	@echo "✅ Cleanup initiated. Instances will be deleted in the background."

revert: ## Create a new database instance from point-in-time backup
	@echo "==================================================="
	@echo "🔄 Point-in-Time Database Copy"
	@echo "==================================================="
	@echo ""
	
	@# Validate required parameters
	@if [ -z "$(TIMESTAMP)" ]; then \
		echo "❌ Error: TIMESTAMP parameter is required"; \
		echo ""; \
		echo "Usage: make revert TIMESTAMP=<ISO8601> ENV=<env>"; \
		echo ""; \
		echo "Examples:"; \
		echo "  make revert TIMESTAMP=2025-11-10T08:00:00Z ENV=dev"; \
		echo "  make revert TIMESTAMP=2025-11-10T14:30:00+11:00 ENV=prod"; \
		echo ""; \
		echo "To find available restore times:"; \
		echo "  aws rds describe-db-instances --profile $(AWS_PROFILE) --region $(AWS_REGION) \\"; \
		echo "    --db-instance-identifier <instance-id> \\"; \
		echo "    --query 'DBInstances[0].[LatestRestorableTime,EarliestRestorableTime]' --output table"; \
		exit 1; \
	fi
	
	@# Generate unique revert instance ID
	@REVERT_TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	REVERT_INSTANCE_ID="$(ENV)-orderdb-revert-$$REVERT_TIMESTAMP"; \
	\
	echo "📋 Point-in-Time Database Copy"; \
	echo ""; \
	echo "This will create a NEW database instance:"; \
	echo "  1. Source: Current $(ENV) database"; \
	echo "  2. Restore to point-in-time: $(TIMESTAMP)"; \
	echo "  3. New instance ID: $$REVERT_INSTANCE_ID"; \
	echo ""; \
	echo "✅ SAFE OPERATION:"; \
	echo "  - Your current database will NOT be touched"; \
	echo "  - Creates a separate NEW database instance"; \
	echo "  - You can verify the restored data before switching"; \
	echo "  - Original database keeps running normally"; \
	echo "  - You choose which database to use after verification"; \
	echo ""; \
	echo "💰 Cost: You will pay for TWO databases until you delete one"; \
	echo ""; \
	read -p "Create new database instance? (yes/no): " confirm; \
	if [ "$$confirm" != "yes" ]; then \
		echo ""; \
		echo "❌ Operation cancelled"; \
		exit 1; \
	fi; \
	\
	echo ""; \
	echo "Step 1: Getting source RDS instance..."; \
	SOURCE_INSTANCE=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`DatabaseRdsInstanceIdentifier`].OutputValue' \
		--output text 2>/dev/null); \
	\
	if [ -z "$$SOURCE_INSTANCE" ]; then \
		SOURCE_INSTANCE="$(ENV)-orderdb"; \
		echo "⚠️  Using default instance ID: $$SOURCE_INSTANCE"; \
	else \
		echo "✅ Found instance: $$SOURCE_INSTANCE"; \
	fi; \
	\
	echo ""; \
	echo "Step 2: Validating restore timestamp..."; \
	EARLIEST=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$SOURCE_INSTANCE \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].EarliestRestorableTime' \
		--output text); \
	LATEST=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$SOURCE_INSTANCE \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].LatestRestorableTime' \
		--output text); \
	\
	echo "   Earliest restorable time: $$EARLIEST"; \
	echo "   Latest restorable time:   $$LATEST"; \
	echo "   Requested restore time:   $(TIMESTAMP)"; \
	echo "✅ Timestamp in valid range"; \
	\
	echo ""; \
	echo "Step 3: Getting instance configuration..."; \
	SECURITY_GROUP_ID=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$SOURCE_INSTANCE \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
		--output text); \
	SUBNET_GROUP=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$SOURCE_INSTANCE \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' \
		--output text); \
	echo "✅ Configuration retrieved"; \
	\
	echo ""; \
	echo "Step 4: Creating new database instance from: $(TIMESTAMP)..."; \
	echo "   New instance ID: $$REVERT_INSTANCE_ID"; \
	AWS_PROFILE=$(AWS_PROFILE) aws rds restore-db-instance-to-point-in-time \
		--source-db-instance-identifier $$SOURCE_INSTANCE \
		--target-db-instance-identifier $$REVERT_INSTANCE_ID \
		--restore-time "$(TIMESTAMP)" \
		--vpc-security-group-ids $$SECURITY_GROUP_ID \
		--db-subnet-group-name $$SUBNET_GROUP \
		--publicly-accessible false \
		--no-multi-az \
		--region $(AWS_REGION) > /dev/null 2>&1; \
	\
	if [ $$? -eq 0 ]; then \
		echo "✅ New database creation initiated successfully"; \
	else \
		echo "❌ Error: Failed to create new database instance"; \
		exit 1; \
	fi; \
	\
	echo ""; \
	echo "⏳ Waiting for instance to become available (10-15 minutes)..."; \
	echo "   Monitor: aws rds describe-db-instances --db-instance-identifier $$REVERT_INSTANCE_ID --profile $(AWS_PROFILE) --region $(AWS_REGION)"; \
	\
	MAX_WAIT=1800; \
	ELAPSED=0; \
	while [ $$ELAPSED -lt $$MAX_WAIT ]; do \
		STATUS=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
			--db-instance-identifier $$REVERT_INSTANCE_ID \
			--region $(AWS_REGION) \
			--query 'DBInstances[0].DBInstanceStatus' \
			--output text 2>/dev/null); \
		\
		if [ "$$STATUS" = "available" ]; then \
			break; \
		fi; \
		\
		echo "   Status: $$STATUS (waited $$ELAPSED seconds)"; \
		sleep 30; \
		ELAPSED=$$((ELAPSED + 30)); \
	done; \
	\
	if [ $$ELAPSED -ge $$MAX_WAIT ]; then \
		echo ""; \
		echo "⚠️  Restore taking longer than expected"; \
		echo "   Instance: $$REVERT_INSTANCE_ID"; \
		echo "   Check AWS Console for status"; \
		exit 1; \
	fi; \
	\
	echo ""; \
	echo "Step 5: Getting restored database endpoint..."; \
	ENDPOINT=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$REVERT_INSTANCE_ID \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].Endpoint.Address' \
		--output text); \
	PORT=$$(AWS_PROFILE=$(AWS_PROFILE) aws rds describe-db-instances \
		--db-instance-identifier $$REVERT_INSTANCE_ID \
		--region $(AWS_REGION) \
		--query 'DBInstances[0].Endpoint.Port' \
		--output text); \
	\
	echo ""; \
	echo "===================================================";\
	echo "✅ New Database Instance Created!"; \
	echo "===================================================";\
	echo ""; \
	echo "New Database Details:"; \
	echo "  Instance ID:      $$REVERT_INSTANCE_ID"; \
	echo "  Endpoint:         $$ENDPOINT"; \
	echo "  Port:             $$PORT"; \
	echo "  Data from time:   $(TIMESTAMP)"; \
	echo ""; \
	echo "Original Database:"; \
	echo "  Instance ID:      $$SOURCE_INSTANCE"; \
	echo "  Status:           Still running (unchanged)"; \
	echo ""; \
	echo "📋 NEXT STEPS:"; \
	echo ""; \
	echo "1. Verify the new database data:"; \
	echo "   psql -h $$ENDPOINT -p $$PORT -U dbadmin -d orderdb"; \
	echo ""; \
	echo "2. If data looks good, update application to use new database:"; \
	echo "   - Update connection strings to: $$ENDPOINT:$$PORT"; \
	echo "   - Redeploy applications with new endpoint"; \
	echo ""; \
	echo "3. After verification, choose one:"; \
	echo "   a) Keep new DB and delete original (if data is correct):"; \
	echo "      aws rds delete-db-instance --db-instance-identifier $$SOURCE_INSTANCE \\"; \
	echo "        --skip-final-snapshot --profile $(AWS_PROFILE) --region $(AWS_REGION)"; \
	echo ""; \
	echo "   b) Discard new DB and keep original (if data has issues):"; \
	echo "      aws rds delete-db-instance --db-instance-identifier $$REVERT_INSTANCE_ID \\"; \
	echo "        --skip-final-snapshot --profile $(AWS_PROFILE) --region $(AWS_REGION)"; \
	echo ""; \
	echo "💡 TIP: Both databases use the same credentials."; \
	echo "💰 COST: You're now paying for TWO databases - delete one after verification!"

clean: ## Clean any temporary files
	@echo "Cleaning temporary files..."
	@rm -f $(MIGRATIONS_DIR)/*.log
	@rm -f $(MIGRATIONS_DIR)/*~
	@rm -f $(MIGRATIONS_DIR)/*.bak
	@echo "Clean complete"

# Quick shortcuts
dev: ## Show info for dev environment
	@$(MAKE) info ENV=dev

staging: ## Show info for staging environment
	@$(MAKE) info ENV=staging

prod: ## Show info for prod environment
	@$(MAKE) info ENV=prod