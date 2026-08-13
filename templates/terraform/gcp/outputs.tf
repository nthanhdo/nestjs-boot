output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL for pushing Docker images"
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "database_endpoint" {
  description = "MongoDB Atlas connection string"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = true
}

output "redis_endpoint" {
  description = "Memorystore Redis endpoint"
  value       = "${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}

output "monitoring_dashboard_url" {
  description = "Cloud Monitoring dashboard URL"
  value       = "https://console.cloud.google.com/monitoring/dashboards?project=${var.gcp_project_id}"
}
