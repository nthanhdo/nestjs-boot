# ─── Artifact Registry ──────────────────────────────────────────────

resource "google_artifact_registry_repository" "app" {
  location      = var.gcp_region
  repository_id = "${local.name_prefix}-repo"
  format        = "DOCKER"
  labels        = local.labels

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }

  depends_on = [google_project_service.apis["artifactregistry.googleapis.com"]]
}
