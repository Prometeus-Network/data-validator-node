import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {AxiosError} from "axios";
import {FilesRepository} from "./FilesRepository";
import {ServiceNodeApiClient} from "../service-node-api";
import {ICreateServiceNodeFileRequest, IUploadChunkRequest} from "../model/api/request";
import {CheckFileUploadStatusResponse, ServiceNodeFileResponse} from "../model/api/response";
import {EntityType} from "../model/entity";
import {DataOwnersRepository} from "../accounts/DataOwnersRepository";

@Injectable()
export class FilesService {
    constructor(private readonly filesRepository: FilesRepository,
                private readonly dataOwnersRepository: DataOwnersRepository,
                private readonly serviceNodeClient: ServiceNodeApiClient) {}

    public async createServiceNodeFile(createServiceNodeFileRequest: ICreateServiceNodeFileRequest): Promise<ServiceNodeFileResponse> {
        try {
            return (await this.serviceNodeClient.createServiceNodeFile(createServiceNodeFileRequest)).data;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    public async uploadFileChunk(serviceNodeFileId: string, uploadChunkRequest: IUploadChunkRequest): Promise<{success: boolean}> {
        try {
            return (await this.serviceNodeClient.uploadFileChunk(serviceNodeFileId, uploadChunkRequest)).data;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    public async checkServiceFileUploadStatusAndSaveFileIfItHasBeenUploaded(serviceNodeFileId: string): Promise<CheckFileUploadStatusResponse> {
        try {
            const uploadStatus = (await this.serviceNodeClient.checkFileUploadStatus(serviceNodeFileId)).data;

            if (uploadStatus.fullyUploaded) {
                this.serviceNodeClient.getFileInfo(uploadStatus.ddsFileId)
                    .then(({data}) => this.filesRepository.save({
                        id: data.id,
                        _type: EntityType.FILE,
                        mimeType: data.attributes.additional.mimeType,
                        extension: data.attributes.additional.extension,
                        name: data.attributes.additional.name,
                        dataValidator: data.attributes.additional.dataValidator,
                        dataOwner: data.attributes.additional.dataOwner,
                        keepUntil: data.attributes.additional.keepUntil,
                        metadata: data.attributes.additional,
                        serviceNode: data.attributes.additional.serviceNode,
                        size: Number(data.attributes.additional.size),
                        createdAt: new Date().toISOString(),
                        price: data.attributes.price
                    }))
                    .then(file => {
                        this.dataOwnersRepository.findByAddress(file.dataOwner).then(dataOwner => this.dataOwnersRepository.save({
                            ...dataOwner,
                            file
                        }))
                    })
            }

            return uploadStatus;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    public async uploadFileToDds(serviceNodeFileId: string): Promise<{success: boolean}> {
        try {
            return (await this.serviceNodeClient.uploadFileToDds(serviceNodeFileId)).data;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    public async deleteServiceNodeFile(serviceNodeFileId: string): Promise<{success: boolean}> {
        try {
            return (await this.serviceNodeClient.deleteServiceNodeFile(serviceNodeFileId)).data;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    private handleServiceNodeError(error: any): void {
        if (error.response) {
            error = error as AxiosError;
            // tslint:disable-next-line:max-line-length
            throw new HttpException(
                `Could not create Service node file. Service node responded with ${error.response.status} status`,
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        } else {
            throw new HttpException("Service node is unreachable", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
