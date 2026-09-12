# Default variable values.
# Sensitive values (credentials, project_id) go in secrets.tfvars (gitignored).

region            = "europe-west4"
cluster_name      = "video-downloader-cluster"
node_machine_type = "e2-small"
min_node_count    = 1
max_node_count    = 3
container_image   = "video-downloader:latest"
app_replicas      = 2
