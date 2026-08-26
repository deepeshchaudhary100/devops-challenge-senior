# Default variable values.
# Sensitive values (credentials, project_id) go in secrets.tfvars (gitignored).

region            = "asia-south1"
cluster_name      = "simpletimeservice-cluster"
node_machine_type = "e2-small"
min_node_count    = 1
max_node_count    = 3
container_image   = "simpletimeservice:latest"
app_replicas      = 2
