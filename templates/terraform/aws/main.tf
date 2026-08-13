# ─── NestJS-Boot AWS Infrastructure (ECS Fargate) ───────────────────
# Terraform >= 1.5 required
# Uncomment the backend block below to use S3 for remote state.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # backend "s3" {
  #   bucket         = "my-terraform-state"
  #   key            = "nestjs-boot/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      project     = var.project_name
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}
