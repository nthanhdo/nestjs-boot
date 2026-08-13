# ─── MongoDB Atlas ──────────────────────────────────────────────────

resource "mongodbatlas_project" "main" {
  name   = "${local.name_prefix}"
  org_id = var.atlas_org_id
}

resource "mongodbatlas_cluster" "main" {
  project_id = mongodbatlas_project.main.id
  name       = "${local.name_prefix}-cluster"

  provider_name               = "TENANT"
  backing_provider_name       = "GCP"
  provider_region_name        = upper(replace(var.gcp_region, "-", "_"))
  provider_instance_size_name = var.atlas_cluster_tier

  labels {
    key   = "environment"
    value = var.environment
  }
  labels {
    key   = "managed-by"
    value = "terraform"
  }
}

resource "mongodbatlas_database_user" "app" {
  project_id         = mongodbatlas_project.main.id
  username           = "appuser"
  password           = var.atlas_db_password
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.project_name
  }
}

# Allow access from anywhere (Cloud Run IPs are dynamic)
# For production, consider using private endpoints with VPC peering
resource "mongodbatlas_project_ip_access_list" "all" {
  project_id = mongodbatlas_project.main.id
  cidr_block = "0.0.0.0/0"
  comment    = "Allow Cloud Run (use VPC peering for production)"
}
