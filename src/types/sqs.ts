import {Environment} from '@holographxyz/environment'
import {CrossChainMessageType} from '../utils/event/event'

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
  payload: ContractDeployedEventPayload | MintEventPayload | BridgeEventPayload | TransferEventPayload
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
  logIndex: number
  blockNum: number
  from: string
  to: string
  contractAddress: string
  tokenId: string
}

export type ContractDeployedEventPayload = {
  tx: string
  blockNum: number
}

export type BridgeEventPayload = {
  tx: string
  blockNum: number
  crossChainMessageType: CrossChainMessageType
}
