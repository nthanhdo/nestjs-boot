# ─── Memorystore Redis ──────────────────────────────────────────────

resource "google_redis_instance" "main" {
  name           = "${local.name_prefix}-redis"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  region         = var.gcp_region
  redis_version  = "REDIS_7_0"

  labels = local.labels

  depends_on = [google_project_service.apis["redis.googleapis.com"]]
}
