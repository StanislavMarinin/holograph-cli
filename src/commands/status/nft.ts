import * as fs from 'fs-extra'
import * as path from 'node:path'
import * as inquirer from 'inquirer'

import {CliUx, Command, Flags} from '@oclif/core'
import {ethers} from 'ethers'

import {CONFIG_FILE_NAME, ensureConfigFileIsValid} from '../../utils/config'
import {ConfigFile, ConfigNetwork, ConfigNetworks} from '../../utils/config'
import {addressValidator, tokenValidator} from '../../utils/validation'

export default class Nft extends Command {
  static LAST_BLOCKS_FILE_NAME = 'blocks.json'
  static description = 'Check the status of an nft across all enabled networks'
  static examples = ['$ holo status:nft --address="0x5059bf8E4De43ccc0C27ebEc9940e2310E071A78" --id=1']
  static flags = {
    address: Flags.string({description: 'The address of contract to check status of'}),
    id: Flags.string({description: 'Token ID to check'}),
    output: Flags.string({options: ['csv', 'json', 'yaml', ''], description: 'Define table output type', default: 'yaml'}),
  }

  tokenId!: string
  contractAddress!: string

  registryAddress!: string
  supportedNetworks: string[] = []
  blockExplorers: { [key: string]: string; } = {
    'rinkeby': 'https://rinkeby.etherscan.io/',
    'mumbai': 'https://mumbai.polygonscan.com/',
    'fuji': 'https://testnet.snowtrace.io/',
  }

  providers: {[key: string]: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider} = {}
  holograph!: ethers.Contract
  registryContract!: ethers.Contract
  erc721Contract!: ethers.Contract
  HOLOGRAPH_ADDRESS = '0xD11a467dF6C80835A1223473aB9A48bF72eFCF4D'.toLowerCase()

  async initializeEthers(
    configFile: ConfigFile,
  ): Promise<void> {
    for (let i = 0, l = this.supportedNetworks.length; i < l; i++) {
      const network = this.supportedNetworks[i]
      const rpcEndpoint = (configFile.networks[network as keyof ConfigNetworks] as ConfigNetwork).providerUrl
      const protocol = new URL(rpcEndpoint).protocol
      switch (protocol) {
        case 'https:':
          this.providers[network] = new ethers.providers.JsonRpcProvider(rpcEndpoint)

          break
        case 'wss:':
          this.providers[network] = new ethers.providers.WebSocketProvider(rpcEndpoint)
          break
        default:
          throw new Error('Unsupported RPC provider protocol -> ' + protocol)
      }
    }

    const holographABI = await fs.readJson('./src/abi/Holograph.json')
    this.holograph = new ethers.Contract(this.HOLOGRAPH_ADDRESS, holographABI, this.providers[this.supportedNetworks[0]])

    const holographRegistryABI = await fs.readJson('./src/abi/HolographRegistry.json')
    this.registryAddress = await this.holograph.getRegistry()
    this.registryContract = new ethers.Contract(this.registryAddress, holographRegistryABI, this.providers[this.supportedNetworks[0]])
    const erc721ABI = await fs.readJson('./src/abi/ERC721Holograph.json')
    this.erc721Contract = new ethers.Contract(this.contractAddress, erc721ABI, this.providers[this.supportedNetworks[0]])
  }

  async validateContractAddress(): Promise<void> {
    if (this.contractAddress === '') {
      const prompt: any = await inquirer.prompt([
        {
          name: 'contractAddress',
          message: 'Enter the contract address to check status of',
          type: 'string',
          validate: async (input: string) => {
            return addressValidator.test(input) ? true : 'Input is not a valid contract address'
          },
        },
      ])
      this.contractAddress = prompt.contractAddress
    }

    if (!addressValidator.test(this.contractAddress)) {
      throw new Error(`Invalid contract address: ${this.contractAddress}`)
    }
  }

  async validateTokenId(): Promise<void> {
    if (this.tokenId === '') {
      const prompt: any = await inquirer.prompt([
        {
          name: 'tokenId',
          message: 'Provide a token ID to get status for',
          type: 'string',
          validate: async (input: string) => {
            return tokenValidator.test(input) ? true : 'Input is neither a valid number or 32-byte hex string'
          },
        },
      ])
      this.tokenId = prompt.tokenId
    }

    if (!tokenValidator.test(this.tokenId)) {
      this.error('Invalid token ID')
    }
  }

  async run(): Promise<void> {
    this.log('Loading user configurations...')
    const configPath = path.join(this.config.configDir, CONFIG_FILE_NAME)
    const {configFile} = await ensureConfigFileIsValid(configPath, undefined, false)
    this.log('User configurations loaded.')

    const {flags} = await this.parse(Nft)
    this.contractAddress = flags.address || ''
    this.tokenId = flags.id || ''
    await this.validateContractAddress()
    await this.validateTokenId()

    this.supportedNetworks = Object.keys(configFile.networks)

    await this.initializeEthers(configFile)

    // data we want
    // network -- deployed -- valid -- address -- explorer link
    const data: { network: string; deployed: boolean; valid: boolean; exists: boolean; owner: string; link: string; }[] = []
    for (const network of this.supportedNetworks) {
      const d: { network: string; deployed: boolean; valid: boolean; exists: boolean; owner: string; link: string; } = {
        network,
        deployed: false,
        valid: false,
        exists: false,
        owner: '0x',
        link: '',
      }
      const provider = this.providers[network]
      const registry = this.registryContract.connect(provider)
      const erc721 = this.erc721Contract.connect(provider)
      // eslint-disable-next-line no-await-in-loop
      const code = await provider.getCode(this.contractAddress, 'latest')
      const token = ethers.BigNumber.from(this.tokenId)
      if (code === '0x') {
        // do nothing
      } else {
        d.deployed = true
        // eslint-disable-next-line no-await-in-loop
        d.valid = await registry.isHolographedContract(this.contractAddress)
        if (d.valid) {
          // eslint-disable-next-line no-await-in-loop
          d.exists = await erc721.exists(token.toHexString())
          if (d.exists) {
            // eslint-disable-next-line no-await-in-loop
            d.owner = await erc721.ownerOf(token.toHexString())
            d.link = this.blockExplorers[network] + 'token/' + this.contractAddress + '?a=' + token.toString()
          }
        }
      }

      data.push(d)
    }

    CliUx.ux.table(data, {
      network: {
        header: 'Network',
      },
      deployed: {
        header: 'Deployed',
      },
      valid: {
        header: 'Valid',
      },
      exists: {
        header: 'Exists',
      },
      owner: {
        header: 'Owner',
      },
      link: {
        header: 'Explorer Link',
      },
    }, {
      printLine: this.log.bind(this),
      'no-truncate': true,
      'no-header': false,
      output: flags.output,
    })
    this.exit()
  }

}