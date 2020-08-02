import {Injectable} from "@nestjs/common";
import Web3 from "web3";
import {Account} from "web3-core";
import {EthereumSignature} from "../service-node-api/types/request";

@Injectable()
export class Web3Wrapper {
    constructor(private readonly web3: Web3) {
    }

    public signData(data: object, privateKey: string): EthereumSignature {
        const jsonData = JSON.stringify(data);
        const base64Data = Buffer.from(jsonData).toString("base64");

        if (!privateKey.startsWith("0x")) {
            privateKey = `0x${privateKey}`;
        }

        const signature = this.web3.eth.accounts.sign(base64Data, privateKey);
        return {
            ...signature,
            messageHash: signature.messageHash!
        }
    }

    public generateAccountFromPrivateKey(privateKey: string): Account {
        return this.web3.eth.accounts.privateKeyToAccount(privateKey);
    }

    public isSignatureValid(address: string, signature: EthereumSignature): boolean {
        try {
            return this.web3.eth.accounts.recover(signature) === address;
        } catch (error) {
            return false;
        }
    }
}
