export interface CheckFileUploadStatusResponse {
    fullyUploaded: boolean,
    failed: boolean,
    ddsFileId?: string,
    price?: number,
    dataOwner?: string,
    privateKey?: string
}
