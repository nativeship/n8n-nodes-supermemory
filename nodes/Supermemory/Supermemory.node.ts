import { NodeConnectionTypes, NodeApiError, NodeOperationError, type IDataObject, type IExecuteFunctions, type IHttpRequestOptions, type INodeExecutionData, type INodeType, type INodeTypeDescription, type JsonObject } from "n8n-workflow";
import { requestWithRetry, resolveServerBaseUrl } from "../../shared/http";

// Generated with ts-morph
type CredentialApplication = { credentialType: string; type: 'apiKey' | 'basic' | 'bearer' | 'oauth2' | 'custom'; location?: 'header' | 'query'; parameter?: string; injections?: Array<{ target: 'header' | 'query' | 'body'; name: string; value: string }> };
type RetryContract = { mode: string; retryConnectionFailures?: boolean; retryTimeouts?: boolean; retryRateLimits?: boolean; retryServerErrors?: boolean; maxAttempts: number; maxElapsedMs: number; baseBackoffMs: number; maxBackoffMs: number; jitterRatio: number; idempotency?: { target: 'header' | 'query' | 'body'; parameter: string } };
type PaginationContract = { style: string; page?: string; limit?: string; cursor?: string; responseCursor?: string; hasMore?: string; itemPath?: string; advancement?: string; maxPages: number; maxItems: number; maxElapsedMs: number; maxMemoryBytes: number; repeatedCursorLimit: number; repeatedPageLimit: number; pageSize: number };

function normalizeParameterValue(value: unknown): IDataObject[string] {
  if (value && typeof value === 'object' && 'value' in value) return (value as { value: IDataObject[string] }).value;
  return value as IDataObject[string];
}


type BodyFieldContract = {
  name: string;
  displayName?: string;
  description?: string;
  type?: string;
  format?: string;
  required?: boolean;
  minValue?: number;
  maxValue?: number;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  pattern?: string;
  fields?: BodyFieldContract[];
  items?: BodyFieldContract;
  additionalValue?: BodyFieldContract;
  alternatives?: BodyFieldContract[];
  composition?: 'oneOf' | 'anyOf';
  representation?: string;
  nullable?: boolean;
};

function normalizeJsonValue(value: unknown, label: string, context: IExecuteFunctions, itemIndex: number): IDataObject | IDataObject[] | string | number | boolean | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed) as IDataObject | IDataObject[] | string | number | boolean | null;
    } catch (error) {
      throw new NodeOperationError(context.getNode(), `${label} must be valid JSON: ${(error as Error).message}`, { itemIndex });
    }
  }
  if (value === null || Array.isArray(value) || (value && typeof value === 'object') || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as IDataObject | IDataObject[] | string | number | boolean | null;
  throw new NodeOperationError(context.getNode(), `${label} must be valid JSON`, { itemIndex });
}


function validateBodyValue(value: unknown, contract: BodyFieldContract, path: string, context: IExecuteFunctions, itemIndex: number): void {
  if (value === undefined || value === '') {
    if (contract.required) throw new NodeOperationError(context.getNode(), `${path} is required`, { itemIndex });
    return;
  }
  if (value === null) {
    if (contract.nullable) return;
    throw new NodeOperationError(context.getNode(), `${path} must not be null`, { itemIndex });
  }
  if (contract.alternatives?.length) {
    selectAlternativeValue(value, contract, path, context, itemIndex);
    return;
  }
  if (contract.type === 'string' && typeof value !== 'string') throw new NodeOperationError(context.getNode(), `${path} must be a string`, { itemIndex });
  if (contract.type === 'boolean' && typeof value !== 'boolean') throw new NodeOperationError(context.getNode(), `${path} must be a boolean`, { itemIndex });
  if (contract.type === 'number' && typeof value !== 'number') throw new NodeOperationError(context.getNode(), `${path} must be a number`, { itemIndex });
  if (contract.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) throw new NodeOperationError(context.getNode(), `${path} must be an integer`, { itemIndex });
  if (contract.enum?.length) {
    const enumValueMatches = (candidate: unknown): boolean => candidate === value ||
      (candidate === null && value === 'null') ||
      (candidate === 'null' && value === null) ||
      Boolean(candidate && value && typeof candidate === 'object' && typeof value === 'object' && JSON.stringify(candidate) === JSON.stringify(value));
    const scalarEnum = contract.enum.every((candidate) => candidate === null || ['string', 'number', 'boolean'].includes(typeof candidate));
    const matches = contract.type === 'array' && Array.isArray(value) && scalarEnum
      ? value.every((item) => contract.enum!.some((candidate) => candidate === item || (candidate === null && item === 'null') || (candidate === 'null' && item === null)))
      : contract.enum.some(enumValueMatches);
    if (!matches) throw new NodeOperationError(context.getNode(), `${path} must be one of: ${contract.enum.join(', ')}`, { itemIndex });
  }
  if (contract.type === 'number' || contract.type === 'integer') {
    const numeric = value as number;
    if (contract.minValue !== undefined && numeric < contract.minValue) throw new NodeOperationError(context.getNode(), `${path} must be at least ${contract.minValue}`, { itemIndex });
    if (contract.maxValue !== undefined && numeric > contract.maxValue) throw new NodeOperationError(context.getNode(), `${path} must be at most ${contract.maxValue}`, { itemIndex });
  }
  if (contract.pattern && typeof value === 'string' && !new RegExp(contract.pattern).test(value)) throw new NodeOperationError(context.getNode(), `${path} must match ${contract.pattern}`, { itemIndex });
  if (contract.format === 'email' && typeof value === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value)) throw new NodeOperationError(context.getNode(), `${path} must be an email address`, { itemIndex });
  if ((contract.format === 'uri' || contract.format === 'url') && typeof value === 'string') {
    try {
      new URL(value);
    } catch {
      throw new NodeOperationError(context.getNode(), `${path} must be a URL`, { itemIndex });
    }
  }
  if (contract.format === 'uuid' && typeof value === 'string' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new NodeOperationError(context.getNode(), `${path} must be a UUID`, { itemIndex });
  if (contract.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NodeOperationError(context.getNode(), `${path} must be a JSON object`, { itemIndex });
    const objectValue = value as IDataObject;
    for (const child of contract.fields ?? []) validateBodyValue(objectValue[child.name], child, `${path}.${child.name}`, context, itemIndex);
    if (contract.additionalValue) {
      const known = new Set((contract.fields ?? []).map((field) => field.name));
      for (const [key, childValue] of Object.entries(objectValue)) {
        if (!known.has(key)) {
          if (contract.additionalValue.alternatives?.length && contract.additionalValue.representation === 'raw') continue;
          validateBodyValue(childValue, contract.additionalValue, `${path}.${key}`, context, itemIndex);
        }
      }
    }
  }
  if (contract.type === 'array') {
    if (!Array.isArray(value)) throw new NodeOperationError(context.getNode(), `${path} must be a JSON array`, { itemIndex });
    if (contract.items) value.forEach((item, index) => validateBodyValue(item, contract.items!, `${path}[${index}]`, context, itemIndex));
  }
}

function setBodyField(body: IDataObject, contract: BodyFieldContract, value: unknown, context: IExecuteFunctions, itemIndex: number): void {
  const normalized = contract.type === 'object' || contract.type === 'array' || contract.type === 'alternative' || contract.representation === 'raw'
    ? normalizeJsonValue(value, contract.displayName ?? contract.name, context, itemIndex)
    : normalizeParameterValue(value);
  const selected = contract.alternatives?.length ? selectAlternativeValue(normalized, contract, contract.name, context, itemIndex) : normalized;
  validateBodyValue(selected, { ...contract, alternatives: undefined, composition: undefined }, contract.name, context, itemIndex);
  body[contract.name] = selected as IDataObject[string];
}


function selectAlternativeValue(value: unknown, contract: BodyFieldContract, path: string, context: IExecuteFunctions, itemIndex: number): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NodeOperationError(context.getNode(), `${path} must include an explicit schema alternative and value`, { itemIndex });
  const selectedName = String((value as IDataObject).schemaAlternative ?? '');
  const selected = (contract.alternatives ?? []).find((alternative) => alternative.name === selectedName);
  if (!selected) throw new NodeOperationError(context.getNode(), `${path} schema alternative must be one of: ${(contract.alternatives ?? []).map((alternative) => alternative.name).join(', ')}`, { itemIndex });
  const selectedValue = (value as IDataObject).value;
  validateBodyValue(selectedValue, selected, path, context, itemIndex);
  return selectedValue;
}

function encodeFormValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return String(value);
}



function toFormData(body: IDataObject): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, encodeFormValue(value));
  return form;
}

function selectResponseFields(value: IDataObject, fields: string[]): IDataObject {
  if (fields.length === 0) return value;
  const selected: IDataObject = {};
  if (value.id !== undefined) selected.id = value.id;
  for (const field of fields) if (value[field] !== undefined) selected[field] = value[field];
  return selected;
}

function valueAtPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').filter(Boolean).reduce((current: unknown, segment) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current)) return current[Number(segment)];
    return (current as IDataObject)[segment];
  }, value);
}

export class Supermemory implements INodeType {
  description: INodeTypeDescription = {
        displayName: "Supermemory",
        name: "supermemory",
        icon: {
            light: "file:supermemory.svg",
            dark: "file:supermemory.dark.svg"
        },
        group: [],
        version: [
            1
        ],
        subtitle: "={{$parameter[\"operation\"] + \": \" + $parameter[\"resource\"]}}",
        description: "Store, manage, search, and recall long-term contextual memories, user profiles, and documents with Supermemory",
        hints: [
            {
                message: "Operation \"getV3ConnectionsByConnectionIdResources\" looks paginated, but no explicit safe Pagination Contract is available. The generated operation remains single-page until an explicit bounded Pagination Contract is provided.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "The specification uses an allOf composition that cannot be safely flattened into typed fields. The generated operation uses the raw JSON boundary for the composed value.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "Operation \"getV3DocumentsProcessing\" looks paginated, but no explicit safe Pagination Contract is available. The generated operation remains single-page until an explicit bounded Pagination Contract is provided.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "The specification uses an allOf composition that cannot be safely flattened into typed fields. The generated operation uses the raw JSON boundary for the composed value.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "The specification uses an allOf composition that cannot be safely flattened into typed fields. The generated operation uses the raw JSON boundary for the composed value.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "The specification uses an allOf composition that cannot be safely flattened into typed fields. The generated operation uses the raw JSON boundary for the composed value.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            },
            {
                message: "The specification uses an allOf composition that cannot be safely flattened into typed fields. The generated operation uses the raw JSON boundary for the composed value.",
                type: "warning",
                location: "inputPane",
                whenToDisplay: "always"
            }
        ],
        defaults: {
            name: "Supermemory"
        },
        usableAsTool: true,
        inputs: [
            NodeConnectionTypes.Main
        ],
        outputs: [
            NodeConnectionTypes.Main
        ],
        credentials: [
            {
                name: "supermemoryApi",
                required: true
            }
        ],
        properties: [
            {
                displayName: "Resource",
                name: "resource",
                type: "options",
                noDataExpression: true,
                default: "connections",
                options: [
                    {
                        name: "Connection",
                        value: "connections"
                    },
                    {
                        name: "Container Tag",
                        value: "containerTags"
                    },
                    {
                        name: "Content Management",
                        value: "contentManagement"
                    },
                    {
                        name: "Document",
                        value: "documents"
                    },
                    {
                        name: "Ingest",
                        value: "ingest"
                    },
                    {
                        name: "Profile",
                        value: "profiles"
                    },
                    {
                        name: "Recall & Search",
                        value: "recallSearch"
                    },
                    {
                        name: "Setting",
                        value: "settings"
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ]
                    }
                },
                default: "deleteV3ConnectionsByConnectionId",
                options: [
                    {
                        name: "Configure",
                        value: "postV3ConnectionsByConnectionIdConfigure",
                        action: "Configure connection",
                        description: "Configure resources for a connection (supported providers: github for now)"
                    },
                    {
                        name: "Create",
                        value: "postV3ConnectionsByProvider",
                        action: "Create connection",
                        description: "Initializes an external integration connection and generates an authorization redirect URL"
                    },
                    {
                        name: "Delete Connection By ID",
                        value: "deleteV3ConnectionsByConnectionId",
                        action: "Delete connection by ID",
                        description: "Delete a specific connection by ID"
                    },
                    {
                        name: "Fetch Resources",
                        value: "getV3ConnectionsByConnectionIdResources",
                        action: "Fetch resources connections",
                        description: "Fetch resources for a connection (supported providers: github for now)"
                    },
                    {
                        name: "Get",
                        value: "getV3ConnectionsByConnectionId",
                        action: "Get connection",
                        description: "Get connection details with ID"
                    },
                    {
                        name: "Get Connection By Provider",
                        value: "postV3ConnectionsByProviderConnection",
                        action: "Get connection by provider",
                        description: "Retrieves connection details by provider type and container tag filter"
                    },
                    {
                        name: "Get Connection Documents",
                        value: "postV3ConnectionsByProviderDocuments",
                        action: "Get connection documents",
                        description: "Lists all documents indexed from a specific integration provider and container tags. connections."
                    },
                    {
                        name: "Get Many",
                        value: "postV3ConnectionsList",
                        action: "Get many connections",
                        description: "Lists external service integration connections filtered by container tags"
                    },
                    {
                        name: "Sync",
                        value: "postV3ConnectionsByProviderImport",
                        action: "Sync connection",
                        description: "Triggers a manual background sync to import documents from a connected provider. connections."
                    }
                ]
            },
            {
                displayName: "Connection ID",
                name: "connectionId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "deleteV3ConnectionsByConnectionId"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "deleteV3ConnectionsByConnectionId"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Delete Documents",
                        name: "deleteDocuments",
                        type: "string",
                        default: "true",
                        description: "Whether to also delete documents imported by this connection. defaults to true."
                    }
                ]
            },
            {
                displayName: "Connection ID",
                name: "connectionId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "getV3ConnectionsByConnectionId"
                        ]
                    }
                }
            },
            {
                displayName: "Connection ID",
                name: "connectionId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "getV3ConnectionsByConnectionIdResources"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "getV3ConnectionsByConnectionIdResources"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Page",
                        name: "page",
                        type: "number",
                        default: 1
                    },
                    {
                        displayName: "Parent ID",
                        name: "parent_id",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Per Page",
                        name: "per_page",
                        type: "number",
                        default: 30
                    }
                ]
            },
            {
                displayName: "Connection ID",
                name: "connectionId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByConnectionIdConfigure"
                        ]
                    }
                }
            },
            {
                displayName: "Resources",
                name: "resources",
                type: "json",
                default: [],
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByConnectionIdConfigure"
                        ]
                    }
                }
            },
            {
                displayName: "Provider",
                name: "provider",
                type: "options",
                default: "notion",
                required: true,
                options: [
                    {
                        name: "Github",
                        value: "github"
                    },
                    {
                        name: "Gmail",
                        value: "gmail"
                    },
                    {
                        name: "Google Drive",
                        value: "google-drive"
                    },
                    {
                        name: "Granola",
                        value: "granola"
                    },
                    {
                        name: "Notion",
                        value: "notion"
                    },
                    {
                        name: "Onedrive",
                        value: "onedrive"
                    },
                    {
                        name: "S3",
                        value: "s3"
                    },
                    {
                        name: "Web Crawler",
                        value: "web-crawler"
                    }
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProvider"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProvider"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: []
                    },
                    {
                        displayName: "Document Limit",
                        name: "documentLimit",
                        type: "number",
                        default: 0,
                        typeOptions: {
                            minValue: 1,
                            maxValue: 10000
                        }
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {}
                    },
                    {
                        displayName: "Redirect URL",
                        name: "redirectUrl",
                        type: "string",
                        default: ""
                    }
                ]
            },
            {
                displayName: "Provider",
                name: "provider",
                type: "options",
                default: "notion",
                required: true,
                options: [
                    {
                        name: "Github",
                        value: "github"
                    },
                    {
                        name: "Gmail",
                        value: "gmail"
                    },
                    {
                        name: "Google Drive",
                        value: "google-drive"
                    },
                    {
                        name: "Granola",
                        value: "granola"
                    },
                    {
                        name: "Notion",
                        value: "notion"
                    },
                    {
                        name: "Onedrive",
                        value: "onedrive"
                    },
                    {
                        name: "S3",
                        value: "s3"
                    },
                    {
                        name: "Web Crawler",
                        value: "web-crawler"
                    }
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderConnection"
                        ]
                    }
                }
            },
            {
                displayName: "Container Tags",
                name: "containerTags",
                type: "json",
                default: [],
                required: true,
                description: "Comma-separated list of container tags to filter connection by",
                placeholder: "e.g. user_123,project_123",
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderConnection"
                        ]
                    }
                }
            },
            {
                displayName: "Provider",
                name: "provider",
                type: "options",
                default: "notion",
                required: true,
                options: [
                    {
                        name: "Github",
                        value: "github"
                    },
                    {
                        name: "Gmail",
                        value: "gmail"
                    },
                    {
                        name: "Google Drive",
                        value: "google-drive"
                    },
                    {
                        name: "Granola",
                        value: "granola"
                    },
                    {
                        name: "Notion",
                        value: "notion"
                    },
                    {
                        name: "Onedrive",
                        value: "onedrive"
                    },
                    {
                        name: "S3",
                        value: "s3"
                    },
                    {
                        name: "Web Crawler",
                        value: "web-crawler"
                    }
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderDocuments"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderDocuments"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional comma-separated list of container tags to filter documents by",
                        placeholder: "e.g. user_123,project_123"
                    }
                ]
            },
            {
                displayName: "Provider",
                name: "provider",
                type: "options",
                default: "notion",
                required: true,
                options: [
                    {
                        name: "Github",
                        value: "github"
                    },
                    {
                        name: "Gmail",
                        value: "gmail"
                    },
                    {
                        name: "Google Drive",
                        value: "google-drive"
                    },
                    {
                        name: "Granola",
                        value: "granola"
                    },
                    {
                        name: "Notion",
                        value: "notion"
                    },
                    {
                        name: "Onedrive",
                        value: "onedrive"
                    },
                    {
                        name: "S3",
                        value: "s3"
                    },
                    {
                        name: "Web Crawler",
                        value: "web-crawler"
                    }
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderImport"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsByProviderImport"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional comma-separated list of container tags to filter connections by",
                        placeholder: "e.g. user_123,project_123"
                    }
                ]
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "connections"
                        ],
                        operation: [
                            "postV3ConnectionsList"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional comma-separated list of container tags to filter documents by",
                        placeholder: "e.g. user_123,project_123"
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ]
                    }
                },
                default: "deleteV3ContainerTagsByContainerTag",
                options: [
                    {
                        name: "Delete",
                        value: "deleteV3ContainerTagsByContainerTag",
                        action: "Delete container tag",
                        description: "Deletes a container tag along with all linked documents and memories"
                    },
                    {
                        name: "Get",
                        value: "getV3ContainerTagsByContainerTag",
                        action: "Get container tag",
                        description: "Retrieves settings, display name, entity context prompt, and profile buckets for a container tag"
                    },
                    {
                        name: "Get Many",
                        value: "getV3ContainerTagsList",
                        action: "Get many container tags",
                        description: "Lists all spaces and container tags with document counts, memory counts, and activity dates"
                    },
                    {
                        name: "Get Merge Status",
                        value: "getV3ContainerTagsMergeByMergeId",
                        action: "Get merge status container tags",
                        description: "Retrieves the execution progress and state of an active container tag merge job"
                    },
                    {
                        name: "Merge",
                        value: "postV3ContainerTagsMerge",
                        action: "Merge container tags",
                        description: "Queues a background job to merge two container tags and consolidate their data into a target tag"
                    },
                    {
                        name: "Update",
                        value: "patchV3ContainerTagsByContainerTag",
                        action: "Update container tag",
                        description: "Updates the display name, custom entity context prompt, or bucket definitions of a container tag"
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "deleteV3ContainerTagsByContainerTag"
                        ]
                    }
                }
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "getV3ContainerTagsByContainerTag"
                        ]
                    }
                }
            },
            {
                displayName: "Output",
                name: "outputMode",
                type: "options",
                default: "simplified",
                description: "Choose whether to return useful fields, the raw response, or selected fields",
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "getV3ContainerTagsList"
                        ]
                    }
                },
                options: [
                    {
                        name: "Raw",
                        value: "raw",
                        description: "Return the complete API response"
                    },
                    {
                        name: "Selected Fields",
                        value: "selected",
                        description: "Return only selected fields"
                    },
                    {
                        name: "Simplified",
                        value: "simplified",
                        description: "Return up to 10 useful fields"
                    }
                ]
            },
            {
                displayName: "Fields to Include",
                name: "selectedFields",
                type: "multiOptions",
                default: [
                    "id",
                    "name",
                    "description",
                    "createdAt",
                    "updatedAt",
                    "containerTag",
                    "documentCount",
                    "emoji",
                    "isExperimental",
                    "isNova"
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "getV3ContainerTagsList"
                        ],
                        outputMode: [
                            "selected"
                        ]
                    }
                },
                options: [
                    {
                        name: "ContainerTag",
                        value: "containerTag"
                    },
                    {
                        name: "CreatedAt",
                        value: "createdAt"
                    },
                    {
                        name: "Description",
                        value: "description"
                    },
                    {
                        name: "DocumentCount",
                        value: "documentCount"
                    },
                    {
                        name: "Emoji",
                        value: "emoji"
                    },
                    {
                        name: "ID",
                        value: "id"
                    },
                    {
                        name: "IsExperimental",
                        value: "isExperimental"
                    },
                    {
                        name: "IsNova",
                        value: "isNova"
                    },
                    {
                        name: "LastActivityAt",
                        value: "lastActivityAt"
                    },
                    {
                        name: "MemoryCount",
                        value: "memoryCount"
                    },
                    {
                        name: "MergeId",
                        value: "mergeId"
                    },
                    {
                        name: "MergeStatus",
                        value: "mergeStatus"
                    },
                    {
                        name: "MergeTargetTag",
                        value: "mergeTargetTag"
                    },
                    {
                        name: "Name",
                        value: "name"
                    },
                    {
                        name: "UpdatedAt",
                        value: "updatedAt"
                    },
                    {
                        name: "Visibility",
                        value: "visibility"
                    }
                ]
            },
            {
                displayName: "Merge ID",
                name: "mergeId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "getV3ContainerTagsMergeByMergeId"
                        ]
                    }
                }
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "patchV3ContainerTagsByContainerTag"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "patchV3ContainerTagsByContainerTag"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Entity Context",
                        name: "entityContext",
                        type: "string",
                        default: "",
                        description: "Custom context prompt for this container tag. used to provide additional context when processing documents in this container. maximum 1500 characters.",
                        placeholder: "e.g. This project contains research papers about machine learning."
                    },
                    {
                        displayName: "Memory Filesystem Paths",
                        name: "memoryFilesystemPaths",
                        type: "json",
                        default: [],
                        description: "Per-tag allowlist of filesystem paths that trigger memory generation for mount-ingested documents. docs whose filepath does not match are ingested as 'superrag' (chunked and searchable, no memory extraction).",
                        placeholder: "e.g. /memory/,/user.md"
                    },
                    {
                        displayName: "Name",
                        name: "name",
                        type: "string",
                        default: "",
                        description: "Display name for this container tag. this does not change the container tag identifier.",
                        placeholder: "e.g. Research Notes"
                    },
                    {
                        displayName: "Profile Buckets",
                        name: "profileBuckets",
                        type: "json",
                        default: [],
                        description: "Container-tag-level buckets to set (add-only on top of org buckets). replaces this tag's own bucket list; cannot override or remove org buckets."
                    }
                ]
            },
            {
                displayName: "Container Tags",
                name: "containerTags",
                type: "json",
                default: [],
                required: true,
                description: "List of container tags to merge (min: 2, max: 2). all documents from these tags will be merged into the target.",
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "postV3ContainerTagsMerge"
                        ]
                    }
                }
            },
            {
                displayName: "Target Container Tag",
                name: "targetContainerTag",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "containerTags"
                        ],
                        operation: [
                            "postV3ContainerTagsMerge"
                        ]
                    }
                }
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ]
                    }
                },
                default: "deleteV4Memories",
                options: [
                    {
                        name: "Create Memories",
                        value: "postV4Memories",
                        action: "Create memories content management",
                        description: "Creates entity-centric memories directly into vector storage, bypassing document extraction. content management."
                    },
                    {
                        name: "Forget Matching Memories",
                        value: "postV4MemoriesForgetMatching",
                        action: "Forget matching memories content management",
                        description: "Uses semantic search or explicit IDs to mass-forget memories matching a prompt or query. content management."
                    },
                    {
                        name: "Forget Memory",
                        value: "deleteV4Memories",
                        action: "Forget memory content management",
                        description: "Soft-deletes a specific memory entry by marking it as forgotten. content management."
                    },
                    {
                        name: "Get Many Memories",
                        value: "postV4MemoriesList",
                        action: "Get many memories content management",
                        description: "Lists active memory entries, version histories, and source document relations for a container tag. content management."
                    },
                    {
                        name: "Update Memory",
                        value: "patchV4Memories",
                        action: "Update memory content management",
                        description: "Creates a new version of an existing memory entry while preserving change history. content management."
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "Container tag / space identifier. required to scope the operation.",
                placeholder: "e.g. user_123",
                hint: "Expected format: ^[a-zA-Z0-9_:-]+$",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "deleteV4Memories"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "deleteV4Memories"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Content",
                        name: "content",
                        type: "string",
                        default: "",
                        description: "Exact content match of the memory entry to operate on. use this when you don't have the ID.",
                        placeholder: "e.g. John prefers dark mode"
                    },
                    {
                        displayName: "ID",
                        name: "id",
                        type: "string",
                        default: "",
                        description: "ID of the memory entry to operate on",
                        placeholder: "e.g. mem_abc123"
                    },
                    {
                        displayName: "Reason",
                        name: "reason",
                        type: "string",
                        default: "",
                        description: "Optional reason for forgetting this memory",
                        placeholder: "e.g. outdated information"
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "Container tag / space identifier. required to scope the operation.",
                placeholder: "e.g. user_123",
                hint: "Expected format: ^[a-zA-Z0-9_:-]+$",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "patchV4Memories"
                        ]
                    }
                }
            },
            {
                displayName: "New Content",
                name: "newContent",
                type: "string",
                default: "",
                required: true,
                description: "The new content that will replace the existing memory",
                placeholder: "e.g. John now prefers light mode",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "patchV4Memories"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "patchV4Memories"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Content",
                        name: "content",
                        type: "string",
                        default: "",
                        description: "Exact content match of the memory entry to operate on. use this when you don't have the ID.",
                        placeholder: "e.g. John prefers dark mode"
                    },
                    {
                        displayName: "Forget After",
                        name: "forgetAfter",
                        type: "string",
                        default: "",
                        description: "ISO 8601 datetime string. the memory will be auto-forgotten after this time. pass null to clear an existing expiry. omit to inherit from the previous version.",
                        placeholder: "e.g. 2026-06-01T00:00:00Z"
                    },
                    {
                        displayName: "Forget Reason",
                        name: "forgetReason",
                        type: "string",
                        default: "",
                        description: "Optional reason for the scheduled forgetting. cleared automatically when forgetafter is set to null.",
                        placeholder: "e.g. temporary project deadline"
                    },
                    {
                        displayName: "ID",
                        name: "id",
                        type: "string",
                        default: "",
                        description: "ID of the memory entry to operate on",
                        placeholder: "e.g. mem_abc123"
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata. if not provided, inherits from the previous version."
                    },
                    {
                        displayName: "Temporal Context",
                        name: "temporalContext",
                        type: "json",
                        default: {},
                        description: "Structured temporal metadata. merged into the metadata JSON column. if omitted, existing temporalcontext is preserved."
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "The space / container tag these memories belong to",
                placeholder: "e.g. user_123",
                hint: "Expected format: ^[a-zA-Z0-9_:-]+$",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4Memories"
                        ]
                    }
                }
            },
            {
                displayName: "Memories",
                name: "memories",
                type: "json",
                default: [],
                required: true,
                description: "Array of memories to create",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4Memories"
                        ]
                    }
                }
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "Container tag / space the forget operation is scoped to",
                placeholder: "e.g. user_123",
                hint: "Expected format: ^[a-zA-Z0-9_:-]+$",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4MemoriesForgetMatching"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4MemoriesForgetMatching"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Dry Run",
                        name: "dryRun",
                        type: "boolean",
                        default: false,
                        description: "Whether when true, returns the memories that would be forgotten without mutating anything. defaults to false (forgets for real).",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "IDs",
                        name: "ids",
                        type: "json",
                        default: [],
                        description: "Forget exactly these memory IDs, with no semantic search. IDs are validated against the containertag, so unknown or out-of-scope IDs are ignored. provide either query or IDs.",
                        placeholder: "e.g. abc123,def456"
                    },
                    {
                        displayName: "Max Forget",
                        name: "maxForget",
                        type: "number",
                        default: 100,
                        description: "Maximum number of memories this call may forget. defaults to 100, max 500.",
                        placeholder: "e.g. 100",
                        typeOptions: {
                            minValue: 1,
                            maxValue: 500
                        }
                    },
                    {
                        displayName: "Query",
                        name: "query",
                        type: "string",
                        default: "",
                        description: "Natural-language instruction ('forget everything about project titan') or a bare topic ('project titan'). the service searches the container's memories and selects matches to forget. provide either query or IDs.",
                        placeholder: "e.g. forget everything about Project Titan"
                    },
                    {
                        displayName: "Reason",
                        name: "reason",
                        type: "string",
                        default: "",
                        description: "Optional reason stored as forgetreason on each memory",
                        placeholder: "e.g. project cancelled"
                    },
                    {
                        displayName: "Threshold",
                        name: "threshold",
                        type: "number",
                        default: 0.5,
                        description: "Minimum cosine similarity a memory must have to be considered. lower = wider net. defaults to 0.5.",
                        placeholder: "e.g. 0.5",
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1
                        }
                    }
                ]
            },
            {
                displayName: "Container Tags",
                name: "containerTags",
                type: "json",
                default: [],
                required: true,
                description: "Container tags to filter memory entries. at least one tag is required.",
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4MemoriesList"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "contentManagement"
                        ],
                        operation: [
                            "postV4MemoriesList"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Filters",
                        name: "filters",
                        type: "string",
                        default: "",
                        description: "Optional filters to apply to the search. can be a JSON string or query object."
                    },
                    {
                        displayName: "Limit",
                        name: "limit",
                        type: "json",
                        default: "50",
                        description: "Number of items per page",
                        placeholder: "e.g. 10"
                    },
                    {
                        displayName: "Order",
                        name: "order",
                        type: "options",
                        default: "desc",
                        description: "Sort order",
                        placeholder: "e.g. desc",
                        options: [
                            {
                                name: "Asc",
                                value: "asc"
                            },
                            {
                                name: "Desc",
                                value: "desc"
                            }
                        ]
                    },
                    {
                        displayName: "Page",
                        name: "page",
                        type: "json",
                        default: {
                            schemaAlternative: "alternative1",
                            value: ""
                        },
                        description: "Page number to fetch",
                        placeholder: "e.g. 1"
                    },
                    {
                        displayName: "Sort",
                        name: "sort",
                        type: "options",
                        default: "createdAt",
                        description: "Field to sort by",
                        placeholder: "e.g. createdAt",
                        options: [
                            {
                                name: "CreatedAt",
                                value: "createdAt"
                            },
                            {
                                name: "UpdatedAt",
                                value: "updatedAt"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ]
                    }
                },
                default: "getV3DocumentsById",
                options: [
                    {
                        name: "Get",
                        value: "getV3DocumentsById",
                        action: "Get document",
                        description: "Retrieves full details, metadata, status, and extracted memories for a specific document"
                    },
                    {
                        name: "Get Document Chunks",
                        value: "getV3DocumentsByIdChunks",
                        action: "Get document chunks",
                        description: "Retrieves the ordered text and image chunks extracted from a specific document"
                    },
                    {
                        name: "Get Document File URL",
                        value: "getV3DocumentsByIdFileUrl",
                        action: "Get document file URL",
                        description: "Generates a temporary presigned download URL for a document's uploaded source file"
                    },
                    {
                        name: "Get Many",
                        value: "postV3DocumentsList",
                        action: "Get many documents",
                        description: "Retrieves a paginated list of documents filtered by container tags, metadata, or dates"
                    },
                    {
                        name: "Get Processing",
                        value: "getV3DocumentsProcessing",
                        action: "Get processing documents",
                        description: "Retrieves in-flight, queued, or failed documents currently going through extraction"
                    },
                    {
                        name: "Search",
                        value: "postV3Search",
                        action: "Search documents",
                        description: "Search memories with advanced filtering. documents."
                    }
                ]
            },
            {
                displayName: "ID",
                name: "id",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsById"
                        ]
                    }
                }
            },
            {
                displayName: "Output",
                name: "outputMode",
                type: "options",
                default: "simplified",
                description: "Choose whether to return useful fields, the raw response, or selected fields",
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsById"
                        ]
                    }
                },
                options: [
                    {
                        name: "Raw",
                        value: "raw",
                        description: "Return the complete API response"
                    },
                    {
                        name: "Selected Fields",
                        value: "selected",
                        description: "Return only selected fields"
                    },
                    {
                        name: "Simplified",
                        value: "simplified",
                        description: "Return up to 10 useful fields"
                    }
                ]
            },
            {
                displayName: "Fields to Include",
                name: "selectedFields",
                type: "multiOptions",
                default: [
                    "id",
                    "title",
                    "status",
                    "type",
                    "createdAt",
                    "updatedAt",
                    "activeContentUpdateId",
                    "connectionId",
                    "content",
                    "customId"
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsById"
                        ],
                        outputMode: [
                            "selected"
                        ]
                    }
                },
                options: [
                    {
                        name: "ActiveContentUpdateId",
                        value: "activeContentUpdateId"
                    },
                    {
                        name: "ConnectionId",
                        value: "connectionId"
                    },
                    {
                        name: "ContainerTags",
                        value: "containerTags"
                    },
                    {
                        name: "Content",
                        value: "content"
                    },
                    {
                        name: "CreatedAt",
                        value: "createdAt"
                    },
                    {
                        name: "CustomId",
                        value: "customId"
                    },
                    {
                        name: "DreamingStatus",
                        value: "dreamingStatus"
                    },
                    {
                        name: "Filepath",
                        value: "filepath"
                    },
                    {
                        name: "ID",
                        value: "id"
                    },
                    {
                        name: "LatestRevision",
                        value: "latestRevision"
                    },
                    {
                        name: "Memories",
                        value: "memories"
                    },
                    {
                        name: "Metadata",
                        value: "metadata"
                    },
                    {
                        name: "OgImage",
                        value: "ogImage"
                    },
                    {
                        name: "Raw",
                        value: "raw"
                    },
                    {
                        name: "Source",
                        value: "source"
                    },
                    {
                        name: "Status",
                        value: "status"
                    },
                    {
                        name: "Summary",
                        value: "summary"
                    },
                    {
                        name: "TaskType",
                        value: "taskType"
                    },
                    {
                        name: "Title",
                        value: "title"
                    },
                    {
                        name: "TombstonedAt",
                        value: "tombstonedAt"
                    },
                    {
                        name: "Type",
                        value: "type"
                    },
                    {
                        name: "UpdatedAt",
                        value: "updatedAt"
                    },
                    {
                        name: "URL",
                        value: "url"
                    }
                ]
            },
            {
                displayName: "ID",
                name: "id",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsByIdChunks"
                        ]
                    }
                }
            },
            {
                displayName: "ID",
                name: "id",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsByIdFileUrl"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "getV3DocumentsProcessing"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "string",
                        default: "",
                        description: "Comma-separated container tags to filter by",
                        placeholder: "e.g. user_123,sm_project_default"
                    },
                    {
                        displayName: "Limit",
                        name: "limit",
                        type: "json",
                        default: "50",
                        description: "Number of items per page. used with `view=all`.",
                        placeholder: "e.g. 50"
                    },
                    {
                        displayName: "Page",
                        name: "page",
                        type: "json",
                        default: {
                            schemaAlternative: "",
                            value: ""
                        },
                        description: "Page number to fetch. used with `view=all`.",
                        placeholder: "e.g. 1"
                    },
                    {
                        displayName: "View",
                        name: "view",
                        type: "options",
                        default: "active",
                        description: "`Active` returns in-flight documents updated in the last 4 hours. `pending` returns every document that is not done or failed, with no time cutoff. `all` also includes failed documents, paginated.",
                        placeholder: "e.g. all",
                        options: [
                            {
                                name: "Active",
                                value: "active"
                            },
                            {
                                name: "All",
                                value: "all"
                            },
                            {
                                name: "Pending",
                                value: "pending"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "postV3DocumentsList"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional tags this document should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to group documents."
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Filter documents by filepath. exact match for full paths, prefix match if ending with /."
                    },
                    {
                        displayName: "Filters",
                        name: "filters",
                        type: "string",
                        default: "",
                        description: "Optional filters to apply to the search. can be a JSON string or query object."
                    },
                    {
                        displayName: "Include Content",
                        name: "includeContent",
                        type: "boolean",
                        default: false,
                        description: "Whether to include the content field in the response. warning: this can make responses significantly larger.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Limit",
                        name: "limit",
                        type: "json",
                        default: "50",
                        description: "Number of items per page",
                        placeholder: "e.g. 10"
                    },
                    {
                        displayName: "Order",
                        name: "order",
                        type: "options",
                        default: "desc",
                        description: "Sort order",
                        placeholder: "e.g. desc",
                        options: [
                            {
                                name: "Asc",
                                value: "asc"
                            },
                            {
                                name: "Desc",
                                value: "desc"
                            }
                        ]
                    },
                    {
                        displayName: "Page",
                        name: "page",
                        type: "json",
                        default: {
                            schemaAlternative: "alternative1",
                            value: ""
                        },
                        description: "Page number to fetch",
                        placeholder: "e.g. 1"
                    },
                    {
                        displayName: "Sort",
                        name: "sort",
                        type: "options",
                        default: "createdAt",
                        description: "Field to sort by",
                        placeholder: "e.g. createdAt",
                        options: [
                            {
                                name: "CreatedAt",
                                value: "createdAt"
                            },
                            {
                                name: "UpdatedAt",
                                value: "updatedAt"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "Q",
                name: "q",
                type: "string",
                default: "",
                required: true,
                description: "Search query string",
                placeholder: "e.g. what are the API rate limits",
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "postV3Search"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "documents"
                        ],
                        operation: [
                            "postV3Search"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Categories Filter",
                        name: "categoriesFilter",
                        type: "json",
                        default: [],
                        description: "Deprecated: optional category filters"
                    },
                    {
                        displayName: "Chunk Threshold",
                        name: "chunkThreshold",
                        type: "number",
                        default: 0,
                        description: "Threshold / sensitivity for chunk selection. 0 is least sensitive (returns most chunks, more results), 1 is most sensitive (returns lesser chunks, accurate results).",
                        placeholder: "e.g. 0.5",
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1
                        }
                    },
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional single container tag. use this or containertags.",
                        placeholder: "e.g. user_alex",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional tags this search should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to filter documents."
                    },
                    {
                        displayName: "Doc ID",
                        name: "docId",
                        type: "string",
                        default: "",
                        description: "Optional document ID to search within. you can use this to find chunks in a very large document."
                    },
                    {
                        displayName: "Document Threshold",
                        name: "documentThreshold",
                        type: "number",
                        default: 0,
                        description: "Deprecated: this field is no longer used in v3 search. the search now uses chunkthreshold only. this parameter will be ignored.",
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1
                        }
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Filter search results by filepath. exact match for full paths, prefix match if ending with /."
                    },
                    {
                        displayName: "Filters",
                        name: "filters",
                        type: "string",
                        default: "",
                        description: "Optional filters to apply to the search. can be a JSON string or query object."
                    },
                    {
                        displayName: "Include Full Docs",
                        name: "includeFullDocs",
                        type: "boolean",
                        default: false,
                        description: "Whether true, include full document in the response. this is helpful if you want a chatbot to know the full context of the document.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Include Summary",
                        name: "includeSummary",
                        type: "boolean",
                        default: false,
                        description: "Whether true, include document summary in the response. this is helpful if you want a chatbot to know the full context of the document."
                    },
                    {
                        displayName: "Limit",
                        name: "limit",
                        type: "number",
                        default: 50,
                        description: "Max number of results to return",
                        placeholder: "e.g. 10",
                        typeOptions: {
                            minValue: 1
                        }
                    },
                    {
                        displayName: "Only Matching Chunks",
                        name: "onlyMatchingChunks",
                        type: "boolean",
                        default: true,
                        description: "Whether true, only return matching chunks without context. normally, we send the previous and next chunk to provide more context for llms. if you only want the matching chunk, set this to true."
                    },
                    {
                        displayName: "Rerank",
                        name: "rerank",
                        type: "boolean",
                        default: false,
                        description: "Whether true, rerank the results based on the query. this is helpful if you want to ensure the most relevant results are returned.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Rewrite Query",
                        name: "rewriteQuery",
                        type: "boolean",
                        default: false,
                        description: "Whether true, rewrites the query to make it easier to find documents. this increases the latency by about 400ms.",
                        placeholder: "e.g. false"
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ]
                    }
                },
                default: "deleteV3DocumentsBulk",
                options: [
                    {
                        name: "Add Document",
                        value: "postV3Documents",
                        action: "Add document ingest",
                        description: "Ingests and processes content, URLs, or text into a containerized document"
                    },
                    {
                        name: "Batch Add Documents",
                        value: "postV3DocumentsBatch",
                        action: "Batch add documents ingest",
                        description: "Ingests up to 600 documents in a single request with metadata and container scoping"
                    },
                    {
                        name: "Bulk Delete Documents",
                        value: "deleteV3DocumentsBulk",
                        action: "Bulk delete documents ingest",
                        description: "Deletes multiple documents simultaneously by a list of document IDs. ingest."
                    },
                    {
                        name: "Delete Document",
                        value: "deleteV3DocumentsById",
                        action: "Delete document ingest",
                        description: "Permanently deletes a specific document by its unique ID or custom ID. ingest."
                    },
                    {
                        name: "Ingest Conversation",
                        value: "postV4Conversations",
                        action: "Ingest conversation",
                        description: "Ingests or updates structured multi-turn conversation messages under a conversation ID"
                    },
                    {
                        name: "Update Document",
                        value: "patchV3DocumentsById",
                        action: "Update document ingest",
                        description: "Updates the content, metadata, or container configuration of an existing document. ingest."
                    },
                    {
                        name: "Upload Document File",
                        value: "postV3DocumentsFile",
                        action: "Upload document file ingest",
                        description: "Uploads and processes a local binary file (pdf, text, image, or media) into a document. ingest."
                    }
                ]
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "deleteV3DocumentsBulk"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Array of container tags - all documents in these containers will be deleted"
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Delete documents matching this filepath. exact match for full paths, prefix match if ending with /."
                    },
                    {
                        displayName: "IDs",
                        name: "ids",
                        type: "json",
                        default: [],
                        description: "Array of document IDs to delete (max 100 at once)"
                    }
                ]
            },
            {
                displayName: "ID",
                name: "id",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "deleteV3DocumentsById"
                        ]
                    }
                }
            },
            {
                displayName: "ID",
                name: "id",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "patchV3DocumentsById"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "patchV3DocumentsById"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional tag this document should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.",
                        placeholder: "e.g. user_alex",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "(Deprecated: use containertag instead) optional tags this document should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to group documents."
                    },
                    {
                        displayName: "Content",
                        name: "content",
                        type: "string",
                        default: "",
                        description: "The content to extract and process into a document. this can be a URL to a website, a pdf, an image, or a video. plaintext: any plaintext format URL: a URL to a website, pdf, image, or video we automatically detect the content type from the URL's response format.",
                        placeholder: "e.g. Our API rate limits are 100 req/min on free and 1000 on pro. Clients should use exponential backoff on 429s."
                    },
                    {
                        displayName: "Custom ID",
                        name: "customId",
                        type: "string",
                        default: "",
                        description: "Optional custom ID of the document. this could be an ID from your database that will uniquely identify this document.",
                        placeholder: "e.g. doc-api-rate-limits"
                    },
                    {
                        displayName: "Document Date",
                        name: "documentDate",
                        type: "string",
                        default: "",
                        description: "When this document's content is from, as opposed to when it was uploaded. accepts yyyy-mm-dd or a full ISO 8601 timestamp. memory extraction resolves relative dates ('yesterday', 'last quarter') against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. set this whenever you backfill historical content.",
                        placeholder: "e.g. 2025-03-14"
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Optional file path for the document (e.g., '/documents/reports/file.pdf'). used by supermemoryfs to map documents to filesystem paths.",
                        placeholder: "e.g. /documents/reports/file.pdf"
                    },
                    {
                        displayName: "Filter By Metadata",
                        name: "filterByMetadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata filter scoping which existing memories are pulled as context during ingestion. scalar values match exactly (and across keys); array values match any (or within key). only memories whose source documents match this filter are used as context.",
                        placeholder: "e.g. [object Object]"
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata for the document. this is used to store additional information about the document. you can use this to store any additional information you need about the document. metadata can be filtered through. keys must be strings and are case sensitive. values can be strings, numbers, or booleans. you cannot nest objects.",
                        placeholder: "e.g. [object Object]"
                    },
                    {
                        displayName: "Task Type",
                        name: "taskType",
                        type: "options",
                        default: "memory",
                        description: "Task type: \"memory\" (default) for full context layer with superrag built in, \"superrag\" for managed rag as a service",
                        placeholder: "e.g. memory",
                        options: [
                            {
                                name: "Memory",
                                value: "memory"
                            },
                            {
                                name: "Superrag",
                                value: "superrag"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "Content",
                name: "content",
                type: "string",
                default: "",
                required: true,
                description: "The content to extract and process into a document. this can be a URL to a website, a pdf, an image, or a video.",
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3Documents"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3Documents"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional tag this document should be containerized by. max 100 characters, alphanumeric with hyphens, underscores, and dots only."
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: []
                    },
                    {
                        displayName: "Custom ID",
                        name: "customId",
                        type: "string",
                        default: "",
                        description: "Optional custom ID of the document. max 100 characters, alphanumeric with hyphens, underscores, and dots only."
                    },
                    {
                        displayName: "Document Date",
                        name: "documentDate",
                        type: "string",
                        default: "",
                        description: "When this document's content is from, as opposed to when it was uploaded. accepts yyyy-mm-dd or a full ISO 8601 timestamp. memory extraction resolves relative dates against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. set this whenever you backfill historical content."
                    },
                    {
                        displayName: "Dreaming",
                        name: "dreaming",
                        type: "options",
                        default: "instant",
                        description: "Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.",
                        options: [
                            {
                                name: "Dynamic",
                                value: "dynamic"
                            },
                            {
                                name: "Instant",
                                value: "instant"
                            }
                        ]
                    },
                    {
                        displayName: "Entity Context",
                        name: "entityContext",
                        type: "string",
                        default: "",
                        description: "Optional entity context for this container tag. max 1500 characters. used during document processing to guide memory extraction."
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Optional file path for the document. used by supermemoryfs to store the full path of the file."
                    },
                    {
                        displayName: "Filter By Metadata",
                        name: "filterByMetadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata filter to apply when pulling related memories and profile during ingestion. only memories matching these filters will be used as context."
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata for the document"
                    },
                    {
                        displayName: "Task Type",
                        name: "taskType",
                        type: "options",
                        default: "memory",
                        description: "Task type: \"memory\" (default) for full context layer with superrag built in, \"superrag\" for managed rag as a service",
                        options: [
                            {
                                name: "Memory",
                                value: "memory"
                            },
                            {
                                name: "Superrag",
                                value: "superrag"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "Documents",
                name: "documents",
                type: "json",
                default: {
                    schemaAlternative: "alternative1",
                    value: ""
                },
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3DocumentsBatch"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3DocumentsBatch"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional tag this document should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.",
                        placeholder: "e.g. user_alex",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "(Deprecated: use containertag instead) optional tags this document should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to group documents."
                    },
                    {
                        displayName: "Content",
                        name: "content",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Document Date",
                        name: "documentDate",
                        type: "string",
                        default: "",
                        description: "When this document's content is from, as opposed to when it was uploaded. accepts yyyy-mm-dd or a full ISO 8601 timestamp. memory extraction resolves relative dates ('yesterday', 'last quarter') against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. set this whenever you backfill historical content.",
                        placeholder: "e.g. 2025-03-14"
                    },
                    {
                        displayName: "Dreaming",
                        name: "dreaming",
                        type: "options",
                        default: "instant",
                        description: "Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.",
                        placeholder: "e.g. instant",
                        options: [
                            {
                                name: "Dynamic",
                                value: "dynamic"
                            },
                            {
                                name: "Instant",
                                value: "instant"
                            }
                        ]
                    },
                    {
                        displayName: "Entity Context",
                        name: "entityContext",
                        type: "string",
                        default: "",
                        description: "Optional entity context for this container tag. max 1500 characters. used during document processing to guide memory extraction.",
                        placeholder: "e.g. User's name is {XYZ}"
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Optional file path for the document (e.g., '/documents/reports/file.pdf'). used by supermemoryfs to map documents to filesystem paths.",
                        placeholder: "e.g. /documents/reports/file.pdf"
                    },
                    {
                        displayName: "Filter By Metadata",
                        name: "filterByMetadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata filter scoping which existing memories are pulled as context during ingestion. scalar values match exactly (and across keys); array values match any (or within key). only memories whose source documents match this filter are used as context.",
                        placeholder: "e.g. [object Object]"
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {},
                        description: "Optional metadata for the document. this is used to store additional information about the document. you can use this to store any additional information you need about the document. metadata can be filtered through. keys must be strings and are case sensitive. values can be strings, numbers, or booleans. you cannot nest objects.",
                        placeholder: "e.g. [object Object]"
                    },
                    {
                        displayName: "Task Type",
                        name: "taskType",
                        type: "options",
                        default: "memory",
                        description: "Task type: \"memory\" (default) for full context layer with superrag built in, \"superrag\" for managed rag as a service",
                        placeholder: "e.g. memory",
                        options: [
                            {
                                name: "Memory",
                                value: "memory"
                            },
                            {
                                name: "Superrag",
                                value: "superrag"
                            }
                        ]
                    }
                ]
            },
            {
                displayName: "File",
                name: "file",
                type: "string",
                default: "",
                required: true,
                description: "File to upload and process",
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3DocumentsFile"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV3DocumentsFile"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional container tag (e.g., 'user_123'). use this for a single tag.",
                        placeholder: "e.g. user_alex"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "string",
                        default: "",
                        description: "Optional container tags. can be either a JSON string of an array (e.g., '[\"user_123\", \"project_123\"]') or a single string (e.g., 'user_123'). single strings will be automatically converted to an array."
                    },
                    {
                        displayName: "Custom ID",
                        name: "customId",
                        type: "string",
                        default: "",
                        description: "Optional custom ID of the document. max 100 characters, alphanumeric with hyphens, underscores, and colons only.",
                        placeholder: "e.g. mem_abc123",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Dreaming",
                        name: "dreaming",
                        type: "options",
                        default: "instant",
                        description: "Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.",
                        placeholder: "e.g. instant",
                        options: [
                            {
                                name: "Dynamic",
                                value: "dynamic"
                            },
                            {
                                name: "Instant",
                                value: "instant"
                            }
                        ]
                    },
                    {
                        displayName: "Entity Context",
                        name: "entityContext",
                        type: "string",
                        default: "",
                        description: "Optional entity context for this container tag. max 1500 characters. used during document processing to guide memory extraction.",
                        placeholder: "e.g. User's name is {XYZ}"
                    },
                    {
                        displayName: "File Type",
                        name: "fileType",
                        type: "string",
                        default: "",
                        description: "Optional file type override to force specific processing behavior. valid values: text, pdf, tweet, google_doc, google_slide, google_sheet, image, video, notion_doc, webpage, onedrive.",
                        placeholder: "e.g. image"
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Optional file path for the uploaded file (e.g., '/documents/reports/file.pdf'). used by supermemoryfs to map documents to filesystem paths.",
                        placeholder: "e.g. /documents/reports/file.pdf"
                    },
                    {
                        displayName: "Filter By Metadata",
                        name: "filterByMetadata",
                        type: "string",
                        default: "",
                        description: "Optional metadata filter as a JSON string. scopes which existing memories are pulled as context during ingestion. scalar values match exactly (and across keys); array values match any (or within key).",
                        placeholder: "e.g. {\"department\": \"engineering\"}"
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "string",
                        default: "",
                        description: "Optional metadata for the document as a JSON string. this is used to store additional information about the document. keys must be strings and values can be strings, numbers, or booleans.",
                        placeholder: "e.g. {\"category\": \"technology\", \"isPublic\": true, \"readingTime\": 5}"
                    },
                    {
                        displayName: "Mime Type",
                        name: "mimeType",
                        type: "string",
                        default: "",
                        description: "Required when filetype is 'image' or 'video'. specifies the exact mime type to use (e.g., 'image/png', 'image/jpeg', 'video/mp4', 'video/webm')."
                    },
                    {
                        displayName: "Task Type",
                        name: "taskType",
                        type: "options",
                        default: "memory",
                        description: "Task type: \"memory\" (default) for full context layer with superrag built in, \"superrag\" for managed rag as a service",
                        placeholder: "e.g. memory",
                        options: [
                            {
                                name: "Memory",
                                value: "memory"
                            },
                            {
                                name: "Superrag",
                                value: "superrag"
                            }
                        ]
                    },
                    {
                        displayName: "Use Advanced Processing",
                        name: "useAdvancedProcessing",
                        type: "string",
                        default: "",
                        description: "Deprecated: this field is no longer used. advanced pdf processing is now automatic with our hybrid mistral ocr + gemini pipeline. this parameter will be accepted but ignored for backwards compatibility.",
                        placeholder: "e.g. true"
                    }
                ]
            },
            {
                displayName: "Conversation ID",
                name: "conversationId",
                type: "string",
                default: "",
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV4Conversations"
                        ]
                    }
                }
            },
            {
                displayName: "Messages",
                name: "messages",
                type: "json",
                default: [],
                required: true,
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV4Conversations"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "ingest"
                        ],
                        operation: [
                            "postV4Conversations"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: []
                    },
                    {
                        displayName: "Metadata",
                        name: "metadata",
                        type: "json",
                        default: {}
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "profiles"
                        ]
                    }
                },
                default: "postV4Profile",
                options: [
                    {
                        name: "Get",
                        value: "postV4Profile",
                        action: "Get profile",
                        description: "Retrieves static and dynamic contextual profile facts for a specific container tag"
                    },
                    {
                        name: "Get Profile Buckets",
                        value: "postV4ProfileBuckets",
                        action: "Get profile buckets",
                        description: "Retrieves effective profile category bucket definitions for a given container tag"
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "Tag to filter the profile by. this can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.",
                hint: "Expected format: ^[a-zA-Z0-9_:-]+$",
                displayOptions: {
                    show: {
                        resource: [
                            "profiles"
                        ],
                        operation: [
                            "postV4Profile"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "profiles"
                        ],
                        operation: [
                            "postV4Profile"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Buckets",
                        name: "buckets",
                        type: "json",
                        default: [],
                        description: "Specific bucket keys to return. omit to return all configured buckets. only relevant when \"buckets\" is included."
                    },
                    {
                        displayName: "Filters",
                        name: "filters",
                        type: "string",
                        default: "",
                        description: "Optional metadata filters to apply to profile results and search results. supports complex and/or queries with multiple conditions."
                    },
                    {
                        displayName: "Include",
                        name: "include",
                        type: "json",
                        default: [],
                        description: "Profile sections to return. omit to return all sections. pass a subset to reduce payload \u2014 e.g. [\"buckets\"] skips static and dynamic entirely."
                    },
                    {
                        displayName: "Q",
                        name: "q",
                        type: "string",
                        default: "",
                        description: "Optional search query to include search results in the response"
                    },
                    {
                        displayName: "Threshold",
                        name: "threshold",
                        type: "number",
                        default: 0,
                        description: "Threshold for search results. only results with a score above this threshold will be included.",
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1
                        }
                    }
                ]
            },
            {
                displayName: "Container Tag",
                name: "containerTag",
                type: "string",
                default: "",
                required: true,
                description: "Tag to resolve effective bucket definitions for. can be a user ID, project ID, or any identifier used to scope memories.",
                displayOptions: {
                    show: {
                        resource: [
                            "profiles"
                        ],
                        operation: [
                            "postV4ProfileBuckets"
                        ]
                    }
                }
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "recallSearch"
                        ]
                    }
                },
                default: "postV4Search",
                options: [
                    {
                        name: "Search Memories",
                        value: "postV4Search",
                        action: "Search memories recall search",
                        description: "Performs low-latency semantic and hybrid search across memories and document chunks. recall & search."
                    }
                ]
            },
            {
                displayName: "Q",
                name: "q",
                type: "string",
                default: "",
                required: true,
                description: "Search query string",
                placeholder: "e.g. what are the API rate limits",
                displayOptions: {
                    show: {
                        resource: [
                            "recallSearch"
                        ],
                        operation: [
                            "postV4Search"
                        ]
                    }
                }
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "recallSearch"
                        ],
                        operation: [
                            "postV4Search"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Aggregate",
                        name: "aggregate",
                        type: "boolean",
                        default: false,
                        description: "Whether true, aggregates information from multiple memories to create new synthesized memories. the result will be a mix of aggregated and non-aggregated memories, reranked by relevance to the query. works in conjunction with reranking.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Container Tag",
                        name: "containerTag",
                        type: "string",
                        default: "",
                        description: "Optional tag this search should be containerized by. this can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.",
                        placeholder: "e.g. user_alex",
                        hint: "Expected format: ^[a-zA-Z0-9_:-]+$"
                    },
                    {
                        displayName: "Container Tags",
                        name: "containerTags",
                        type: "json",
                        default: [],
                        description: "Optional tags this search should be containerized by. search is scoped to memories under these tags.",
                        placeholder: "e.g. user_alex"
                    },
                    {
                        displayName: "Filepath",
                        name: "filepath",
                        type: "string",
                        default: "",
                        description: "Filter search results by filepath. exact match for full paths, prefix match if ending with /."
                    },
                    {
                        displayName: "Filters",
                        name: "filters",
                        type: "string",
                        default: "",
                        description: "Optional filters to apply to the search. can be a JSON string or query object."
                    },
                    {
                        displayName: "Include",
                        name: "include",
                        type: "json",
                        default: {}
                    },
                    {
                        displayName: "Limit",
                        name: "limit",
                        type: "number",
                        default: 50,
                        description: "Max number of results to return",
                        placeholder: "e.g. 10",
                        typeOptions: {
                            minValue: 1
                        }
                    },
                    {
                        displayName: "Rerank",
                        name: "rerank",
                        type: "boolean",
                        default: false,
                        description: "Whether true, rerank the results based on the query. this is helpful if you want to ensure the most relevant results are returned.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Rewrite Query",
                        name: "rewriteQuery",
                        type: "boolean",
                        default: false,
                        description: "Whether true, rewrites the query to make it easier to find documents. this increases the latency by about 400ms.",
                        placeholder: "e.g. false"
                    },
                    {
                        displayName: "Search Mode",
                        name: "searchMode",
                        type: "options",
                        default: "memories",
                        description: "Search mode. 'memories' searches only memory entries (default). 'hybrid' searches both memories and document chunks. 'documents' searches only document chunks.",
                        placeholder: "e.g. memories",
                        options: [
                            {
                                name: "Documents",
                                value: "documents"
                            },
                            {
                                name: "Hybrid",
                                value: "hybrid"
                            },
                            {
                                name: "Memories",
                                value: "memories"
                            }
                        ]
                    },
                    {
                        displayName: "Threshold",
                        name: "threshold",
                        type: "number",
                        default: 0.6,
                        description: "Threshold / sensitivity for memories selection. 0 is least sensitive (returns most memories, more results), 1 is most sensitive (returns lesser memories, accurate results).",
                        placeholder: "e.g. 0.5",
                        typeOptions: {
                            minValue: 0,
                            maxValue: 1
                        }
                    }
                ]
            },
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: [
                            "settings"
                        ]
                    }
                },
                default: "getV3Settings",
                options: [
                    {
                        name: "Get",
                        value: "getV3Settings",
                        action: "Get settings",
                        description: "Get settings for an organization"
                    },
                    {
                        name: "Update",
                        value: "patchV3Settings",
                        action: "Update settings",
                        description: "Update settings for an organization"
                    }
                ]
            },
            {
                displayName: "Output",
                name: "outputMode",
                type: "options",
                default: "simplified",
                description: "Choose whether to return useful fields, the raw response, or selected fields",
                displayOptions: {
                    show: {
                        resource: [
                            "settings"
                        ],
                        operation: [
                            "getV3Settings"
                        ]
                    }
                },
                options: [
                    {
                        name: "Raw",
                        value: "raw",
                        description: "Return the complete API response"
                    },
                    {
                        name: "Selected Fields",
                        value: "selected",
                        description: "Return only selected fields"
                    },
                    {
                        name: "Simplified",
                        value: "simplified",
                        description: "Return up to 10 useful fields"
                    }
                ]
            },
            {
                displayName: "Fields to Include",
                name: "selectedFields",
                type: "multiOptions",
                default: [
                    "chunkSize",
                    "excludeItems",
                    "filterPrompt",
                    "githubClientId",
                    "githubClientSecret",
                    "githubCustomKeyEnabled",
                    "googleDriveClientId",
                    "googleDriveClientSecret",
                    "googleDriveCustomKeyEnabled",
                    "includeItems"
                ],
                displayOptions: {
                    show: {
                        resource: [
                            "settings"
                        ],
                        operation: [
                            "getV3Settings"
                        ],
                        outputMode: [
                            "selected"
                        ]
                    }
                },
                options: [
                    {
                        name: "ChunkSize",
                        value: "chunkSize"
                    },
                    {
                        name: "ExcludeItems",
                        value: "excludeItems"
                    },
                    {
                        name: "FilterPrompt",
                        value: "filterPrompt"
                    },
                    {
                        name: "GithubClientId",
                        value: "githubClientId"
                    },
                    {
                        name: "GithubClientSecret",
                        value: "githubClientSecret"
                    },
                    {
                        name: "GithubCustomKeyEnabled",
                        value: "githubCustomKeyEnabled"
                    },
                    {
                        name: "GoogleDriveClientId",
                        value: "googleDriveClientId"
                    },
                    {
                        name: "GoogleDriveClientSecret",
                        value: "googleDriveClientSecret"
                    },
                    {
                        name: "GoogleDriveCustomKeyEnabled",
                        value: "googleDriveCustomKeyEnabled"
                    },
                    {
                        name: "IncludeItems",
                        value: "includeItems"
                    },
                    {
                        name: "NotionClientId",
                        value: "notionClientId"
                    },
                    {
                        name: "NotionClientSecret",
                        value: "notionClientSecret"
                    },
                    {
                        name: "NotionCustomKeyEnabled",
                        value: "notionCustomKeyEnabled"
                    },
                    {
                        name: "OnedriveClientId",
                        value: "onedriveClientId"
                    },
                    {
                        name: "OnedriveClientSecret",
                        value: "onedriveClientSecret"
                    },
                    {
                        name: "OnedriveCustomKeyEnabled",
                        value: "onedriveCustomKeyEnabled"
                    },
                    {
                        name: "ProfileBuckets",
                        value: "profileBuckets"
                    },
                    {
                        name: "ShouldLLMFilter",
                        value: "shouldLLMFilter"
                    }
                ]
            },
            {
                displayName: "Additional Fields",
                name: "additionalFields",
                type: "collection",
                placeholder: "Add Field",
                default: {},
                displayOptions: {
                    show: {
                        resource: [
                            "settings"
                        ],
                        operation: [
                            "patchV3Settings"
                        ]
                    }
                },
                options: [
                    {
                        displayName: "Chunk Size",
                        name: "chunkSize",
                        type: "number",
                        default: 0,
                        typeOptions: {
                            minValue: -2147483648,
                            maxValue: 2147483647
                        }
                    },
                    {
                        displayName: "Exclude Items",
                        name: "excludeItems",
                        type: "json",
                        default: {
                            schemaAlternative: "",
                            value: ""
                        }
                    },
                    {
                        displayName: "Filter Prompt",
                        name: "filterPrompt",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Github Client ID",
                        name: "githubClientId",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Github Client Secret",
                        name: "githubClientSecret",
                        type: "string",
                        default: "",
                        typeOptions: {
                            password: true
                        }
                    },
                    {
                        displayName: "Github Custom Key Enabled",
                        name: "githubCustomKeyEnabled",
                        type: "boolean",
                        default: false,
                        description: "Whether to enable github custom key enabled"
                    },
                    {
                        displayName: "Google Drive Client ID",
                        name: "googleDriveClientId",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Google Drive Client Secret",
                        name: "googleDriveClientSecret",
                        type: "string",
                        default: "",
                        typeOptions: {
                            password: true
                        }
                    },
                    {
                        displayName: "Google Drive Custom Key Enabled",
                        name: "googleDriveCustomKeyEnabled",
                        type: "boolean",
                        default: false,
                        description: "Whether to enable google drive custom key enabled"
                    },
                    {
                        displayName: "Include Items",
                        name: "includeItems",
                        type: "json",
                        default: {
                            schemaAlternative: "",
                            value: ""
                        }
                    },
                    {
                        displayName: "Notion Client ID",
                        name: "notionClientId",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Notion Client Secret",
                        name: "notionClientSecret",
                        type: "string",
                        default: "",
                        typeOptions: {
                            password: true
                        }
                    },
                    {
                        displayName: "Notion Custom Key Enabled",
                        name: "notionCustomKeyEnabled",
                        type: "boolean",
                        default: false,
                        description: "Whether to enable notion custom key enabled"
                    },
                    {
                        displayName: "Onedrive Client ID",
                        name: "onedriveClientId",
                        type: "string",
                        default: ""
                    },
                    {
                        displayName: "Onedrive Client Secret",
                        name: "onedriveClientSecret",
                        type: "string",
                        default: "",
                        typeOptions: {
                            password: true
                        }
                    },
                    {
                        displayName: "Onedrive Custom Key Enabled",
                        name: "onedriveCustomKeyEnabled",
                        type: "boolean",
                        default: false,
                        description: "Whether to enable onedrive custom key enabled"
                    },
                    {
                        displayName: "Profile Buckets",
                        name: "profileBuckets",
                        type: "json",
                        default: [],
                        description: "Profile bucket definitions"
                    },
                    {
                        displayName: "Should L L M Filter",
                        name: "shouldLLMFilter",
                        type: "boolean",
                        default: false,
                        description: "Whether to enable should l l m filter"
                    }
                ]
            }
        ]
    };

  public async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const output: INodeExecutionData[] = [];
    for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex += 1) {
      const outputStart = output.length;
      let errorPlan: Record<string, { title: string; recovery?: string; parameter?: string }> = {};
      try {
        const operation = this.getNodeParameter('operation', itemIndex) as string;
        const nodeVersion = this.getNode().typeVersion;
        let additionalFields: IDataObject = {};
        const nodeOptions = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
        
        let retryContract: RetryContract = { mode: 'none', maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0 };
        let credentialApplications: CredentialApplication[] | undefined;
        let options: IHttpRequestOptions;
        let pagination: PaginationContract = { style: 'none', advancement: '', maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10 * 1024 * 1024, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        let responsePlan: { binary: boolean; full: boolean; envelopePath: string; itemPath: string; fields: string[]; simplified: string[] } = { binary: false, full: false, envelopePath: "", itemPath: "", fields: [], simplified: [] };
        switch (operation) {
          case "deleteV3ConnectionsByConnectionId": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/connections/{connectionId}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{connectionId}").join(encodeURIComponent(String(this.getNodeParameter("connectionId", itemIndex))));
    if (additionalFields["deleteDocuments"] !== undefined) qs["deleteDocuments"] = additionalFields["deleteDocuments"];
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","provider"], simplified: ["id","provider"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Connection not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "deleteV3ConnectionsByProvider": {
        
        
        let path = "/v3/connections/{provider}";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{provider}").join(encodeURIComponent(String(this.getNodeParameter("provider", itemIndex))));
        setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","required":true,"description":"Optional comma-separated list of container tags to filter connections by","example":["user_123","project_123"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, this.getNodeParameter("containerTags", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","provider"], simplified: ["id","provider"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Provider not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3ConnectionsByConnectionId": {
        
        
        let path = "/v3/connections/{connectionId}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{connectionId}").join(encodeURIComponent(String(this.getNodeParameter("connectionId", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"], simplified: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Connection not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3ConnectionsByConnectionIdResources": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/connections/{connectionId}/resources";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{connectionId}").join(encodeURIComponent(String(this.getNodeParameter("connectionId", itemIndex))));
    if (additionalFields["page"] !== undefined) qs["page"] = additionalFields["page"];
    if (additionalFields["parent_id"] !== undefined) qs["parent_id"] = additionalFields["parent_id"];
    if (additionalFields["per_page"] !== undefined) qs["per_page"] = additionalFields["per_page"];
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["resources","total_count"], simplified: ["resources","total_count"] };
        errorPlan = {"400":{"title":"Connection missing refresh token"},"401":{"title":"Unauthorized"},"404":{"title":"Connection not found"},"501":{"title":"Provider does not support resource fetching"}};
        break;
      }
    case "postV3ConnectionsByConnectionIdConfigure": {
        
        
        let path = "/v3/connections/{connectionId}/configure";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{connectionId}").join(encodeURIComponent(String(this.getNodeParameter("connectionId", itemIndex))));
        setBodyField(body as IDataObject, {"name":"resources","displayName":"Resources","type":"array","required":true,"items":{"name":"item","displayName":"Item","type":"object","additionalValue":{"name":"value","displayName":"Value","type":"string"},"representation":"raw"},"representation":"raw"}, this.getNodeParameter("resources", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["message","success","webhooksRegistered"], simplified: ["message","success","webhooksRegistered"] };
        errorPlan = {"400":{"title":"Connection missing refresh token"},"401":{"title":"Unauthorized"},"404":{"title":"Connection not found"},"501":{"title":"Provider does not support resource configuration"}};
        break;
      }
    case "postV3ConnectionsByProvider": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/connections/{provider}";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{provider}").join(encodeURIComponent(String(this.getNodeParameter("provider", itemIndex))));
        if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["documentLimit"] !== undefined) setBodyField(body as IDataObject, {"name":"documentLimit","displayName":"Document Limit","type":"integer","minValue":1,"maxValue":10000}, additionalFields["documentLimit"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw","nullable":true}, additionalFields["metadata"], this, itemIndex);
    if (additionalFields["redirectUrl"] !== undefined) setBodyField(body as IDataObject, {"name":"redirectUrl","displayName":"Redirect Url","type":"string"}, additionalFields["redirectUrl"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["authLink","expiresIn","id","redirectsTo"], simplified: ["authLink","expiresIn","id","redirectsTo"] };
        errorPlan = {"401":{"title":"Unauthorized"}};
        break;
      }
    case "postV3ConnectionsByProviderConnection": {
        
        
        let path = "/v3/connections/{provider}/connection";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{provider}").join(encodeURIComponent(String(this.getNodeParameter("provider", itemIndex))));
        setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","required":true,"description":"Comma-separated list of container tags to filter connection by","example":["user_123","project_123"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, this.getNodeParameter("containerTags", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"], simplified: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Connection not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3ConnectionsByProviderDocuments": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/connections/{provider}/documents";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{provider}").join(encodeURIComponent(String(this.getNodeParameter("provider", itemIndex))));
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional comma-separated list of container tags to filter documents by","example":["user_123","project_123"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["createdAt","id","status","summary","title","type","updatedAt"], simplified: ["createdAt","id","status","summary","title","type","updatedAt"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Provider not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3ConnectionsByProviderImport": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/connections/{provider}/import";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{provider}").join(encodeURIComponent(String(this.getNodeParameter("provider", itemIndex))));
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional comma-separated list of container tags to filter connections by","example":["user_123","project_123"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: [], simplified: [] };
        errorPlan = {"400":{"title":"Bad request"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3ConnectionsList": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/connections/list";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional comma-separated list of container tags to filter documents by","example":["user_123","project_123"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"], simplified: ["containerTags","createdAt","documentLimit","email","expiresAt","id","lastSyncRun","metadata","provider"] };
        errorPlan = {"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "deleteV3ContainerTagsByContainerTag": {
        
        
        let path = "/v3/container-tags/{containerTag}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{containerTag}").join(encodeURIComponent(String(this.getNodeParameter("containerTag", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTag","deletedDocumentsCount","deletedMemoriesCount","success"], simplified: ["containerTag","deletedDocumentsCount","deletedMemoriesCount","success"] };
        errorPlan = {"401":{"title":"Unauthorized"},"403":{"title":"Forbidden - only owners and admins can delete container tags"},"404":{"title":"Container tag not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3ContainerTagsByContainerTag": {
        
        
        let path = "/v3/container-tags/{containerTag}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{containerTag}").join(encodeURIComponent(String(this.getNodeParameter("containerTag", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTag","createdAt","entityContext","memoryFilesystemPaths","name","profileBuckets","updatedAt"], simplified: ["containerTag","createdAt","entityContext","memoryFilesystemPaths","name","profileBuckets","updatedAt"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Container tag not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3ContainerTagsList": {
        
        
        const path = "/v3/container-tags/list";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTag","createdAt","description","documentCount","emoji","id","isExperimental","isNova","lastActivityAt","memoryCount","mergeId","mergeStatus","mergeTargetTag","name","updatedAt","visibility"], simplified: ["id","name","description","createdAt","updatedAt","containerTag","documentCount","emoji","isExperimental","isNova"] };
        errorPlan = {"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3ContainerTagsMergeByMergeId": {
        
        
        let path = "/v3/container-tags/merge/{mergeId}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{mergeId}").join(encodeURIComponent(String(this.getNodeParameter("mergeId", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","lastError","progress","sourceTags","status","targetTag"], simplified: ["id","lastError","progress","sourceTags","status","targetTag"] };
        errorPlan = {"404":{"title":"Merge job not found"}};
        break;
      }
    case "patchV3ContainerTagsByContainerTag": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/container-tags/{containerTag}";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{containerTag}").join(encodeURIComponent(String(this.getNodeParameter("containerTag", itemIndex))));
        if (additionalFields["entityContext"] !== undefined) setBodyField(body as IDataObject, {"name":"entityContext","displayName":"Entity Context","type":"string","description":"Custom context prompt for this container tag. Used to provide additional context when processing documents in this container. Maximum 1500 characters.","example":"This project contains research papers about machine learning.","nullable":true}, additionalFields["entityContext"], this, itemIndex);
    if (additionalFields["memoryFilesystemPaths"] !== undefined) setBodyField(body as IDataObject, {"name":"memoryFilesystemPaths","displayName":"Memory Filesystem Paths","type":"array","description":"Per-tag allowlist of filesystem paths that trigger memory generation for mount-ingested documents. Docs whose filepath does not match are ingested as 'superrag' (chunked and searchable, no memory extraction).","example":["/memory/","/user.md"],"items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw","nullable":true}, additionalFields["memoryFilesystemPaths"], this, itemIndex);
    if (additionalFields["name"] !== undefined) setBodyField(body as IDataObject, {"name":"name","displayName":"Name","type":"string","description":"Display name for this container tag. This does not change the container tag identifier.","example":"Research Notes"}, additionalFields["name"], this, itemIndex);
    if (additionalFields["profileBuckets"] !== undefined) setBodyField(body as IDataObject, {"name":"profileBuckets","displayName":"Profile Buckets","type":"array","description":"Container-tag-level buckets to set (add-only on top of org buckets). Replaces this tag's own bucket list; cannot override or remove org buckets.","items":{"name":"item","displayName":"Item","type":"object","description":"Definition of a single profile bucket","fields":[{"name":"description","displayName":"Description","type":"string","description":"What belongs in this bucket — used to guide the ingestion classifier.","default":""},{"name":"key","displayName":"Key","type":"string","required":true,"description":"Stable slug for the bucket, stored on each memory","pattern":"^[a-z0-9][a-z0-9_-]*$"}],"representation":"raw"},"representation":"raw"}, additionalFields["profileBuckets"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "PATCH" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTag","entityContext","memoryFilesystemPaths","name","profileBuckets","updatedAt"], simplified: ["containerTag","entityContext","memoryFilesystemPaths","name","profileBuckets","updatedAt"] };
        errorPlan = {"400":{"title":"Bad request"},"401":{"title":"Unauthorized"},"404":{"title":"Container tag not found"}};
        break;
      }
    case "postV3ContainerTagsMerge": {
        
        
        const path = "/v3/container-tags/merge";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","required":true,"description":"List of container tags to merge (min: 2, max: 2). All documents from these tags will be merged into the target.","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, this.getNodeParameter("containerTags", itemIndex), this, itemIndex);
    setBodyField(body as IDataObject, {"name":"targetContainerTag","displayName":"Target Container Tag","type":"string","required":true}, this.getNodeParameter("targetContainerTag", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["mergeId","sourceTags","status","success","targetTag"], simplified: ["mergeId","sourceTags","status","success","targetTag"] };
        errorPlan = {"400":{"title":"Bad request (e.g., invalid parameters)"},"401":{"title":"Unauthorized"},"403":{"title":"Forbidden - Only organization admins and owners can merge container tags"},"404":{"title":"One or more container tags not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "deleteV4Memories": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/memories";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"Container tag / space identifier. Required to scope the operation.","example":"user_123","pattern":"^[a-zA-Z0-9_:-]+$"}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
    if (additionalFields["content"] !== undefined) setBodyField(body as IDataObject, {"name":"content","displayName":"Content","type":"string","description":"Exact content match of the memory entry to operate on. Use this when you don't have the ID.","example":"John prefers dark mode"}, additionalFields["content"], this, itemIndex);
    if (additionalFields["id"] !== undefined) setBodyField(body as IDataObject, {"name":"id","displayName":"Id","type":"string","description":"ID of the memory entry to operate on","example":"mem_abc123"}, additionalFields["id"], this, itemIndex);
    if (additionalFields["reason"] !== undefined) setBodyField(body as IDataObject, {"name":"reason","displayName":"Reason","type":"string","description":"Optional reason for forgetting this memory","example":"outdated information"}, additionalFields["reason"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["forgotten","id"], simplified: ["forgotten","id"] };
        errorPlan = {"400":{"title":"Invalid request - missing id or content"},"401":{"title":"Unauthorized"},"404":{"title":"Memory not found"},"409":{"title":"Memory already forgotten"},"500":{"title":"Server error"}};
        break;
      }
    case "patchV4Memories": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/memories";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"Container tag / space identifier. Required to scope the operation.","example":"user_123","pattern":"^[a-zA-Z0-9_:-]+$"}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
    if (additionalFields["content"] !== undefined) setBodyField(body as IDataObject, {"name":"content","displayName":"Content","type":"string","description":"Exact content match of the memory entry to operate on. Use this when you don't have the ID.","example":"John prefers dark mode"}, additionalFields["content"], this, itemIndex);
    if (additionalFields["forgetAfter"] !== undefined) setBodyField(body as IDataObject, {"name":"forgetAfter","displayName":"Forget After","type":"string","description":"ISO 8601 datetime string. The memory will be auto-forgotten after this time. Pass null to clear an existing expiry. Omit to inherit from the previous version.","example":"2026-06-01T00:00:00Z","nullable":true}, additionalFields["forgetAfter"], this, itemIndex);
    if (additionalFields["forgetReason"] !== undefined) setBodyField(body as IDataObject, {"name":"forgetReason","displayName":"Forget Reason","type":"string","description":"Optional reason for the scheduled forgetting. Cleared automatically when forgetAfter is set to null.","example":"temporary project deadline","nullable":true}, additionalFields["forgetReason"], this, itemIndex);
    if (additionalFields["id"] !== undefined) setBodyField(body as IDataObject, {"name":"id","displayName":"Id","type":"string","description":"ID of the memory entry to operate on","example":"mem_abc123"}, additionalFields["id"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","description":"Optional metadata. If not provided, inherits from the previous version.","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["metadata"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"newContent","displayName":"New Content","type":"string","required":true,"description":"The new content that will replace the existing memory","example":"John now prefers light mode"}, this.getNodeParameter("newContent", itemIndex), this, itemIndex);
    if (additionalFields["temporalContext"] !== undefined) setBodyField(body as IDataObject, {"name":"temporalContext","displayName":"Temporal Context","type":"object","description":"Structured temporal metadata. Merged into the metadata JSON column. If omitted, existing temporalContext is preserved.","fields":[{"name":"documentDate","displayName":"Document Date","type":"string","description":"Date the document was authored","nullable":true},{"name":"eventDate","displayName":"Event Date","type":"array","description":"Dates of events referenced in the memory","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw","nullable":true}],"representation":"raw"}, additionalFields["temporalContext"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "PATCH" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["createdAt","forgetAfter","forgetReason","id","memory","metadata","parentMemoryId","rootMemoryId","version"], simplified: ["createdAt","forgetAfter","forgetReason","id","memory","metadata","parentMemoryId","rootMemoryId","version"] };
        errorPlan = {"400":{"title":"Invalid request - missing required fields"},"401":{"title":"Unauthorized"},"404":{"title":"Memory not found"},"500":{"title":"Server error"}};
        break;
      }
    case "postV4Memories": {
        
        
        const path = "/v4/memories";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"The space / container tag these memories belong to.","example":"user_123","pattern":"^[a-zA-Z0-9_:-]+$"}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
    setBodyField(body as IDataObject, {"name":"memories","displayName":"Memories","type":"array","required":true,"description":"Array of memories to create","items":{"name":"item","displayName":"Item","type":"object","fields":[{"name":"content","displayName":"Content","type":"string","required":true,"description":"The memory text. Should be entity-centric, e.g. 'John prefers dark mode'.","example":"John prefers dark mode"},{"name":"forgetAfter","displayName":"Forget After","type":"string","description":"ISO 8601 datetime string. The memory will be auto-forgotten after this time. Pass null or omit for no expiry.","example":"2026-06-01T00:00:00Z","nullable":true},{"name":"forgetReason","displayName":"Forget Reason","type":"string","description":"Optional reason for the scheduled forgetting. Only meaningful when forgetAfter is set.","example":"temporary project deadline","nullable":true},{"name":"isStatic","displayName":"Is Static","type":"boolean","description":"Mark as true for permanent traits (name, profession, hometown). Defaults to false.","example":false},{"name":"metadata","displayName":"Metadata","type":"object","description":"Arbitrary key-value metadata to attach.","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"},{"name":"temporalContext","displayName":"Temporal Context","type":"object","description":"Structured temporal metadata. Merged into the metadata JSON column.","fields":[{"name":"documentDate","displayName":"Document Date","type":"string","description":"Date the document was authored","nullable":true},{"name":"eventDate","displayName":"Event Date","type":"array","description":"Dates of events referenced in the memory","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw","nullable":true}],"representation":"raw"}],"representation":"raw"},"representation":"raw"}, this.getNodeParameter("memories", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["documentId","memories"], simplified: ["documentId","memories"] };
        errorPlan = {"400":{"title":"Invalid request"},"401":{"title":"Unauthorized"},"404":{"title":"Space not found for the given containerTag"},"500":{"title":"Server error"}};
        break;
      }
    case "postV4MemoriesForgetMatching": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/memories/forget-matching";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"Container tag / space the forget operation is scoped to.","example":"user_123","pattern":"^[a-zA-Z0-9_:-]+$"}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
    if (additionalFields["dryRun"] !== undefined) setBodyField(body as IDataObject, {"name":"dryRun","displayName":"Dry Run","type":"boolean","description":"When true, returns the memories that WOULD be forgotten without mutating anything. Defaults to false (forgets for real).","default":false,"example":false}, additionalFields["dryRun"], this, itemIndex);
    if (additionalFields["ids"] !== undefined) setBodyField(body as IDataObject, {"name":"ids","displayName":"Ids","type":"array","description":"Forget exactly these memory ids, with no semantic search. Ids are validated against the containerTag, so unknown or out-of-scope ids are ignored. Provide either query or ids.","example":["abc123","def456"],"items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, additionalFields["ids"], this, itemIndex);
    if (additionalFields["maxForget"] !== undefined) setBodyField(body as IDataObject, {"name":"maxForget","displayName":"Max Forget","type":"integer","minValue":1,"maxValue":500,"description":"Maximum number of memories this call may forget. Defaults to 100, max 500.","default":100,"example":100}, additionalFields["maxForget"], this, itemIndex);
    if (additionalFields["query"] !== undefined) setBodyField(body as IDataObject, {"name":"query","displayName":"Query","type":"string","description":"Natural-language instruction ('forget everything about Project Titan') or a bare topic ('Project Titan'). The service searches the container's memories and selects matches to forget. Provide either query or ids.","example":"forget everything about Project Titan"}, additionalFields["query"], this, itemIndex);
    if (additionalFields["reason"] !== undefined) setBodyField(body as IDataObject, {"name":"reason","displayName":"Reason","type":"string","description":"Optional reason stored as forgetReason on each memory.","example":"project cancelled"}, additionalFields["reason"], this, itemIndex);
    if (additionalFields["threshold"] !== undefined) setBodyField(body as IDataObject, {"name":"threshold","displayName":"Threshold","type":"number","minValue":0,"maxValue":1,"description":"Minimum cosine similarity a memory must have to be considered. Lower = wider net. Defaults to 0.5.","default":0.5,"example":0.5}, additionalFields["threshold"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["candidates","count","dryRun","forgetBatchId","forgotten","summary"], simplified: ["candidates","count","dryRun","forgetBatchId","forgotten","summary"] };
        errorPlan = {"400":{"title":"Invalid request"},"401":{"title":"Unauthorized"},"500":{"title":"Server error"}};
        break;
      }
    case "postV4MemoriesList": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/memories/list";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","required":true,"description":"Container tags to filter memory entries. At least one tag is required.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, this.getNodeParameter("containerTags", itemIndex), this, itemIndex);
    if (additionalFields["filters"] !== undefined) setBodyField(body as IDataObject, {"name":"filters","displayName":"Filters","type":"any","description":"Optional filters to apply to the search. Can be a JSON string or Query object."}, additionalFields["filters"], this, itemIndex);
    if (additionalFields["limit"] !== undefined) setBodyField(body as IDataObject, {"name":"limit","displayName":"Limit","type":"alternative","description":"Number of items per page","example":"10","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string","pattern":"^\\d+$"},{"name":"alternative2","displayName":"Alternative2","type":"number"}],"composition":"anyOf","representation":"raw"}, additionalFields["limit"], this, itemIndex);
    if (additionalFields["order"] !== undefined) setBodyField(body as IDataObject, {"name":"order","displayName":"Order","type":"string","description":"Sort order","enum":["asc","desc"],"default":"desc","example":"desc"}, additionalFields["order"], this, itemIndex);
    if (additionalFields["page"] !== undefined) setBodyField(body as IDataObject, {"name":"page","displayName":"Page","type":"alternative","description":"Page number to fetch","example":"1","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string","pattern":"^\\d+$"},{"name":"alternative2","displayName":"Alternative2","type":"number"}],"composition":"anyOf","representation":"raw"}, additionalFields["page"], this, itemIndex);
    if (additionalFields["sort"] !== undefined) setBodyField(body as IDataObject, {"name":"sort","displayName":"Sort","type":"string","description":"Field to sort by","enum":["createdAt","updatedAt"],"default":"createdAt","example":"createdAt"}, additionalFields["sort"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["memoryEntries","pagination"], simplified: ["memoryEntries","pagination"] };
        errorPlan = {"400":{"title":"Bad request - containerTags are required"},"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3DocumentsById": {
        
        
        let path = "/v3/documents/{id}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{id}").join(encodeURIComponent(String(this.getNodeParameter("id", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["activeContentUpdateId","connectionId","containerTags","content","createdAt","customId","dreamingStatus","filepath","id","latestRevision","memories","metadata","ogImage","raw","source","status","summary","taskType","title","tombstonedAt","type","updatedAt","url"], simplified: ["id","title","status","type","createdAt","updatedAt","activeContentUpdateId","connectionId","content","customId"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Document not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3DocumentsByIdChunks": {
        
        
        let path = "/v3/documents/{id}/chunks";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{id}").join(encodeURIComponent(String(this.getNodeParameter("id", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["chunks","documentId","total"], simplified: ["chunks","documentId","total"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Document not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "getV3DocumentsByIdFileUrl": {
        
        
        let path = "/v3/documents/{id}/file-url";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{id}").join(encodeURIComponent(String(this.getNodeParameter("id", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["url"], simplified: ["url"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Document not found or has no file"}};
        break;
      }
    case "getV3DocumentsProcessing": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents/processing";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        if (additionalFields["view"] !== undefined) qs["view"] = additionalFields["view"];
    if (additionalFields["containerTags"] !== undefined) qs["containerTags"] = additionalFields["containerTags"];
    if (additionalFields["page"] !== undefined) qs["page"] = additionalFields["page"];
    if (additionalFields["limit"] !== undefined) qs["limit"] = additionalFields["limit"];
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["documents","pagination","totalCount"], simplified: ["documents","pagination","totalCount"] };
        errorPlan = {"400":{"title":"Bad request"},"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3DocumentsList": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents/list";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional tags this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Filter documents by filepath. Exact match for full paths, prefix match if ending with /"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filters"] !== undefined) setBodyField(body as IDataObject, {"name":"filters","displayName":"Filters","type":"any","description":"Optional filters to apply to the search. Can be a JSON string or Query object."}, additionalFields["filters"], this, itemIndex);
    if (additionalFields["includeContent"] !== undefined) setBodyField(body as IDataObject, {"name":"includeContent","displayName":"Include Content","type":"boolean","description":"Whether to include the content field in the response. Warning: This can make responses significantly larger.","default":false,"example":false}, additionalFields["includeContent"], this, itemIndex);
    if (additionalFields["limit"] !== undefined) setBodyField(body as IDataObject, {"name":"limit","displayName":"Limit","type":"alternative","description":"Number of items per page","example":"10","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string","pattern":"^\\d+$"},{"name":"alternative2","displayName":"Alternative2","type":"number"}],"composition":"anyOf","representation":"raw"}, additionalFields["limit"], this, itemIndex);
    if (additionalFields["order"] !== undefined) setBodyField(body as IDataObject, {"name":"order","displayName":"Order","type":"string","description":"Sort order","enum":["asc","desc"],"default":"desc","example":"desc"}, additionalFields["order"], this, itemIndex);
    if (additionalFields["page"] !== undefined) setBodyField(body as IDataObject, {"name":"page","displayName":"Page","type":"alternative","description":"Page number to fetch","example":"1","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string","pattern":"^\\d+$"},{"name":"alternative2","displayName":"Alternative2","type":"number"}],"composition":"anyOf","representation":"raw"}, additionalFields["page"], this, itemIndex);
    if (additionalFields["sort"] !== undefined) setBodyField(body as IDataObject, {"name":"sort","displayName":"Sort","type":"string","description":"Field to sort by","enum":["createdAt","updatedAt"],"default":"createdAt","example":"createdAt"}, additionalFields["sort"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["memories","pagination"], simplified: ["memories","pagination"] };
        errorPlan = {"400":{"title":"Invalid request"},"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3Search": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/search";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["categoriesFilter"] !== undefined) setBodyField(body as IDataObject, {"name":"categoriesFilter","displayName":"Categories Filter","type":"array","description":"DEPRECATED: Optional category filters","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, additionalFields["categoriesFilter"], this, itemIndex);
    if (additionalFields["chunkThreshold"] !== undefined) setBodyField(body as IDataObject, {"name":"chunkThreshold","displayName":"Chunk Threshold","type":"number","minValue":0,"maxValue":1,"description":"Threshold / sensitivity for chunk selection. 0 is least sensitive (returns most chunks, more results), 1 is most sensitive (returns lesser chunks, accurate results)","default":0,"example":0.5}, additionalFields["chunkThreshold"], this, itemIndex);
    if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional single container tag. Use this or containerTags.","example":"user_alex","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional tags this search should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to filter documents.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["docId"] !== undefined) setBodyField(body as IDataObject, {"name":"docId","displayName":"Doc Id","type":"string","description":"Optional document ID to search within. You can use this to find chunks in a very large document."}, additionalFields["docId"], this, itemIndex);
    if (additionalFields["documentThreshold"] !== undefined) setBodyField(body as IDataObject, {"name":"documentThreshold","displayName":"Document Threshold","type":"number","minValue":0,"maxValue":1,"description":"DEPRECATED: This field is no longer used in v3 search. The search now uses chunkThreshold only. This parameter will be ignored.","default":0}, additionalFields["documentThreshold"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Filter search results by filepath. Exact match for full paths, prefix match if ending with /"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filters"] !== undefined) setBodyField(body as IDataObject, {"name":"filters","displayName":"Filters","type":"any","description":"Optional filters to apply to the search. Can be a JSON string or Query object."}, additionalFields["filters"], this, itemIndex);
    if (additionalFields["includeFullDocs"] !== undefined) setBodyField(body as IDataObject, {"name":"includeFullDocs","displayName":"Include Full Docs","type":"boolean","description":"If true, include full document in the response. This is helpful if you want a chatbot to know the full context of the document.","default":false,"example":false}, additionalFields["includeFullDocs"], this, itemIndex);
    if (additionalFields["includeSummary"] !== undefined) setBodyField(body as IDataObject, {"name":"includeSummary","displayName":"Include Summary","type":"boolean","description":"If true, include document summary in the response. This is helpful if you want a chatbot to know the full context of the document.","default":false}, additionalFields["includeSummary"], this, itemIndex);
    if (additionalFields["limit"] !== undefined) setBodyField(body as IDataObject, {"name":"limit","displayName":"Limit","type":"integer","minValue":1,"maxValue":100,"description":"Maximum number of results to return","default":10,"example":10}, additionalFields["limit"], this, itemIndex);
    if (additionalFields["onlyMatchingChunks"] !== undefined) setBodyField(body as IDataObject, {"name":"onlyMatchingChunks","displayName":"Only Matching Chunks","type":"boolean","description":"If true, only return matching chunks without context. Normally, we send the previous and next chunk to provide more context for LLMs. If you only want the matching chunk, set this to true.","default":true}, additionalFields["onlyMatchingChunks"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"q","displayName":"Q","type":"string","required":true,"description":"Search query string","example":"what are the API rate limits"}, this.getNodeParameter("q", itemIndex), this, itemIndex);
    if (additionalFields["rerank"] !== undefined) setBodyField(body as IDataObject, {"name":"rerank","displayName":"Rerank","type":"boolean","description":"If true, rerank the results based on the query. This is helpful if you want to ensure the most relevant results are returned.","default":false,"example":false}, additionalFields["rerank"], this, itemIndex);
    if (additionalFields["rewriteQuery"] !== undefined) setBodyField(body as IDataObject, {"name":"rewriteQuery","displayName":"Rewrite Query","type":"boolean","description":"If true, rewrites the query to make it easier to find documents. This increases the latency by about 400ms","default":false,"example":false}, additionalFields["rewriteQuery"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["results","timing","total"], simplified: ["results","timing","total"] };
        errorPlan = {"400":{"title":"Invalid request parameters"},"401":{"title":"Unauthorized"},"402":{"title":"Search quota or credits exhausted"},"404":{"title":"Document not found"},"500":{"title":"Server error"}};
        break;
      }
    case "deleteV3DocumentsBulk": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents/bulk";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Array of container tags - all documents in these containers will be deleted","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Delete documents matching this filepath. Exact match for full paths, prefix match if ending with /"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["ids"] !== undefined) setBodyField(body as IDataObject, {"name":"ids","displayName":"Ids","type":"array","description":"Array of document IDs to delete (max 100 at once)","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, additionalFields["ids"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["containerTags","deletedCount","errors","success"], simplified: ["containerTags","deletedCount","errors","success"] };
        errorPlan = {"400":{"title":"Bad request - either 'ids' or 'containerTags' must be provided"},"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "deleteV3DocumentsById": {
        
        
        let path = "/v3/documents/{id}";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{id}").join(encodeURIComponent(String(this.getNodeParameter("id", itemIndex))));
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "DELETE" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: [], simplified: [] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Document not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "patchV3DocumentsById": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        let path = "/v3/documents/{id}";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        path = path.split("{id}").join(encodeURIComponent(String(this.getNodeParameter("id", itemIndex))));
        if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional tag this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","example":"user_alex","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"(DEPRECATED: Use containerTag instead) Optional tags this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["content"] !== undefined) setBodyField(body as IDataObject, {"name":"content","displayName":"Content","type":"string","description":"The content to extract and process into a document. This can be a URL to a website, a PDF, an image, or a video. \n\nPlaintext: Any plaintext format\n\nURL: A URL to a website, PDF, image, or video\n\nWe automatically detect the content type from the url's response format.","example":"Our API rate limits are 100 req/min on free and 1000 on pro. Clients should use exponential backoff on 429s."}, additionalFields["content"], this, itemIndex);
    if (additionalFields["customId"] !== undefined) setBodyField(body as IDataObject, {"name":"customId","displayName":"Custom Id","type":"string","description":"Optional custom ID of the document. This could be an ID from your database that will uniquely identify this document.","example":"doc-api-rate-limits"}, additionalFields["customId"], this, itemIndex);
    if (additionalFields["documentDate"] !== undefined) setBodyField(body as IDataObject, {"name":"documentDate","displayName":"Document Date","type":"string","description":"When this document's content is from, as opposed to when it was uploaded. Accepts YYYY-MM-DD or a full ISO 8601 timestamp. Memory extraction resolves relative dates ('yesterday', 'last quarter') against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. Set this whenever you backfill historical content.","example":"2025-03-14"}, additionalFields["documentDate"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Optional file path for the document (e.g., '/documents/reports/file.pdf'). Used by supermemoryfs to map documents to filesystem paths.","example":"/documents/reports/file.pdf"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filterByMetadata"] !== undefined) setBodyField(body as IDataObject, {"name":"filterByMetadata","displayName":"Filter By Metadata","type":"object","description":"Optional metadata filter scoping which existing memories are pulled as context during ingestion. Scalar values match exactly (AND across keys); array values match ANY (OR within key). Only memories whose source documents match this filter are used as context.","example":{"department":"engineering","region":"us"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["filterByMetadata"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","description":"Optional metadata for the document. This is used to store additional information about the document. You can use this to store any additional information you need about the document. Metadata can be filtered through. Keys must be strings and are case sensitive. Values can be strings, numbers, or booleans. You cannot nest objects.","example":{"language":"en","source":"upload"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["metadata"], this, itemIndex);
    if (additionalFields["taskType"] !== undefined) setBodyField(body as IDataObject, {"name":"taskType","displayName":"Task Type","type":"string","description":"Task type: \"memory\" (default) for full context layer with SuperRAG built in, \"superrag\" for managed RAG as a service.","enum":["memory","superrag"],"example":"memory"}, additionalFields["taskType"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "PATCH" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","status"], simplified: ["id","status"] };
        errorPlan = {"401":{"title":"Unauthorized"},"404":{"title":"Document not found"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3Documents": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional tag this document should be containerized by. Max 100 characters, alphanumeric with hyphens, underscores, and dots only."}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"content","displayName":"Content","type":"string","required":true,"description":"The content to extract and process into a document. This can be a URL to a website, a PDF, an image, or a video."}, this.getNodeParameter("content", itemIndex), this, itemIndex);
    if (additionalFields["customId"] !== undefined) setBodyField(body as IDataObject, {"name":"customId","displayName":"Custom Id","type":"string","description":"Optional custom ID of the document. Max 100 characters, alphanumeric with hyphens, underscores, and dots only."}, additionalFields["customId"], this, itemIndex);
    if (additionalFields["documentDate"] !== undefined) setBodyField(body as IDataObject, {"name":"documentDate","displayName":"Document Date","type":"string","description":"When this document's content is from, as opposed to when it was uploaded. Accepts YYYY-MM-DD or a full ISO 8601 timestamp. Memory extraction resolves relative dates against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. Set this whenever you backfill historical content."}, additionalFields["documentDate"], this, itemIndex);
    if (additionalFields["dreaming"] !== undefined) setBodyField(body as IDataObject, {"name":"dreaming","displayName":"Dreaming","type":"string","description":"Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.","enum":["instant","dynamic"]}, additionalFields["dreaming"], this, itemIndex);
    if (additionalFields["entityContext"] !== undefined) setBodyField(body as IDataObject, {"name":"entityContext","displayName":"Entity Context","type":"string","description":"Optional entity context for this container tag. Max 1500 characters. Used during document processing to guide memory extraction."}, additionalFields["entityContext"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Optional file path for the document. Used by supermemoryfs to store the full path of the file."}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filterByMetadata"] !== undefined) setBodyField(body as IDataObject, {"name":"filterByMetadata","displayName":"Filter By Metadata","type":"object","description":"Optional metadata filter to apply when pulling related memories and profile during ingestion. Only memories matching these filters will be used as context.","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["filterByMetadata"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","description":"Optional metadata for the document.","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["metadata"], this, itemIndex);
    if (additionalFields["taskType"] !== undefined) setBodyField(body as IDataObject, {"name":"taskType","displayName":"Task Type","type":"string","description":"Task type: \"memory\" (default) for full context layer with SuperRAG built in, \"superrag\" for managed RAG as a service.","enum":["memory","superrag"]}, additionalFields["taskType"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","status"], simplified: ["id","status"] };
        errorPlan = {"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3DocumentsBatch": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents/batch";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional tag this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","example":"user_alex","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"(DEPRECATED: Use containerTag instead) Optional tags this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["content"] !== undefined) setBodyField(body as IDataObject, {"name":"content","displayName":"Content","type":"string","nullable":true}, additionalFields["content"], this, itemIndex);
    if (additionalFields["documentDate"] !== undefined) setBodyField(body as IDataObject, {"name":"documentDate","displayName":"Document Date","type":"string","description":"When this document's content is from, as opposed to when it was uploaded. Accepts YYYY-MM-DD or a full ISO 8601 timestamp. Memory extraction resolves relative dates ('yesterday', 'last quarter') against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. Set this whenever you backfill historical content.","example":"2025-03-14"}, additionalFields["documentDate"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"documents","displayName":"Documents","type":"alternative","required":true,"alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"array","items":{"name":"item","displayName":"Item","type":"object","fields":[{"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional tag this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","example":"user_alex","pattern":"^[a-zA-Z0-9_:-]+$"},{"name":"containerTags","displayName":"Container Tags","type":"array","description":"(DEPRECATED: Use containerTag instead) Optional tags this document should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to group documents.","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"},{"name":"content","displayName":"Content","type":"string","required":true,"description":"The content to extract and process into a document. This can be a URL to a website, a PDF, an image, or a video. \n\nPlaintext: Any plaintext format\n\nURL: A URL to a website, PDF, image, or video\n\nWe automatically detect the content type from the url's response format.","example":"Our API rate limits are 100 req/min on free and 1000 on pro. Clients should use exponential backoff on 429s."},{"name":"customId","displayName":"Custom Id","type":"string","description":"Optional custom ID of the document. This could be an ID from your database that will uniquely identify this document.","example":"doc-api-rate-limits"},{"name":"documentDate","displayName":"Document Date","type":"string","description":"When this document's content is from, as opposed to when it was uploaded. Accepts YYYY-MM-DD or a full ISO 8601 timestamp. Memory extraction resolves relative dates ('yesterday', 'last quarter') against this instead of the ingestion time, and documents in a batch are processed oldest-first so newer facts correctly supersede older ones. Set this whenever you backfill historical content.","example":"2025-03-14"},{"name":"dreaming","displayName":"Dreaming","type":"string","description":"Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.","enum":["instant","dynamic"],"example":"instant"},{"name":"entityContext","displayName":"Entity Context","type":"string","description":"Optional entity context for this container tag. Max 1500 characters. Used during document processing to guide memory extraction.","example":"User's name is {XYZ}"},{"name":"filepath","displayName":"Filepath","type":"string","description":"Optional file path for the document (e.g., '/documents/reports/file.pdf'). Used by supermemoryfs to map documents to filesystem paths.","example":"/documents/reports/file.pdf"},{"name":"filterByMetadata","displayName":"Filter By Metadata","type":"object","description":"Optional metadata filter scoping which existing memories are pulled as context during ingestion. Scalar values match exactly (AND across keys); array values match ANY (OR within key). Only memories whose source documents match this filter are used as context.","example":{"department":"engineering","region":"us"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"},{"name":"metadata","displayName":"Metadata","type":"object","description":"Optional metadata for the document. This is used to store additional information about the document. You can use this to store any additional information you need about the document. Metadata can be filtered through. Keys must be strings and are case sensitive. Values can be strings, numbers, or booleans. You cannot nest objects.","example":{"language":"en","source":"upload"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"},{"name":"taskType","displayName":"Task Type","type":"string","description":"Task type: \"memory\" (default) for full context layer with SuperRAG built in, \"superrag\" for managed RAG as a service.","enum":["memory","superrag"],"example":"memory"}],"representation":"raw"},"representation":"raw"},{"name":"alternative2","displayName":"Alternative2","type":"array","items":{"name":"item","displayName":"Item","type":"string","description":"The content to extract and process into a document. This can be a URL to a website, a PDF, an image, or a video. \n\nPlaintext: Any plaintext format\n\nURL: A URL to a website, PDF, image, or video\n\nWe automatically detect the content type from the url's response format.","example":"Our API rate limits are 100 req/min on free and 1000 on pro. Clients should use exponential backoff on 429s."},"representation":"raw"}],"composition":"anyOf","representation":"raw"}, this.getNodeParameter("documents", itemIndex), this, itemIndex);
    if (additionalFields["dreaming"] !== undefined) setBodyField(body as IDataObject, {"name":"dreaming","displayName":"Dreaming","type":"string","description":"Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.","enum":["instant","dynamic"],"example":"instant"}, additionalFields["dreaming"], this, itemIndex);
    if (additionalFields["entityContext"] !== undefined) setBodyField(body as IDataObject, {"name":"entityContext","displayName":"Entity Context","type":"string","description":"Optional entity context for this container tag. Max 1500 characters. Used during document processing to guide memory extraction.","example":"User's name is {XYZ}"}, additionalFields["entityContext"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Optional file path for the document (e.g., '/documents/reports/file.pdf'). Used by supermemoryfs to map documents to filesystem paths.","example":"/documents/reports/file.pdf"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filterByMetadata"] !== undefined) setBodyField(body as IDataObject, {"name":"filterByMetadata","displayName":"Filter By Metadata","type":"object","description":"Optional metadata filter scoping which existing memories are pulled as context during ingestion. Scalar values match exactly (AND across keys); array values match ANY (OR within key). Only memories whose source documents match this filter are used as context.","example":{"department":"engineering","region":"us"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["filterByMetadata"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","description":"Optional metadata for the document. This is used to store additional information about the document. You can use this to store any additional information you need about the document. Metadata can be filtered through. Keys must be strings and are case sensitive. Values can be strings, numbers, or booleans. You cannot nest objects.","example":{"language":"en","source":"upload"},"additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"},{"name":"alternative4","displayName":"Alternative4","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["metadata"], this, itemIndex);
    if (additionalFields["taskType"] !== undefined) setBodyField(body as IDataObject, {"name":"taskType","displayName":"Task Type","type":"string","description":"Task type: \"memory\" (default) for full context layer with SuperRAG built in, \"superrag\" for managed RAG as a service.","enum":["memory","superrag"],"example":"memory"}, additionalFields["taskType"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["failed","results","success"], simplified: ["failed","results","success"] };
        errorPlan = {"401":{"title":"Unauthorized"},"402":{"title":"Document token limit reached"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3DocumentsFile": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/documents/file";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional container tag (e.g., 'user_123'). Use this for a single tag.","example":"user_alex"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"string","description":"Optional container tags. Can be either a JSON string of an array (e.g., '[\"user_123\", \"project_123\"]') or a single string (e.g., 'user_123'). Single strings will be automatically converted to an array."}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["customId"] !== undefined) setBodyField(body as IDataObject, {"name":"customId","displayName":"Custom Id","type":"string","description":"Optional custom ID of the document. Max 100 characters, alphanumeric with hyphens, underscores, and colons only.","example":"mem_abc123","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["customId"], this, itemIndex);
    if (additionalFields["dreaming"] !== undefined) setBodyField(body as IDataObject, {"name":"dreaming","displayName":"Dreaming","type":"string","description":"Processing mode. \"dynamic\" (default) groups related documents together so memories form from coherent, logical units rather than one isolated entry at a time. \"instant\" processes each document on its own right away, and bills one extra operation per document.","enum":["instant","dynamic"],"example":"instant"}, additionalFields["dreaming"], this, itemIndex);
    if (additionalFields["entityContext"] !== undefined) setBodyField(body as IDataObject, {"name":"entityContext","displayName":"Entity Context","type":"string","description":"Optional entity context for this container tag. Max 1500 characters. Used during document processing to guide memory extraction.","example":"User's name is {XYZ}"}, additionalFields["entityContext"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"file","displayName":"File","type":"string","format":"binary","required":true,"description":"File to upload and process"}, this.getNodeParameter("file", itemIndex), this, itemIndex);
    if (additionalFields["fileType"] !== undefined) setBodyField(body as IDataObject, {"name":"fileType","displayName":"File Type","type":"string","description":"Optional file type override to force specific processing behavior. Valid values: text, pdf, tweet, google_doc, google_slide, google_sheet, image, video, notion_doc, webpage, onedrive","example":"image"}, additionalFields["fileType"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Optional file path for the uploaded file (e.g., '/documents/reports/file.pdf'). Used by supermemoryfs to map documents to filesystem paths.","example":"/documents/reports/file.pdf"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filterByMetadata"] !== undefined) setBodyField(body as IDataObject, {"name":"filterByMetadata","displayName":"Filter By Metadata","type":"string","description":"Optional metadata filter as a JSON string. Scopes which existing memories are pulled as context during ingestion. Scalar values match exactly (AND across keys); array values match ANY (OR within key).","example":"{\"department\": \"engineering\"}"}, additionalFields["filterByMetadata"], this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"string","description":"Optional metadata for the document as a JSON string. This is used to store additional information about the document. Keys must be strings and values can be strings, numbers, or booleans.","example":"{\"category\": \"technology\", \"isPublic\": true, \"readingTime\": 5}"}, additionalFields["metadata"], this, itemIndex);
    if (additionalFields["mimeType"] !== undefined) setBodyField(body as IDataObject, {"name":"mimeType","displayName":"Mime Type","type":"string","description":"Required when fileType is 'image' or 'video'. Specifies the exact MIME type to use (e.g., 'image/png', 'image/jpeg', 'video/mp4', 'video/webm')"}, additionalFields["mimeType"], this, itemIndex);
    if (additionalFields["taskType"] !== undefined) setBodyField(body as IDataObject, {"name":"taskType","displayName":"Task Type","type":"string","description":"Task type: \"memory\" (default) for full context layer with SuperRAG built in, \"superrag\" for managed RAG as a service.","enum":["memory","superrag"],"example":"memory"}, additionalFields["taskType"], this, itemIndex);
    if (additionalFields["useAdvancedProcessing"] !== undefined) setBodyField(body as IDataObject, {"name":"useAdvancedProcessing","displayName":"Use Advanced Processing","type":"string","description":"DEPRECATED: This field is no longer used. Advanced PDF processing is now automatic with our hybrid Mistral OCR + Gemini pipeline. This parameter will be accepted but ignored for backwards compatibility.","example":"true"}, additionalFields["useAdvancedProcessing"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: toFormData(body), json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["id","status"], simplified: ["id","status"] };
        errorPlan = {"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV4Conversations": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/conversations";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"conversationId","displayName":"Conversation Id","type":"string","required":true}, this.getNodeParameter("conversationId", itemIndex), this, itemIndex);
    setBodyField(body as IDataObject, {"name":"messages","displayName":"Messages","type":"array","required":true,"items":{"name":"item","displayName":"Item","type":"object","fields":[{"name":"content","displayName":"Content","type":"alternative","required":true,"alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"array","items":{"name":"item","displayName":"Item","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"object","fields":[{"name":"text","displayName":"Text","type":"string","required":true},{"name":"type","displayName":"Type","type":"string","required":true}],"representation":"raw"},{"name":"alternative2","displayName":"Alternative2","type":"object","fields":[{"name":"imageUrl","displayName":"Image Url","type":"object","required":true,"fields":[{"name":"url","displayName":"Url","type":"string","format":"uri","required":true}],"representation":"raw"},{"name":"type","displayName":"Type","type":"string","required":true}],"representation":"raw"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}],"composition":"anyOf","representation":"raw"},{"name":"name","displayName":"Name","type":"string"},{"name":"role","displayName":"Role","type":"string","required":true,"enum":["user","assistant","system","tool"]},{"name":"tool_call_id","displayName":"Tool call id","type":"string"},{"name":"tool_calls","displayName":"Tool calls","type":"array","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}],"representation":"raw"},"representation":"raw"}, this.getNodeParameter("messages", itemIndex), this, itemIndex);
    if (additionalFields["metadata"] !== undefined) setBodyField(body as IDataObject, {"name":"metadata","displayName":"Metadata","type":"object","additionalValue":{"name":"value","displayName":"Value","type":"alternative","alternatives":[{"name":"alternative1","displayName":"Alternative1","type":"string"},{"name":"alternative2","displayName":"Alternative2","type":"string"},{"name":"alternative3","displayName":"Alternative3","type":"string"}],"composition":"anyOf","representation":"raw"},"representation":"raw"}, additionalFields["metadata"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["conversationId","id","status"], simplified: ["conversationId","id","status"] };
        errorPlan = {"400":{"title":"Invalid request parameters"},"401":{"title":"Unauthorized"},"402":{"title":"Quota exceeded"},"409":{"title":"A container tag merge is in progress"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV4Profile": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/profile";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["buckets"] !== undefined) setBodyField(body as IDataObject, {"name":"buckets","displayName":"Buckets","type":"array","description":"Specific bucket keys to return. Omit to return all configured buckets. Only relevant when \"buckets\" is included.","items":{"name":"item","displayName":"Item","type":"string"},"representation":"raw"}, additionalFields["buckets"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"Tag to filter the profile by. This can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.","pattern":"^[a-zA-Z0-9_:-]+$"}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
    if (additionalFields["filters"] !== undefined) setBodyField(body as IDataObject, {"name":"filters","displayName":"Filters","type":"any","description":"Optional metadata filters to apply to profile results and search results. Supports complex AND/OR queries with multiple conditions."}, additionalFields["filters"], this, itemIndex);
    if (additionalFields["include"] !== undefined) setBodyField(body as IDataObject, {"name":"include","displayName":"Include","type":"array","description":"Profile sections to return. Omit to return all sections. Pass a subset to reduce payload — e.g. [\"buckets\"] skips static and dynamic entirely.","items":{"name":"item","displayName":"Item","type":"string","enum":["static","dynamic","buckets"]},"representation":"raw"}, additionalFields["include"], this, itemIndex);
    if (additionalFields["q"] !== undefined) setBodyField(body as IDataObject, {"name":"q","displayName":"Q","type":"string","description":"Optional search query to include search results in the response"}, additionalFields["q"], this, itemIndex);
    if (additionalFields["threshold"] !== undefined) setBodyField(body as IDataObject, {"name":"threshold","displayName":"Threshold","type":"number","minValue":0,"maxValue":1,"description":"Threshold for search results. Only results with a score above this threshold will be included."}, additionalFields["threshold"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["profile","searchResults"], simplified: ["profile","searchResults"] };
        errorPlan = {"400":{"title":"Invalid request parameters"},"401":{"title":"Unauthorized"},"402":{"title":"Search quota or credits exhausted (when search query is provided)"},"500":{"title":"Server error"}};
        break;
      }
    case "postV4ProfileBuckets": {
        
        
        const path = "/v4/profile/buckets";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","required":true,"description":"Tag to resolve effective bucket definitions for. Can be a user ID, project ID, or any identifier used to scope memories."}, this.getNodeParameter("containerTag", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["buckets"], simplified: ["buckets"] };
        errorPlan = {"401":{"title":"Unauthorized"}};
        break;
      }
    case "postV4Search": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v4/search";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["aggregate"] !== undefined) setBodyField(body as IDataObject, {"name":"aggregate","displayName":"Aggregate","type":"boolean","description":"If true, aggregates information from multiple memories to create new synthesized memories. The result will be a mix of aggregated and non-aggregated memories, reranked by relevance to the query. Works in conjunction with reranking.","default":false,"example":false}, additionalFields["aggregate"], this, itemIndex);
    if (additionalFields["containerTag"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTag","displayName":"Container Tag","type":"string","description":"Optional tag this search should be containerized by. This can be an ID for your user, a project ID, or any other identifier you wish to use to filter memories.","example":"user_alex","pattern":"^[a-zA-Z0-9_:-]+$"}, additionalFields["containerTag"], this, itemIndex);
    if (additionalFields["containerTags"] !== undefined) setBodyField(body as IDataObject, {"name":"containerTags","displayName":"Container Tags","type":"array","description":"Optional tags this search should be containerized by. Search is scoped to memories under these tags.","example":["user_alex"],"items":{"name":"item","displayName":"Item","type":"string","pattern":"^[a-zA-Z0-9_:-]+$"},"representation":"raw"}, additionalFields["containerTags"], this, itemIndex);
    if (additionalFields["filepath"] !== undefined) setBodyField(body as IDataObject, {"name":"filepath","displayName":"Filepath","type":"string","description":"Filter search results by filepath. Exact match for full paths, prefix match if ending with /"}, additionalFields["filepath"], this, itemIndex);
    if (additionalFields["filters"] !== undefined) setBodyField(body as IDataObject, {"name":"filters","displayName":"Filters","type":"any","description":"Optional filters to apply to the search. Can be a JSON string or Query object."}, additionalFields["filters"], this, itemIndex);
    if (additionalFields["include"] !== undefined) setBodyField(body as IDataObject, {"name":"include","displayName":"Include","type":"object","default":{"chunks":false,"documents":false,"forgottenMemories":false,"relatedMemories":false,"summaries":false},"fields":[{"name":"chunks","displayName":"Chunks","type":"boolean","description":"DEPRECATED: Use searchMode='hybrid' instead. If true, automatically switches to hybrid mode. This field is kept for backward compatibility only.","default":false,"example":false},{"name":"documents","displayName":"Documents","type":"boolean","default":false},{"name":"forgottenMemories","displayName":"Forgotten Memories","type":"boolean","description":"If true, include forgotten memories in search results. Forgotten memories are memories that have been explicitly forgotten or have passed their expiration date.","default":false,"example":false},{"name":"relatedMemories","displayName":"Related Memories","type":"boolean","default":false},{"name":"summaries","displayName":"Summaries","type":"boolean","default":false}],"representation":"raw"}, additionalFields["include"], this, itemIndex);
    if (additionalFields["limit"] !== undefined) setBodyField(body as IDataObject, {"name":"limit","displayName":"Limit","type":"integer","minValue":1,"maxValue":100,"description":"Maximum number of results to return","default":10,"example":10}, additionalFields["limit"], this, itemIndex);
    setBodyField(body as IDataObject, {"name":"q","displayName":"Q","type":"string","required":true,"description":"Search query string","example":"what are the API rate limits"}, this.getNodeParameter("q", itemIndex), this, itemIndex);
    if (additionalFields["rerank"] !== undefined) setBodyField(body as IDataObject, {"name":"rerank","displayName":"Rerank","type":"boolean","description":"If true, rerank the results based on the query. This is helpful if you want to ensure the most relevant results are returned.","default":false,"example":false}, additionalFields["rerank"], this, itemIndex);
    if (additionalFields["rewriteQuery"] !== undefined) setBodyField(body as IDataObject, {"name":"rewriteQuery","displayName":"Rewrite Query","type":"boolean","description":"If true, rewrites the query to make it easier to find documents. This increases the latency by about 400ms","default":false,"example":false}, additionalFields["rewriteQuery"], this, itemIndex);
    if (additionalFields["searchMode"] !== undefined) setBodyField(body as IDataObject, {"name":"searchMode","displayName":"Search Mode","type":"string","description":"Search mode. 'memories' searches only memory entries (default). 'hybrid' searches both memories and document chunks. 'documents' searches only document chunks.","enum":["memories","hybrid","documents"],"default":"memories","example":"memories"}, additionalFields["searchMode"], this, itemIndex);
    if (additionalFields["threshold"] !== undefined) setBodyField(body as IDataObject, {"name":"threshold","displayName":"Threshold","type":"number","minValue":0,"maxValue":1,"description":"Threshold / sensitivity for memories selection. 0 is least sensitive (returns most memories, more results), 1 is most sensitive (returns lesser memories, accurate results)","default":0.6,"example":0.5}, additionalFields["threshold"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["results","timing","total"], simplified: ["results","timing","total"] };
        errorPlan = {"400":{"title":"Invalid request parameters"},"401":{"title":"Unauthorized"},"402":{"title":"Search quota or credits exhausted"},"500":{"title":"Server error"}};
        break;
      }
    case "getV3Settings": {
        
        
        const path = "/v3/settings";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "GET" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["chunkSize","excludeItems","filterPrompt","githubClientId","githubClientSecret","githubCustomKeyEnabled","googleDriveClientId","googleDriveClientSecret","googleDriveCustomKeyEnabled","includeItems","notionClientId","notionClientSecret","notionCustomKeyEnabled","onedriveClientId","onedriveClientSecret","onedriveCustomKeyEnabled","profileBuckets","shouldLLMFilter"], simplified: ["chunkSize","excludeItems","filterPrompt","githubClientId","githubClientSecret","githubCustomKeyEnabled","googleDriveClientId","googleDriveClientSecret","googleDriveCustomKeyEnabled","includeItems"] };
        errorPlan = {"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "patchV3Settings": {
        
        additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const path = "/v3/settings";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        if (additionalFields["chunkSize"] !== undefined) setBodyField(body as IDataObject, {"name":"chunkSize","displayName":"Chunk Size","type":"integer","minValue":-2147483648,"maxValue":2147483647,"nullable":true}, additionalFields["chunkSize"], this, itemIndex);
    if (additionalFields["excludeItems"] !== undefined) setBodyField(body as IDataObject, {"name":"excludeItems","displayName":"Exclude Items","type":"alternative","nullable":true}, additionalFields["excludeItems"], this, itemIndex);
    if (additionalFields["filterPrompt"] !== undefined) setBodyField(body as IDataObject, {"name":"filterPrompt","displayName":"Filter Prompt","type":"string","nullable":true}, additionalFields["filterPrompt"], this, itemIndex);
    if (additionalFields["githubClientId"] !== undefined) setBodyField(body as IDataObject, {"name":"githubClientId","displayName":"Github Client Id","type":"string","nullable":true}, additionalFields["githubClientId"], this, itemIndex);
    if (additionalFields["githubClientSecret"] !== undefined) setBodyField(body as IDataObject, {"name":"githubClientSecret","displayName":"Github Client Secret","type":"string","nullable":true}, additionalFields["githubClientSecret"], this, itemIndex);
    if (additionalFields["githubCustomKeyEnabled"] !== undefined) setBodyField(body as IDataObject, {"name":"githubCustomKeyEnabled","displayName":"Github Custom Key Enabled","type":"boolean","nullable":true}, additionalFields["githubCustomKeyEnabled"], this, itemIndex);
    if (additionalFields["googleDriveClientId"] !== undefined) setBodyField(body as IDataObject, {"name":"googleDriveClientId","displayName":"Google Drive Client Id","type":"string","nullable":true}, additionalFields["googleDriveClientId"], this, itemIndex);
    if (additionalFields["googleDriveClientSecret"] !== undefined) setBodyField(body as IDataObject, {"name":"googleDriveClientSecret","displayName":"Google Drive Client Secret","type":"string","nullable":true}, additionalFields["googleDriveClientSecret"], this, itemIndex);
    if (additionalFields["googleDriveCustomKeyEnabled"] !== undefined) setBodyField(body as IDataObject, {"name":"googleDriveCustomKeyEnabled","displayName":"Google Drive Custom Key Enabled","type":"boolean","nullable":true}, additionalFields["googleDriveCustomKeyEnabled"], this, itemIndex);
    if (additionalFields["includeItems"] !== undefined) setBodyField(body as IDataObject, {"name":"includeItems","displayName":"Include Items","type":"alternative","nullable":true}, additionalFields["includeItems"], this, itemIndex);
    if (additionalFields["notionClientId"] !== undefined) setBodyField(body as IDataObject, {"name":"notionClientId","displayName":"Notion Client Id","type":"string","nullable":true}, additionalFields["notionClientId"], this, itemIndex);
    if (additionalFields["notionClientSecret"] !== undefined) setBodyField(body as IDataObject, {"name":"notionClientSecret","displayName":"Notion Client Secret","type":"string","nullable":true}, additionalFields["notionClientSecret"], this, itemIndex);
    if (additionalFields["notionCustomKeyEnabled"] !== undefined) setBodyField(body as IDataObject, {"name":"notionCustomKeyEnabled","displayName":"Notion Custom Key Enabled","type":"boolean","nullable":true}, additionalFields["notionCustomKeyEnabled"], this, itemIndex);
    if (additionalFields["onedriveClientId"] !== undefined) setBodyField(body as IDataObject, {"name":"onedriveClientId","displayName":"Onedrive Client Id","type":"string","nullable":true}, additionalFields["onedriveClientId"], this, itemIndex);
    if (additionalFields["onedriveClientSecret"] !== undefined) setBodyField(body as IDataObject, {"name":"onedriveClientSecret","displayName":"Onedrive Client Secret","type":"string","nullable":true}, additionalFields["onedriveClientSecret"], this, itemIndex);
    if (additionalFields["onedriveCustomKeyEnabled"] !== undefined) setBodyField(body as IDataObject, {"name":"onedriveCustomKeyEnabled","displayName":"Onedrive Custom Key Enabled","type":"boolean","nullable":true}, additionalFields["onedriveCustomKeyEnabled"], this, itemIndex);
    if (additionalFields["profileBuckets"] !== undefined) setBodyField(body as IDataObject, {"name":"profileBuckets","displayName":"Profile Buckets","type":"array","description":"Profile bucket definitions","items":{"name":"item","displayName":"Item","type":"object","description":"Definition of a single profile bucket","fields":[{"name":"description","displayName":"Description","type":"string","description":"What belongs in this bucket — used to guide the ingestion classifier.","default":""},{"name":"key","displayName":"Key","type":"string","required":true,"description":"Stable slug for the bucket, stored on each memory","pattern":"^[a-z0-9][a-z0-9_-]*$"}],"representation":"raw"},"representation":"raw"}, additionalFields["profileBuckets"], this, itemIndex);
    if (additionalFields["shouldLLMFilter"] !== undefined) setBodyField(body as IDataObject, {"name":"shouldLLMFilter","displayName":"Should L L M Filter","type":"boolean","nullable":true}, additionalFields["shouldLLMFilter"], this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "PATCH" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["orgId","orgSlug","updated"], simplified: ["orgId","orgSlug","updated"] };
        errorPlan = {"400":{"title":"Bad request"},"401":{"title":"Unauthorized"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3SettingsReset": {
        
        
        const path = "/v3/settings/reset";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"confirmation","displayName":"Confirmation","type":"string","required":true}, this.getNodeParameter("confirmation", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["clearedDefaultSpaceContext","deletedConnections","deletedDocumentBatches","deletedDocumentsApprox","deletedExtraSpaces","deletedMemoryRows","settingsReset","success"], simplified: ["clearedDefaultSpaceContext","deletedConnections","deletedDocumentBatches","deletedDocumentsApprox","deletedExtraSpaces","deletedMemoryRows","settingsReset","success"] };
        errorPlan = {"400":{"title":"Bad request"},"401":{"title":"Unauthorized"},"403":{"title":"Forbidden"},"500":{"title":"Internal server error"}};
        break;
      }
    case "postV3SettingsSuggestBuckets": {
        
        
        const path = "/v3/settings/suggest-buckets";
        const qs: IDataObject = {};
        
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "POST" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: ["suggestions"], simplified: ["suggestions"] };
        errorPlan = {"400":{"title":"No context available"},"401":{"title":"Unauthorized"}};
        break;
      }
    case "patchV3SettingsSecurity": {
        
        
        const path = "/v3/settings/security";
        const qs: IDataObject = {};
        const headers: IDataObject = {};
        const body: IDataObject | IDataObject[] | string | number | boolean | null = {};
        
        setBodyField(body as IDataObject, {"name":"requireTwoFactor","displayName":"Require Two Factor","type":"boolean","required":true}, this.getNodeParameter("requireTwoFactor", itemIndex), this, itemIndex);
        
        const serverBaseUrl = resolveServerBaseUrl(this as never, [{"id":"documentServer1HttpsApiSupermemoryAi","url":"https://api.supermemory.ai","kind":"selectable","variables":[]}], "documentServer1HttpsApiSupermemoryAi", nodeOptions, false);
        options = { method: "PATCH" as unknown as IHttpRequestOptions["method"], url: serverBaseUrl.url + path, qs, headers: { ...headers, ...{ 'Content-Type': "application/json" } }, body: body, json: true, arrayFormat: "indices", ...(serverBaseUrl.blockRedirects ? { maxRedirects: 0 } : {}) };
        credentialApplications = ([{"credentialType":"supermemoryApi","type":"bearer"}]) as CredentialApplication[];
        retryContract = { mode: "none", retryConnectionFailures: false, retryTimeouts: false, retryRateLimits: false, retryServerErrors: false, maxAttempts: 1, maxElapsedMs: 30000, baseBackoffMs: 500, maxBackoffMs: 5000, jitterRatio: 0.2, idempotency: undefined };
        pagination = { style: "none", page: "", limit: "", cursor: "", responseCursor: "", hasMore: "", itemPath: "", advancement: "", maxPages: 1, maxItems: Number.POSITIVE_INFINITY, maxElapsedMs: 30000, maxMemoryBytes: 10485760, repeatedCursorLimit: 1, repeatedPageLimit: 1, pageSize: 100 };
        responsePlan = { binary: false, full: false, envelopePath: "", itemPath: "", fields: [], simplified: [] };
        errorPlan = {};
        break;
      }
          default: throw new NodeOperationError(this.getNode(), `Unsupported operation ${operation} for node version ${nodeVersion}`, { itemIndex });
        }
        const returnAll = pagination.style !== 'none' ? Boolean(nodeOptions.returnAll ?? false) : false;
    const resultLimit = pagination.style !== 'none' && !returnAll ? Number(nodeOptions.resultLimit ?? 50) : Math.min(pagination.maxItems, Number.POSITIVE_INFINITY);
    const pageStartTime = Date.now();
    const seenCursors = new Map<string, number>(); const seenPages = new Map<string, number>();
    let page = 1; let offset = 0; let cursor: unknown; let pagesFetched = 0; let estimatedBytes = 0; let finished = false;
    while (!finished && output.length - outputStart < resultLimit && pagesFetched < pagination.maxPages) {
      if (Date.now() - pageStartTime > pagination.maxElapsedMs) throw new NodeOperationError(this.getNode(), 'Pagination elapsed-time budget was exceeded', { itemIndex });
      const qs = options.qs as IDataObject;
      // Only the paginator's own page size is written here. It used to overwrite a
      // limit parameter the operation itself declared and the user had just set.
      if (pagination.limit && (pagesFetched > 0 || qs[pagination.limit] === undefined)) qs[pagination.limit] = Math.min(pagination.pageSize, resultLimit - (output.length - outputStart));
      if (pagination.style === 'offset' && pagination.page) qs[pagination.page] = offset;
      if (pagination.style === 'pageNumber' && pagination.page) qs[pagination.page] = page;
      if (pagination.style === 'cursor' && pagination.cursor && cursor) qs[pagination.cursor] = cursor as string;
      const response = await requestWithRetry(this as never, options, credentialApplications, retryContract, itemIndex);
      pagesFetched += 1;
      const pageFingerprint = JSON.stringify(response);
      const pageRepeats = (seenPages.get(pageFingerprint) ?? 0) + 1;
      seenPages.set(pageFingerprint, pageRepeats);
      if (pageRepeats > pagination.repeatedPageLimit) throw new NodeOperationError(this.getNode(), 'Pagination repeated-page budget was exceeded', { itemIndex });
      estimatedBytes += pageFingerprint.length;
      if (estimatedBytes > pagination.maxMemoryBytes) throw new NodeOperationError(this.getNode(), 'Pagination memory budget was exceeded', { itemIndex });
      if (responsePlan.binary) {
        const binaryPayload = responsePlan.full ? ((response as IDataObject).body ?? response) : response;
        const responseHeaders = (responsePlan.full ? ((response as IDataObject).headers as IDataObject | undefined) : undefined) ?? {};
        const contentType = String(responseHeaders['content-type'] ?? '').split(';')[0].trim() || 'application/octet-stream';
        // prepareBinaryData is what fills in fileName, fileSize and fileExtension.
        // Hand-building the binary entry produced items that downstream nodes could
        // not name or type, and discarded the response's own content type.
        const binaryData = await this.helpers.prepareBinaryData(Buffer.from(binaryPayload as ArrayBuffer), undefined, contentType);
        output.push({ json: {}, binary: { data: binaryData }, pairedItem: { item: itemIndex } });
        finished = true;
        continue;
      }
      const normalizedResponse = responsePlan.full ? ((response as IDataObject).body ?? response) : response;
      const envelopeValue = valueAtPath(normalizedResponse, responsePlan.envelopePath);
      if (responsePlan.envelopePath && envelopeValue === undefined) throw new NodeOperationError(this.getNode(), `Response envelope path "${responsePlan.envelopePath}" was not found`, { itemIndex });
      const envelope = (envelopeValue ?? normalizedResponse) as IDataObject;
      const itemPath = pagination.itemPath || responsePlan.itemPath;
      const extractedItems = valueAtPath(envelope, itemPath);
      if (itemPath && extractedItems === undefined) throw new NodeOperationError(this.getNode(), `Response item path "${itemPath}" was not found`, { itemIndex });
      // A DELETE used to be reported as a fixed { deleted: true } with its body
      // thrown away, which lost the deleted representation and the job handle that
      // asynchronous deletes return. The body is used when there is one.
      const deletedFallback = options.method === 'DELETE' && (normalizedResponse === undefined || normalizedResponse === null || normalizedResponse === '' ||
        (typeof normalizedResponse === 'object' && !Array.isArray(normalizedResponse) && Object.keys(normalizedResponse as IDataObject).length === 0));
      const values = deletedFallback
        ? [{ deleted: true }]
        : Array.isArray(extractedItems) ? extractedItems : Array.isArray(normalizedResponse) ? normalizedResponse : [extractedItems ?? envelope];
      const outputMode = responsePlan.fields.length > 10 ? this.getNodeParameter('outputMode', itemIndex, 'simplified') as string : 'raw';
      const selectedFields = outputMode === 'selected' ? this.getNodeParameter('selectedFields', itemIndex, []) as string[] : [];
      for (const value of values) {
        if (output.length - outputStart >= resultLimit) break;
        const fields = outputMode === 'simplified' ? responsePlan.simplified : outputMode === 'selected' ? selectedFields : [];
        output.push({ json: selectResponseFields(value as IDataObject, fields), pairedItem: { item: itemIndex } });
      }
      if (!returnAll || pagination.style === 'none' || values.length === 0) { finished = true; continue; }
      if (pagination.hasMore && envelope[pagination.hasMore] === false) { finished = true; continue; }
      if (pagination.style === 'cursor') {
        cursor = pagination.responseCursor ? valueAtPath(envelope, pagination.responseCursor) : undefined;
        finished = !cursor;
        if (cursor) {
          const key = String(cursor);
          const repeats = (seenCursors.get(key) ?? 0) + 1;
          seenCursors.set(key, repeats);
          if (repeats > pagination.repeatedCursorLimit) throw new NodeOperationError(this.getNode(), 'Pagination repeated-cursor budget was exceeded', { itemIndex });
        }
      }
      if (pagination.advancement === 'offsetByItems') offset += values.length;
      if (pagination.advancement === 'incrementPage') page += 1;
    }
      } catch (error) {
        if (this.continueOnFail()) {
          output.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
          continue;
        }
        if (error instanceof NodeApiError) {
          const status = String((error as unknown as { httpCode?: string; cause?: { statusCode?: number } }).httpCode ?? (error as unknown as { cause?: { statusCode?: number } }).cause?.statusCode ?? 'default');
          const planned = errorPlan[status] ?? errorPlan.default;
          if (planned) {
            const parameterHelp = planned.parameter ? `Check the '${planned.parameter}' parameter.` : undefined;
            const description = [planned.recovery, parameterHelp].filter(Boolean).join(' ');
            throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex, message: planned.title, description });
          }
        }
        if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
      }
    }
    return [output];
  }
}
