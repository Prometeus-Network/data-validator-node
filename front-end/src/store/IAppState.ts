import {
    AccountRegistrationStore,
    AccountsBalanceStore,
    AccountsStore,
    CreateDataOwnerStore,
    DataOwnersAccountsStore
} from "../Account";
import {AddMetadataDialogStore, EditMetadataDialogStore, UploadDataStore, ExtendFileStorageDurationStore} from "../DataUpload";
import {DrawerStore} from "../AppBar";
import {SettingsStore} from "../Settings";
import {TransactionsStore} from "../Transaction";

export interface IAppState {
    store?: any, //needed for Mobx-router
    dataUpload: UploadDataStore,
    metadataAdding: AddMetadataDialogStore,
    metadataEdit: EditMetadataDialogStore,
    registration: AccountRegistrationStore,
    drawer: DrawerStore,
    settings: SettingsStore,
    accounts: AccountsStore,
    balances: AccountsBalanceStore,
    dataOwners: DataOwnersAccountsStore,
    createDataOwner: CreateDataOwnerStore,
    transactions: TransactionsStore,
    fileStorageDurationExtension: ExtendFileStorageDurationStore
}
