import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {LoggerService} from "nest-logger";
import {AxiosError} from "axios";
import uuid4 from "uuid/v4";
import fileSystem from "fs";
import {
    ExtendFileStorageDurationRequest,
    ICreateServiceNodeFileRequest,
    IUploadChunkRequest,
    PurchaseFileRequestSignature,
    UploadChunkRequest
} from "./types/request";
import {CheckFileUploadStatusResponse, FileResponse, ServiceNodeFileResponse} from "./types/response";
import {FilesRepository} from "./FilesRepository";
import {ServiceNodeTemporaryFilesRepository} from "./ServiceNodeTemporaryFilesRepository";
import {fileToFileResponse} from "./file-mappers";
import {ServiceNodeTemporaryFile} from "./types/entity";
import {ServiceNodeApiClient} from "../service-node-api";
import {EntityType} from "../nedb/entity";
import {DataOwnersRepository} from "../accounts";
import {config} from "../config";
import {AccountsRepository} from "../accounts/AccountsRepository";
import {Web3Wrapper} from "../web3";
import {EncryptorServiceClient} from "../encryptor";
import {TransactionType} from "../transactions/types/response";

@Injectable()
export class FilesService {
    constructor(private readonly filesRepository: FilesRepository,
                private readonly dataOwnersRepository: DataOwnersRepository,
                private readonly serviceNodeTemporaryFilesRepository: ServiceNodeTemporaryFilesRepository,
                private readonly accountsRepository: AccountsRepository,
                private readonly serviceNodeClient: ServiceNodeApiClient,
                private readonly web3Wrapper: Web3Wrapper,
                private readonly encryptorService: EncryptorServiceClient,
                private readonly log: LoggerService) {
    }

    public async createLocalFile(): Promise<{id: string}> {
        const id = uuid4();
        fileSystem.closeSync(fileSystem.openSync(`${config.LOCAL_FILES_DIRECTORY}/${id}`, "w"));
        return {id};
    }

    public async uploadLocalFileChunk(localFileId: string, uploadChunkRequest: UploadChunkRequest): Promise<void> {
        fileSystem.appendFileSync(`${config.LOCAL_FILES_DIRECTORY}/${localFileId}`, uploadChunkRequest.chunkData);
    }

    public async findFileById(id: string): Promise<FileResponse> {
        const file = await this.filesRepository.findById(id);

        if (!file) {
            throw new HttpException(
                `Could not find file with id ${id}`,
                HttpStatus.NOT_FOUND
            )
        }

        return fileToFileResponse(file);
    }

    public async uploadLocalFileToServiceNode(
        localFileId: string,
        createServiceNodeFileRequest: ICreateServiceNodeFileRequest
    ): Promise<ServiceNodeFileResponse> {
        try {
            const data = fileSystem.readFileSync(`${config.LOCAL_FILES_DIRECTORY}/${localFileId}`).toString("base64");
            const dataEncrypted = (await this.encryptorService.encryptWithAes({content: data})).data;
            const serviceNodeFileResponse = await this.createServiceNodeFile(createServiceNodeFileRequest, {
                key: dataEncrypted.result.key,
                iv: dataEncrypted.result.iv
            });
            this.uploadFileToServiceNodeByChunks(serviceNodeFileResponse.id, dataEncrypted.result.content)
                .then(async () => this.uploadFileToDds(serviceNodeFileResponse.id));
            return serviceNodeFileResponse;
        } catch (error) {
            console.log(error.stack);
            throw error;
        }
    }

    public async createServiceNodeFile(
        createServiceNodeFileRequest: ICreateServiceNodeFileRequest,
        fileKey: {
            key: string,
            iv: string
        }
    ): Promise<ServiceNodeFileResponse> {
        try {
            const serviceNodeResponse = (await this.serviceNodeClient.createServiceNodeFile({
                ...createServiceNodeFileRequest,
            })).data;
            const serviceNodeFile: ServiceNodeTemporaryFile = {
                _type: EntityType.SERVICE_NODE_TEMPORARY_FILE,
                dataValidatorAddress: createServiceNodeFileRequest.dataValidatorAddress,
                ddsFileId: undefined,
                id: serviceNodeResponse.id,
                fileKey
            };
            await this.serviceNodeTemporaryFilesRepository.save(serviceNodeFile);
            return serviceNodeResponse;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    private async uploadFileToServiceNodeByChunks(serviceNodeFileId: string, data: string): Promise<void> {
        const targetPosition = data.length;
        let chunk: string;
        const chunkSize = 5242878;
        const totalChunks = Math.ceil(targetPosition / chunkSize);
        let currentChunk = 0;

        while (currentChunk < totalChunks) {
            const offset = currentChunk * chunkSize;
            chunk = data.slice(offset, offset + chunkSize);
            if (offset + chunkSize < targetPosition) {
                if (chunk.endsWith("=")) {
                    chunk = chunk.substring(0, chunk.indexOf("="));
                } else if (chunk.endsWith("==")) {
                    chunk = chunk.substring(0, chunk.indexOf("=="));
                }
            }
            currentChunk++;
            await this.uploadFileChunk(serviceNodeFileId, {
                chunkData: chunk
            })
        }
    }

    private async uploadFileChunk(serviceNodeFileId: string, uploadChunkRequest: IUploadChunkRequest): Promise<{success: boolean}> {
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
                    .then(async ({data}) => {
                        const fileKey = (await this.serviceNodeTemporaryFilesRepository.findById(serviceNodeFileId)).fileKey;
                        return this.filesRepository.save({
                            id: data.id,
                            _type: EntityType.FILE,
                            mimeType: data.mimeType,
                            extension: data.extension,
                            name: data.name,
                            dataValidator: data.dataValidator,
                            dataOwner: data.dataOwner,
                            keepUntil: data.keepUntil,
                            metadata: data.metadata,
                            serviceNode: data.serviceNode,
                            size: Number(data.size),
                            createdAt: new Date().toISOString(),
                            price: data.price,
                            fileKey
                        })
                    })
                    .then(file => {
                        this.dataOwnersRepository.save({
                            file,
                            _type: EntityType.DATA_OWNER,
                            dataValidatorAddress: file.dataValidator,
                            privateKey: uploadStatus.privateKey!,
                            address: uploadStatus.dataOwner
                        });
                    })
            }

            return uploadStatus;
        } catch (error) {
            this.handleServiceNodeError(error);
        }
    }

    public async uploadFileToDds(serviceNodeFileId: string): Promise<{success: boolean}> {
        try {
            const serviceNodeFile = await this.serviceNodeTemporaryFilesRepository.findById(serviceNodeFileId);
            const account = await this.accountsRepository.findByAddress(serviceNodeFile.dataValidatorAddress);
            const dataToSing = {serviceNodeFileId};
            const signedData = this.web3Wrapper.signData(dataToSing, account.privateKey);
            return (await this.serviceNodeClient.uploadFileToDds(
                serviceNodeFileId,
                {signature: signedData}
            )).data;
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

    public async extendFileStorageDuration(
        fileId: string,
        extendFileStorageDurationRequest: ExtendFileStorageDurationRequest
    ): Promise<{success: boolean}> {
        try {
            const file = await this.filesRepository.findById(fileId);
            await this.serviceNodeClient.extendFileStorageDuration(fileId, extendFileStorageDurationRequest);

            if (file) {
                file.keepUntil = extendFileStorageDurationRequest.keepUntil;
                const dataOwner = await this.dataOwnersRepository.findByFileId(fileId);
                dataOwner.file = file;
                await this.filesRepository.save(file);
                await this.dataOwnersRepository.save(dataOwner);
            }

            return {success: true}
        } catch (error) {
            if (error.response) {
                if (error.response.status === 404) {
                    throw new HttpException(`Could not find file with id ${fileId}`, HttpStatus.NOT_FOUND);
                } else {
                    throw new HttpException(
                        `Could not extend file storage duration, service node responded with ${error.response.status} status`,
                        HttpStatus.INTERNAL_SERVER_ERROR
                    )
                }
            } else {
                throw new HttpException(
                    "Service node is unreachable",
                    HttpStatus.INTERNAL_SERVER_ERROR
                )
            }
        }
    }

    public async getFileKey(fileId: string, purchaseFileRequestSignature: PurchaseFileRequestSignature): Promise<{key: string, iv: string}> {
        if (!this.web3Wrapper.isSignatureValid(purchaseFileRequestSignature.address, purchaseFileRequestSignature)) {
            throw new HttpException(
                "Invalid Ethereum signature",
                HttpStatus.BAD_REQUEST
            )
        }

        const file = await this.filesRepository.findById(fileId);

        if (file === null) {
            throw new HttpException(
                `Could not find file with id ${fileId}`,
                HttpStatus.NOT_FOUND
            );
        }

        if (!this.checkFilePurchaseStatus(fileId, purchaseFileRequestSignature.address)) {
            throw new HttpException(
                `File with id ${fileId} has not been purchased by ${purchaseFileRequestSignature.address}`,
                HttpStatus.FORBIDDEN
            )
        }

        return file.fileKey;
    }

    private async checkFilePurchaseStatus(fileId: string, dataMartAddress: string): Promise<boolean> {
        this.log.info(`Checking if file with ${fileId} id has been purchased by ${dataMartAddress}`);
        let fetchedAllTransactions = false;
        let transactionFound = false;
        let currentPage = 0;
        const pageSize = 100;

        while (!fetchedAllTransactions || !transactionFound) {
            let transactions = (await this.serviceNodeClient.getTransactionsOfAddressByType(
                dataMartAddress,
                TransactionType.DATA_PURCHASE,
                currentPage,
                pageSize,
            )).data;

            if (transactions.length === 0) {
                fetchedAllTransactions = true;
                break;
            }

            transactions = transactions.filter(transaction => transaction.dataMart === dataMartAddress && transaction.id === fileId);

            if (transactions.length !== 0) {
                this.log.info(`File with ${fileId} id has been purchased by ${dataMartAddress}`);
                transactionFound = true;
                break;
            }

            currentPage += 1;
        }

        return transactionFound;
    }

    private handleServiceNodeError(error: any): void {
        console.log(error);
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
