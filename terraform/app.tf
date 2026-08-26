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
# Kubernetes Deployment — SimpleTimeService
# -----------------------------------------------------------------------------
resource "kubernetes_deployment" "simpletimeservice" {
  metadata {
    name = "simpletimeservice"
    labels = {
      app = "simpletimeservice"
    }
  }

  spec {
    replicas = var.app_replicas

    selector {
      match_labels = {
        app = "simpletimeservice"
      }
    }

    template {
      metadata {
        labels = {
          app = "simpletimeservice"
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
          name  = "simpletimeservice"
          image = "docker.io/${var.dockerhub_username}/${var.container_image}"

          port {
            container_port = 8080
            protocol       = "TCP"
          }

          # Resource requests and limits
          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              cpu    = "200m"
              memory = "128Mi"
            }
          }

          # Liveness probe — restarts container if unhealthy
          liveness_probe {
            http_get {
              path = "/health"
              port = 8080
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
              port = 8080
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

  depends_on = [google_container_node_pool.primary_nodes, kubernetes_secret.dockerhub]
}

# -----------------------------------------------------------------------------
# Kubernetes Service — LoadBalancer (public access)
# -----------------------------------------------------------------------------
resource "kubernetes_service" "simpletimeservice" {
  metadata {
    name = "simpletimeservice"
    labels = {
      app = "simpletimeservice"
    }
  }

  spec {
    type = "LoadBalancer"

    selector = {
      app = "simpletimeservice"
    }

    port {
      port        = 80
      target_port = 8080
      protocol    = "TCP"
    }
  }

  depends_on = [kubernetes_deployment.simpletimeservice]
}
