import {IBaseEntity} from "../../../nedb/entity";

export interface ServiceNodeTemporaryFile extends IBaseEntity {
    id: string,
    dataValidatorAddress: string,
    ddsFileId?: string,
    localId?: string,
    fileKey: {
        key: string,
        iv: string
    }
}
