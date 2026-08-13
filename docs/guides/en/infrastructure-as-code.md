# Infrastructure as Code (Terraform)

nestjs-boot ships production-ready Terraform templates for deploying your application to **AWS** (ECS Fargate) or **GCP** (Cloud Run). The templates provision networking, compute, database, cache, container registry, monitoring, and alerting -- everything needed to run a NestJS application in production.

## Supported Clouds

| Cloud | Compute | Database | Cache | Registry | Monitoring |
|-------|---------|----------|-------|----------|------------|
| **AWS** | ECS Fargate | DocumentDB | ElastiCache Redis | ECR | CloudWatch |
| **GCP** | Cloud Run | MongoDB Atlas | Memorystore Redis | Artifact Registry | Cloud Monitoring |

Templates live in `templates/terraform/aws/` and `templates/terraform/gcp/`.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Terraform | >= 1.5 | [terraform.io/downloads](https://www.terraform.io/downloads) |
| AWS CLI v2 | latest | `brew install awscli` (AWS only) |
| gcloud CLI | latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) (GCP only) |
| Docker | latest | Required for building/pushing images |

## AWS (ECS Fargate)

### Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │                    VPC                       │
  Internet ──▶ IGW │  ┌──────────┐    ┌────────────────────────┐  │
                    │  │  Public   │    │     Private Subnets     │  │
                    │  │ Subnets   │    │                        │  │
                    │  │  ┌─────┐ │    │  ┌──────────────────┐  │  │
                    │  │  │ ALB │─┼────┼─▶│  ECS Fargate     │  │  │
                    │  │  └─────┘ │    │  │  (auto-scaling)  │  │  │
                    │  │  ┌─────┐ │    │  └──────┬───────────┘  │  │
                    │  │  │ NAT │◀┼────┼─────────┘              │  │
                    │  │  └─────┘ │    │  ┌──────────────────┐  │  │
                    │  └──────────┘    │  │ DocumentDB       │  │  │
                    │                  │  │ (MongoDB compat.) │  │  │
                    │                  │  └──────────────────┘  │  │
                    │                  │  ┌──────────────────┐  │  │
                    │                  │  │ ElastiCache Redis │  │  │
                    │                  │  └──────────────────┘  │  │
                    │                  └────────────────────────┘  │
                    └──────────────────────────────────────────────┘
```

### Resources Created

- **VPC** with public and private subnets across 2 AZs
- **Internet Gateway** + **NAT Gateway** for outbound from private subnets
- **Application Load Balancer** in public subnets (HTTP listener)
- **ECS Fargate cluster** with auto-scaling (CPU 70%, memory 80%)
- **DocumentDB** cluster (MongoDB-compatible) in private subnets
- **ElastiCache Redis** in private subnets
- **ECR** repository for Docker images
- **CloudWatch** log group, dashboard, and SNS alarms
- **IAM roles** (execution + task) with least-privilege policies

### Deploy Step-by-Step

```bash
# 1. Copy templates to your project
cp -r templates/terraform/aws infrastructure/aws
cd infrastructure/aws

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: project_name, docdb_master_password, alert_email

# 3. Initialize and deploy
terraform init
terraform plan          # Review what will be created
terraform apply         # Type "yes" to confirm

# 4. Build and push your Docker image
ECR_URL=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "$ECR_URL"
docker build -t "$ECR_URL:latest" .
docker push "$ECR_URL:latest"

# 5. Force a new deployment to pick up the image
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment
```

## GCP (Cloud Run)

### Architecture

```
                ┌───────────────────────────────────────┐
                │            GCP Project                │
  Internet ──▶  │  ┌──────────────────┐                 │
                │  │   Cloud Run      │                 │
                │  │  (auto-scaling,  │                 │
                │  │   scale-to-zero) │                 │
                │  └────────┬─────────┘                 │
                │           │ VPC Connector             │
                │           ▼                           │
                │  ┌──────────────────┐                 │
                │  │ Memorystore Redis│ (private)       │
                │  └──────────────────┘                 │
                │                                       │
                │  ┌──────────────────┐ (SaaS, external)│
                │  │ MongoDB Atlas    │ IP-allowlisted  │
                │  └──────────────────┘                 │
                │                                       │
                │  ┌──────────────────┐                 │
                │  │ Artifact Registry│                 │
                │  └──────────────────┘                 │
                └───────────────────────────────────────┘
```

### Resources Created

- **Cloud Run v2 service** with startup/liveness probes, scale-to-zero
- **VPC Access Connector** for private Redis connectivity
- **MongoDB Atlas** cluster + database user + IP allowlist (via Atlas provider)
- **Memorystore Redis** instance in private network
- **Artifact Registry** Docker repository
- **Cloud Monitoring** alert policies (latency, 5xx, scaling) + email notification
- **GCP APIs** auto-enabled (Run, Artifact Registry, Redis, Monitoring, VPC Access, Compute)

### Deploy Step-by-Step

```bash
# 1. Copy templates to your project
cp -r templates/terraform/gcp infrastructure/gcp
cd infrastructure/gcp

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars: gcp_project_id, atlas_*, alert_email

# 3. Authenticate
gcloud auth application-default login

# 4. Initialize and deploy
terraform init
terraform plan
terraform apply

# 5. Build and push your Docker image
REGION=$(terraform output -raw gcp_region)
REPO=$(terraform output -raw artifact_registry_url)
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker build -t "${REPO}/app:latest" .
docker push "${REPO}/app:latest"
# Cloud Run auto-deploys when a new image is pushed
```

## CLI Integration

When scaffolding a new project, use the `--iac` flag to copy Terraform templates into your project:

```bash
npx nestjs-boot new my-app --iac=aws    # AWS ECS Fargate
npx nestjs-boot new my-app --iac=gcp    # GCP Cloud Run
npx nestjs-boot new my-app --iac=both   # Both providers
```

This copies the templates into `infrastructure/aws/` and/or `infrastructure/gcp/` in your new project, ready to configure and deploy.

> **Note:** The `--iac` flag is planned for a future CLI release. For now, copy templates manually from `templates/terraform/`.

## Variables Reference

### Common Variables (Both Clouds)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `project_name` | Resource naming prefix | -- | Yes |
| `environment` | `dev` / `staging` / `prod` | `dev` | No |
| `app_port` | NestJS listen port | `3000` | No |
| `alert_email` | Email for alerts (empty = no alerts) | `""` | No |

### AWS Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `vpc_cidr` | VPC CIDR block | `10.0.0.0/16` |
| `availability_zones` | AZs (min 2) | `["us-east-1a", "us-east-1b"]` |
| `app_cpu` | Fargate CPU units (256/512/1024/2048/4096) | `256` |
| `app_memory` | Fargate memory in MiB | `512` |
| `desired_count` | Initial ECS task count | `2` |
| `min_capacity` / `max_capacity` | Auto-scaling bounds | `1` / `4` |
| `docdb_instance_class` | DocumentDB instance type | `db.t3.medium` |
| `docdb_instance_count` | DocumentDB instance count | `1` |
| `docdb_master_username` | DocumentDB username | `docdbadmin` |
| `docdb_master_password` | DocumentDB password (sensitive) | -- (required) |
| `redis_node_type` | ElastiCache node type | `cache.t3.micro` |
| `redis_num_cache_nodes` | Redis node count | `1` |

### GCP Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `gcp_project_id` | GCP project ID | -- (required) |
| `gcp_region` | GCP region | `us-central1` |
| `cloud_run_cpu` | CPU per instance | `"1"` |
| `cloud_run_memory` | Memory per instance | `"512Mi"` |
| `min_instances` / `max_instances` | Scaling bounds (0 = scale-to-zero) | `0` / `4` |
| `atlas_public_key` | MongoDB Atlas API public key | -- (required) |
| `atlas_private_key` | MongoDB Atlas API private key (sensitive) | -- (required) |
| `atlas_org_id` | Atlas organization ID | -- (required) |
| `atlas_cluster_tier` | Atlas tier (`M0` = free) | `M0` |
| `atlas_db_password` | Atlas DB password (sensitive) | -- (required) |
| `redis_tier` | `BASIC` or `STANDARD_HA` | `BASIC` |
| `redis_memory_size_gb` | Redis memory in GB | `1` |

## Security

### Network Isolation

- **AWS:** ECS tasks, DocumentDB, and Redis run in **private subnets** with no public IPs. Only the ALB is publicly accessible. Security groups restrict ECS ingress to ALB-only traffic on the app port.
- **GCP:** Memorystore Redis is private-network only, accessed via VPC Connector (`PRIVATE_RANGES_ONLY` egress). MongoDB Atlas is IP-allowlisted to the Cloud Run egress range.

### Least-Privilege IAM

- **ECS Execution Role:** Only pulls images from ECR and writes logs to CloudWatch.
- **ECS Task Role:** Only `cloudwatch:PutMetricData` scoped to the project namespace. Extend as needed.
- **GCP:** Cloud Run uses the default compute service account. Public invoker access is granted for the API endpoint.

### Secrets Management

Database passwords are passed as Terraform variables (marked `sensitive`). For production:

- **AWS:** Replace environment variables with AWS Secrets Manager references in the task definition.
- **GCP:** Use GCP Secret Manager and reference secrets in the Cloud Run service definition.
- Never commit `terraform.tfvars` to version control (add it to `.gitignore`).

## Monitoring and Alerts

Set `alert_email` to enable monitoring. Alerts are sent via email (SNS for AWS, notification channel for GCP).

### AWS CloudWatch

| Alarm | Condition | Period |
|-------|-----------|--------|
| CPU High | ECS CPU > 85% for 2 periods | 5 min |
| Memory High | ECS memory > 90% for 2 periods | 5 min |
| ALB 5xx | Target 5xx count > 10 | 5 min |

A CloudWatch dashboard is created with widgets for ECS CPU/memory, ALB request count/latency, DocumentDB connections/CPU, and Redis cache hits/memory.

### GCP Cloud Monitoring

| Alert | Condition | Duration |
|-------|-----------|----------|
| High Latency | Cloud Run p95 latency > 2s | 5 min |
| High Error Rate | 5xx count > 10 | 5 min |
| Near Max Instances | Instance count > 80% of max | 5 min |

## Cost Estimation

### AWS

| Tier | ECS | DocumentDB | ElastiCache | ALB | NAT GW | Total |
|------|-----|------------|-------------|-----|--------|-------|
| **Dev** | ~$15 (256 CPU, 512 MiB, 2 tasks) | ~$55 (db.t3.medium) | ~$13 (cache.t3.micro) | ~$18 | ~$32 | **~$133/mo** |
| **Staging** | ~$30 (512 CPU, 1 GiB, 2 tasks) | ~$55 | ~$13 | ~$18 | ~$32 | **~$148/mo** |
| **Prod** | ~$120 (1024 CPU, 2 GiB, 4 tasks) | ~$170 (db.r5.large, 2 instances) | ~$50 (cache.r6g.large) | ~$18 | ~$32 | **~$390/mo** |

### GCP

| Tier | Cloud Run | MongoDB Atlas | Memorystore | Total |
|------|-----------|---------------|-------------|-------|
| **Dev** | ~$0-5 (scale-to-zero) | $0 (M0 free) | ~$35 (1 GB BASIC) | **~$35-40/mo** |
| **Staging** | ~$20 (min 1 instance) | ~$57 (M10) | ~$35 | **~$112/mo** |
| **Prod** | ~$80 (min 2, max 8) | ~$165 (M30) | ~$185 (STANDARD_HA, 5 GB) | **~$430/mo** |

> Costs vary by region and usage. GCP is significantly cheaper for dev/staging due to scale-to-zero and Atlas free tier.

## Customization

### Adding HTTPS

**AWS:** Create an ACM certificate, add an HTTPS listener to the ALB in `alb.tf`, and redirect HTTP to HTTPS.

**GCP:** Map a custom domain to Cloud Run and enable a Google-managed SSL certificate.

### Custom Domain

- **AWS:** Create a Route53 hosted zone and an alias record pointing to the ALB.
- **GCP:** Use Cloud Run domain mapping or Cloud DNS.

### Additional Services

Add new `.tf` files alongside the existing ones. For example, add an S3 bucket (`s3.tf`) or Cloud Storage bucket (`gcs.tf`) for file uploads, then pass the bucket name as an environment variable to the container.

### Environment-Specific Overrides

Use `terraform.tfvars` per environment or Terraform workspaces:

```bash
# Separate tfvars per environment
terraform apply -var-file="environments/prod.tfvars"

# Or use workspaces
terraform workspace new prod
terraform workspace select prod
terraform apply
```

## Best Practices

### Remote State

Both templates include commented-out backend configurations. Enable remote state for team collaboration:

**AWS (S3 + DynamoDB locking):**
```hcl
backend "s3" {
  bucket         = "my-terraform-state"
  key            = "nestjs-boot/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-locks"
  encrypt        = true
}
```

**GCP (GCS):**
```hcl
backend "gcs" {
  bucket = "my-terraform-state"
  prefix = "nestjs-boot/terraform.tfstate"
}
```

### Workspaces for Environments

```bash
terraform workspace new staging
terraform workspace new prod
# Each workspace maintains separate state
```

### CI/CD Integration

Add Terraform to your pipeline:

1. `terraform fmt -check` -- enforce formatting
2. `terraform validate` -- syntax validation
3. `terraform plan -out=plan.tfplan` -- generate plan on PRs
4. `terraform apply plan.tfplan` -- apply on merge to main

Use the `--ci=github` flag when creating your project to get a GitHub Actions workflow that includes Terraform plan on pull requests.

### Tear Down

```bash
# Remove all resources
terraform destroy

# Destroy specific resources only
terraform destroy -target=aws_ecs_service.app
```

> **Warning:** `terraform destroy` in production causes downtime. DocumentDB with `skip_final_snapshot = false` (prod) creates a final snapshot automatically.
