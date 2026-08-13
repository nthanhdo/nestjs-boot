variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# ── Networking ──────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AZs to use (minimum 2)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── ECS / App ───────────────────────────────────────────────────────

variable "app_port" {
  description = "Port the NestJS app listens on"
  type        = number
  default     = 3000
}

variable "app_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "app_memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of tasks for auto-scaling"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks for auto-scaling"
  type        = number
  default     = 4
}

# ── DocumentDB (MongoDB-compatible) ────────────────────────────────

variable "docdb_instance_class" {
  description = "DocumentDB instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "docdb_instance_count" {
  description = "Number of DocumentDB instances"
  type        = number
  default     = 1
}

variable "docdb_master_username" {
  description = "DocumentDB master username"
  type        = string
  default     = "docdbadmin"
}

variable "docdb_master_password" {
  description = "DocumentDB master password"
  type        = string
  sensitive   = true
}

# ── ElastiCache Redis ──────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 1
}

# ── Monitoring ──────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = ""
}
