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
  description = "Docker image for the SimpleTimeService application."
  type        = string
  default     = "docker.io/deepesh434/simpletimeservice:latest"
}

variable "app_replicas" {
  description = "Number of application pod replicas."
  type        = number
  default     = 2
}
