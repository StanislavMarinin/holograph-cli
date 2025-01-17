import {InterestingTransaction} from '../../types/network-monitor'
import {BlockJob} from '../../utils/network-monitor'

/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */
async function handleCrossChainMessageSentEvent(
  job: BlockJob,
  interestingTransaction: InterestingTransaction,
  tags: (string | number)[] = [],
): Promise<void> {
  // should optimize SQS logic to not make additional calls since all data is already digested and parsed here
  // await sqsHandleBridgeEvent.call(this, this.networkMonitor, interestingTransaction.transaction, job.network, tags)
}

export default handleCrossChainMessageSentEvent
