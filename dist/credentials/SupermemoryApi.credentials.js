"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupermemoryApi = void 0;
class SupermemoryApi {
    constructor() {
        this.name = "supermemoryApi";
        this.displayName = "Supermemory API";
        this.documentationUrl = "https://nativeship.io/nodes/@nativeship/n8n-nodes-supermemory";
        this.icon = {
            light: "file:../nodes/Supermemory/supermemory.svg",
            dark: "file:../nodes/Supermemory/supermemory.dark.svg"
        };
        this.properties = [
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
        this.authenticate = {
            type: "generic",
            properties: {
                headers: {
                    Authorization: "=Bearer {{$credentials.secret}}"
                }
            }
        };
        this.test = {
            request: {
                baseURL: "https://api.supermemory.ai",
                url: "/v3/container-tags/list"
            }
        };
    }
}
exports.SupermemoryApi = SupermemoryApi;
//# sourceMappingURL=SupermemoryApi.credentials.js.map