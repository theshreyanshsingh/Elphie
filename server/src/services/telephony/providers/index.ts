import { registerProvider } from "../registry.js";

let registered = false;

const field = (
  name: string,
  label: string,
  options: {
    type?: "text" | "password" | "textarea" | "string-array" | "number";
    required?: boolean;
    sensitive?: boolean;
    description?: string;
    placeholder?: string;
  } = {}
) => ({
  name,
  label,
  type: options.type ?? "text",
  required: options.required ?? true,
  sensitive: options.sensitive ?? false,
  description: options.description,
  placeholder: options.placeholder
});

export const registerTelephonyProviders = (): void => {
  if (registered) {
    return;
  }
  registered = true;

  registerProvider({
    name: "ari",
    transportSampleRate: 16000,
    accountIdCredentialField: "",
    uiMetadata: {
      displayName: "ARI",
      fields: [
        field("ari_endpoint", "ARI Endpoint", {
          placeholder: "https://pbx.example.com:8088"
        }),
        field("app_name", "Application Name"),
        field("app_password", "Application Password", {
          type: "password",
          sensitive: true
        })
      ]
    }
  });

  registerProvider({
    name: "cloudonix",
    transportSampleRate: 8000,
    accountIdCredentialField: "application_name",
    uiMetadata: {
      displayName: "Cloudonix",
      fields: [
        field("bearer_token", "Bearer Token", {
          type: "password",
          sensitive: true
        }),
        field("domain_id", "Domain ID", {
          placeholder: "example.cloudonix.net"
        }),
        field("application_name", "Application Name", { required: false })
      ]
    }
  });

  registerProvider({
    name: "plivo",
    transportSampleRate: 8000,
    accountIdCredentialField: "auth_id",
    uiMetadata: {
      displayName: "Plivo",
      fields: [
        field("auth_id", "Auth ID"),
        field("auth_token", "Auth Token", {
          type: "password",
          sensitive: true
        }),
        field("application_id", "Application ID", { required: false })
      ]
    }
  });

  registerProvider({
    name: "telnyx",
    transportSampleRate: 8000,
    accountIdCredentialField: "connection_id",
    uiMetadata: {
      displayName: "Telnyx",
      fields: [
        field("api_key", "API Key", {
          type: "password",
          sensitive: true
        }),
        field("connection_id", "Connection ID"),
        field("webhook_public_key", "Webhook Public Key", {
          type: "textarea",
          sensitive: true,
          description: "Base64 Ed25519 public key used to verify Telnyx webhooks."
        })
      ]
    }
  });

  registerProvider({
    name: "twilio",
    transportSampleRate: 8000,
    accountIdCredentialField: "account_sid",
    uiMetadata: {
      displayName: "Twilio",
      fields: [
        field("account_sid", "Account SID"),
        field("auth_token", "Auth Token", {
          type: "password",
          sensitive: true
        })
      ]
    }
  });

  registerProvider({
    name: "vobiz",
    transportSampleRate: 8000,
    accountIdCredentialField: "auth_id",
    uiMetadata: {
      displayName: "Vobiz",
      fields: [
        field("auth_id", "Auth ID"),
        field("auth_token", "Auth Token", {
          type: "password",
          sensitive: true
        }),
        field("application_id", "Application ID", { required: false })
      ]
    }
  });

  registerProvider({
    name: "vonage",
    transportSampleRate: 16000,
    accountIdCredentialField: "application_id",
    uiMetadata: {
      displayName: "Vonage",
      fields: [
        field("application_id", "Application ID"),
        field("private_key", "Private Key", {
          type: "textarea",
          sensitive: true,
          placeholder: "-----BEGIN PRIVATE KEY-----"
        })
      ]
    }
  });
};
