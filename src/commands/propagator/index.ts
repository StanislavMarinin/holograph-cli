import * as fs from 'fs-extra'
import * as path from 'node:path'
import * as inquirer from 'inquirer'

import {CliUx, Command, Flags} from '@oclif/core'
import {ethers} from 'ethers'

import {CONFIG_FILE_NAME, ensureConfigFileIsValid} from '../../utils/config'
import {ConfigFile, ConfigNetwork, ConfigNetworks} from '../../utils/config'

import {decodeDeploymentConfigInput, capitalize, NETWORK_COLORS, DeploymentConfig} from '../../utils/utils'
import color from '@oclif/color'
import {startHealcheckServer} from '../../utils/health-check-server'

enum PropagatorMode {
  listen,
  manual,
  auto,
}

type KeepAliveParams = {
  provider: ethers.providers.WebSocketProvider
  onDisconnect: (err: any) => void
  expectedPongBack?: number
  checkInterval?: number
}

type BlockJob = {
  network: string
  block: number
}

const keepAlive = ({provider, onDisconnect, expectedPongBack = 15_000, checkInterval = 7500}: KeepAliveParams) => {
  let pingTimeout: NodeJS.Timeout | null = null
  let keepAliveInterval: NodeJS.Timeout | null = null

  provider._websocket.on('open', () => {
    keepAliveInterval = setInterval(() => {
      provider._websocket.ping()

      // Use `WebSocket#terminate()`, which immediately destroys the connection,
      // instead of `WebSocket#close()`, which waits for the close timer.
      // Delay should be equal to the interval at which your server
      // sends out pings plus a conservative assumption of the latency.
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate()
      }, expectedPongBack)
    }, checkInterval)
  })

  provider._websocket.on('close', (err: any) => {
    if (keepAliveInterval) clearInterval(keepAliveInterval)
    if (pingTimeout) clearTimeout(pingTimeout)
    onDisconnect(err)
  })

  provider._websocket.on('pong', () => {
    if (pingTimeout) clearInterval(pingTimeout)
  })
}

export default class Propagator extends Command {
  static LAST_BLOCKS_FILE_NAME = 'blocks.json'
  static description = 'Listen for EVM events deploys collections to ther supported networks'
  static examples = ['$ holo propagator --networks="rinkeby mumbai fuji" --mode=auto']
  static flags = {
    networks: Flags.string({description: 'Comma separated list of networks to operate to', multiple: true}),
    mode: Flags.string({
      description: 'The mode in which to run the propagator',
      options: ['listen', 'manual', 'auto'],
      char: 'm',
    }),
    healthCheck: Flags.boolean({
      description: 'Launch server on http://localhost:6000 to make sure command is still running',
      default: false
    })
  }

  crossDeployments: string[] = []

  /**
   * Propagator class variables
   */
  bridgeAddress: string | undefined
  factoryAddress: string | undefined
  operatorAddress: string | undefined
  supportedNetworks: string[] = ['rinkeby', 'fuji', 'mumbai']
  blockJobs: BlockJob[] = []
  providers: {[key: string]: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider} = {}
  abiCoder = ethers.utils.defaultAbiCoder
  wallets: {[key: string]: ethers.Wallet} = {}
  holograph!: ethers.Contract
  propagatorMode: PropagatorMode = PropagatorMode.listen
  operatorContract!: ethers.Contract
  factoryContract!: ethers.Contract
  HOLOGRAPH_ADDRESS = '0xD11a467dF6C80835A1223473aB9A48bF72eFCF4D'.toLowerCase()
  LAYERZERO_RECEIVERS: any = {
    rinkeby: '0xF5E8A439C599205C1aB06b535DE46681Aed1007a'.toLowerCase(),
    mumbai: '0xF5E8A439C599205C1aB06b535DE46681Aed1007a'.toLowerCase(),
    fuji: '0xF5E8A439C599205C1aB06b535DE46681Aed1007a'.toLowerCase(),
  }

  targetEvents: Record<string, string> = {
    BridgeableContractDeployed: '0xa802207d4c618b40db3b25b7b90e6f483e16b2c1f8d3610b15b345a718c6b41b',
    '0xa802207d4c618b40db3b25b7b90e6f483e16b2c1f8d3610b15b345a718c6b41b': 'BridgeableContractDeployed',

    AvailableJob: '0x6114b34f1f941c01691c47744b4fbc0dd9d542be34241ba84fc4c0bd9bef9b11',
    '0x6114b34f1f941c01691c47744b4fbc0dd9d542be34241ba84fc4c0bd9bef9b11': 'AvailableJob',
  }

  networkColors: any = {}
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Set all networks to start with latest block at index 0
  latestBlockHeight: {[key: string]: number} = {}
  exited = false

  async loadLastBlocks(fileName: string, configDir: string): Promise<{[key: string]: number}> {
    const filePath = path.join(configDir, fileName)
    let lastBlocks: {[key: string]: number} = {}
    if (await fs.pathExists(filePath)) {
      lastBlocks = await fs.readJson(filePath)
    }

    return lastBlocks
  }

  saveLastBlocks(fileName: string, configDir: string, lastBlocks: {[key: string]: number}): void {
    const filePath = path.join(configDir, fileName)
    fs.writeFileSync(filePath, JSON.stringify(lastBlocks), 'utf8')
  }

  disconnectBuilder(
    userWallet: ethers.Wallet,
    network: string,
    rpcEndpoint: string,
    subscribe: boolean,
  ): (err: any) => void {
    return (err: any) => {
      ;(this.providers[network] as ethers.providers.WebSocketProvider).destroy().then(() => {
        this.debug('onDisconnect')
        this.log(network, 'WS connection was closed', JSON.stringify(err, null, 2))
        this.providers[network] = this.failoverWebSocketProvider(userWallet, network, rpcEndpoint, subscribe)
        this.wallets[network] = userWallet.connect(this.providers[network] as ethers.providers.WebSocketProvider)
      })
    }
  }

  failoverWebSocketProvider(
    userWallet: ethers.Wallet,
    network: string,
    rpcEndpoint: string,
    subscribe: boolean,
  ): ethers.providers.WebSocketProvider {
    this.debug('this.providers', network)
    const provider = new ethers.providers.WebSocketProvider(rpcEndpoint)
    keepAlive({
      provider,
      onDisconnect: this.disconnectBuilder.bind(this)(userWallet, network, rpcEndpoint, true),
    })
    this.providers[network] = provider
    if (subscribe) {
      this.networkSubscribe(network)
    }

    return provider
  }

  async initializeEthers(
    loadNetworks: string[],
    configFile: ConfigFile,
    userWallet: ethers.Wallet | undefined,
    subscribe: boolean,
  ): Promise<void> {
    for (let i = 0, l = loadNetworks.length; i < l; i++) {
      const network = loadNetworks[i]
      const rpcEndpoint = (configFile.networks[network as keyof ConfigNetworks] as ConfigNetwork).providerUrl
      const protocol = new URL(rpcEndpoint).protocol
      switch (protocol) {
        case 'https:':
          this.providers[network] = new ethers.providers.JsonRpcProvider(rpcEndpoint)

          break
        case 'wss:':
          this.providers[network] = this.failoverWebSocketProvider(userWallet!, network, rpcEndpoint, subscribe)
          break
        default:
          throw new Error('Unsupported RPC provider protocol -> ' + protocol)
      }

      if (userWallet !== undefined) {
        this.wallets[network] = userWallet.connect(this.providers[network])
      }

      if (network in this.latestBlockHeight && this.latestBlockHeight[network] > 0) {
        this.structuredLog(network, `Resuming Propagator from block height ${this.latestBlockHeight[network]}`)
      } else {
        this.structuredLog(network, `Starting Propagator from latest block height`)
        this.latestBlockHeight[network] = 0
      }
    }

    const holographABI = await fs.readJson('./src/abi/Holograph.json')
    this.holograph = new ethers.ContractFactory(holographABI, '0x', this.wallets[loadNetworks[0]]).attach(
      this.HOLOGRAPH_ADDRESS.toLowerCase(),
    )

    const holographOperatorABI = await fs.readJson('./src/abi/HolographOperator.json')
    this.operatorContract = new ethers.ContractFactory(holographOperatorABI, '0x').attach(
      await this.holograph.getOperator(),
    )

    const holographFactoryABI = await fs.readJson('./src/abi/HolographFactory.json')
    this.factoryContract = new ethers.ContractFactory(holographFactoryABI, '0x').attach(
      await this.holograph.getFactory(),
    )
  }

  exitHandler = async (exitCode: number): Promise<void> => {
    /**
     * Before exit, save the block heights to the local db
     */
    if (this.exited === false) {
      this.log('')
      this.log(`Saving current block heights: ${JSON.stringify(this.latestBlockHeight)}`)
      this.saveLastBlocks(Propagator.LAST_BLOCKS_FILE_NAME, this.config.configDir, this.latestBlockHeight)
      this.log(`Exiting propagator with code ${exitCode}...`)
      this.log('Goodbye! 👋')
      this.exited = true
    }
  }

  exitRouter = (options: {[key: string]: boolean | string | number}, exitCode: number | string): void => {
    /**
     * Before exit, save the block heights to the local db
     */
    if ((exitCode && exitCode === 0) || exitCode === 'SIGINT') {
      if (this.exited === false) {
        this.log('')
        this.log(`Saving current block heights:\n${JSON.stringify(this.latestBlockHeight, undefined, 2)}`)
        this.saveLastBlocks(Propagator.LAST_BLOCKS_FILE_NAME, this.config.configDir, this.latestBlockHeight)
        this.log(`Exiting propagator with code ${exitCode}...`)
        this.log('Goodbye! 👋')
        this.exited = true
      }

      this.debug(`\nExit code ${exitCode}`)
      if (options.exit) {
        // eslint-disable-next-line no-process-exit, unicorn/no-process-exit
        process.exit()
      }
    } else {
      this.debug(`\nError: ${exitCode}`)
    }
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Propagator)

    const enableHealthCheckServer = flags.healthCheck

    // Have the user input the mode if it's not provided
    let mode: string | undefined = flags.mode

    if (!mode) {
      const prompt: any = await inquirer.prompt([
        {
          name: 'mode',
          message: 'Enter the mode in which to run the propagator',
          type: 'list',
          choices: ['listen', 'manual', 'auto'],
          default: 'listen',
        },
      ])
      mode = prompt.mode
    }

    this.propagatorMode = PropagatorMode[mode as keyof typeof PropagatorMode]
    this.log(`Propagator mode: ${this.propagatorMode}`)

    this.log('Loading user configurations...')
    const configPath = path.join(this.config.configDir, CONFIG_FILE_NAME)
    const {userWallet, configFile} = await ensureConfigFileIsValid(configPath, true)
    this.log('User configurations loaded.')

    this.latestBlockHeight = await this.loadLastBlocks(Propagator.LAST_BLOCKS_FILE_NAME, this.config.configDir)
    let canSync = false
    const lastBlockKeys: string[] = Object.keys(this.latestBlockHeight)
    for (let i = 0, l: number = lastBlockKeys.length; i < l; i++) {
      if (this.latestBlockHeight[lastBlockKeys[i]] > 0) {
        canSync = true
        break
      }
    }

    if (canSync) {
      const syncPrompt: any = await inquirer.prompt([
        {
          name: 'shouldSync',
          message: 'Propagator has previous (missed) blocks that can be synced. Would you like to sync?',
          type: 'confirm',
          default: true,
        },
      ])
      if (syncPrompt.shouldSync === false) {
        this.latestBlockHeight = {}
      }
    }

    // Load defaults for the networks from the config file
    if (flags.networks === undefined || '') {
      flags.networks = Object.keys(configFile.networks)
    }

    // Color the networks 🌈
    for (let i = 0, l = flags.networks.length; i < l; i++) {
      const network = flags.networks[i]
      if (Object.keys(configFile.networks).includes(network)) {
        this.networkColors[network] = color.hex(NETWORK_COLORS[network])
      } else {
        // If network is not supported remove it from the array
        flags.networks.splice(i, 1)
        l--
        i--
      }
    }

    CliUx.ux.action.start(`Starting propagator in mode: ${PropagatorMode[this.propagatorMode]}`)
    await this.initializeEthers(flags.networks, configFile, userWallet, false)

    this.bridgeAddress = (await this.holograph.getBridge()).toLowerCase()
    this.factoryAddress = (await this.holograph.getFactory()).toLowerCase()
    this.operatorAddress = (await this.holograph.getOperator()).toLowerCase()

    this.log(`Holograph address: ${this.HOLOGRAPH_ADDRESS}`)
    this.log(`Bridge address: ${this.bridgeAddress}`)
    this.log(`Factory address: ${this.factoryAddress}`)
    this.log(`Operator address: ${this.operatorAddress}`)
    CliUx.ux.action.stop('🚀')

    // Setup websocket subscriptions and start processing blocks
    for (let i = 0, l = flags.networks.length; i < l; i++) {
      const network = flags.networks[i]

      // Subscribe to events 🎧
      this.networkSubscribe(network)
    }

    // Catch all exit events
    for (const eventType of [`EEXIT`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`]) {
      process.on(eventType, this.exitRouter.bind(this, {exit: true}))
    }

    process.on('exit', this.exitHandler)

    // Start server
    if(enableHealthCheckServer) {
      startHealcheckServer()
    }

    // // Process blocks 🧱
    this.blockJobHandler()
  }

  // you can
  async processBlock(job: BlockJob): Promise<void> {
    this.debug(`processing [${job.network}] ${job.block}`)
    const block = await this.providers[job.network].getBlockWithTransactions(job.block)
    if (block !== null && 'transactions' in block) {
      if (block.transactions.length === 0) {
        this.structuredLog(job.network, `Zero block transactions for block ${job.block}`)
      }

      const interestingTransactions = []
      for (let i = 0, l = block.transactions.length; i < l; i++) {
        const transaction = block.transactions[i]
        if ('to' in transaction && transaction.to !== null && transaction.to !== '') {
          const to: string | undefined = transaction.to?.toLowerCase()
          // Check if it's a factory call
          if (to === this.factoryAddress) {
            // We have a potential factory deployment transaction
            interestingTransactions.push(transaction)
          }
        }
      }

      if (interestingTransactions.length > 0) {
        this.structuredLog(
          job.network,
          `Found ${interestingTransactions.length} interesting transactions on block ${job.block}`,
        )
        this.processTransactions(job.network, interestingTransactions)
      } else {
        this.blockJobHandler()
      }
    } else {
      this.structuredLog(job.network, `${job.network} ${color.red('Dropped block!')} ${job.block}`)
      this.blockJobs.unshift(job)
      this.blockJobHandler()
    }
  }

  // For some reason defining this as function definition causes `this` to be undefined
  blockJobHandler = (): void => {
    if (this.blockJobs.length > 0) {
      const blockJob: BlockJob = this.blockJobs.shift() as BlockJob
      this.processBlock(blockJob)
    } else {
      this.debug('no blocks')
      setTimeout(this.blockJobHandler, 1000)
    }
  }

  async processTransactions(network: string, transactions: ethers.Transaction[]): Promise<void> {
    /* eslint-disable no-await-in-loop */
    if (transactions.length > 0) {
      for (const transaction of transactions) {
        const receipt = await this.providers[network].getTransactionReceipt(transaction.hash as string)
        if (receipt === null) {
          throw new Error(`Could not get receipt for ${transaction.hash}`)
        }

        this.debug(`Processing transaction ${transaction.hash} on ${network} at block ${receipt.blockNumber}`)
        if (transaction.to?.toLowerCase() === this.factoryAddress) {
          await this.handleContractDeployedEvents(transaction, receipt, network)
        }
      }
    }

    this.blockJobHandler()
  }

  async handleContractDeployedEvents(
    transaction: ethers.Transaction,
    receipt: ethers.ContractReceipt,
    network: string,
  ): Promise<void> {
    this.structuredLog(network, `Checking if a new Holograph contract was deployed at tx: ${transaction.hash}`)
    const config: DeploymentConfig = decodeDeploymentConfigInput(transaction.data)
    let event = null
    if ('logs' in receipt && typeof receipt.logs !== 'undefined' && receipt.logs !== null) {
      for (let i = 0, l = receipt.logs.length; i < l; i++) {
        if (event === null) {
          const log = receipt.logs[i]
          if (log.topics.length > 0 && log.topics[0] === this.targetEvents.BridgeableContractDeployed) {
            event = log.topics
            break
          } else {
            this.structuredLog(network, `BridgeableContractDeployed event not found in ${transaction.hash}`)
          }
        }
      }

      if (event) {
        const deploymentAddress = '0x' + event[1].slice(26)
        this.structuredLog(
          network,
          `\nHolographFactory deployed a new collection on ${capitalize(network)} at address ${deploymentAddress}\n` +
            `Wallet that deployed the collection is ${transaction.from}\n` +
            `The config used for deployHolographableContract was ${JSON.stringify(config, null, 2)}\n` +
            `The transaction hash is: ${transaction.hash}\n`,
        )
        if (
          this.propagatorMode !== PropagatorMode.listen &&
          !this.crossDeployments.includes(deploymentAddress.toLowerCase())
        ) {
          await this.executePayload(network, config, deploymentAddress)
        }
      }
    }
  }

  async deployContract(network: string, deploymentConfig: DeploymentConfig, deploymentAddress: string): Promise<void> {
    const contractCode = await this.providers[network].getCode(deploymentAddress)
    if (contractCode === '0x') {
      const factory: ethers.Contract = this.factoryContract.connect(this.wallets[network])
      CliUx.ux.action.start('Calculating gas price')
      let gasAmount
      try {
        this
        gasAmount = await factory.estimateGas.deployHolographableContract(
          deploymentConfig.config,
          deploymentConfig.signature,
          deploymentConfig.signer,
        )
      } catch (error: any) {
        this.error(error.reason)
      }

      const gasPrice = await this.providers[network].getGasPrice()
      CliUx.ux.action.stop()
      this.log(
        'Transaction is estimated to cost a total of',
        ethers.utils.formatUnits(gasAmount.mul(gasPrice), 'ether'),
        'native gas tokens (in ether)',
      )

      try {
        CliUx.ux.action.start('Sending transaction to mempool')
        const deployTx = await factory.deployHolographableContract(
          deploymentConfig.config,
          deploymentConfig.signature,
          deploymentConfig.signer,
        )
        this.debug(deployTx)
        CliUx.ux.action.stop('Transaction hash is ' + deployTx.hash)

        CliUx.ux.action.start('Waiting for transaction to be mined and confirmed')
        const deployReceipt = await deployTx.wait()
        this.debug(deployReceipt)
        let collectionAddress
        for (let i = 0, l = deployReceipt.logs.length; i < l; i++) {
          const log = deployReceipt.logs[i]
          if (
            log.topics.length === 3 &&
            log.topics[0] === '0xa802207d4c618b40db3b25b7b90e6f483e16b2c1f8d3610b15b345a718c6b41b'
          ) {
            collectionAddress = '0x' + log.topics[1].slice(26)
            break
          }
        }

        CliUx.ux.action.stop('Collection deployed to ' + collectionAddress)
        return
      } catch (error: any) {
        this.error(error.error.reason)
      }
    } else {
      this.debug(`${deploymentAddress} already deployed on ${network}`)
    }
  }

  async executePayload(network: string, config: DeploymentConfig, deploymentAddress: string): Promise<void> {
    // If the propagator is in listen mode, contract deployments will not be executed
    // If the propagator is in manual mode, the contract deployments must be manually executed
    // If the propagator is in auto mode, the contract deployments will be executed automatically
    let operate = this.propagatorMode === PropagatorMode.auto
    if (this.propagatorMode === PropagatorMode.manual) {
      const propagatorPrompt: any = await inquirer.prompt([
        {
          name: 'shouldContinue',
          message: `A contract appeared on ${network} for cross-chain deployment, would you like to deploy?\n`,
          type: 'confirm',
          default: false,
        },
      ])
      operate = propagatorPrompt.shouldContinue
    }

    if (operate) {
      this.crossDeployments.push(deploymentAddress.toLowerCase())
      for (const selectedNetwork of this.supportedNetworks) {
        if (selectedNetwork !== network) {
          this.debug(`trying to deploy contract from ${network} to ${selectedNetwork}`)
          await this.deployContract(selectedNetwork, config, deploymentAddress)
        }
      }
    } else {
      this.structuredLog(network, 'Dropped potential contract deployment to execute')
    }
  }

  structuredLog(network: string, msg: string): void {
    const timestamp = new Date(Date.now()).toISOString()
    const timestampColor = color.keyword('green')

    this.log(
      `[${timestampColor(timestamp)}] [${this.constructor.name}] [${this.networkColors[network](
        capitalize(network),
      )}] -> ${msg}`,
    )
  }

  networkSubscribe(network: string): void {
    this.providers[network].on('block', (blockNumber: string) => {
      const block = Number.parseInt(blockNumber, 10)
      if (this.latestBlockHeight[network] !== 0 && block - this.latestBlockHeight[network] > 1) {
        this.debug(`Dropped ${capitalize(network)} websocket connection, gotta do some catching up`)
        let latest = this.latestBlockHeight[network]
        while (block - latest > 1) {
          this.structuredLog(network, `Block ${latest} (Syncing)`)
          this.blockJobs.push({
            network: network,
            block: latest,
          })
          latest++
        }
      }

      this.latestBlockHeight[network] = block
      this.structuredLog(network, `Block ${block}`)
      this.blockJobs.push({
        network: network,
        block: block,
      } as BlockJob)
    })
  }
}