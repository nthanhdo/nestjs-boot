# ─── NestJS-Boot GCP Infrastructure (Cloud Run) ─────────────────────
# Terraform >= 1.5 required
# Uncomment the backend block below to use GCS for remote state.

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.12"
    }
  }

  # backend "gcs" {
  #   bucket = "my-terraform-state"
  #   prefix = "nestjs-boot/terraform.tfstate"
  # }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "mongodbatlas" {
  public_key  = var.atlas_public_key
  private_key = var.atlas_private_key
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  labels = {
    project     = var.project_name
    environment = var.environment
    managed-by  = "terraform"
  }
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "redis.googleapis.com",
    "monitoring.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}
