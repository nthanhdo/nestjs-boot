# ─── Cloud Run Service ──────────────────────────────────────────────

# VPC connector for private access to Redis
resource "google_vpc_access_connector" "main" {
  name          = "${local.name_prefix}-vpc"
  region        = var.gcp_region
  ip_cidr_range = "10.8.0.0/28"
  network       = "default"

  depends_on = [google_project_service.apis["vpcaccess.googleapis.com"]]
}

resource "google_cloud_run_v2_service" "app" {
  name     = "${local.name_prefix}-app"
  location = var.gcp_region
  labels   = local.labels

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.app.repository_id}/app:latest"

      ports {
        container_port = var.app_port
      }

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = tostring(var.app_port)
      }
      env {
        name  = "MONGODB_URI"
        value = "mongodb+srv://appuser:${var.atlas_db_password}@${replace(mongodbatlas_cluster.main.connection_strings[0].standard_srv, "mongodb+srv://", "")}/${var.project_name}?retryWrites=true&w=majority"
      }
      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.main.host
      }
      env {
        name  = "REDIS_PORT"
        value = tostring(google_redis_instance.main.port)
      }

      startup_probe {
        http_get {
          path = "/health"
          port = var.app_port
        }
        initial_delay_seconds = 10
        period_seconds        = 3
        failure_threshold     = 10
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = var.app_port
        }
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  depends_on = [google_project_service.apis["run.googleapis.com"]]
}

# Allow unauthenticated access (public API)
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
