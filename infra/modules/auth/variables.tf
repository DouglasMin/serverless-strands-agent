variable "name_prefix" {
  type = string
}

variable "google_client_id" {
  description = "OAuth 2.0 Client ID from Google Cloud Console (Web application type), used by Cognito as a federated IdP. Distinct from the AgentCore Identity google-calendar-provider credentials."
  type        = string
}

variable "google_client_secret" {
  description = "OAuth 2.0 Client secret paired with google_client_id."
  type        = string
  sensitive   = true
}

variable "callback_urls" {
  description = "Exact URLs Cognito may redirect to after sign-in. Must match the redirect_uri the SPA sends, character for character."
  type        = list(string)
}

variable "logout_urls" {
  description = "Exact URLs Cognito may redirect to after sign-out."
  type        = list(string)
}

variable "domain_prefix" {
  description = "Hosted UI subdomain prefix — becomes https://<prefix>.auth.<region>.amazoncognito.com. Must be globally unique."
  type        = string
}
