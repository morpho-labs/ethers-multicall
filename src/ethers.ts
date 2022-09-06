import DataLoader from "dataloader";
import { Contract, ethers } from "ethers";
import { FunctionFragment, Interface } from "ethers/lib/utils";

import MulticallAbi from "./abi.json";
import { MulticallContract } from "./contract";
import { Multicall, IMulticallWrapper, CallStruct } from "./interface";
import { MULTICALL_ADDRESSES } from "./registry";

export type ContractCall = {
  fragment: FunctionFragment;
  address: string;
  params: any[];
  stack?: string;
};

type TargetContract = Pick<Contract, "functions" | "interface" | "callStatic" | "address">;

export const isMulticallUnderlyingError = (err: Error) =>
  err.message.includes("Multicall call failed for");

export type MulticallCallbackHooks = {
  beforeCallHook?: (calls: ContractCall[], callRequests: CallStruct[]) => void;
};

const DEFAULT_DATALOADER_OPTIONS = { cache: false, maxBatchSize: 250 };

export interface EthersMulticallOptions {
  chainId: number;
  overrides: ethers.CallOverrides;
  dataLoaderOptions: DataLoader.Options<ContractCall, any>;
  callbackHooks: MulticallCallbackHooks;
}

export class EthersMulticall implements IMulticallWrapper {
  private multicall: Multicall;
  private dataLoader: DataLoader<ContractCall, any>;
  private beforeCallHook?: (calls: ContractCall[], callRequests: CallStruct[]) => void;

  public overrides: ethers.CallOverrides;

  constructor(
    provider: ethers.providers.Provider,
    {
      chainId = 1,
      dataLoaderOptions = DEFAULT_DATALOADER_OPTIONS,
      callbackHooks = {},
      overrides = {},
    }: Partial<EthersMulticallOptions> = {}
  ) {
    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) throw new Error(`Multicall not supported on chain with id "${chainId}"`);

    this.multicall = new Contract(multicallAddress, MulticallAbi, provider) as Multicall;
    this.dataLoader = new DataLoader(
      // @ts-ignore
      this.doCalls.bind(this),
      dataLoaderOptions
    );
    this.beforeCallHook = callbackHooks.beforeCallHook;
    this.overrides = overrides;
  }

  static async new(
    provider: ethers.providers.Provider,
    overrides?: ethers.CallOverrides,
    dataLoaderOptions: DataLoader.Options<ContractCall, any> = DEFAULT_DATALOADER_OPTIONS,
    callbackHooks: MulticallCallbackHooks = {}
  ) {
    const network = await provider.getNetwork();

    return new EthersMulticall(provider, {
      chainId: network.chainId,
      overrides,
      dataLoaderOptions,
      callbackHooks,
    });
  }

  get contract() {
    return this.multicall;
  }

  async setProvider(provider: ethers.providers.Provider, chainId?: number) {
    chainId ??= (await provider.getNetwork()).chainId;

    const multicallAddress = MULTICALL_ADDRESSES[chainId];
    if (!multicallAddress) throw new Error(`Multicall not supported on chain with id "${chainId}"`);

    this.multicall = new Contract(multicallAddress, MulticallAbi, provider) as Multicall;
  }

  private async doCalls(calls: ContractCall[]) {
    const callRequests = calls.map((call) => ({
      target: call.address,
      callData: new Interface([]).encodeFunctionData(call.fragment, call.params),
    }));

    if (this.beforeCallHook) this.beforeCallHook(calls, callRequests);
    const res = await this.multicall.callStatic.aggregate(callRequests, false, this.overrides);

    if (res.returnData.length !== callRequests.length) {
      throw new Error(
        `Unexpected response length: received ${res.returnData.length}; expected ${callRequests.length}`
      );
    }

    const result = calls.map((call, i) => {
      const signature = FunctionFragment.from(call.fragment).format();
      const callIdentifier = [call.address, signature].join(":");
      const [success, data] = res.returnData[i];

      if (!success) {
        const error = new Error(`Multicall call failed for ${callIdentifier}`);
        error.stack = call.stack;
        return error;
      }

      try {
        const outputs = call.fragment.outputs!;
        const result = new Interface([]).decodeFunctionResult(call.fragment, data);

        return outputs.length === 1 ? result[0] : result;
      } catch (err: any) {
        const error = new Error(`Multicall call failed for ${callIdentifier}: ${err.message}`);
        error.name = error.message;
        error.stack = call.stack;

        throw error;
      }
    });

    return result;
  }

  wrap<T extends TargetContract>(contract: T) {
    const abi = contract.interface.fragments;
    const multicallContract = new MulticallContract(contract.address, abi as any);

    const funcs = abi.reduce((memo, frag) => {
      if (frag.type !== "function") return memo;

      const funcFrag = frag as FunctionFragment;
      if (!["pure", "view"].includes(funcFrag.stateMutability)) return memo;

      // Overwrite the function with a dataloader batched call
      const multicallFunc = multicallContract[funcFrag.name].bind(multicallContract);
      const newFunc = (...args: any) => {
        const stack = new Error().stack?.split("\n").slice(1).join("\n");

        const contractCall = multicallFunc(...args);
        return this.dataLoader.load({ ...contractCall, stack });
      };

      memo[funcFrag.name] = newFunc;

      return memo;
    }, {} as Record<string, (...args: any) => any>);

    return Object.setPrototypeOf({ ...contract, ...funcs }, Contract.prototype) as T;
  }
}

export default EthersMulticall;
