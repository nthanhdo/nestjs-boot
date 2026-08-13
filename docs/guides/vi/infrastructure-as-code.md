# Infrastructure as Code (Terraform)

nestjs-boot cung cap san template Terraform de deploy ung dung len **AWS** (ECS Fargate) hoac **GCP** (Cloud Run). Cac template tao san networking, compute, database, cache, container registry, monitoring va alerting -- du de chay ung dung NestJS trong production.

## Cloud duoc ho tro

| Cloud | Compute | Database | Cache | Registry | Monitoring |
|-------|---------|----------|-------|----------|------------|
| **AWS** | ECS Fargate | DocumentDB | ElastiCache Redis | ECR | CloudWatch |
| **GCP** | Cloud Run | MongoDB Atlas | Memorystore Redis | Artifact Registry | Cloud Monitoring |

Template nam trong `templates/terraform/aws/` va `templates/terraform/gcp/`.

## Yeu cau

| Cong cu | Phien ban | Cai dat |
|---------|-----------|---------|
| Terraform | >= 1.5 | [terraform.io/downloads](https://www.terraform.io/downloads) |
| AWS CLI v2 | latest | `brew install awscli` (chi AWS) |
| gcloud CLI | latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) (chi GCP) |
| Docker | latest | Can de build va push image |

## AWS (ECS Fargate)

### Kien truc

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
                    │                  │  │ (tuong thich Mongo)│  │  │
                    │                  │  └──────────────────┘  │  │
                    │                  │  ┌──────────────────┐  │  │
                    │                  │  │ ElastiCache Redis │  │  │
                    │                  │  └──────────────────┘  │  │
                    │                  └────────────────────────┘  │
                    └──────────────────────────────────────────────┘
```

### Tai nguyen duoc tao

- **VPC** voi public va private subnets tren 2 AZ
- **Internet Gateway** + **NAT Gateway** cho traffic ra ngoai tu private subnets
- **Application Load Balancer** trong public subnets (HTTP listener)
- **ECS Fargate cluster** voi auto-scaling (CPU 70%, memory 80%)
- **DocumentDB** cluster (tuong thich MongoDB) trong private subnets
- **ElastiCache Redis** trong private subnets
- **ECR** repository cho Docker images
- **CloudWatch** log group, dashboard va SNS alarms
- **IAM roles** (execution + task) voi chinh sach quyen toi thieu

### Cac buoc deploy

```bash
# 1. Copy templates vao project
cp -r templates/terraform/aws infrastructure/aws
cd infrastructure/aws

# 2. Cau hinh bien
cp terraform.tfvars.example terraform.tfvars
# Sua terraform.tfvars: project_name, docdb_master_password, alert_email

# 3. Khoi tao va deploy
terraform init
terraform plan          # Xem lai nhung gi se duoc tao
terraform apply         # Nhap "yes" de xac nhan

# 4. Build va push Docker image
ECR_URL=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "$ECR_URL"
docker build -t "$ECR_URL:latest" .
docker push "$ECR_URL:latest"

# 5. Bat ECS deploy image moi
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) \
  --force-new-deployment
```

## GCP (Cloud Run)

### Kien truc

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
                │  ┌──────────────────┐ (SaaS, ben ngoai)│
                │  │ MongoDB Atlas    │ IP-allowlisted  │
                │  └──────────────────┘                 │
                │                                       │
                │  ┌──────────────────┐                 │
                │  │ Artifact Registry│                 │
                │  └──────────────────┘                 │
                └───────────────────────────────────────┘
```

### Tai nguyen duoc tao

- **Cloud Run v2 service** voi startup/liveness probes, scale-to-zero
- **VPC Access Connector** de ket noi private toi Redis
- **MongoDB Atlas** cluster + database user + IP allowlist (qua Atlas provider)
- **Memorystore Redis** instance trong mang private
- **Artifact Registry** Docker repository
- **Cloud Monitoring** alert policies (latency, 5xx, scaling) + thong bao email
- **GCP APIs** tu dong bat (Run, Artifact Registry, Redis, Monitoring, VPC Access, Compute)

### Cac buoc deploy

```bash
# 1. Copy templates vao project
cp -r templates/terraform/gcp infrastructure/gcp
cd infrastructure/gcp

# 2. Cau hinh bien
cp terraform.tfvars.example terraform.tfvars
# Sua terraform.tfvars: gcp_project_id, atlas_*, alert_email

# 3. Xac thuc
gcloud auth application-default login

# 4. Khoi tao va deploy
terraform init
terraform plan
terraform apply

# 5. Build va push Docker image
REGION=$(terraform output -raw gcp_region)
REPO=$(terraform output -raw artifact_registry_url)
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker build -t "${REPO}/app:latest" .
docker push "${REPO}/app:latest"
# Cloud Run tu dong deploy khi co image moi
```

## Tich hop CLI

Khi tao project moi, dung flag `--iac` de copy Terraform templates vao project:

```bash
npx nestjs-boot new my-app --iac=aws    # AWS ECS Fargate
npx nestjs-boot new my-app --iac=gcp    # GCP Cloud Run
npx nestjs-boot new my-app --iac=both   # Ca hai providers
```

Lenh nay copy templates vao `infrastructure/aws/` va/hoac `infrastructure/gcp/` trong project moi, san sang de cau hinh va deploy.

> **Luu y:** Flag `--iac` duoc len ke hoach cho phien ban CLI tuong lai. Hien tai, hay copy templates thu cong tu `templates/terraform/`.

## Bang tham chieu bien

### Bien chung (ca hai Cloud)

| Bien | Mo ta | Mac dinh | Bat buoc |
|------|-------|----------|----------|
| `project_name` | Tien to dat ten tai nguyen | -- | Co |
| `environment` | `dev` / `staging` / `prod` | `dev` | Khong |
| `app_port` | Port NestJS lang nghe | `3000` | Khong |
| `alert_email` | Email nhan canh bao (rong = khong canh bao) | `""` | Khong |

### Bien AWS

| Bien | Mo ta | Mac dinh |
|------|-------|----------|
| `aws_region` | Vung AWS | `us-east-1` |
| `vpc_cidr` | Khoi CIDR cua VPC | `10.0.0.0/16` |
| `availability_zones` | Cac AZ (toi thieu 2) | `["us-east-1a", "us-east-1b"]` |
| `app_cpu` | Don vi CPU Fargate (256/512/1024/2048/4096) | `256` |
| `app_memory` | Bo nho Fargate tinh bang MiB | `512` |
| `desired_count` | So luong ECS task ban dau | `2` |
| `min_capacity` / `max_capacity` | Gioi han auto-scaling | `1` / `4` |
| `docdb_instance_class` | Loai instance DocumentDB | `db.t3.medium` |
| `docdb_instance_count` | So luong instance DocumentDB | `1` |
| `docdb_master_username` | Ten dang nhap DocumentDB | `docdbadmin` |
| `docdb_master_password` | Mat khau DocumentDB (nhay cam) | -- (bat buoc) |
| `redis_node_type` | Loai node ElastiCache | `cache.t3.micro` |
| `redis_num_cache_nodes` | So luong node Redis | `1` |

### Bien GCP

| Bien | Mo ta | Mac dinh |
|------|-------|----------|
| `gcp_project_id` | ID project GCP | -- (bat buoc) |
| `gcp_region` | Vung GCP | `us-central1` |
| `cloud_run_cpu` | CPU moi instance | `"1"` |
| `cloud_run_memory` | Bo nho moi instance | `"512Mi"` |
| `min_instances` / `max_instances` | Gioi han scaling (0 = scale-to-zero) | `0` / `4` |
| `atlas_public_key` | Atlas API public key | -- (bat buoc) |
| `atlas_private_key` | Atlas API private key (nhay cam) | -- (bat buoc) |
| `atlas_org_id` | ID to chuc Atlas | -- (bat buoc) |
| `atlas_cluster_tier` | Tang Atlas (`M0` = mien phi) | `M0` |
| `atlas_db_password` | Mat khau Atlas DB (nhay cam) | -- (bat buoc) |
| `redis_tier` | `BASIC` hoac `STANDARD_HA` | `BASIC` |
| `redis_memory_size_gb` | Dung luong bo nho Redis (GB) | `1` |

## Bao mat

### Cach ly mang

- **AWS:** ECS tasks, DocumentDB va Redis chay trong **private subnets** khong co public IP. Chi ALB duoc truy cap cong khai. Security groups gioi han ingress cua ECS chi nhan traffic tu ALB tren app port.
- **GCP:** Memorystore Redis chi truy cap duoc qua mang private thong qua VPC Connector (`PRIVATE_RANGES_ONLY` egress). MongoDB Atlas duoc IP-allowlist theo dai IP egress cua Cloud Run.

### Quyen toi thieu (IAM)

- **ECS Execution Role:** Chi pull image tu ECR va ghi log vao CloudWatch.
- **ECS Task Role:** Chi `cloudwatch:PutMetricData` gioi han trong namespace cua project. Mo rong khi can.
- **GCP:** Cloud Run su dung service account compute mac dinh. Quyen invoker cong khai duoc cap cho API endpoint.

### Quan ly bi mat

Mat khau database duoc truyen qua bien Terraform (danh dau `sensitive`). Cho production:

- **AWS:** Thay the bien moi truong bang tham chieu AWS Secrets Manager trong task definition.
- **GCP:** Su dung GCP Secret Manager va tham chieu secrets trong dinh nghia Cloud Run service.
- Khong bao gio commit `terraform.tfvars` vao version control (them vao `.gitignore`).

## Giam sat va canh bao

Dat `alert_email` de bat giam sat. Canh bao duoc gui qua email (SNS cho AWS, notification channel cho GCP).

### AWS CloudWatch

| Canh bao | Dieu kien | Chu ky |
|----------|-----------|--------|
| CPU cao | ECS CPU > 85% trong 2 chu ky | 5 phut |
| Memory cao | ECS memory > 90% trong 2 chu ky | 5 phut |
| ALB 5xx | So loi 5xx > 10 | 5 phut |

Dashboard CloudWatch duoc tao voi cac widget cho ECS CPU/memory, ALB request count/latency, DocumentDB connections/CPU va Redis cache hits/memory.

### GCP Cloud Monitoring

| Canh bao | Dieu kien | Thoi gian |
|----------|-----------|-----------|
| Do tre cao | Cloud Run p95 latency > 2s | 5 phut |
| Ti le loi cao | So loi 5xx > 10 | 5 phut |
| Gan dat max instances | So instance > 80% cua max | 5 phut |

## Uoc tinh chi phi

### AWS

| Tier | ECS | DocumentDB | ElastiCache | ALB | NAT GW | Tong |
|------|-----|------------|-------------|-----|--------|------|
| **Dev** | ~$15 (256 CPU, 512 MiB, 2 tasks) | ~$55 (db.t3.medium) | ~$13 (cache.t3.micro) | ~$18 | ~$32 | **~$133/thang** |
| **Staging** | ~$30 (512 CPU, 1 GiB, 2 tasks) | ~$55 | ~$13 | ~$18 | ~$32 | **~$148/thang** |
| **Prod** | ~$120 (1024 CPU, 2 GiB, 4 tasks) | ~$170 (db.r5.large, 2 instances) | ~$50 (cache.r6g.large) | ~$18 | ~$32 | **~$390/thang** |

### GCP

| Tier | Cloud Run | MongoDB Atlas | Memorystore | Tong |
|------|-----------|---------------|-------------|------|
| **Dev** | ~$0-5 (scale-to-zero) | $0 (M0 mien phi) | ~$35 (1 GB BASIC) | **~$35-40/thang** |
| **Staging** | ~$20 (min 1 instance) | ~$57 (M10) | ~$35 | **~$112/thang** |
| **Prod** | ~$80 (min 2, max 8) | ~$165 (M30) | ~$185 (STANDARD_HA, 5 GB) | **~$430/thang** |

> Chi phi thay doi theo vung va muc su dung. GCP re hon dang ke cho dev/staging nho scale-to-zero va Atlas free tier.

## Tuy chinh

### Them HTTPS

**AWS:** Tao chung chi ACM, them HTTPS listener vao ALB trong `alb.tf`, va redirect HTTP sang HTTPS.

**GCP:** Map custom domain vao Cloud Run va bat chung chi SSL Google-managed.

### Custom Domain

- **AWS:** Tao Route53 hosted zone va ban ghi alias tro den ALB.
- **GCP:** Su dung Cloud Run domain mapping hoac Cloud DNS.

### Dich vu bo sung

Them file `.tf` moi ben canh cac file hien tai. Vi du, them S3 bucket (`s3.tf`) hoac Cloud Storage bucket (`gcs.tf`) cho file uploads, sau do truyen ten bucket qua bien moi truong vao container.

### Ghi de theo moi truong

Dung `terraform.tfvars` rieng cho moi moi truong hoac Terraform workspaces:

```bash
# File tfvars rieng cho moi moi truong
terraform apply -var-file="environments/prod.tfvars"

# Hoac dung workspaces
terraform workspace new prod
terraform workspace select prod
terraform apply
```

## Thuc hanh tot nhat

### Remote State

Ca hai template deu co cau hinh backend duoc comment san. Bat remote state de lam viec nhom:

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

### Workspaces cho cac moi truong

```bash
terraform workspace new staging
terraform workspace new prod
# Moi workspace duy tri state rieng biet
```

### Tich hop CI/CD

Them Terraform vao pipeline:

1. `terraform fmt -check` -- dam bao dinh dang
2. `terraform validate` -- kiem tra cu phap
3. `terraform plan -out=plan.tfplan` -- tao plan tren PRs
4. `terraform apply plan.tfplan` -- apply khi merge vao main

Dung flag `--ci=github` khi tao project de co GitHub Actions workflow bao gom Terraform plan tren pull requests.

### Xoa tai nguyen

```bash
# Xoa tat ca tai nguyen
terraform destroy

# Chi xoa tai nguyen cu the
terraform destroy -target=aws_ecs_service.app
```

> **Canh bao:** `terraform destroy` trong production gay downtime. DocumentDB voi `skip_final_snapshot = false` (prod) tu dong tao final snapshot.
