/*
 * Copyright 2019-2020, Offchain Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-env browser */
'use strict'

import * as ArbValue from './value'
import { L2Call } from './message'

import * as ethers from 'ethers'

import evm from './abi/evm.evm.d'

const NAMESPACE = 'Aggregator'

// TODO remove this dep
const jaysonBrowserClient = require('jayson/lib/client/browser') // eslint-disable-line @typescript-eslint/no-var-requires

/* eslint-disable no-alert, @typescript-eslint/no-explicit-any */
function _arbClient(managerAddress: string): any {
  /* eslint-disable no-alert, @typescript-eslint/no-explicit-any */
  const callServer = (request: any, callback: any): void => {
    const options = {
      body: request, // request is a string
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }

    fetch(managerAddress, options)
      /* eslint-disable no-alert, @typescript-eslint/no-explicit-any */
      .then((res: any) => {
        return res.text()
      })
      .then((text: string) => {
        callback(null, text)
      })
      .catch((err: Error) => {
        callback(err)
      })
  }

  return jaysonBrowserClient(callServer, {})
}

interface RawMessageResult {
  log: ArbValue.Value
  txIndex: number
  startLogIndex: number
}

interface OutputMessage {
  outputMsg: ArbValue.Value
}

function convertBlockTag(tag?: ethers.providers.BlockTag): string | undefined {
  if (tag === undefined || typeof tag == 'string') {
    return tag
  }

  return ethers.utils.bigNumberify(tag).toHexString()
}

function convertTopics(
  topicGroups?: Array<string | Array<string>>
): Array<evm.TopicGroup> | undefined {
  if (topicGroups == undefined) {
    return topicGroups
  }
  return topicGroups.map(
    (topics): evm.TopicGroup => {
      if (typeof topics == 'string') {
        return { topics: [topics] }
      } else {
        return { topics }
      }
    }
  )
}

export class ArbClient {
  /* eslint-disable no-alert, @typescript-eslint/no-explicit-any */
  public client: any

  constructor(managerUrl: string) {
    this.client = _arbClient(managerUrl)
  }

  public async getBlockCount(): Promise<number> {
    const params: evm.BlockCountArgs = {}
    return await new Promise<number>((resolve, reject): void => {
      this.client.request(
        `${NAMESPACE}.GetOutputMessage`,
        [params],
        (err: Error, error: Error, result: evm.BlockCountReply) => {
          if (err) {
            reject(err)
          } else if (error) {
            reject(error)
          } else {
            resolve(result.height)
          }
        }
      )
    })
  }

  public async getOutputMessage(index: number): Promise<OutputMessage> {
    const params: evm.GetOutputMessageArgs = { index }
    const msgResult = await new Promise<evm.GetOutputMessageReply>(
      (resolve, reject): void => {
        this.client.request(
          `${NAMESPACE}.GetOutputMessage`,
          [params],
          (err: Error, error: Error, result: evm.GetOutputMessageReply) => {
            if (err) {
              reject(err)
            } else if (error) {
              reject(error)
            } else {
              resolve(result)
            }
          }
        )
      }
    )
    if (msgResult.rawVal === undefined) {
      throw Error("reply didn't contain output")
    }
    return {
      outputMsg: ArbValue.unmarshal(msgResult.rawVal),
    }
  }

  public async getRequestResult(txHash: string): Promise<RawMessageResult> {
    const params: evm.GetRequestResultArgs = {
      txHash,
    }
    const messageResult = await new Promise<evm.GetRequestResultReply>(
      (resolve, reject): void => {
        this.client.request(
          `${NAMESPACE}.GetMessageResult`,
          [params],
          (err: Error, error: Error, result: evm.GetRequestResultReply) => {
            if (err) {
              reject(err)
            } else if (error) {
              reject(error)
            } else {
              resolve(result)
            }
          }
        )
      }
    )

    if (
      messageResult.rawVal === undefined ||
      messageResult.index === undefined ||
      messageResult.startLogIndex === undefined
    ) {
      throw Error("reply didn't contain result")
    }

    return {
      log: ArbValue.unmarshal(messageResult.rawVal),
      txIndex: messageResult.index,
      startLogIndex: messageResult.startLogIndex,
    }
  }

  private _call(
    callFunc: string,
    l2Call: L2Call,
    sender: string | undefined
  ): Promise<ArbValue.Value> {
    return new Promise((resolve, reject): void => {
      const params: evm.CallMessageArgs = {
        data: ethers.utils.hexlify(l2Call.asData()),
        sender,
      }
      this.client.request(
        callFunc,
        [params],
        (err: Error, error: Error, result: evm.CallMessageReply) => {
          if (err) {
            reject(err)
          } else if (error) {
            reject(error)
          } else {
            if (result.rawVal === undefined) {
              reject('call result empty')
              return
            }
            resolve(ArbValue.unmarshal(result.rawVal))
          }
        }
      )
    })
  }

  public call(tx: L2Call, sender: string | undefined): Promise<ArbValue.Value> {
    return this._call(`${NAMESPACE}.CallMessage`, tx, sender)
  }

  public pendingCall(
    tx: L2Call,
    sender: string | undefined
  ): Promise<ArbValue.Value> {
    return this._call(`${NAMESPACE}.PendingCall`, tx, sender)
  }

  public findLogs(filter: ethers.providers.Filter): Promise<evm.FullLogBuf[]> {
    return new Promise((resolve, reject): void => {
      const addresses: string[] = []
      if (filter.address !== undefined) {
        addresses.push(filter.address)
      }

      const params: evm.FindLogsArgs = {
        addresses,
        fromHeight: convertBlockTag(filter.fromBlock),
        toHeight: convertBlockTag(filter.toBlock),
        topicGroups: convertTopics(filter.topics),
      }
      return this.client.request(
        `${NAMESPACE}.FindLogs`,
        [params],
        (err: Error, error: Error, result: evm.FindLogsReply) => {
          if (err) {
            reject(err)
          } else if (error) {
            reject(error)
          } else {
            resolve(result.logs)
          }
        }
      )
    })
  }

  public getChainAddress(): Promise<string> {
    const params: evm.GetChainAddressArgs = {}
    return new Promise((resolve, reject): void => {
      this.client.request(
        `${NAMESPACE}.GetChainAddress`,
        [params],
        (err: Error, error: Error, result: evm.GetChainAddressReply) => {
          if (err) {
            reject(err)
          } else if (error) {
            reject(error)
          } else {
            resolve(result.chainAddress)
          }
        }
      )
    })
  }
}
