# =============================================================================
# Backend Bootstrap — Creates the GCS bucket for Terraform remote state
# =============================================================================
# Run this ONCE before initializing the main Terraform configuration:
#
#   cd terraform/backend-setup
#   terraform init
#   terraform apply
#
# This creates:
#   - A GCS bucket with versioning for state file history
#   - Uniform bucket-level access for security
#   - Lifecycle rule to clean up old state versions after 30 days
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
variable "project_id" {
  description = "GCP project ID."
  type        = string
  default     = "project-52f6c9e3-3da1-4320-9fa"
}

variable "region" {
  description = "GCP region for the state bucket."
  type        = string
  default     = "asia-south1"
}

variable "bucket_name" {
  description = "Name of the GCS bucket for Terraform state."
  type        = string
  default     = "simpletimeservice-tfstate-project-52f6c9e3"
}

# -----------------------------------------------------------------------------
# GCS Bucket for Terraform State
# -----------------------------------------------------------------------------
resource "google_storage_bucket" "tfstate" {
  name     = var.bucket_name
  location = var.region
  project  = var.project_id

  # Prevent accidental deletion of the state bucket
  force_destroy = false

  # Enable versioning for state file history and rollback
  versioning {
    enabled = true
  }

  # Uniform bucket-level access (recommended for security)
  uniform_bucket_level_access = true

  # Clean up old state versions after 30 days to manage storage costs
  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    purpose = "terraform-state"
    project = "simpletimeservice"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "bucket_name" {
  description = "Name of the GCS bucket for Terraform state."
  value       = google_storage_bucket.tfstate.name
}

output "bucket_url" {
  description = "URL of the GCS bucket."
  value       = google_storage_bucket.tfstate.url
}
