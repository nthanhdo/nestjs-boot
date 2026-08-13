# ─── ElastiCache Redis ──────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = "default.redis7"

  snapshot_retention_limit = var.environment == "prod" ? 3 : 0
}
