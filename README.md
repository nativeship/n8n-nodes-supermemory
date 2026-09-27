# Supermemory n8n community node

Store, manage, search, and recall long-term contextual memories, user profiles, and documents with Supermemory

Generated from OpenAPI 3.0.0 with template 1.1.0. Generated files are platform-managed and will be overwritten during regeneration.

## Authentication

Configure the generated bearer token credential in n8n before using the node.

## Supported operations

- `DELETE /v3/connections/{connectionId}` - Delete connection by ID
  - Retry Contract: none
  - Pagination Contract: none
- `DELETE /v3/connections/{provider}` - Delete Connection
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/connections/{connectionId}` - Get Connection
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/connections/{connectionId}/resources` - Fetch resources
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/{connectionId}/configure` - Configure connection
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/{provider}` - Create Connection
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/{provider}/connection` - Get Connection by Provider
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/{provider}/documents` - Get Connection Documents
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/{provider}/import` - Sync Connection
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/connections/list` - Get Many Connections
  - Retry Contract: none
  - Pagination Contract: none
- `DELETE /v3/container-tags/{containerTag}` - Delete Container Tag
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/container-tags/{containerTag}` - Get Container Tag
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/container-tags/list` - Get Many Container Tags
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/container-tags/merge/{mergeId}` - Get Merge Status
  - Retry Contract: none
  - Pagination Contract: none
- `PATCH /v3/container-tags/{containerTag}` - Update Container Tag
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/container-tags/merge` - Merge Container Tags
  - Retry Contract: none
  - Pagination Contract: none
- `DELETE /v4/memories` - Forget Memory
  - Retry Contract: none
  - Pagination Contract: none
- `PATCH /v4/memories` - Update Memory
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/memories` - Create Memories
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/memories/forget-matching` - Forget Matching Memories
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/memories/list` - Get Many Memories
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/documents/{id}` - Get Document
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/documents/{id}/chunks` - Get Document Chunks
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/documents/{id}/file-url` - Get Document File URL
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/documents/processing` - Get Processing Documents
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/documents/list` - Get Many Documents
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/search` - Search documents
  - Retry Contract: none
  - Pagination Contract: none
- `DELETE /v3/documents/bulk` - Bulk Delete Documents
  - Retry Contract: none
  - Pagination Contract: none
- `DELETE /v3/documents/{id}` - Delete Document
  - Retry Contract: none
  - Pagination Contract: none
- `PATCH /v3/documents/{id}` - Update Document
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/documents` - Add Document
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/documents/batch` - Batch Add Documents
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/documents/file` - Upload Document File
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/conversations` - Ingest Conversation
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/profile` - Get Profile
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/profile/buckets` - Get Profile Buckets
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v4/search` - Search Memories
  - Retry Contract: none
  - Pagination Contract: none
- `GET /v3/settings` - Get settings
  - Retry Contract: none
  - Pagination Contract: none
- `PATCH /v3/settings` - Update settings
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/settings/reset` - Reset organization data
  - Retry Contract: none
  - Pagination Contract: none
- `POST /v3/settings/suggest-buckets` - Suggest profile buckets
  - Retry Contract: none
  - Pagination Contract: none
- `PATCH /v3/settings/security` - Patch V3 Settings Security
  - Retry Contract: none
  - Pagination Contract: none

## Usage

1. Install this community-node package in n8n.
2. Add the **Supermemory** node to a workflow.
3. Select a resource and operation, configure its parameters, and execute the workflow.

## Example workflow

Connect **Manual Trigger** -> **Supermemory** -> a destination node, select an operation, then run the workflow and inspect the returned items.

## Development

```sh
npm install
npm run build
npm run lint
npm run dev
```

`npm run dev` starts a local n8n development instance. Find the integration by its **Supermemory** display name.
