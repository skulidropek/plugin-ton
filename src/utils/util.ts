import { Address, beginCell, Cell, internal, SendMode } from "@ton/ton";
import pinataSDK from "@pinata/sdk";

import { readdirSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import { WalletProvider } from "../providers/wallet";
// import { MintParams } from "./NFTCollection";
export const sleep = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
};

export const base64ToHex = (base64: string) => {
    return Buffer.from(base64, "base64").toString("hex");
};

export function bufferToChunks(buff: Buffer, chunkSize: number) {
    const chunks: Buffer[] = [];
    while (buff.byteLength > 0) {
      chunks.push(buff.subarray(0, chunkSize));
      buff = buff.subarray(chunkSize);
    }
    return chunks;
  }

 export  function makeSnakeCell(data: Buffer): Cell {
    const chunks = bufferToChunks(data, 127);

    if (chunks.length === 0) {
      return beginCell().endCell();
    }

    if (chunks.length === 1) {
      return beginCell().storeBuffer(chunks[0]).endCell();
    }

    let curCell = beginCell();

    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];

      curCell.storeBuffer(chunk);

      if (i - 1 >= 0) {
        const nextCell = beginCell();
        nextCell.storeRef(curCell);
        curCell = nextCell;
      }
    }

    return curCell.endCell();
  }

  export function encodeOffChainContent(content: string) {
    let data = Buffer.from(content);
    const offChainPrefix = Buffer.from([0x01]);
    data = Buffer.concat([offChainPrefix, data]);
    return makeSnakeCell(data);
  }

  export async function waitSeqno(seqno: number, wallet) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(2000);
      const seqnoAfter = await wallet.contract.getSeqno();
      if (seqnoAfter == seqno + 1) break;
    }
  }

  export async function uploadFolderToIPFS(folderPath: string): Promise<string> {
  const pinata = new pinataSDK({
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretApiKey: process.env.PINATA_API_SECRET,
  });

  const response = await pinata.pinFromFS(folderPath);
  return response.IpfsHash;
}

export async function updateMetadataFiles(metadataFolderPath: string, imagesIpfsHash: string): Promise<void> {
  const files = readdirSync(metadataFolderPath);

  files.forEach(async (filename, index) => {
    const filePath = path.join(metadataFolderPath, filename)
    const file = await readFile(filePath);

    const metadata = JSON.parse(file.toString());
    metadata.image =
      index != files.length - 1
        ? `ipfs://${imagesIpfsHash}/${index}.jpg`
        : `ipfs://${imagesIpfsHash}/logo.jpg`;

    await writeFile(filePath, JSON.stringify(metadata));
  });
}

export async function uploadJSONToIPFS(json: any): Promise<string> {
  const pinata = new pinataSDK({
    pinataApiKey: process.env.PINATA_API_KEY,
    pinataSecretApiKey: process.env.PINATA_API_SECRET,
  });

  const response = await pinata.pinJSONToIPFS(json);
  return response.IpfsHash;
}

export function formatCurrency(amount: string, digits: number): string {
  try {
      return parseFloat(amount).toFixed(digits).toString();
  } catch (e) {
      return "0";
  }
};


export async function topUpBalance(
    walletProvider: WalletProvider,
    nftAmount: number,
    collectionAddress: string
  ): Promise<number> {
    const feeAmount = 0.026 // approximate value of fees for 1 transaction in our case
    const walletClient = walletProvider.getWalletClient();
    const contract = walletClient.open(walletProvider.wallet);
    const seqno = await contract.getSeqno();
    const amount = nftAmount * feeAmount;

    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [
        internal({
          value: amount.toString(),
          to: collectionAddress,
          bounce: false,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    });

    return seqno;
  }

  export async function waitSeqnoContract(seqno: number, contract) {

    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(2000);
      console.log("Transaction sent, still waiting for confirmation...")

      const seqnoAfter: number = await contract.getSeqno();
      if (seqnoAfter == seqno + 1) break;
    }
  }


  export function sanitizeTonAddress(input: string, bounceable?: boolean, testOnly?: boolean): string | null {
    try {
        // Parse the input into a normalized address
        const address = Address.parse(input);

        // Convert to the desired format based on the provided flags
        const sanitizedAddress = address.toString({ bounceable: bounceable ?? false, testOnly: testOnly ?? false });

        return sanitizedAddress;
    } catch (error) {
        console.error("Invalid TON address:", error.message);
        return null; // Return null if the address is invalid
    }
}


/**
* Converts an input (string or number) to a BigInt.
*
* The input may contain underscore separators (e.g. "50_000") which are removed.
* The returned value is a BigInt (e.g. 50_000n).
*
* @param input - The input string or number.
* @returns The corresponding BigInt.
*/
export function convertToBigInt(input: string | number): bigint {
    // If the input is a string, remove underscores; otherwise, just convert the number.
    const cleanedInput = typeof input === "string" ? input.replace(/_/g, "") : input;
    return BigInt(cleanedInput);
}
