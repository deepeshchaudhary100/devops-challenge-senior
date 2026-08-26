# -----------------------------------------------------------------------------
# Remote Backend — GCS (Google Cloud Storage)
# -----------------------------------------------------------------------------
# Before using this backend, you must create the GCS bucket first.
# Run the bootstrap setup in backend-setup/ directory:
#   cd backend-setup && terraform init && terraform apply
#
# Then initialize this backend:
#   terraform init -backend-config="bucket=simpletimeservice-tfstate-project-52f6c9e3"
# -----------------------------------------------------------------------------

terraform {
  backend "gcs" {
    bucket = "simpletimeservice-tfstate-project-52f6c9e3"
    prefix = "terraform/state"
  }
}
