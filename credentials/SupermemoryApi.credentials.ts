import { type IAuthenticateGeneric, type Icon, type ICredentialTestRequest, type ICredentialType, type INodeProperties } from "n8n-workflow";

// Generated with ts-morph
export class SupermemoryApi implements ICredentialType {
  name = "supermemoryApi";
  displayName = "Supermemory API";
  documentationUrl = "https://nativeship.io/nodes/@nativeship/n8n-nodes-supermemory";
  icon: Icon = {
        light: "file:../nodes/Supermemory/supermemory.svg",
        dark: "file:../nodes/Supermemory/supermemory.dark.svg"
    };
  properties: INodeProperties[] = [
        {
            displayName: "Access Token",
            name: "secret",
            type: "string",
            typeOptions: {
                password: true
            },
            default: "",
            required: true
        }
    ];
  authenticate: IAuthenticateGeneric = {
        type: "generic",
        properties: {
            headers: {
                Authorization: "=Bearer {{$credentials.secret}}"
            }
        }
    };
  test: ICredentialTestRequest = {
        request: {
            baseURL: "https://api.supermemory.ai",
            url: "/v3/container-tags/list"
        }
    };
}
