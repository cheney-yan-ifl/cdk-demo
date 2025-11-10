.PHONY: help bootstrap install build test deploy diff destroy validate synth clean

# Default environment
ENV ?= dev

# AWS Profile (can be overridden)
AWS_PROFILE ?= personal-sydney

# AWS account and region detection
AWS_ACCOUNT_ID := $(shell AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
AWS_REGION := $(shell AWS_PROFILE=$(AWS_PROFILE) aws configure get region 2>/dev/null || echo "ap-southeast-2")

# CDK context
CDK_CONTEXT := -c environment=$(ENV)
CDK_APP := npx cdk

help: ## Display this help message
	@echo "Shared Infrastructure Makefile"
	@echo ""
	@echo "Usage: make [target] ENV=[dev|staging|prod]"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Examples:"
	@echo "  make install              - Install dependencies"
	@echo "  make deploy ENV=dev       - Deploy to dev environment"
	@echo "  make destroy ENV=dev      - Destroy dev environment"
	@echo ""
	@echo "Note: Database migrations have moved to ../database-migrations/"
	@echo "      Run: cd ../database-migrations && make help"

install: ## Install dependencies
	@echo "Installing dependencies..."
	npm install

build: install ## Build TypeScript code
	@echo "Building TypeScript..."
	npm run build

test: ## Run unit tests
	@echo "Running tests..."
	npm test

validate: build ## Validate CDK app configuration
	@echo "Validating CDK app for $(ENV) environment using profile $(AWS_PROFILE)..."
	@if [ -z "$(AWS_ACCOUNT_ID)" ]; then \
		echo "Error: AWS credentials not configured for profile $(AWS_PROFILE)"; \
		exit 1; \
	fi
	@echo "AWS Profile: $(AWS_PROFILE)"
	@echo "AWS Account: $(AWS_ACCOUNT_ID)"
	@echo "AWS Region: $(AWS_REGION)"
	@if [ ! -f .env.$(ENV) ]; then \
		echo "Error: .env.$(ENV) file not found"; \
		exit 1; \
	fi
	@echo "Configuration file: .env.$(ENV)"
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) synth $(CDK_CONTEXT) > /dev/null

bootstrap: ## Bootstrap CDK in AWS account
	@echo "Bootstrapping CDK in account $(AWS_ACCOUNT_ID) region $(AWS_REGION) using profile $(AWS_PROFILE)..."
	@if [ -z "$(AWS_ACCOUNT_ID)" ]; then \
		echo "Error: AWS credentials not configured for profile $(AWS_PROFILE)"; \
		exit 1; \
	fi
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) bootstrap aws://$(AWS_ACCOUNT_ID)/$(AWS_REGION)

synth: build ## Synthesize CloudFormation template
	@echo "Synthesizing CloudFormation template for $(ENV) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) synth $(CDK_CONTEXT)

diff: build ## Show infrastructure changes
	@echo "Showing diff for $(ENV) environment using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) diff $(CDK_CONTEXT)

deploy: validate ## Deploy infrastructure
	@echo "Deploying shared infrastructure to $(ENV) using profile $(AWS_PROFILE)..."
	@if [ "$(ENV)" = "prod" ]; then \
		read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm; \
		if [ "$$confirm" != "yes" ]; then \
			echo "Deployment cancelled"; \
			exit 1; \
		fi; \
	fi
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) deploy $(CDK_CONTEXT) --require-approval never --all

destroy: ## Destroy infrastructure (with confirmation)
	@echo "WARNING: This will destroy all infrastructure in $(ENV) environment!"
	@read -p "Type the environment name '$(ENV)' to confirm: " confirm; \
	if [ "$$confirm" != "$(ENV)" ]; then \
		echo "Confirmation failed. Aborting."; \
		exit 1; \
	fi
	@if [ "$(ENV)" = "prod" ]; then \
		echo "ERROR: Cannot destroy production environment via Makefile"; \
		echo "Please use AWS Console for production destruction"; \
		exit 1; \
	fi
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) destroy $(CDK_CONTEXT) --force --all

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	rm -rf node_modules
	rm -rf cdk.out
	rm -rf dist
	rm -rf coverage
	find . -name "*.js" -type f -delete
	find . -name "*.d.ts" -type f -delete

dev: ## Quick deploy to dev (shortcut)
	@$(MAKE) deploy ENV=dev

staging: ## Quick deploy to staging (shortcut)
	@$(MAKE) deploy ENV=staging

prod: ## Quick deploy to prod (shortcut)
	@$(MAKE) deploy ENV=prod