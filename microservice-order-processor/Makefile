.PHONY: help build push deploy destroy test validate clean docker-login bootstrap install

# Default environment
ENV ?= dev

# AWS Profile (can be overridden)
AWS_PROFILE ?= personal-sydney

# AWS Configuration
AWS_ACCOUNT_ID := $(shell AWS_PROFILE=$(AWS_PROFILE) aws sts get-caller-identity --query Account --output text)
AWS_REGION := $(shell AWS_PROFILE=$(AWS_PROFILE) aws configure get region 2>/dev/null || echo "ap-southeast-2")
ECR_REPOSITORY := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
IMAGE_NAME := order-processor-$(ENV)
IMAGE_TAG ?= latest
FULL_IMAGE_NAME := $(ECR_REPOSITORY)/$(IMAGE_NAME):$(IMAGE_TAG)

# CDK Configuration
STACK_NAME := MicroserviceOrderProcessorStack-$(ENV)
CDK_CONTEXT := -c environment=$(ENV)
CDK_APP := npx cdk

help: ## Show this help message
	@echo 'Usage: make [target] ENV=<dev|staging|prod>'
	@echo ''
	@echo 'Targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

validate-env: ## Validate environment variable
	@if [ "$(ENV)" != "dev" ] && [ "$(ENV)" != "staging" ] && [ "$(ENV)" != "prod" ]; then \
		echo "Error: ENV must be 'dev', 'staging', or 'prod'"; \
		exit 1; \
	fi
	@echo "Environment: $(ENV)"
	@echo "AWS Account: $(AWS_ACCOUNT_ID)"
	@echo "AWS Region: $(AWS_REGION)"

validate-shared: validate-env ## Validate shared infrastructure is deployed
	@echo "Validating shared infrastructure for $(ENV) using profile $(AWS_PROFILE)..."
	@AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name InfrastructureSharedStack-$(ENV) --region $(AWS_REGION) > /dev/null 2>&1 || \
		(echo "Error: Shared infrastructure stack 'InfrastructureSharedStack-$(ENV)' not found. Deploy it first." && exit 1)
	@echo "Shared infrastructure validated successfully"

check-ecr: ## Check if ECR repository exists and configure lifecycle policy
	@AWS_PROFILE=$(AWS_PROFILE) aws ecr describe-repositories --repository-names $(IMAGE_NAME) --region $(AWS_REGION) > /dev/null 2>&1 || \
		(echo "Creating ECR repository $(IMAGE_NAME)..." && \
		AWS_PROFILE=$(AWS_PROFILE) aws ecr create-repository --repository-name $(IMAGE_NAME) --region $(AWS_REGION) \
		--encryption-configuration encryptionType=AES256 \
		--image-scanning-configuration scanOnPush=true)
	@echo "Setting ECR lifecycle policy for $(IMAGE_NAME)..."
	@echo '{ \
		"rules": [ \
			{ \
				"rulePriority": 1, \
				"description": "Delete untagged images immediately", \
				"selection": { \
					"tagStatus": "untagged", \
					"countType": "sinceImagePushed", \
					"countUnit": "days", \
					"countNumber": 1 \
				}, \
				"action": { \
					"type": "expire" \
				} \
			}, \
			{ \
				"rulePriority": 2, \
				"description": "Keep only 1 latest tagged image", \
				"selection": { \
					"tagStatus": "tagged", \
					"tagPrefixList": ["latest"], \
					"countType": "imageCountMoreThan", \
					"countNumber": 1 \
				}, \
				"action": { \
					"type": "expire" \
				} \
			} \
		] \
	}' | AWS_PROFILE=$(AWS_PROFILE) aws ecr put-lifecycle-policy \
		--repository-name $(IMAGE_NAME) \
		--lifecycle-policy-text file:///dev/stdin \
		--region $(AWS_REGION) > /dev/null 2>&1 || echo "Lifecycle policy already set or failed to apply"

docker-login: check-ecr ## Login to ECR
	@echo "Logging in to ECR using profile $(AWS_PROFILE)..."
	@AWS_PROFILE=$(AWS_PROFILE) aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REPOSITORY)

build: ## Build Docker image
	@echo "Cleaning up build artifacts..."
	rm -rf docker/node_modules
	@echo "Installing dependencies..."
	cd docker && npm install
	@echo "Building Docker image for x86_64/amd64: $(FULL_IMAGE_NAME)"
	cd docker && docker build --platform=linux/amd64 -t $(IMAGE_NAME):$(IMAGE_TAG) .
	docker tag $(IMAGE_NAME):$(IMAGE_TAG) $(FULL_IMAGE_NAME)
	@echo "Build complete: $(FULL_IMAGE_NAME)"

push: docker-login build ## Build and push Docker image to ECR
	@echo "Pushing image to ECR: $(FULL_IMAGE_NAME)"
	docker push $(FULL_IMAGE_NAME)
	@echo "Push complete"

install: ## Install CDK dependencies
	@echo "Installing CDK dependencies..."
	npm install
	@echo "Dependencies installed"

bootstrap: validate-env install ## Bootstrap CDK for the AWS account/region
	@echo "Bootstrapping CDK for $(AWS_ACCOUNT_ID) in $(AWS_REGION) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) bootstrap aws://$(AWS_ACCOUNT_ID)/$(AWS_REGION)

synth: validate-env install ## Synthesize CloudFormation template
	@echo "Synthesizing CDK stack for $(ENV) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) synth $(CDK_CONTEXT)

diff: validate-env validate-shared install ## Show changes that will be deployed
	@echo "Showing deployment diff for $(ENV) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) diff $(CDK_CONTEXT)

deploy: validate-env validate-shared install push ## Build, push, and deploy the microservice
	@echo "Deploying microservice to $(ENV) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) deploy $(CDK_CONTEXT) --require-approval never
	@echo ""
	@echo "=============================================="
	@echo "✅ Deployment Complete!"
	@echo "=============================================="
	@echo ""
	@echo "🌐 Service URLs:"
	@echo "   Root:   $$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].Outputs[?OutputKey==`ServiceRootUrl`].OutputValue' --output text)"
	@echo "   Health: $$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].Outputs[?OutputKey==`ServiceHealthUrl`].OutputValue' --output text)"
	@echo "   Users:  $$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].Outputs[?OutputKey==`ServiceUsersUrl`].OutputValue' --output text)"
	@echo ""
	@echo "📊 Queue URL:"
	@echo "   $$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].Outputs[?OutputKey==`QueueUrl`].OutputValue' --output text)"
	@echo ""

deploy-only: validate-env validate-shared install ## Deploy without building/pushing (use existing image)
	@echo "Deploying microservice to $(ENV) (using existing image) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) deploy $(CDK_CONTEXT) --require-approval never

destroy: validate-env ## Destroy the microservice stack
	@if [ "$(ENV)" = "prod" ]; then \
		echo "WARNING: You are about to destroy PRODUCTION environment!"; \
		read -p "Type 'destroy-prod' to confirm: " confirm; \
		if [ "$$confirm" != "destroy-prod" ]; then \
			echo "Destruction cancelled"; \
			exit 1; \
		fi; \
	fi
	@echo "Destroying microservice stack for $(ENV) using profile $(AWS_PROFILE)..."
	AWS_PROFILE=$(AWS_PROFILE) $(CDK_APP) destroy $(CDK_CONTEXT) --force

test: ## Run CDK unit tests
	@echo "Running tests..."
	npm test

validate: ## Validate CDK code and configuration
	@echo "Validating CDK code..."
	npm run build
	@echo "Validation complete"

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	rm -rf cdk.out
	rm -rf node_modules
	rm -rf docker/node_modules
	@echo "Clean complete"

logs: validate-env ## Tail CloudWatch logs for the service
	@echo "Tailing logs for $(ENV) using profile $(AWS_PROFILE)..."
	@LOG_GROUP=$$(AWS_PROFILE=$(AWS_PROFILE) aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) \
		--query 'Stacks[0].Outputs[?OutputKey==`ServiceLogGroup`].OutputValue' --output text 2>/dev/null || echo "/aws/ecs/$(ENV)/order-processor-$(ENV)"); \
	AWS_PROFILE=$(AWS_PROFILE) aws logs tail $$LOG_GROUP --follow --region $(AWS_REGION)

status: validate-env ## Show service status
	@echo "Service Status for $(ENV) using profile $(AWS_PROFILE):"
	@echo "=========================="
	@AWS_PROFILE=$(AWS_PROFILE) aws ecs describe-services \
		--cluster $(ENV)-ecs-cluster \
		--services order-processor-$(ENV) \
		--region $(AWS_REGION) \
		--query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Pending:pendingCount}' \
		--output table

scale: validate-env ## Scale service (usage: make scale DESIRED=3)
	@if [ -z "$(DESIRED)" ]; then \
		echo "Error: DESIRED count not specified. Usage: make scale DESIRED=3"; \
		exit 1; \
	fi
	@echo "Scaling service to $(DESIRED) tasks using profile $(AWS_PROFILE)..."
	@AWS_PROFILE=$(AWS_PROFILE) aws ecs update-service \
		--cluster $(ENV)-ecs-cluster \
		--service order-processor-$(ENV) \
		--desired-count $(DESIRED) \
		--region $(AWS_REGION) > /dev/null
	@echo "Scale request sent. New desired count: $(DESIRED)"

restart: validate-env ## Force restart of all tasks
	@echo "Restarting service tasks using profile $(AWS_PROFILE)..."
	@AWS_PROFILE=$(AWS_PROFILE) aws ecs update-service \
		--cluster $(ENV)-ecs-cluster \
		--service order-processor-$(ENV) \
		--force-new-deployment \
		--region $(AWS_REGION) > /dev/null
	@echo "Restart initiated"

# CI/CD targets
ci-build: ## CI: Build and test
	npm ci
	npm run build
	npm test
	make build

ci-deploy: ## CI: Deploy (assumes image is already pushed)
	make deploy-only ENV=$(ENV)