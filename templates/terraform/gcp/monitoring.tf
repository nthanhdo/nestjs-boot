# ─── Cloud Monitoring + Alerting ────────────────────────────────────

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "${local.name_prefix} alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# Cloud Run latency alert (p95 > 2s)
resource "google_monitoring_alert_policy" "latency" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "${local.name_prefix} — High latency"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run p95 latency > 2s"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.name_prefix}-app\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_NONE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

# Cloud Run 5xx alert
resource "google_monitoring_alert_policy" "errors" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "${local.name_prefix} — High error rate"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx count > 10 in 5min"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.name_prefix}-app\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 10

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}

# Cloud Run instance count alert
resource "google_monitoring_alert_policy" "scaling" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "${local.name_prefix} — Near max instances"
  combiner     = "OR"

  conditions {
    display_name = "Instance count near maximum"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${local.name_prefix}-app\" AND metric.type = \"run.googleapis.com/container/instance_count\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = var.max_instances * 0.8

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
}
