# -----------------------------------------------------------------------------
# Kubernetes Provider (authenticated via GKE cluster)
# -----------------------------------------------------------------------------
data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${google_container_cluster.primary.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(google_container_cluster.primary.master_auth[0].cluster_ca_certificate)
}

# -----------------------------------------------------------------------------
# Kubernetes Secret — Docker Hub Registry Credentials
# -----------------------------------------------------------------------------
resource "kubernetes_secret" "dockerhub" {
  metadata {
    name = "dockerhub-credentials"
  }

  type = "kubernetes.io/dockerconfigjson"

  data = {
    ".dockerconfigjson" = jsonencode({
      auths = {
        "https://index.docker.io/v1/" = {
          username = var.dockerhub_username
          password = var.dockerhub_password
          auth     = base64encode("${var.dockerhub_username}:${var.dockerhub_password}")
        }
      }
    })
  }

  depends_on = [google_container_node_pool.primary_nodes]
}

# -----------------------------------------------------------------------------
# Kubernetes Deployment — video-downloader
# -----------------------------------------------------------------------------
resource "kubernetes_deployment" "video-downloader" {
  metadata {
    name = "video-downloader"
    labels = {
      app = "video-downloader"
    }
  }

  spec {
    replicas = var.app_replicas

    selector {
      match_labels = {
        app = "video-downloader"
      }
    }

    template {
      metadata {
        labels = {
          app = "video-downloader"
        }
      }

      spec {
        # Use Docker Hub credentials to pull the image
        image_pull_secrets {
          name = kubernetes_secret.dockerhub.metadata[0].name
        }

        # Run as non-root user (matches Dockerfile USER appuser)
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "video-downloader"
          image             = "docker.io/${var.dockerhub_username}/${var.container_image}"
          image_pull_policy = "Always"

          port {
            container_port = 3000
            protocol       = "TCP"
          }

          # Resource requests and limits
          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          # Liveness probe — restarts container if unhealthy
          liveness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 15
            timeout_seconds       = 3
            failure_threshold     = 3
          }

          # Readiness probe — removes from service if not ready
          readiness_probe {
            http_get {
              path = "/health"
              port = 3000
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 3
          }
        }
      }
    }
  }

  wait_for_rollout = true

  timeouts {
    create = "15m"
    update = "15m"
  }

  depends_on = [google_container_node_pool.primary_nodes, kubernetes_secret.dockerhub]
}

# -----------------------------------------------------------------------------
# Kubernetes Service — LoadBalancer (public access)
# -----------------------------------------------------------------------------
resource "kubernetes_service" "video-downloader" {
  metadata {
    name = "video-downloader"
    labels = {
      app = "video-downloader"
    }
  }

  spec {
    type                    = "LoadBalancer"
    external_traffic_policy = "Local"

    selector = {
      app = "video-downloader"
    }

    port {
      port        = 80
      target_port = 3000
      protocol    = "TCP"
    }
  }

  # Wait for the LoadBalancer IP to be allocated before Terraform completes
  wait_for_load_balancer = true

  depends_on = [kubernetes_deployment.video-downloader]
}

