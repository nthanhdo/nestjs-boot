# ─── DocumentDB (MongoDB-compatible) ────────────────────────────────

resource "aws_docdb_subnet_group" "main" {
  name       = "${local.name_prefix}-docdb"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "docdb" {
  name_prefix = "${local.name_prefix}-docdb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 27017
    to_port         = 27017
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

resource "aws_docdb_cluster" "main" {
  cluster_identifier     = "${local.name_prefix}-docdb"
  engine                 = "docdb"
  master_username        = var.docdb_master_username
  master_password        = var.docdb_master_password
  db_subnet_group_name   = aws_docdb_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.docdb.id]

  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${local.name_prefix}-docdb-final" : null

  backup_retention_period = var.environment == "prod" ? 7 : 1
}

resource "aws_docdb_cluster_instance" "main" {
  count              = var.docdb_instance_count
  identifier         = "${local.name_prefix}-docdb-${count.index}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.docdb_instance_class
}
