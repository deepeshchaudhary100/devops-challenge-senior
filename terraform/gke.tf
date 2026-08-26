# -----------------------------------------------------------------------------
# GKE Cluster (Private)
# -----------------------------------------------------------------------------
resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.region

  # Use the private subnet for the cluster
  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.private_1.id

  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Private cluster configuration — nodes have no public IPs
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # We manage the node pool separately
  remove_default_node_pool = true
  initial_node_count       = 1

  # Release channel for automatic upgrades
  release_channel {
    channel = "REGULAR"
  }

  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Deletion protection — set to false for easy cleanup during challenge
  deletion_protection = false

  depends_on = [
    google_project_service.container,
    google_compute_subnetwork.private_1,
  ]
}

# -----------------------------------------------------------------------------
# GKE Node Pool
# -----------------------------------------------------------------------------
resource "google_container_node_pool" "primary_nodes" {
  name     = "${var.cluster_name}-node-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name

  # Autoscaling configuration
  autoscaling {
    min_node_count = var.min_node_count
    max_node_count = var.max_node_count
  }

  node_config {
    machine_type = var.node_machine_type
    disk_size_gb = 30
    disk_type    = "pd-standard"

    # Use spot VMs to reduce costs during the challenge
    spot = true

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]

    tags = ["gke-node", var.cluster_name]

    labels = {
      env     = "challenge"
      cluster = var.cluster_name
    }

    # Workload Identity
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}
