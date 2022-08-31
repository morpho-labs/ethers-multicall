import type {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  Contract,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  Event,
  EventFilter,
  ethers,
} from "ethers";

import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener } from "@ethersproject/providers";

export type TargetContract = Pick<Contract, "functions" | "interface" | "callStatic" | "address">;

export type CallStruct = { target: string; callData: BytesLike };

export type CallStructOutput = [string, string] & {
  target: string;
  callData: string;
};

export type ReturnStruct = { success: boolean; data: BytesLike };

export type ReturnStructOutput = [boolean, string] & {
  success: boolean;
  data: string;
};

export interface TypedEvent<TArgsArray extends Array<any> = any, TArgsObject = any> extends Event {
  args: TArgsArray & TArgsObject;
}

export interface TypedEventFilter<_TEvent extends TypedEvent> extends EventFilter {}

export interface TypedListener<TEvent extends TypedEvent> {
  (...listenerArg: [...__TypechainArgsArray<TEvent>, TEvent]): void;
}

type __TypechainArgsArray<T> = T extends TypedEvent<infer U> ? U : never;

export interface OnEvent<TRes> {
  <TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>,
    listener: TypedListener<TEvent>
  ): TRes;
  (eventName: string, listener: Listener): TRes;
}

export interface MulticallInterface extends ethers.utils.Interface {
  functions: {
    "aggregate((address,bytes)[],bool)": FunctionFragment;
    "getBlockHash(uint256)": FunctionFragment;
    "getCurrentBlockCoinbase()": FunctionFragment;
    "getCurrentBlockDifficulty()": FunctionFragment;
    "getCurrentBlockGasLimit()": FunctionFragment;
    "getCurrentBlockTimestamp()": FunctionFragment;
    "getEthBalance(address)": FunctionFragment;
    "getLastBlockHash()": FunctionFragment;
  };

  getFunction(
    nameOrSignatureOrTopic:
      | "aggregate"
      | "getBlockHash"
      | "getCurrentBlockCoinbase"
      | "getCurrentBlockDifficulty"
      | "getCurrentBlockGasLimit"
      | "getCurrentBlockTimestamp"
      | "getEthBalance"
      | "getLastBlockHash"
  ): FunctionFragment;

  encodeFunctionData(functionFragment: "aggregate", values: [CallStruct[], boolean]): string;
  encodeFunctionData(functionFragment: "getBlockHash", values: [BigNumberish]): string;
  encodeFunctionData(functionFragment: "getCurrentBlockCoinbase", values?: undefined): string;
  encodeFunctionData(functionFragment: "getCurrentBlockDifficulty", values?: undefined): string;
  encodeFunctionData(functionFragment: "getCurrentBlockGasLimit", values?: undefined): string;
  encodeFunctionData(functionFragment: "getCurrentBlockTimestamp", values?: undefined): string;
  encodeFunctionData(functionFragment: "getEthBalance", values: [string]): string;
  encodeFunctionData(functionFragment: "getLastBlockHash", values?: undefined): string;

  decodeFunctionResult(functionFragment: "aggregate", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getBlockHash", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getCurrentBlockCoinbase", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getCurrentBlockDifficulty", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getCurrentBlockGasLimit", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getCurrentBlockTimestamp", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getEthBalance", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getLastBlockHash", data: BytesLike): Result;

  events: {};
}

export interface Multicall extends BaseContract {
  connect(signerOrProvider: Signer | ethers.providers.Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: MulticallInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    aggregate(
      calls: CallStruct[],
      strict: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    getBlockHash(
      blockNumber: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[string] & { blockHash: string }>;

    getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<[string] & { coinbase: string }>;

    getCurrentBlockDifficulty(
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { difficulty: BigNumber }>;

    getCurrentBlockGasLimit(
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { gaslimit: BigNumber }>;

    getCurrentBlockTimestamp(
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { timestamp: BigNumber }>;

    getEthBalance(
      addr: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { balance: BigNumber }>;

    getLastBlockHash(overrides?: CallOverrides): Promise<[string] & { blockHash: string }>;
  };

  aggregate(
    calls: CallStruct[],
    strict: boolean,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<string>;

  getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<string>;

  getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

  getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

  getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

  getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

  getLastBlockHash(overrides?: CallOverrides): Promise<string>;

  callStatic: {
    aggregate(
      calls: CallStruct[],
      strict: boolean,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, ReturnStructOutput[]] & {
        blockNumber: BigNumber;
        returnData: ReturnStructOutput[];
      }
    >;

    getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<string>;

    getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<string>;

    getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

    getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

    getLastBlockHash(overrides?: CallOverrides): Promise<string>;
  };

  filters: {};

  estimateGas: {
    aggregate(
      calls: CallStruct[],
      strict: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    getBlockHash(blockNumber: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<BigNumber>;

    getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

    getEthBalance(addr: string, overrides?: CallOverrides): Promise<BigNumber>;

    getLastBlockHash(overrides?: CallOverrides): Promise<BigNumber>;
  };

  populateTransaction: {
    aggregate(
      calls: CallStruct[],
      strict: boolean,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    getBlockHash(
      blockNumber: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    getCurrentBlockCoinbase(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getCurrentBlockDifficulty(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getCurrentBlockGasLimit(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getCurrentBlockTimestamp(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getEthBalance(addr: string, overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getLastBlockHash(overrides?: CallOverrides): Promise<PopulatedTransaction>;
  };
}

export interface IMulticallWrapper {
  get contract(): Multicall;
  wrap<T extends TargetContract>(contract: T): T;
}
