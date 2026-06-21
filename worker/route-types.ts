import type { paths, components } from "../openapi/vuefinder";

export type DirEntry = components["schemas"]["DirEntry"];
export type FileListResponse = components["schemas"]["FsData"];

export type ErrorResponse = components["schemas"]["ErrorResponse"];

export type DeleteResult = components["schemas"]["DeleteResult"];
export type FileOperationResult = components["schemas"]["FileOperationResult"];
export type FileContentResult = components["schemas"]["FileContentResult"];

export type DeleteRequest = components["schemas"]["DeleteRequest"];
export type DeleteItems = components["schemas"]["DeleteRequest"]["items"];
export type RenameRequest = components["schemas"]["RenameRequest"];
export type TransferRequest = components["schemas"]["TransferRequest"];
export type ArchiveRequest = components["schemas"]["ArchiveRequest"];
export type UnarchiveRequest = components["schemas"]["UnarchiveRequest"];
export type CreateItemRequest = components["schemas"]["CreateItemRequest"];
export type SaveRequest = components["schemas"]["SaveRequest"];

export type UploadRequest = {
	file: File;
	path: string;
	name?: string;
    type?: string;
};

export type SearchFilesQuery = paths["/search"]["get"]["parameters"]["query"];

