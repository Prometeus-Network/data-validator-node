import {CreateFileMetadataRequest} from "./CreateFileMetadataRequest";

export interface ICreateServiceNodeFileRequest {
    keepUntil: string,
    name: string,
    additional: CreateFileMetadataRequest,
    dataOwnerAddress: string,
    size: number,
    dataValidatorAddress: string,
    mimeType: string,
    extension: string,
}
