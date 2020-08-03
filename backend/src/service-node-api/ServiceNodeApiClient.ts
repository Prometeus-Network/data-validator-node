import {Inject, Injectable} from "@nestjs/common";
import {AxiosInstance, AxiosPromise} from "axios";
import {LoggerService} from "nest-logger";
import {RegisterAccountRequest, ServiceNodeWithdrawFundsRequest, SignedRequest} from "./types/request";
import {AccountRegistrationStatusResponse, ServiceNodeLambdaTransactionResponse} from "./types/response";
import {BalanceResponse, DataOwnersOfDataValidatorResponse} from "../accounts/types/response";
import {CheckFileUploadStatusResponse, DdsFileResponse, ServiceNodeFileResponse} from "../files/types/response";
import {ExtendFileStorageDurationRequest, ICreateServiceNodeFileRequest, IUploadChunkRequest} from "../files/types/request"
import {ICreateDataOwnerRequest} from "../accounts/types/request";
import {ServiceNodeTransactionResponse, TransactionType} from "../transactions/types/response";
import {RoundRobinLoadBalancerClient} from "../discovery";
import {RegisterNodeRequest} from "../discovery/types/request";

@Injectable()
export class ServiceNodeApiClient {
    constructor(@Inject("serviceNodeApiAxios") private readonly axios: AxiosInstance,
                private readonly loadBalancerClient: RoundRobinLoadBalancerClient,
                private readonly log: LoggerService) {};

    public createServiceNodeFile(createServiceNodeFileRequest: ICreateServiceNodeFileRequest): AxiosPromise<ServiceNodeFileResponse> {
        return this.axios.post(`${this.getUrl()}/api/v1/files/local`, createServiceNodeFileRequest);
    }

    public uploadFileChunk(serviceNodeFileId: string, uploadFileChunkRequest: IUploadChunkRequest): AxiosPromise<{success: boolean}> {
        return this.axios.post(`${this.getUrl()}/api/v1/files/local/${serviceNodeFileId}/chunk`, uploadFileChunkRequest);
    }

    public uploadFileToDds(serviceNodeFileId: string, uploadRequest: SignedRequest): AxiosPromise<{success: boolean}> {
        return this.axios.post(`${this.getUrl()}/api/v1/files/local/${serviceNodeFileId}/to-dds`, uploadRequest);
    }

    public checkFileUploadStatus(serviceNodeFileId: string): AxiosPromise<CheckFileUploadStatusResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/files/local/${serviceNodeFileId}/is-fully-uploaded`);
    }

    public deleteServiceNodeFile(serviceNodeFileId: string): AxiosPromise<{success: boolean}> {
        return this.axios.delete(`${this.getUrl()}/api/v1/files/local/${serviceNodeFileId}`);
    }

    public getDataOwnersOfDataValidator(dataValidatorAddress: string): AxiosPromise<DataOwnersOfDataValidatorResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/data-validators/${dataValidatorAddress}/data-owners`);
    }

    public getFileInfo(fileId: string): AxiosPromise<DdsFileResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/files/${fileId}/info`);
    }

    public getBalanceOfAccount(address: string): AxiosPromise<BalanceResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/${address}/balance`);
    }

    public registerAccount(registerAccountRequest: RegisterAccountRequest): AxiosPromise<void> {
        return this.axios.post(`${this.getUrl()}/api/v1/accounts`, registerAccountRequest);
    }

    public isAccountRegistered(address: string): AxiosPromise<AccountRegistrationStatusResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/${address}/is-registered`);
    }

    public registerDataOwner(createDataOwnerRequest: ICreateDataOwnerRequest): AxiosPromise<DataOwnersOfDataValidatorResponse> {
        return this.axios.post(`${this.getUrl()}/api/v1/accounts/data-owners`, createDataOwnerRequest);
    }

    public getTransactionsOfAddress(address: string, page: number, size: number): AxiosPromise<ServiceNodeTransactionResponse[]> {
        return this.axios.get(`${this.getUrl()}/api/v1/transactions/${address}?page=${page}&size=${size}`);
    }

    // tslint:disable-next-line:max-line-length
    public getTransactionsOfAddressByType(address: string, type: TransactionType, page: number, size: number): AxiosPromise<ServiceNodeTransactionResponse[]> {
        return this.axios.get(`${this.getUrl()}/api/v1/transactions/${address}?type=${type}&page=${page}&size=${size}`);
    }

    public extendFileStorageDuration(fileId: string, extendFileStorageDurationRequest: ExtendFileStorageDurationRequest): AxiosPromise<void> {
        return this.axios.patch(`${this.getUrl()}/api/v1/files/${fileId}`, extendFileStorageDurationRequest);
    }

    public getBalanceOfLambdaWallet(address: string): AxiosPromise<BalanceResponse> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/lambda/${address}/balance`);
    }

    public withdrawFunds(serviceNodeWithdrawFundsRequest: ServiceNodeWithdrawFundsRequest): AxiosPromise<void> {
        return this.axios.post(`${this.getUrl()}/api/v1/accounts/withdraw`, serviceNodeWithdrawFundsRequest);
    }

    public isLambdaWalletRegistered(lambdaWallet: string): AxiosPromise<Omit<AccountRegistrationStatusResponse, "role">> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/lambda/${lambdaWallet}/is-registered`);
    }

    public getTransactionsOfLambdaWallet(lambdaWallet: string): AxiosPromise<ServiceNodeLambdaTransactionResponse[]> {
        return this.axios.get(`${this.getUrl()}/api/v1/accounts/lambda/${lambdaWallet}/transactions`);
    }

    private getUrl(): string {
        const serviceNodeInstance = this.loadBalancerClient.getServiceNodeInstance();
        this.log.debug(`Chosen Service node instance IP: ${serviceNodeInstance.ipAddress}`);
        return `http://${serviceNodeInstance.ipAddress}:${serviceNodeInstance.port}`;
    }
}
