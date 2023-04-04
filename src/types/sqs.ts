import {Environment} from '@holographxyz/environment'

export enum PayloadType {
  HolographProtocol = 'HolographProtocol',
  ERC20 = 'ERC20',
  ERC721 = 'ERC721',
}

export enum EventName {
  MintNft = 'MintNft',
  BridgePreProcess = 'BridgePreProcess',
  ContractDeployed = 'ContractDeployed',
  AvailableOperatorJob = 'AvailableOperatorJob',
  TransferERC721 = 'TransferERC721',
}

export type SqsMessageBody = {
  type: PayloadType
  eventName: EventName
  eventSignature?: string
  tagId: (string | number)[]
  chainId: number
  holographAddress: string
  environment: Environment
  payload: MintEventPayload | BridgeEventPayload | TransferEventPayload
}

export type MintEventPayload = {
  tx: string
  blockNum: number
  collectionAddress: string
  nftTokenId: string
  to: string
}

export type TransferEventPayload = {
  tx: string
  blockNum: number
  from: string
  to: string
  contractAddress: string
  hexEncodedTokenId: string
}

export type BridgeEventPayload = {
  tx: string
  blockNum: number
}
