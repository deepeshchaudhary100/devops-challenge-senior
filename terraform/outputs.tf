# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "load_balancer_ip" {
  description = "Public IP address of the SimpleTimeService load balancer."
  value       = kubernetes_service.simpletimeservice.status[0].load_balancer[0].ingress[0].ip
}

output "cluster_name" {
  description = "Name of the GKE cluster."
  value       = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  description = "Endpoint of the GKE cluster API server."
  value       = google_container_cluster.primary.endpoint
  sensitive   = true
}

output "cluster_location" {
  description = "Location (region) of the GKE cluster."
  value       = google_container_cluster.primary.location
}

output "vpc_name" {
  description = "Name of the VPC network."
  value       = google_compute_network.vpc.name
}

output "kubectl_connect_command" {
  description = "Command to configure kubectl for this cluster."
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${google_container_cluster.primary.location} --project ${var.project_id}"
}
