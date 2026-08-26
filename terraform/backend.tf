# -----------------------------------------------------------------------------
# Remote Backend — GCS (Google Cloud Storage)
# -----------------------------------------------------------------------------
# Before using this backend, you must create the GCS bucket first.
# Run the bootstrap setup in backend-setup/ directory:
#   cd backend-setup && terraform init && terraform apply
#
# Then initialize this backend with your bucket name:
#   terraform init -backend-config="bucket=<your-bucket-name>"
# -----------------------------------------------------------------------------

terraform {
  backend "gcs" {
    # Bucket name is provided via:
    #   terraform init -backend-config="bucket=<your-bucket-name>"
    prefix = "terraform/state"
  }
}
