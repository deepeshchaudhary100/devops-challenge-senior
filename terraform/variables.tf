# -----------------------------------------------------------------------------
# Project & Region
# -----------------------------------------------------------------------------
variable "project_id" {
  description = "The GCP project ID to deploy resources into."
  type        = string
}

variable "region" {
  description = "The GCP region for resource deployment."
  type        = string
  default     = "asia-south1"
}

# -----------------------------------------------------------------------------
# GKE Cluster
# -----------------------------------------------------------------------------
variable "cluster_name" {
  description = "Name of the GKE cluster."
  type        = string
  default     = "simpletimeservice-cluster"
}

variable "node_machine_type" {
  description = "Machine type for GKE nodes."
  type        = string
  default     = "e2-small"
}

variable "min_node_count" {
  description = "Minimum number of nodes per zone in the node pool."
  type        = number
  default     = 1
}

variable "max_node_count" {
  description = "Maximum number of nodes per zone in the node pool."
  type        = number
  default     = 3
}

# -----------------------------------------------------------------------------
# Application
# -----------------------------------------------------------------------------
variable "container_image" {
  description = "Docker image name (without the username prefix). The full image path is built as: docker.io/<dockerhub_username>/<container_image>."
  type        = string
  default     = "simpletimeservice:latest"
}

variable "app_replicas" {
  description = "Number of application pod replicas."
  type        = number
  default     = 2
}

# -----------------------------------------------------------------------------
# Docker Hub Credentials (sensitive — stored in secrets.tfvars)
# -----------------------------------------------------------------------------
variable "dockerhub_username" {
  description = "Docker Hub username for pulling container images."
  type        = string
  sensitive   = true
}

variable "dockerhub_password" {
  description = "Docker Hub password or access token."
  type        = string
  sensitive   = true
}
