variable "project_name" {
  description = "Project name used for resource naming and labeling"
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

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

# ── Cloud Run ───────────────────────────────────────────────────────

variable "app_port" {
  description = "Port the NestJS app listens on"
  type        = number
  default     = 3000
}

variable "cloud_run_cpu" {
  description = "CPU allocation per Cloud Run instance (e.g. '1', '2')"
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Memory allocation per Cloud Run instance (e.g. '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "min_instances" {
  description = "Minimum Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 4
}

# ── MongoDB Atlas ───────────────────────────────────────────────────

variable "atlas_public_key" {
  description = "MongoDB Atlas API public key"
  type        = string
}

variable "atlas_private_key" {
  description = "MongoDB Atlas API private key"
  type        = string
  sensitive   = true
}

variable "atlas_org_id" {
  description = "MongoDB Atlas organization ID"
  type        = string
}

variable "atlas_cluster_tier" {
  description = "Atlas cluster tier (M0 = free, M10+ = dedicated)"
  type        = string
  default     = "M0"
}

variable "atlas_db_password" {
  description = "MongoDB Atlas database user password"
  type        = string
  sensitive   = true
}

# ── Memorystore Redis ──────────────────────────────────────────────

variable "redis_tier" {
  description = "Memorystore Redis tier (BASIC or STANDARD_HA)"
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

# ── Monitoring ──────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email for monitoring alert notifications"
  type        = string
  default     = ""
}
