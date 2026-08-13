# Terraform Infrastructure Templates

Infrastructure-as-Code templates for deploying a **nestjs-boot** application to AWS or GCP.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Terraform | >= 1.5 | [terraform.io/downloads](https://www.terraform.io/downloads) |
| AWS CLI | v2 | `brew install awscli` — needed for `aws/` |
| gcloud CLI | latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) — needed for `gcp/` |
| Docker | latest | Required for building and pushing images |

### Cloud-specific setup

**AWS:** Run `aws configure` with an IAM user that has permissions for ECS, ECR, VPC, DocumentDB, ElastiCache, CloudWatch, IAM, and ALB.

**GCP:** Run `gcloud auth application-default login`. Enable billing on your project. Create a [MongoDB Atlas](https://www.mongodb.com/atlas) account and generate API keys.

## Quick Start

### AWS (ECS Fargate)

```bash
cd infrastructure/aws   # or templates/terraform/aws if using from the framework

# Configure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Deploy
terraform init
terraform plan
terraform apply

# Push your Docker image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ECR_URL>
docker build -t <ECR_URL>:latest .
docker push <ECR_URL>:latest

# Force new deployment
aws ecs update-service --cluster <cluster-name> --service <service-name> --force-new-deployment
```

### GCP (Cloud Run)

```bash
cd infrastructure/gcp   # or templates/terraform/gcp if using from the framework

# Configure
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Deploy
terraform init
terraform plan
terraform apply

# Push your Docker image
gcloud auth configure-docker <REGION>-docker.pkg.dev
docker build -t <ARTIFACT_REGISTRY_URL>/app:latest .
docker push <ARTIFACT_REGISTRY_URL>/app:latest

# Cloud Run auto-deploys when a new image is pushed
```

## Variable Reference

### Common Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `project_name` | Project name for resource naming | — | Yes |
| `environment` | `dev`, `staging`, or `prod` | `dev` | No |
| `app_port` | NestJS app port | `3000` | No |
| `alert_email` | Email for monitoring alerts | `""` | No |

### AWS-specific

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `app_cpu` | Fargate CPU units (256/512/1024/2048/4096) | `256` |
| `app_memory` | Fargate memory in MiB | `512` |
| `desired_count` | Number of ECS tasks | `2` |
| `min_capacity` / `max_capacity` | Auto-scaling bounds | `1` / `4` |
| `docdb_instance_class` | DocumentDB instance type | `db.t3.medium` |
| `docdb_master_password` | DocumentDB password | — (required) |
| `redis_node_type` | ElastiCache node type | `cache.t3.micro` |

### GCP-specific

| Variable | Description | Default |
|----------|-------------|---------|
| `gcp_project_id` | GCP project ID | — (required) |
| `gcp_region` | GCP region | `us-central1` |
| `cloud_run_cpu` | CPU per instance | `"1"` |
| `cloud_run_memory` | Memory per instance | `"512Mi"` |
| `min_instances` / `max_instances` | Scaling bounds (0 = scale-to-zero) | `0` / `4` |
| `atlas_cluster_tier` | MongoDB Atlas tier (`M0` = free) | `M0` |
| `atlas_db_password` | Atlas database password | — (required) |
| `redis_tier` | `BASIC` or `STANDARD_HA` | `BASIC` |

## Architecture

### AWS

```
Internet → ALB (public subnets) → ECS Fargate (private subnets)
                                    ├── DocumentDB (private subnets)
                                    └── ElastiCache Redis (private subnets)
```

- ECS tasks run in private subnets with NAT Gateway for outbound
- DocumentDB and Redis only accept connections from ECS security group
- Auto-scaling on CPU (70%) and memory (80%)
- CloudWatch dashboard + SNS email alerts

### GCP

```
Internet → Cloud Run (managed, public) → VPC Connector
                                           ├── MongoDB Atlas (SaaS, IP-allowlisted)
                                           └── Memorystore Redis (private)
```

- Cloud Run scales to zero in dev, configurable min/max
- VPC connector for private Redis access
- MongoDB Atlas as managed MongoDB (M0 free tier available)
- Cloud Monitoring alerts for latency, errors, and scaling

## Cost Estimation

### AWS (dev defaults)

| Resource | Approx. monthly cost |
|----------|---------------------|
| ECS Fargate (256 CPU, 512 MiB, 2 tasks) | ~$15 |
| DocumentDB (db.t3.medium, 1 instance) | ~$55 |
| ElastiCache (cache.t3.micro, 1 node) | ~$13 |
| ALB | ~$18 |
| NAT Gateway | ~$32 |
| **Total (dev)** | **~$133/mo** |

### GCP (dev defaults)

| Resource | Approx. monthly cost |
|----------|---------------------|
| Cloud Run (scale to zero) | ~$0–5 |
| MongoDB Atlas (M0 free) | $0 |
| Memorystore Redis (1 GB, BASIC) | ~$35 |
| **Total (dev)** | **~$35–40/mo** |

> Costs vary by region and usage. Use `terraform plan` to see exact resources. For production, expect 3–5x dev costs.

## Destroy

```bash
# Remove all resources (careful in production!)
terraform destroy

# Or target specific resources
terraform destroy -target=aws_ecs_service.app
```

> **Warning:** `terraform destroy` in production will cause downtime. For DocumentDB with `skip_final_snapshot = false` (prod), a final snapshot is created automatically.

## Remote State

Both templates include commented-out backend configurations. To enable:

1. Create the state bucket manually (S3 for AWS, GCS for GCP)
2. Uncomment the `backend` block in `main.tf`
3. Run `terraform init` to migrate state

## Customization

- **HTTPS:** Add an ACM certificate (AWS) or Google-managed cert and update the ALB listener / Cloud Run domain mapping
- **Custom domain:** Use Route53 (AWS) or Cloud DNS (GCP) with the load balancer
- **Secrets:** Replace environment variables with AWS Secrets Manager or GCP Secret Manager references
- **CI/CD:** Use the `--ci=github` flag when creating your project to get a GitHub Actions workflow that includes `terraform plan` on PRs
