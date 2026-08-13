# ─── CloudWatch Dashboard + Alarms ──────────────────────────────────

resource "aws_sns_topic" "alerts" {
  count = var.alert_email != "" ? 1 : 0
  name  = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# High CPU alarm
resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count               = var.alert_email != "" ? 1 : 0
  alarm_name          = "${local.name_prefix}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS CPU utilization > 85%"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}

# High memory alarm
resource "aws_cloudwatch_metric_alarm" "memory_high" {
  count               = var.alert_email != "" ? 1 : 0
  alarm_name          = "${local.name_prefix}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 90
  alarm_description   = "ECS memory utilization > 90%"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }
}

# ALB 5xx alarm
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count               = var.alert_email != "" ? 1 : 0
  alarm_name          = "${local.name_prefix}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "ALB target 5xx errors > 10 in 5 min"
  alarm_actions       = [aws_sns_topic.alerts[0].arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.app.arn_suffix
  }
}

# Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ECS CPU & Memory"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.app.name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.app.name],
          ]
          period = 300
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ALB Request Count & Latency"
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix],
          ]
          period = 300
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "DocumentDB Connections & CPU"
          metrics = [
            ["AWS/DocDB", "DatabaseConnections", "DBClusterIdentifier", aws_docdb_cluster.main.cluster_identifier],
            ["AWS/DocDB", "CPUUtilization", "DBClusterIdentifier", aws_docdb_cluster.main.cluster_identifier],
          ]
          period = 300
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Redis Cache Hits & Memory"
          metrics = [
            ["AWS/ElastiCache", "CacheHits", "CacheClusterId", aws_elasticache_cluster.redis.cluster_id],
            ["AWS/ElastiCache", "BytesUsedForCache", "CacheClusterId", aws_elasticache_cluster.redis.cluster_id],
          ]
          period = 300
          region = var.aws_region
        }
      },
    ]
  })
}
