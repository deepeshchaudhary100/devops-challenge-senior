# Default variable values.
# Sensitive values (credentials) go in secrets.tfvars (gitignored).

project_id        = "project-52f6c9e3-3da1-4320-9fa"
region            = "asia-south1"
cluster_name      = "simpletimeservice-cluster"
node_machine_type = "e2-small"
min_node_count    = 1
max_node_count    = 3
container_image   = "docker.io/deepesh434/simpletimeservice:latest"
app_replicas      = 2
