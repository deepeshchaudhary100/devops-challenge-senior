# SimpleTimeService — DevOps Challenge

A minimal microservice that returns the current UTC timestamp and the visitor's IP address as JSON. Deployed on **Google Cloud Platform (GCP)** using **GKE (Google Kubernetes Engine)** with **Terraform** for infrastructure-as-code.

## Response Format

```json
{
  "timestamp": "2026-08-26T00:12:34Z",
  "ip": "203.0.113.42"
}
```

## Architecture

```
                        ┌──────────────────────────────────────┐
                        │     GCP Project (asia-south1)        │
                        │                                      │
  Internet ──▶ [ Load Balancer (public subnets) ]              │
                        │         │                            │
                        │    [ Cloud NAT ]                     │
                        │         │                            │
                        │   ┌─────┴──────┐                     │
                        │   │ GKE Cluster │ (private)          │
                        │   │ ┌────────┐ │                     │
                        │   │ │  Pods  │ │ ← private           │
                        │   │ │ (x2)   │ │   subnets only      │
                        │   │ └────────┘ │                     │
                        │   └────────────┘                     │
                        │                                      │
                        │   [ GCS Bucket ] ← Terraform state   │
                        └──────────────────────────────────────┘
```

**Key Infrastructure:**
- **VPC** with 2 public and 2 private subnets
- **GKE private cluster** — nodes in private subnets only (no public IPs)
- **Cloud NAT** — outbound internet for private nodes (image pulls)
- **LoadBalancer Service** — exposes the app on port 80
- **GCS remote backend** — Terraform state with versioning (extra credit)
- **GitHub Actions CI/CD** — automated build, push, and deploy (extra credit)

## Repository Structure

```
.
├── app/                                # Application source code
│   ├── app.py                          # Flask web server
│   ├── Dockerfile                      # Container image (non-root, Alpine)
│   ├── requirements.txt                # Python dependencies
│   ├── deployment.yaml                 # K8s manifest (reference only)
│   └── service.yaml                    # K8s manifest (reference only)
├── terraform/                          # Infrastructure-as-Code
│   ├── main.tf                         # Provider config + API enablement
│   ├── vpc.tf                          # VPC, subnets, NAT, firewall rules
│   ├── gke.tf                          # GKE cluster + node pool
│   ├── app.tf                          # K8s deployment + service
│   ├── variables.tf                    # Input variables
│   ├── outputs.tf                      # Output values
│   ├── terraform.tfvars                # Default variable values
│   ├── versions.tf                     # Provider version constraints
│   ├── backend.tf                      # GCS remote state backend
│   ├── secrets.tfvars                  # Sensitive values (GITIGNORED)
│   ├── secrets.tfvars.example          # Template for secrets
│   └── backend-setup/                  # Bootstrap GCS bucket for state
│       └── main.tf
├── .github/
│   └── workflows/
│       └── ci-cd.yml                   # GitHub Actions CI/CD pipeline
├── .gitignore
└── README.md                           # This file
```

---

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| [Docker](https://docs.docker.com/get-docker/) | Build & run container images | [Install Docker](https://docs.docker.com/get-docker/) |
| [Terraform](https://developer.hashicorp.com/terraform/downloads) (>= 1.5) | Infrastructure provisioning | [Install Terraform](https://developer.hashicorp.com/terraform/downloads) |
| [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install) | GCP authentication & CLI | [Install gcloud](https://cloud.google.com/sdk/docs/install) |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Kubernetes cluster interaction | [Install kubectl](https://kubernetes.io/docs/tasks/tools/) |
| A **GCP Project** with billing enabled | Required to create resources | [Create a project](https://console.cloud.google.com/projectcreate) |

---

## Credentials & Secrets Management

> **⚠️ IMPORTANT: No credentials are stored in this repository.**

All sensitive values are managed through one of these mechanisms:

| Secret | Where to Store | Used By |
|---|---|---|
| GCP credentials | `gcloud auth application-default login` | Local Terraform |
| Docker Hub password | GitHub Secrets (`DOCKERHUB_TOKEN`) | CI/CD pipeline |
| Docker Hub username | GitHub Secrets (`DOCKERHUB_USERNAME`) | CI/CD pipeline |
| GCP service account key | GitHub Secrets (`GCP_SA_KEY`) | CI/CD pipeline |
| GCP project ID | GitHub Secrets (`GCP_PROJECT_ID`) | CI/CD pipeline |

For local development, copy the secrets template:

```bash
cd terraform
cp secrets.tfvars.example secrets.tfvars
# Edit secrets.tfvars with your values (this file is gitignored)
```

---

## Task 1 — Build & Run the Container

### Build the Docker Image

```bash
cd app
docker build -t simpletimeservice:latest .
```

### Run Locally

```bash
docker run -p 8080:8080 simpletimeservice:latest
```

### Test

```bash
curl http://localhost:8080/
# {"timestamp": "2026-08-26T00:12:34Z", "ip": "172.17.0.1"}

curl http://localhost:8080/health
# {"status": "healthy"}
```

### Publish to DockerHub

```bash
docker login -u <your-dockerhub-username>
docker tag simpletimeservice:latest <your-dockerhub-username>/simpletimeservice:latest
docker push <your-dockerhub-username>/simpletimeservice:latest
```

---

## Task 2 — Deploy Infrastructure with Terraform

### Step 1: Authenticate with GCP

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project project-52f6c9e3-3da1-4320-9fa

# Set up Application Default Credentials (required by Terraform)
gcloud auth application-default login
```

### Step 2: Bootstrap Remote State Backend (one-time)

```bash
cd terraform/backend-setup

terraform init
terraform apply
```

This creates a GCS bucket (`simpletimeservice-tfstate-project-52f6c9e3`) with versioning enabled for Terraform state storage.

### Step 3: Initialize & Deploy

```bash
cd terraform

# Initialize Terraform with remote backend
terraform init

# Preview the infrastructure changes
terraform plan

# Apply — creates all resources
terraform apply
```

> **Note:** The GKE cluster takes approximately 8–10 minutes to provision.

### Step 4: Verify Deployment

After `terraform apply` completes, it will output the **Load Balancer IP**:

```bash
# Get the load balancer IP
terraform output load_balancer_ip

# Test the service (may take 1-2 minutes for LB to become ready)
curl http://$(terraform output -raw load_balancer_ip)/
```

Expected response:

```json
{
  "timestamp": "2026-08-26T00:12:34Z",
  "ip": "203.0.113.42"
}
```

### Step 5: (Optional) Connect via kubectl

```bash
# Configure kubectl
gcloud container clusters get-credentials simpletimeservice-cluster \
    --region asia-south1 \
    --project project-52f6c9e3-3da1-4320-9fa

# Check pods
kubectl get pods

# Check services
kubectl get svc
```

---

## Extra Credit: CI/CD Pipeline (GitHub Actions)

The CI/CD pipeline (`.github/workflows/ci-cd.yml`) automatically:

1. **Builds** the Docker image
2. **Verifies** the container runs as non-root
3. **Pushes** to Docker Hub (tagged with git SHA + `latest`)
4. **Deploys** via Terraform (apply on `main`, plan-only on PRs)

### Setup GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret Name | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token ([create here](https://hub.docker.com/settings/security)) |
| `GCP_SA_KEY` | Base64-encoded service account key JSON (see below) |
| `GCP_PROJECT_ID` | Your GCP project ID |

### Create GCP Service Account for CI/CD

```bash
# Create service account
gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions CI/CD" \
    --project=project-52f6c9e3-3da1-4320-9fa

# Grant required roles
SA_EMAIL="github-actions@project-52f6c9e3-3da1-4320-9fa.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding project-52f6c9e3-3da1-4320-9fa \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/container.admin"

gcloud projects add-iam-policy-binding project-52f6c9e3-3da1-4320-9fa \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/compute.admin"

gcloud projects add-iam-policy-binding project-52f6c9e3-3da1-4320-9fa \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding project-52f6c9e3-3da1-4320-9fa \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/iam.serviceAccountUser"

# Create and download key (use the JSON content as GCP_SA_KEY secret)
gcloud iam service-accounts keys create sa-key.json \
    --iam-account="${SA_EMAIL}"

# IMPORTANT: Add the contents of sa-key.json as the GCP_SA_KEY GitHub Secret,
# then DELETE the local file:
# rm sa-key.json
```

### Extra Credit: Remote State Backend

Terraform state is stored in a **GCS bucket** with:
- **Versioning** enabled — full history of state changes
- **Lifecycle rules** — old versions cleaned up after 5 newer versions
- **Uniform access** — consistent bucket-level IAM security

---

## Cleanup

**⚠️ IMPORTANT: To avoid ongoing charges, destroy all resources when done:**

```bash
# Destroy the application infrastructure
cd terraform
terraform destroy

# (Optional) Destroy the state bucket
cd backend-setup
terraform destroy
```

Type `yes` when prompted. This removes all GCP resources created by Terraform.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **GKE (vs Cloud Run / GCE)** | Matches challenge requirement for container orchestration (EKS/ECS equivalent) |
| **Private cluster** | Nodes in private subnets only — matches challenge security requirements |
| **Cloud NAT** | Allows private nodes to pull container images without public IPs |
| **Spot VMs** | Reduces cost during development/testing |
| **Terraform K8s provider** | Deploys app alongside infra — single `terraform apply` does everything |
| **Alpine-based image** | Minimal footprint (~50MB), reduced attack surface |
| **Non-root user** | Security best practice, explicitly required by the challenge |
| **Health endpoints** | Enables GKE liveness/readiness probes for self-healing |
| **GCS remote backend** | Production-grade state management with versioning and locking |
| **GitHub Actions** | Automated CI/CD — build, test, and deploy on every push to main |
| **asia-south1** | Region closest to the user for lower latency |

---

## Security Notes

- **No credentials in this repository.** Authentication is handled via `gcloud auth` (local) or GitHub Secrets (CI/CD).
- The container runs as a **non-root user** (`appuser`, UID 1000).
- GKE nodes have **no public IP addresses** — all traffic routes through Cloud NAT.
- Workload Identity is enabled for secure pod-to-GCP-service authentication.
- `secrets.tfvars` is gitignored — sensitive values never enter version control.
- Docker Hub uses **access tokens** (not passwords) for CI/CD authentication.